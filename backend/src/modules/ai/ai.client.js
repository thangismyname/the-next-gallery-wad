// Client gọi ai-service (FastAPI) cho các tác vụ AI: embedding semantic search
// (OpenCLIP), object detection (YOLO26), image similarity (DINOv3) và gắn tag
// nội dung (classification). Native Node 20 có sẵn global fetch/FormData/Blob.

const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

// AI_EMBED_TIMEOUT_MS: tên cũ, vẫn đọc để không vỡ .env hiện có.
const AI_TIMEOUT_MS =
  Number(process.env.AI_TIMEOUT_MS || process.env.AI_EMBED_TIMEOUT_MS) || 30000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mã hoá 1 ảnh thành vector embedding qua ai-service (CLIP image encoder).
 * @returns {Promise<{ embedding: number[], provider: string, model: string, dimension: number }>}
 */
export async function embedImage(buffer, mimeType, filename = "image") {
  const form = new FormData();
  const blob = new Blob([buffer], {
    type: mimeType || "application/octet-stream",
  });
  form.append("file", blob, filename);

  const response = await fetchWithTimeout(`${AI_SERVICE_URL}/api/v1/embed/image`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI embed image failed (${response.status}): ${detail}`);
  }
  return response.json();
}

/**
 * Mã hoá câu truy vấn text thành vector embedding qua ai-service (CLIP text encoder).
 * @returns {Promise<{ embedding: number[], provider: string, model: string, dimension: number }>}
 */
export async function embedText(text) {
  const response = await fetchWithTimeout(`${AI_SERVICE_URL}/api/v1/embed/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI embed text failed (${response.status}): ${detail}`);
  }
  return response.json();
}

/**
 * Phát hiện object trong 1 ảnh qua ai-service (YOLO26).
 * @returns {Promise<{ provider: string, model: string, detections: {class_name: string, confidence: number, bbox: number[]}[] }>}
 */
export async function detectObjects(buffer, mimeType, filename = "image") {
  const form = new FormData();
  const blob = new Blob([buffer], {
    type: mimeType || "application/octet-stream",
  });
  form.append("file", blob, filename);

  const response = await fetchWithTimeout(
    `${AI_SERVICE_URL}/api/v1/detect/objects`,
    { method: "POST", body: form },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI detect objects failed (${response.status}): ${detail}`);
  }
  return response.json();
}

/**
 * Mã hoá 1 ảnh thành descriptor DINOv3 qua ai-service (so khớp ảnh↔ảnh).
 * @returns {Promise<{ embedding: number[], provider: string, model: string, dimension: number }>}
 */
export async function embedImageDino(buffer, mimeType, filename = "image") {
  const form = new FormData();
  const blob = new Blob([buffer], {
    type: mimeType || "application/octet-stream",
  });
  form.append("file", blob, filename);

  const response = await fetchWithTimeout(
    `${AI_SERVICE_URL}/api/v1/similarity/embed`,
    { method: "POST", body: form },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI similarity embed failed (${response.status}): ${detail}`);
  }
  return response.json();
}

/**
 * Chấm 17 tag nội dung từ vector CLIP đã lưu (không gửi ảnh) — tối đa 500 / lần.
 * @returns {Promise<{ model: string, taxonomy_version: string, tags: string[], thresholds: number[], scores: number[][] }>}
 */
export async function predictTags(embeddings) {
  const response = await fetchWithTimeout(`${AI_SERVICE_URL}/api/v1/tags/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeddings }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI predict tags failed (${response.status}): ${detail}`);
  }
  return response.json();
}

// Model đang chạy ở ai-service (CLIP + bộ gắn tag) — cache ngắn: đổi model
// cần restart ai-service, backend tự nhận sau tối đa INFO_TTL_MS.
const INFO_TTL_MS = 60_000;
const infoCache = new Map();

async function getInfo(path) {
  const cached = infoCache.get(path);
  if (cached && Date.now() - cached.at < INFO_TTL_MS) return cached.value;
  const response = await fetchWithTimeout(`${AI_SERVICE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`AI info ${path} failed (${response.status})`);
  }
  const value = await response.json();
  infoCache.set(path, { at: Date.now(), value });
  return value;
}

/** @returns {Promise<{ provider: string, model: string, dimension: number, logit_scale: number }>} */
export const getClipInfo = () => getInfo("/api/v1/embed/info");

/** @returns {Promise<{ model: string, taxonomy_version: string, tags: { id: string, threshold: number }[] }>} */
export const getTaggerInfo = () => getInfo("/api/v1/tags/info");

/** GET /health của ai-service (provider đang chạy); không phản hồi → null. */
export async function getHealth() {
  try {
    const response = await fetchWithTimeout(`${AI_SERVICE_URL}/health`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Như trên nhưng trả null khi ai-service không phản hồi (dùng cho thống kê). */
export async function currentModels() {
  const [clip, tagger] = await Promise.all([
    getClipInfo().catch(() => null),
    getTaggerInfo().catch(() => null),
  ]);
  return { clipModel: clip?.model ?? null, tagModel: tagger?.model ?? null };
}

export { AI_SERVICE_URL };
