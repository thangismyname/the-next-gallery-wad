// ==========================================================
// WebSocket Protocol — message { type, payload } (JSON)
// ==========================================================
// Client → Server:
//   auth                       { guestId?, name? } (cookie → user, không → khách)
//   xfer:host / xfer:unhost    { transferId }                — người gửi
//   xfer:join / xfer:leave     { transferId, token? }        — người nhận
//   xfer:signal                { transferId, to, data }      — offer/answer/ICE/khoá
//   xfer:report                { transferId, status, via, bytes }
//   xfer:relay-request         { transferId, fileIds }
// Server → Client:
//   auth:success               { connId, guest, userId?, username? }
//   xfer:hosting               { transferId, peers }
//   xfer:joined                { transferId, recipientId, hostConnId }
//   xfer:peer-joined/-left     { transferId, peer | connId }
//   xfer:host-online/-offline  { transferId, hostConnId? }
//   xfer:signal                { transferId, from, data }
//   xfer:recipient             { transferId, recipient }     — tiến độ người nhận
//   xfer:relay-request         { transferId, from, fileIds }
//   xfer:relay                 { transferId, fileId, relayParts, partCount }
//   xfer:incoming              { transferId, sender, fileCount, libraryCount }
//   xfer:closed                { transferId }
//   presence:online/offline/snapshot, album:invite, moment:* (modules/*.notify.js)
//   error                      { code, message, transferId? }
// ==========================================================

export function buildMessage(type, payload = {}) {
  return JSON.stringify({ type, payload });
}

export function parseMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    if (!msg || typeof msg.type !== "string" || !msg.type) return null;
    return { type: msg.type, payload: msg.payload || {} };
  } catch {
    return null;
  }
}
