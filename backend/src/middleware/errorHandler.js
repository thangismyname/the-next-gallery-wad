export function errorHandler(err, req, res, _next) {
  console.error(err);

  // Lỗi tự ném (httpError, multer…) mang status 4xx → trả message cho client.
  // Lỗi 5xx / không rõ (Postgres, MinIO, ai-service) → chỉ trả câu chung,
  // chi tiết nằm trong log — tránh lộ câu SQL, tên bảng, đường dẫn nội bộ.
  const status = Number.isInteger(err.status) && err.status >= 400 ? err.status : 500;
  const expose = status < 500;

  res.status(status).json({
    success: false,
    error: {
      code: expose ? (typeof err.code === "string" ? err.code : "BAD_REQUEST") : "INTERNAL_ERROR",
      message: expose ? err.message || "Yêu cầu không hợp lệ" : "Lỗi server không xác định",
    },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Không tìm thấy route: ${req.method} ${req.originalUrl}`,
    },
  });
}
