import { Client } from "minio";
import { logger } from "../lib/logger.js";

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL:
    process.env.MINIO_SECURE === "true" || process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

export const BUCKET_NAME = process.env.MINIO_BUCKET || "the-next-gallery";

export async function ensureBucketExists() {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME);
      logger.info(`Created MinIO bucket "${BUCKET_NAME}"`);
    } else {
      logger.info(`MinIO bucket "${BUCKET_NAME}" already exists`);
    }
  } catch (err) {
    logger.error({ err }, `Cannot connect/check MinIO bucket "${BUCKET_NAME}"`);
  }
}
