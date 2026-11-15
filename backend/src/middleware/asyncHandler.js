// Bọc route handler async (Express 4 không tự bắt lỗi của Promise).
//
//   asyncHandler(async (req, res) => { … res.status(201).json(…) })
//       lỗi (kể cả httpError 403/404 từ service) → next(error) → errorHandler.
//   respond((req) => service(req.user.id, …))
//       như trên + tự trả { success: true, data } (data = giá trị trả về, undefined → null),
//       trừ khi handler đã tự gửi response (res.status(…).json / stream).

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next);
};

export const respond = (fn) =>
  asyncHandler(async (req, res) => {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({ success: true, data: data ?? null });
  });
