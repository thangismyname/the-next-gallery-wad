// ==========================================================
// TransferHost — người gửi "phát" 1 phiên gửi file
// ==========================================================
// - Mỗi người nhận vào phiên → 1 RtcLink (mình tạo offer). Người nhận tự xin
//   file (`get` + offset) — mình chỉ stream theo yêu cầu, tối đa 3 người cùng lúc.
// - Người nhận không có khoá (vào bằng mã) → ECDH: bọc khoá phiên bằng khoá tạm của họ.
// - P2P hỏng / bạn bè offline / "Giữ khi đóng trang" → mã hoá + đẩy file lên relay.
// Ảnh thư viện không đi qua đây (server copy / stream thẳng).
// ==========================================================
import { getSignalingClient } from "@/hooks/useSignaling";
import { SIGNAL } from "@/services/signaling";
import {
  fetchIceServers,
  fetchRelayParts,
  type TransferDetail,
  type TransferRecipient,
} from "@/services/transfers";
import { wrapTransferKey } from "./crypto";
import { Observable } from "./observable";
import { DC_CHUNK, MAX_PARALLEL_STREAMS, type DcMessage, type SignalData } from "./protocol";
import { uploadFileToRelay } from "./relay";
import { RtcLink } from "./rtc";

/** Đọc file theo khối 1 MiB rồi cắt thành mảnh 64 KiB (ít lần đọc đĩa). */
const READ_BLOCK = 1024 * 1024;
const PROGRESS_EVERY_MS = 250;
const ICE_TTL_MS = 50 * 60 * 1000;

export interface HostPeerView {
  connId: string;
  name: string | null;
  guest: boolean;
  recipientId: string;
  state: "connecting" | "connected" | "failed";
  via: "p2p" | "turn" | null;
  /** Đang gửi (P2P) cho người này. */
  sending: { fileId: string; bytes: number; size: number } | null;
  queued: boolean;
}

export interface HostState {
  detail: TransferDetail;
  online: boolean;
  peers: Record<string, HostPeerView>;
  /** Số part đã lên relay theo file. */
  relay: Record<string, number>;
  relayBusy: boolean;
  relayError: string | null;
  closed: boolean;
}

interface PeerRuntime {
  link: RtcLink | null;
  abort: { aborted: boolean } | null;
  /** Các yêu cầu `get` của 1 người nhận chạy lần lượt — mảnh cũ không chen vào file mới. */
  chain: Promise<void>;
}

export class TransferHost extends Observable<HostState> {
  readonly id: string;
  private offs: Array<() => void> = [];
  private runtimes = new Map<string, PeerRuntime>();
  private ice: { at: number; servers: Promise<RTCIceServer[]> } | null = null;
  private active = 0;
  private waiting: Array<() => void> = [];
  private relayQueue: string[] = [];
  private relayAbort = new AbortController();

  constructor(
    detail: TransferDetail,
    private readonly key: CryptoKey,
    /** Dữ liệu file trên máy theo fileId (ảnh thư viện không có). */
    private readonly blobs: Map<string, Blob>,
  ) {
    super({
      detail,
      online: false,
      peers: {},
      relay: Object.fromEntries(detail.files.map((f) => [f.id, f.relayParts])),
      relayBusy: false,
      relayError: null,
      closed: false,
    });
    this.id = detail.id;
  }

  /** Còn dữ liệu trên máy để phát P2P không (tải lại trang = mất File). */
  get hasLocalData() {
    return this.state.detail.files.every((f) => f.source === "library" || this.blobs.has(f.id));
  }

  get busy() {
    return this.state.relayBusy || Object.values(this.state.peers).some((p) => p.sending);
  }

  start() {
    const client = getSignalingClient();
    const mine = (payload: Record<string, unknown>) => payload.transferId === this.id;
    const on = (type: string, fn: (p: Record<string, unknown>) => void) =>
      this.offs.push(client.on(type, (p) => mine(p) && fn(p)));

    on(SIGNAL.XFER_HOSTING, (p) => {
      this.setState({ online: true });
      for (const peer of (p.peers as HostPeerView[]) ?? []) this.addPeer(peer);
    });
    on(SIGNAL.XFER_PEER_JOINED, (p) => this.addPeer(p.peer as HostPeerView));
    on(SIGNAL.XFER_PEER_LEFT, (p) => this.dropPeer(p.connId as string));
    on(SIGNAL.XFER_SIGNAL, (p) => void this.onSignal(p.from as string, p.data as SignalData));
    on(SIGNAL.XFER_RELAY_REQUEST, (p) => this.relayFiles(p.fileIds as string[]));
    on(SIGNAL.XFER_RECIPIENT, (p) => this.updateRecipient(p.recipient as TransferRecipient));
    on(SIGNAL.XFER_CLOSED, () => this.stop(true));
    on(SIGNAL.ERROR, (p) => {
      if (p.code === "TRANSFER_CLOSED") this.stop(true);
    });
    // Reconnect WS → server quên mình đang phát → gửi lại.
    this.offs.push(client.on(SIGNAL.AUTH_SUCCESS, () => this.announce()));
    this.announce();
  }

