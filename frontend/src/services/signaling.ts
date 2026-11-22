// ==========================================================
// Signaling Client — WebSocket client cho share protocol
// ==========================================================
// Kết nối tới backend WS (`/ws`), tự gửi `auth` khi mở,
// auto-reconnect với exponential backoff, và route message
// JSON { type, payload } tới các handler đã subscribe.
// ==========================================================

// Message types — khớp với backend/src/ws/protocol.js
export const SIGNAL = {
  // Client → Server
  AUTH: "auth",
  XFER_HOST: "xfer:host",
  XFER_UNHOST: "xfer:unhost",
  XFER_JOIN: "xfer:join",
  XFER_LEAVE: "xfer:leave",
  XFER_REPORT: "xfer:report",
  XFER_RELAY_REQUEST: "xfer:relay-request",
  /** Hai chiều: offer / answer / ICE / trao khoá (server chỉ chuyển tiếp). */
  XFER_SIGNAL: "xfer:signal",

  // Server → Client
  AUTH_SUCCESS: "auth:success",
  XFER_HOSTING: "xfer:hosting",
  XFER_JOINED: "xfer:joined",
  XFER_PEER_JOINED: "xfer:peer-joined",
  XFER_PEER_LEFT: "xfer:peer-left",
  XFER_HOST_ONLINE: "xfer:host-online",
  XFER_HOST_OFFLINE: "xfer:host-offline",
  XFER_RECIPIENT: "xfer:recipient",
  XFER_RELAY: "xfer:relay",
  XFER_INCOMING: "xfer:incoming",
  XFER_CLOSED: "xfer:closed",
  FRIEND_REQUEST: "friend:request",
  FRIEND_ACCEPTED: "friend:accepted",
  FRIEND_CHANGED: "friend:changed",
  PRESENCE_ONLINE: "presence:online",
  PRESENCE_OFFLINE: "presence:offline",
  PRESENCE_SNAPSHOT: "presence:snapshot",
  MOMENT_COLLAB_INVITE: "moment:collab-invite",
  ALBUM_INVITE: "album:invite",
  MOMENT_COLLAB_COMPLETE: "moment:collab-complete",
  MOMENT_MEME_ADDED: "moment:meme-added",
  MOMENT_MEME_REMOVED: "moment:meme-removed",
  MOMENT_MEME_REACTED: "moment:meme-reacted",
  MOMENT_REACTION: "moment:reaction",
  MOMENT_DELETED: "moment:deleted",
  /** Thông báo mới đã lưu (backend `notifications.service.js::NOTIFICATION_EVENT`). */
  NOTIFICATION_NEW: "notification:new",
  MOMENT_LEFT: "moment:left",
  MOMENT_UPDATED: "moment:updated",
  ERROR: "error",
} as const;

type SignalPayload = Record<string, unknown>;
type SignalHandler = (payload: SignalPayload) => void;

const GUEST_ID_KEY = "tng.guestId";

/** Id ổn định của trình duyệt khi chưa đăng nhập (nhận file qua link / mã). */
export function getGuestId(): string {
  let id = localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

// Backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
function backoffDelay(attempt: number): number {
  return Math.min(30000, 1000 * 2 ** (attempt - 1));
}

class SignalingClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private handlers = new Map<string, Set<SignalHandler>>();
  private pendingQueue: Array<{ type: string; payload: SignalPayload }> = [];
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  /** Tên hiển thị khi là khách (người gửi thấy trong danh sách người nhận). */
  guestName: string | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.intentionallyClosed = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Có cookie → server nhận là user; không → khách với guestId.
      this.send(SIGNAL.AUTH, { guestId: getGuestId(), name: this.guestName });
      this.flushQueue();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this.handleClose();
    };

    this.ws.onerror = () => {
      // onclose sẽ trigger reconnect
    };
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.handlers.clear();
    if (this.ws) {
      const socket = this.ws;
      const readyState = socket.readyState;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (readyState === WebSocket.OPEN) {
        socket.close();
      } else if (readyState === WebSocket.CONNECTING) {
        socket.addEventListener("open", () => socket.close(), { once: true });
      }
      this.ws = null;
    }
    this.pendingQueue.length = 0;
  }

  send(type: string, payload: SignalPayload = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
      return;
    }
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.pendingQueue.push({ type, payload });
      return;
    }
    console.warn(`[signaling] Không thể gửi '${type}' — socket chưa mở`);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  isConnecting(): boolean {
    return this.ws?.readyState === WebSocket.CONNECTING;
  }

  on(type: string, handler: SignalHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  off(type: string, handler: SignalHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  private flushQueue(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    while (this.pendingQueue.length > 0) {
      const msg = this.pendingQueue.shift();
      if (msg) this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(raw: unknown): void {
    let msg: { type?: unknown; payload?: unknown } | null = null;
    try {
      msg = JSON.parse(raw as string);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;
    this.emit(msg.type as string, (msg.payload as SignalPayload) ?? {});
  }

  private emit(type: string, payload: SignalPayload): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of Array.from(set)) {
      handler(payload);
    }
  }

  private handleClose(): void {
    if (this.intentionallyClosed || !this.ws) return;

    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.emit("disconnected", { attempts: this.reconnectAttempts });
      return;
    }

    const delay = backoffDelay(this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

export default SignalingClient;