// Search kết hợp (Compositional Search): 1 truy vấn → 3 nguồn đã tính sẵn lúc
// upload, không chạy model ảnh nào khi search (chỉ CLIP text encoder):
//
//   clip    margin = cos(q, ảnh) − cos(neg, ảnh) ("neg" = ảnh chung chung), chuẩn
//           hoá z-score theo chính truy vấn trên bộ ảnh của user rồi
//           p = σ(Z_SLOPE · (z − Z_CENTER)). Ảnh khớp thật là điểm nổi bật (z ≈ 4–5);
//           truy vấn CLIP không hiểu (vd tiếng Việt với CLIP tiếng Anh) thì không
//           ảnh nào nổi bật → không trả bừa như ngưỡng cosine thô.
//   tag     trung bình confidence các tag nội dung có tên trong câu (media_tags)
//   object  vật thể YOLO có tên trong câu, khớp số lượng ("2 con chó")
//
//   score = trung bình NHÂN có trọng số (Π part_i^w_i)^(1/Σw) — câu nhắc "đồ ăn"
//   mà ảnh không có tag đồ ăn thì bị loại (AND), không được CLIP "cứu".
//   w_clip = CLIP_RANGE · (1 − độ phủ từ điển): câu được hiểu trọn thành tag /
//   vật thể ("2 con chó trên bãi biển") chỉ chấm bằng tag/YOLO — CLIP chỉ phá
//   thế hoà (TIE_BREAK); phần từ điển không hiểu ("đang chơi", "màu đỏ") thì
//   CLIP chấm. Câu không có tag/vật thể nào → chỉ còn CLIP.
//
// GIỮ KHỚP hằng số + công thức với ai-service bench/search_eval.py.
import { dbPool } from "../../config/db.js";
import { embedText, getClipInfo } from "./ai.client.js";
import { applyQueryTemplate, toVectorLiteral } from "./embedding.service.js";
import { LEXICON, parseQuery } from "./search.query.js";

export const PARAMS = {
  clipRange: 0.5,
  tag: 0.25,
  object: 0.25,
  zCenter: 3,
  zSlope: 1.5,
  floor: 0.02, // điểm thành phần tối thiểu (tránh log 0)
  tieBreak: 0.001, // + tieBreak · clip: xếp các ảnh bằng điểm tag/YOLO theo CLIP
  minRowsForZ: 30, // ít ảnh hơn → độ lệch chuẩn không tin được
};
// = AI_YOLO_MIN_CONF (detection lưu từ 0.25, search chỉ tin từ 0.4).
const OBJECT_MIN_CONF = Number.isFinite(Number(process.env.AI_YOLO_MIN_CONF))
  ? Number(process.env.AI_YOLO_MIN_CONF)
  : 0.4;
// Điểm tối thiểu để trả về (0–1). Câu chỉ có CLIP: 0.5 ⇔ z ≥ Z_CENTER (ảnh
// nổi bật hẳn so với phần còn lại của bộ ảnh).
const MIN_SCORE = Number.isFinite(Number(process.env.AI_SEARCH_MIN_SCORE))
  ? Number(process.env.AI_SEARCH_MIN_SCORE)
  : 0.5;

const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, x))));

/** Khớp số lượng: đúng n → 1; nhiều hơn → 0.5; ít hơn → 0.5·k/n; không có → 0. */
export function countFactor(found, wanted) {
  if (found === 0) return 0;
  if (wanted === null || found === wanted) return 1;
  return found > wanted ? 0.5 : (0.5 * found) / wanted;
}

/**
 * Điểm 1 ảnh. `parts.clip` luôn có; tag/object chỉ khi câu nhắc tới.
 * @param {{ clip: number, tags: Record<string, number>, objects: Record<string, { n: number, conf: number }> }} row
 * @param {{ tags: string[], objects: { cls: string, count: number | null }[], coverage: number }} parsed
 */
export function scoreRow(row, parsed) {
  const parts = { clip: row.clip };
  const weights = {};
  if (parsed.tags.length) {
    parts.tag =
      parsed.tags.reduce((sum, t) => sum + (row.tags[t] ?? 0), 0) /
      parsed.tags.length;
    weights.tag = PARAMS.tag;
  }
  if (parsed.objects.length) {
    parts.object =
      parsed.objects.reduce((sum, { cls, count }) => {
        const hit = row.objects[cls];
        return sum + (hit ? hit.conf * countFactor(hit.n, count) : 0);
      }, 0) / parsed.objects.length;
    weights.object = PARAMS.object;
  }
  const structured = Object.keys(weights).length > 0;
  const clipWeight = structured
    ? PARAMS.clipRange * (1 - parsed.coverage)
    : 1;
  if (clipWeight > 0) weights.clip = clipWeight;

  let logSum = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    logSum += weight * Math.log(Math.max(parts[key], PARAMS.floor));
    weightSum += weight;
  }
  const score = Math.exp(logSum / weightSum);
  return {
    score: structured ? Math.min(1, score + PARAMS.tieBreak * row.clip) : score,
    parts,
  };
}