  private announce() {
    if (!this.state.closed && this.hasLocalData) {
      getSignalingClient().send(SIGNAL.XFER_HOST, { transferId: this.id });
    }
  }

  stop(closed = false) {
    getSignalingClient().send(SIGNAL.XFER_UNHOST, { transferId: this.id });
    this.offs.forEach((off) => off());
    this.offs = [];
    this.relayAbort.abort();
    for (const connId of [...this.runtimes.keys()]) this.dropPeer(connId);
    this.setState({ online: false, closed: closed || this.state.closed, relayBusy: false });
  }

  setDetail(detail: TransferDetail) {
    this.setState({ detail });
  }

  // ---- Người nhận ----

  private iceServers() {
    if (!this.ice || Date.now() - this.ice.at > ICE_TTL_MS) {
      this.ice = {
        at: Date.now(),
        servers: fetchIceServers(this.id)
          .then((r) => r.iceServers)
          .catch(() => [{ urls: "stun:stun.l.google.com:19302" }]),
      };
    }
    return this.ice.servers;
  }

  private patchPeer(connId: string, patch: Partial<HostPeerView>) {
    this.setState((s) => {
      const peer = s.peers[connId];
      return peer ? { peers: { ...s.peers, [connId]: { ...peer, ...patch } } } : {};
    });
  }

  private addPeer(peer: HostPeerView) {
    if (!peer?.connId) return;
    this.dropPeer(peer.connId);
    this.setState((s) => ({
      peers: {
        ...s.peers,
        [peer.connId]: {
          connId: peer.connId,
          name: peer.name ?? null,
          guest: Boolean(peer.guest),
          recipientId: peer.recipientId,
          state: "connecting",
          via: null,
          sending: null,
          queued: false,
        },
      },
    }));
    // Người nhận mới (khách qua link) → hiện ngay trong danh sách, chưa cần chờ báo tiến độ.
    if (peer.recipientId && !this.state.detail.recipients?.some((r) => r.id === peer.recipientId)) {
      this.updateRecipient({
        id: peer.recipientId,
        userId: null,
        name: peer.name ?? null,
        avatarUrl: null,
        guest: Boolean(peer.guest),
        status: "pending",
        via: null,
        bytes: 0,
        startedAt: null,
        finishedAt: null,
      });
    }
    const runtime: PeerRuntime = { link: null, abort: null, chain: Promise.resolve() };
    this.runtimes.set(peer.connId, runtime);
    // Không có File trên máy (vd mở lại trang) → không P2P được, người nhận dùng relay.
    if (!this.hasLocalData) return;
    void this.iceServers().then((iceServers) => {
      if (this.runtimes.get(peer.connId) !== runtime) return;
      runtime.link = new RtcLink({
        iceServers,
        initiator: true,
        sendSignal: (data) =>
          getSignalingClient().send(SIGNAL.XFER_SIGNAL, { transferId: this.id, to: peer.connId, data }),
        onOpen: () => {
          void runtime.link?.via().then((via) => this.patchPeer(peer.connId, { state: "connected", via }));
        },
        onClose: () => {
          if (runtime.abort) runtime.abort.aborted = true;
          this.patchPeer(peer.connId, { state: "failed", sending: null });
        },
        onMessage: (msg) => this.onDcMessage(peer.connId, msg),
      });
    });
  }

  private dropPeer(connId: string) {
    const runtime = this.runtimes.get(connId);
    if (runtime) {
      if (runtime.abort) runtime.abort.aborted = true;
      runtime.link?.close();
      this.runtimes.delete(connId);
    }
    this.setState((s) => {
      if (!s.peers[connId]) return {};
      const peers = { ...s.peers };
      delete peers[connId];
      return { peers };
    });
  }

  private async onSignal(from: string, data: SignalData) {
    if (!data) return;
    if (data.kind === "key-req") {
      const wrapped = await wrapTransferKey(this.key, data.pub, "ephemeral").catch(() => null);
      if (wrapped) {
        getSignalingClient().send(SIGNAL.XFER_SIGNAL, {
          transferId: this.id,
          to: from,
          data: { kind: "key", wrapped } satisfies SignalData,
        });
      }
      return;
    }
    if (data.kind === "hello") {
      const peer = this.state.peers[from];
      if (peer) this.addPeer(peer);
      return;
    }
    await this.runtimes.get(from)?.link?.handleSignal(data);
  }

