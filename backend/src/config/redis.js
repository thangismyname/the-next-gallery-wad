import Redis from "ioredis";
import { logger } from "../lib/logger.js";

let redis = null;
let redisAvailable = false;

// Khởi tạo Redis client. Nếu REDIS_URL không set hoặc kết nối fail → fallback in-memory.
export async function initRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info("REDIS_URL not set — using in-memory cache/rate-limit");
    return null;
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
      lazyConnect: true,
    });
    await client.connect();
    await client.ping();
    redis = client;
    redisAvailable = true;
    logger.info("Redis connected — using Redis for cache/rate-limit");
    client.on("error", (err) => {
      logger.error({ err }, "Redis error");
      redisAvailable = false;
    });
    client.on("connect", () => {
      redisAvailable = true;
    });
    return client;
  } catch (err) {
    logger.warn({ err }, "Redis connection failed — falling back to in-memory");
    redis = null;
    redisAvailable = false;
    return null;
  }
}

export function getRedis() {
  return redisAvailable ? redis : null;
}

export function isRedisAvailable() {
  return redisAvailable;
}

export default { initRedis, getRedis, isRedisAvailable };