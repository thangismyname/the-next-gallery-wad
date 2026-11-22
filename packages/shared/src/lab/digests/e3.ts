// E3: CLIP zero-shot tìm ảnh (theo lớp, caption, query ghép).
import { Obj, pick, Tone } from "../common";

const KS = ["P@1", "P@5", "P@10", "P@20"];

/** (a) P@k của query theo lớp: strict (ảnh chưa nhãn = sai) vs known (bỏ ảnh chưa nhãn), nhóm all. */
export const e3PrecisionCurve = (result: unknown) =>
  KS.map((k) => ({
    label: k,
    strict: pick(result, `a_class_queries.strict_all.${k}`),
    known: pick(result, `a_class_queries.known_all.${k}`),
  })).filter((r) => r.strict != null || r.known != null);

/** (a) AP theo nhóm all / object / scene, strict vs known. */
export const e3Groups = (result: unknown) =>
  ["all", "object", "scene"]
    .map((g) => ({
      label: g,
      known: pick(result, `a_class_queries.known_${g}.AP`),
      strict: pick(result, `a_class_queries.strict_${g}.AP`),
    }))
    .filter((r) => r.known != null || r.strict != null);

/** (b) caption Localized Narratives: caption đầy đủ vs chỉ câu đầu. */
export const e3Captions = (result: unknown) =>
  ["R@1", "R@5", "R@10", "MRR"]
    .map((m) => ({
      label: m,
      full: pick(result, `b_captions.full.${m}`),
      first: pick(result, `b_captions.first_sentence.${m}`),
    }))
    .filter((r) => r.full != null || r.first != null);

/** (c) query ghép theo cấu hình "<ngôn ngữ>@<model>" (en@app, vi@app, vi@multilingual…). */
export function e3Compositional(result: unknown) {
  const c = (result as Obj | undefined)?.c_compositional;
  if (!c || typeof c !== "object") return [];
  return Object.entries(c as Obj)
    .filter(([, v]) => v && typeof v === "object")
    .map(([key, v]) => {
      const [lang, model] = key.split("@");
      return { key, lang, model, label: key, p10: pick(v, "P@10"), ndcg10: pick(v, "nDCG@10") };
    });
}

/** Tone thanh query ghép: tiếng Việt qua CLIP app (không hiểu tiếng Việt) = cảnh báo, còn lại = CLIP. */
export const compositionalTone = (r: { lang?: string; model?: string }): Tone =>
  r.lang === "vi" && r.model === "app" ? "fail" : "clip";
