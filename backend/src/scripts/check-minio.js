// Chạy: node src/scripts/check-minio.js  (từ thư mục backend/)
import "../config/env.js"; // load .env trước tiên
import { minioClient } from "../config/minio.js";

async function testMinio() {
  console.log("Đang kết nối MinIO...");
  console.log("Endpoint:", process.env.MINIO_ENDPOINT);
  console.log("Bucket cần kiểm tra:", process.env.MINIO_BUCKET);

  try {
    // 1. List toàn bộ bucket hiện có trên MinIO server
    const buckets = await minioClient.listBuckets();
    console.log("\n✅ Kết nối MinIO thành công. Danh sách bucket:");
    buckets.forEach((b) =>
      console.log(`  - ${b.name} (tạo lúc: ${b.creationDate})`),
    );

    // 2. Kiểm tra riêng bucket ai-image-gallery có tồn tại không
    const bucketName = process.env.MINIO_BUCKET;
    const exists = await minioClient.bucketExists(bucketName);
    console.log(
      exists
        ? `\n✅ Bucket "${bucketName}" tồn tại.`
        : `\n⚠️  Bucket "${bucketName}" KHÔNG tồn tại — kiểm tra lại tên hoặc tạo mới.`,
    );

    // 3. Nếu bucket tồn tại, thử list vài object đầu tiên để chắc chắn đọc được data thật
    if (exists) {
      console.log("\nMột vài object trong bucket (tối đa 5):");
      const stream = minioClient.listObjectsV2(bucketName, "", true);
      let count = 0;
      stream.on("data", (obj) => {
        if (count < 5) {
          console.log(`  - ${obj.name} (${obj.size} bytes)`);
          count++;
        }
      });
      stream.on("end", () => {
        if (count === 0) console.log("  (bucket rỗng, không có object nào)");
        process.exit(0);
      });
      stream.on("error", (err) => {
        console.error("Lỗi khi list object:", err.message);
        process.exit(1);
      });
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error("\n❌ Kết nối MinIO thất bại:", err.message);
    process.exit(1);
  }
}

testMinio();
