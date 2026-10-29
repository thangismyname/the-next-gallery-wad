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
  ROOM_CREATE: "room:create",
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  SIGNAL_OFFER: "signal:offer",
  SIGNAL_ANSWER: "signal:answer",
  SIGNAL_ICE: "signal:ice-candidate",
  TRANSFER_METADATA: "transfer:metadata",
  TRANSFER_ACCEPT: "transfer:accept",
  TRANSFER_REJECT: "transfer:reject",
  TRANSFER_PROGRESS: "transfer:progress",
  TRANSFER_COMPLETE: "transfer:complete",

  // Server → Client
  AUTH_SUCCESS: "auth:success",
  AUTH_ERROR: "auth:error",
  ROOM_CREATED: "room:created",
  ROOM_JOINED: "room:joined",
  ROOM_PEER_JOINED: "room:peer-joined",
  ROOM_PEER_LEFT: "room:peer-left",
  SHARE_INVITE: "share:invite",
  PRESENCE_ONLINE: "presence:online",
  PRESENCE_OFFLINE: "presence:offline",
  PRESENCE_SNAPSHOT: "presence:snapshot",
  MOMENT_COLLAB_INVITE: "moment:collab-invite",
  ALBUM_INVITE: "album:invite",
  MOMENT_COLLAB_COMPLETE: "moment:collab-complete",
  MOMENT_MEME_ADDED: "moment:meme-added",
  MOMENT_MEME_REMOVED: "moment:meme-removed",
  MOMENT_MEME_REACTED: "moment:meme-reacted",
  ERROR: "error",
} as const;

export type SignalType = (typeof SIGNAL)[keyof typeof SIGNAL] | string;

type SignalPayload = Record<string, unknown>;
type SignalHandler = (payload: SignalPayload) => void;

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
      this.send(SIGNAL.AUTH, {});
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