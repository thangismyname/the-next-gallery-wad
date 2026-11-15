// Khoá thiết bị (ECDH P-256 công khai) để bọc khoá file cho bạn bè đang offline,
// và cấu hình ICE (STUN + TURN tạm thời) cho WebRTC.
import { createHmac } from "node:crypto";
import { dbPool } from "../../config/db.js";

/** Tối đa 5 thiết bị / user (bọc khoá cho từng thiết bị) — giữ 5 cái dùng gần nhất. */
const MAX_DEVICES = 5;

export async function upsertDeviceKey(userId, deviceId, publicKey) {
  await dbPool.query(
    `INSERT INTO user_device_keys (user_id, device_id, public_key) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, device_id) DO UPDATE SET public_key = EXCLUDED.public_key, last_seen_at = NOW()`,
    [userId, deviceId, JSON.stringify(publicKey)],
  );
  await dbPool.query(
    `DELETE FROM user_device_keys WHERE user_id = $1 AND device_id NOT IN (
       SELECT device_id FROM user_device_keys WHERE user_id = $1
       ORDER BY last_seen_at DESC LIMIT ${MAX_DEVICES})`,
    [userId],
  );
}

/** Khoá thiết bị của các bạn bè (người lạ → bỏ qua). */
export async function listFriendDeviceKeys(userId, friendIds) {
  const { rows } = await dbPool.query(
    `SELECT k.user_id, k.device_id, k.public_key
     FROM user_device_keys k
     WHERE k.user_id = ANY($2::text[]) AND EXISTS (
       SELECT 1 FROM friendships f WHERE f.status = 'accepted'
         AND ((f.requester_id = $1 AND f.addressee_id = k.user_id)
           OR (f.addressee_id = $1 AND f.requester_id = k.user_id)))
     ORDER BY k.last_seen_at DESC`,
    [userId, friendIds],
  );
  const byUser = {};
  for (const r of rows) {
    (byUser[r.user_id] ??= []).push({ deviceId: r.device_id, publicKey: r.public_key });
  }
  return byUser;
}

const list = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * ICE servers cho RTCPeerConnection. TURN dùng "REST API credentials" của
 * coturn (`use-auth-secret`): username = "<hết hạn>:<id>", password =
 * base64(HMAC-SHA1(TURN_SECRET, username)) → không lộ secret ra FE, tự hết hạn.
 */
export function buildIceServers(identity) {
  const stun = list(process.env.STUN_URLS || "stun:stun.l.google.com:19302");
  const servers = stun.length ? [{ urls: stun }] : [];
  const turnUrls = list(process.env.TURN_URLS);
  const secret = process.env.TURN_SECRET;
  if (turnUrls.length && secret) {
    const ttl = Number(process.env.TURN_TTL_SECONDS) || 3600;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${String(identity).slice(0, 64)}`;
    const credential = createHmac("sha1", secret).update(username).digest("base64");
    servers.push({ urls: turnUrls, username, credential });
  }
  return { iceServers: servers, turn: Boolean(turnUrls.length && secret) };
}