/** margin CLIP → xác suất, chuẩn hoá theo phân bố của chính truy vấn. */
export function clipProbabilities(margins, logitScale) {
  if (margins.length < PARAMS.minRowsForZ) {
    return margins.map((m) => sigmoid(logitScale * m));
  }
  const mean = margins.reduce((s, m) => s + m, 0) / margins.length;
  const sd =
    Math.sqrt(margins.reduce((s, m) => s + (m - mean) ** 2, 0) / margins.length) ||
    1;
  return margins.map((m) =>
    sigmoid(PARAMS.zSlope * ((m - mean) / sd - PARAMS.zCenter)),
  );
}

// Vector "ảnh chung chung" của từng model CLIP (trung bình các câu negatives).
const negativeCache = new Map();
async function negativeVector(model) {
  if (negativeCache.has(model)) return negativeCache.get(model);
  const vectors = await Promise.all(
    LEXICON.negatives.map(async (text) => (await embedText(text)).embedding),
  );
  const mean = vectors[0].map(
    (_, i) => vectors.reduce((s, v) => s + v[i], 0) / vectors.length,
  );
  const norm = Math.hypot(...mean) || 1;
  const unit = mean.map((v) => v / norm);
  negativeCache.set(model, unit);
  return unit;
}

/**
 * `onlyIds` (Set) = chỉ giữ ảnh trong phạm vi.
 * @returns {Promise<{ hits: { id: string, score: number, parts: object }[], hadEmbeddings: boolean, parsed: object }>}
 */
export async function hybridSearch(userId, query, { limit = 20, onlyIds = null } = {}) {
  const parsed = parseQuery(query);
  const [queryEmbedding, info] = await Promise.all([
    embedText(applyQueryTemplate(query)),
    getClipInfo(),
  ]);
  const model = queryEmbedding.model;
  const negative = await negativeVector(model);
  const classes = parsed.objects.map((o) => o.cls);

  // Duyệt toàn bộ ảnh có vector (brute force — vài nghìn ảnh/user vẫn vài chục
  // ms); tag/vật thể chỉ tra khi câu có nhắc (mảng rỗng → subquery trả null).
  const result = await dbPool.query(
    `SELECT e.media_id,
            (e.embedding <=> $3::vector) - (e.embedding <=> $2::vector) AS margin,
            (SELECT json_object_agg(t.tag, t.confidence)
               FROM media_tags t
              WHERE t.media_id = e.media_id AND t.tag = ANY($5::text[])) AS tags,
            (SELECT json_object_agg(d.class_name, json_build_object('n', d.n, 'conf', d.conf))
               FROM (SELECT class_name, COUNT(*)::int AS n, MAX(confidence) AS conf
                       FROM media_detections
                      WHERE media_id = e.media_id
                        AND class_name = ANY($6::text[])
                        AND confidence >= $7
                      GROUP BY class_name) d) AS objects
     FROM media_embeddings e
     JOIN media m ON m.id = e.media_id
     WHERE e.user_id = $1
       AND e.model = $4
       AND m.deleted_at IS NULL`,
    [
      userId,
      toVectorLiteral(queryEmbedding.embedding),
      toVectorLiteral(negative),
      model,
      parsed.tags,
      classes,
      OBJECT_MIN_CONF,
    ],
  );

  // margin = cos(q) − cos(neg) (<=> là khoảng cách cosine = 1 − cos).
  const clip = clipProbabilities(
    result.rows.map((row) => Number(row.margin)),
    info.logit_scale,
  );
  const hits = result.rows
    .map((row, i) => {
      const { score, parts } = scoreRow(
        { clip: clip[i], tags: row.tags ?? {}, objects: row.objects ?? {} },
        parsed,
      );
      return { id: String(row.media_id), score, parts };
    })
    // Phạm vi (Spotlight "Tìm trong Yêu thích"…) lọc SAU khi chấm điểm trên
    // toàn bộ ảnh — z-score CLIP vẫn tính trên cả thư viện như bench.
    .filter((hit) => hit.score >= MIN_SCORE && (!onlyIds || onlyIds.has(hit.id)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    hits,
    hadEmbeddings: result.rows.length > 0,
    parsed: {
      tags: parsed.tags,
      objects: parsed.objects,
      coverage: parsed.coverage,
    },
  };
}