  private updateRecipient(recipient: TransferRecipient) {
    if (!recipient?.id) return;
    this.setState((s) => {
      const list = s.detail.recipients ?? [];
      const exists = list.some((r) => r.id === recipient.id);
      return {
        detail: {
          ...s.detail,
          recipients: exists
            ? list.map((r) => (r.id === recipient.id ? recipient : r))
            : [...list, recipient],
        },
      };
    });
  }

  // ---- Stream P2P theo yêu cầu ----

  private onDcMessage(connId: string, msg: DcMessage) {
    const runtime = this.runtimes.get(connId);
    if (!runtime) return;
    if (msg.t === "cancel") {
      if (runtime.abort) runtime.abort.aborted = true;
    } else if (msg.t === "get") {
      if (runtime.abort) runtime.abort.aborted = true;
      runtime.chain = runtime.chain.then(() => this.serve(connId, runtime, msg.fileId, msg.offset));
    }
  }

  private async acquire(connId: string) {
    if (this.active < MAX_PARALLEL_STREAMS) {
      this.active++;
      return;
    }
    this.patchPeer(connId, { queued: true });
    this.runtimes.get(connId)?.link?.send({ t: "queued" });
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.patchPeer(connId, { queued: false });
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }

  private async serve(connId: string, runtime: PeerRuntime, fileId: string, offset: number) {
    const abort = { aborted: false };
    runtime.abort = abort;
    const link = runtime.link;
    const blob = this.blobs.get(fileId);
    if (!link || !blob) {
      link?.send({ t: "error", fileId, message: "Không có file trên máy người gửi" });
      return;
    }
    await this.acquire(connId);
    try {
      if (abort.aborted) return;
      const size = blob.size;
      let pos = Math.min(Math.max(0, Math.floor(offset)), size);
      link.send({ t: "begin", fileId, offset: pos, size });
      let lastUi = 0;
      while (pos < size && !abort.aborted) {
        const block = await blob.slice(pos, Math.min(size, pos + READ_BLOCK)).arrayBuffer();
        for (let at = 0; at < block.byteLength && !abort.aborted; at += DC_CHUNK) {
          await link.sendBinary(block.slice(at, at + DC_CHUNK));
        }
        pos += block.byteLength;
        if (performance.now() - lastUi > PROGRESS_EVERY_MS || pos >= size) {
          lastUi = performance.now();
          this.patchPeer(connId, { sending: { fileId, bytes: pos, size } });
        }
      }
      if (!abort.aborted) link.send({ t: "end", fileId });
    } catch {
      // Kênh đóng giữa chừng — người nhận sẽ xin tiếp từ offset (P2P mới hoặc relay).
    } finally {
      this.release();
      if (runtime.abort === abort) runtime.abort = null;
      this.patchPeer(connId, { sending: null });
    }
  }

  // ---- Relay (mã hoá, lên server) ----

  /** Đẩy các file trên máy lên relay (mặc định: tất cả). File đã đủ part bỏ qua. */
  relayFiles(fileIds?: string[]) {
    const device = this.state.detail.files.filter((f) => f.source === "device" && this.blobs.has(f.id));
    const wanted = fileIds?.length ? device.filter((f) => fileIds.includes(f.id)) : device;
    for (const f of wanted) {
      if (!this.relayQueue.includes(f.id) && (this.state.relay[f.id] ?? 0) < f.partCount) {
        this.relayQueue.push(f.id);
      }
    }
    if (!this.state.relayBusy && this.relayQueue.length) void this.drainRelay();
  }

  private async drainRelay() {
    this.setState({ relayBusy: true, relayError: null });
    try {
      while (this.relayQueue.length) {
        const fileId = this.relayQueue[0];
        const index = this.state.detail.files.findIndex((f) => f.id === fileId);
        const blob = this.blobs.get(fileId);
        if (index >= 0 && blob) {
          const done = new Set(await fetchRelayParts(this.id, fileId));
          await uploadFileToRelay({
            transferId: this.id,
            fileId,
            fileIndex: index,
            blob,
            key: this.key,
            done,
            signal: this.relayAbort.signal,
            onPart: (relayParts) =>
              this.setState((s) => ({ relay: { ...s.relay, [fileId]: relayParts } })),
          });
        }
        this.relayQueue.shift();
      }
    } catch (err) {
      this.relayQueue = [];
      if (!this.relayAbort.signal.aborted) {
        this.setState({ relayError: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      this.setState({ relayBusy: false });
    }
  }
}
