// ==========================================================
// TransferReceiver — người nhận 1 phiên gửi file
// ==========================================================
// Mỗi file chọn đường tốt nhất đang có:
//   ảnh thư viện  → tải thẳng từ server (Range, tải tiếp được)
//   file trên máy → P2P (WebRTC, STUN/TURN) nếu người gửi online;
//                   không mở được trong 15 s / người gửi offline → relay đã mã hoá.
// Dữ liệu ghi vào OPFS (đĩa) → nhận video nhiều GB, tải lại trang vẫn tiếp tục.
// Khoá giải mã (relay + thumbnail): #k= trong link · khoá bọc cho thiết bị này
// (bạn bè) · ECDH tạm với người gửi (vào bằng mã 6 số) · đã lưu trong máy.
// ==========================================================
import { getSignalingClient } from "@/hooks/useSignaling";
import { SIGNAL } from "@/services/signaling";
import {
  fetchIceServers,
  fetchTransfer,
  openLibraryContent,
  type TransferDetail,
  type TransferFile,
} from "@/services/transfers";
import {
  decryptThumbUrl,
  exportPublicJwk,
  generateEcdhPair,
  importKey,
  recallTransferKey,
  rememberTransferKey,
  unwrapTransferKey,
} from "./crypto";
import { unwrapForThisDevice } from "./deviceKeys";
import { Observable } from "./observable";
import { CONNECT_TIMEOUT_MS, type DcMessage, type SignalData, type Via } from "./protocol";
import { downloadFileFromRelay } from "./relay";
import { RtcLink } from "./rtc";
import { openSink, type FileSink } from "./sink";

const REPORT_EVERY_MS = 1000;
const UI_EVERY_MS = 200;

export type LinkState = "idle" | "connecting" | "p2p" | "turn" | "failed";

export interface ReceiverFile {
  status: "idle" | "queued" | "receiving" | "done" | "error";
  bytes: number;
  via: Via | null;
  error?: string;
  file?: File;
}

export interface ReceiverState {
  detail: TransferDetail | null;
  error: { code?: string; message: string } | null;
  keyState: "ready" | "missing" | "requesting";
  joined: boolean;
  hostOnline: boolean;
  link: LinkState;
  files: Record<string, ReceiverFile>;
  thumbs: Record<string, string>;
  running: boolean;
  closed: boolean;
}

class Cancelled extends Error {}
/** Người gửi không phục vụ file này qua P2P (vd đã mất File) → dùng relay. */
class P2PUnavailable extends Error {}

export class TransferReceiver extends Observable<ReceiverState> {
  private key: CryptoKey | null = null;
  private offs: Array<() => void> = [];
  private hostConnId: string | null = null;
  private rtc: RtcLink | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private relayRequested = new Set<string>();
  private ephemeral: CryptoKeyPair | null = null;
  /** Đánh thức vòng tải khi có thay đổi (kênh mở, part relay mới, có khoá…). */
  private wakers: Array<() => void> = [];
  private current: {
    fileId: string;
    sink: FileSink;
    writes: Promise<void>;
    started: boolean;
    resolve: () => void;
    reject: (err: Error) => void;
  } | null = null;
  private stopped = false;
  /** Tín hiệu xử lý lần lượt — ICE tới sớm chờ offer tạo xong kết nối. */
  private signalChain: Promise<void> = Promise.resolve();
  private ice: Promise<RTCIceServer[]> | null = null;
  private lastReport = 0;
  private lastUi = 0;

  constructor(
    readonly id: string,
    private readonly token: string | null,
    private readonly fragmentKey: string | null,
  ) {
    super({
      detail: null,
      error: null,
      keyState: "missing",
      joined: false,
      hostOnline: false,
      link: "idle",
      files: {},
      thumbs: {},
      running: false,
      closed: false,
    });
  }

  // ---- Khởi động ----

  async start() {
    try {
      const detail = await fetchTransfer(this.id, this.token);
      this.setState({
        detail,
        hostOnline: detail.hostOnline,
        files: Object.fromEntries(
          detail.files.map((f) => [f.id, { status: "idle", bytes: 0, via: null } as ReceiverFile]),
        ),
      });
      await this.loadKey(detail);
    } catch (err) {
      const e = err as { message?: string; code?: string };
      this.setState({ error: { code: e.code, message: e.message ?? String(err) } });
      return;
    }
    if (this.stopped) return;
    this.ice = fetchIceServers(this.id, this.token)
      .then((r) => r.iceServers)
      .catch(() => [{ urls: "stun:stun.l.google.com:19302" }]);
    const client = getSignalingClient();
    const on = (type: string, fn: (p: Record<string, unknown>) => void) =>
      this.offs.push(client.on(type, (p) => p.transferId === this.id && fn(p)));

    on(SIGNAL.XFER_JOINED, (p) => {
      this.setState({ joined: true });
      this.setHost((p.hostConnId as string) ?? null);
    });
    on(SIGNAL.XFER_HOST_ONLINE, (p) => this.setHost(p.hostConnId as string));
    on(SIGNAL.XFER_HOST_OFFLINE, () => this.setHost(null));
    on(SIGNAL.XFER_SIGNAL, (p) => {
      this.signalChain = this.signalChain
        .then(() => this.onSignal(p.from as string, p.data as SignalData))
        .catch(() => {});
    });
    on(SIGNAL.XFER_RELAY, (p) => {
      this.patchDetailFile(p.fileId as string, { relayParts: p.relayParts as number });
      this.wake();
    });
    on(SIGNAL.XFER_CLOSED, () => this.close("TRANSFER_CLOSED"));
    on(SIGNAL.ERROR, (p) => {
      if (typeof p.code === "string" && ["TRANSFER_CLOSED", "TRANSFER_NOT_FOUND", "TRANSFER_FULL", "OWN_TRANSFER"].includes(p.code)) {
        this.setState({ error: { code: p.code, message: String(p.message ?? p.code) } });
        if (p.code === "TRANSFER_CLOSED") this.close("TRANSFER_CLOSED");
      }
    });
    this.offs.push(client.on(SIGNAL.AUTH_SUCCESS, () => this.join()));
    this.join();
  }

  private join() {
    if (!this.stopped) getSignalingClient().send(SIGNAL.XFER_JOIN, { transferId: this.id, token: this.token });
  }

  stop() {
    this.stopped = true;
    getSignalingClient().send(SIGNAL.XFER_LEAVE, { transferId: this.id });
    this.offs.forEach((off) => off());
    this.offs = [];
    this.closeLink();
    this.current?.reject(new Cancelled());
    this.wake();
    Object.values(this.state.thumbs).forEach((url) => URL.revokeObjectURL(url));
  }

  private close(code: string) {
    this.closeLink();
    this.setState({ closed: true, error: { code, message: "Phiên gửi đã đóng" } });
    this.current?.reject(new Cancelled());
    this.wake();
  }

  // ---- Khoá ----

  private async loadKey(detail: TransferDetail) {
    let key: CryptoKey | null = null;
    if (this.fragmentKey) key = await importKey(this.fragmentKey).catch(() => null);
    key ??= await recallTransferKey(this.id);
    if (!key && detail.me?.wrappedKeys?.length) key = await unwrapForThisDevice(detail.me.wrappedKeys);
    if (key) await this.useKey(key);
  }

  private async useKey(key: CryptoKey) {
    this.key = key;
    void rememberTransferKey(this.id, key).catch(() => {});
    this.setState({ keyState: "ready" });
    const files = this.state.detail?.files ?? [];
    const thumbs: Record<string, string> = {};
    await Promise.all(
      files.map(async (f, i) => {
        if (!f.thumb) return;
        const url = await decryptThumbUrl(key, i, f.thumb);
        if (url) thumbs[f.id] = url;
      }),
    );
    this.setState({ thumbs });
    this.wake();
  }

  /** Chưa có khoá + người gửi online → xin khoá qua ECDH (server chỉ chuyển tiếp). */
  private requestKey() {
    if (this.key || !this.hostConnId || this.state.keyState === "requesting") return;
    this.setState({ keyState: "requesting" });
    void (async () => {
      this.ephemeral ??= await generateEcdhPair(false);
      this.signal({ kind: "key-req", pub: await exportPublicJwk(this.ephemeral.publicKey) });
    })();
  }

  // ---- Người gửi online/offline + WebRTC ----

  private setHost(connId: string | null) {
    if (connId === this.hostConnId) return;
    this.hostConnId = connId;
    this.closeLink();
    // Yêu cầu khoá gửi cho người gửi cũ (đã offline) không còn ai trả lời → hỏi lại.
    this.setState({
      hostOnline: Boolean(connId),
      link: "idle",
      ...(this.state.keyState === "requesting" ? { keyState: "missing" as const } : {}),
    });
    if (!connId) return this.wake();
    if (!this.key) this.requestKey();
    if (this.hasPendingDeviceFiles()) this.expectConnection();
  }

  private hasPendingDeviceFiles() {
    return (this.state.detail?.files ?? []).some(
      (f) => f.source === "device" && this.state.files[f.id]?.status !== "done",
    );
  }

  /** Người gửi tạo offer; quá 15 s chưa mở kênh → coi như P2P hỏng, dùng relay. */
  private expectConnection() {
    this.setState({ link: "connecting" });
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (!this.rtc?.isOpen) {
        this.closeLink();
        this.setState({ link: "failed" });
        this.askRelay();
        this.wake();
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private closeLink() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    const rtc = this.rtc;
    this.rtc = null;
    rtc?.close();
  }

  private signal(data: SignalData) {
    if (this.hostConnId) {
      getSignalingClient().send(SIGNAL.XFER_SIGNAL, { transferId: this.id, to: this.hostConnId, data });
    }
  }

  private async onSignal(from: string, data: SignalData) {
    if (!data || from !== this.hostConnId) return;
    if (data.kind === "key") {
      if (!this.ephemeral) return;
      const key = await unwrapTransferKey(this.ephemeral.privateKey, data.wrapped).catch(() => null);
      if (key) await this.useKey(key);
      else this.setState({ keyState: "missing" });
      return;
    }
    if (data.kind === "offer") {
      this.closeLink();
      const iceServers = (await this.ice) ?? [];
      if (from !== this.hostConnId || this.stopped) return;
      this.expectConnection();
      const rtc: RtcLink = new RtcLink({
        iceServers,
        initiator: false,
        sendSignal: (d) => this.signal(d),
        onOpen: () => {
          if (this.connectTimer) clearTimeout(this.connectTimer);
          void rtc.via().then((via) => this.rtc === rtc && this.setState({ link: via }));
          this.wake();
        },
        onClose: () => {
          if (this.rtc === rtc) {
            this.rtc = null;
            this.setState({ link: "failed" });
          }
          this.current?.reject(new Error("P2P đã ngắt"));
          this.wake();
        },
        onMessage: (msg) => this.onDcMessage(msg),
        onBinary: (data) => this.onDcBinary(data),
      });
      this.rtc = rtc;
    }
    await this.rtc?.handleSignal(data);
  }

  /** P2P hỏng → xin người gửi đẩy file lên relay (1 lần / file). */
  private askRelay() {
    const ids = (this.state.detail?.files ?? [])
      .filter(
        (f) =>
          f.source === "device" &&
          this.state.files[f.id]?.status !== "done" &&
          f.relayParts < f.partCount &&
          !this.relayRequested.has(f.id),
      )
      .map((f) => f.id);
    if (!ids.length) return;
    ids.forEach((id) => this.relayRequested.add(id));
    getSignalingClient().send(SIGNAL.XFER_RELAY_REQUEST, { transferId: this.id, fileIds: ids });
  }

  // ---- Nhận qua DataChannel ----

  private onDcMessage(msg: DcMessage) {
    const cur = this.current;
    if (!cur) return;
    if (msg.t === "begin" && msg.fileId === cur.fileId) {
      cur.started = true;
      if (msg.offset !== cur.sink.size) cur.writes = cur.writes.then(() => cur.sink.truncate(msg.offset));
    } else if (msg.t === "end" && msg.fileId === cur.fileId) {
      cur.writes.then(cur.resolve, cur.reject);
    } else if (msg.t === "error" && msg.fileId === cur.fileId) {
      cur.reject(new P2PUnavailable(msg.message));
    }
  }

  private onDcBinary(data: ArrayBuffer) {
    const cur = this.current;
    if (!cur?.started) return;
    cur.writes = cur.writes.then(() => cur.sink.write(data));
    this.progress(cur.fileId, cur.sink.size + data.byteLength, this.state.link === "turn" ? "turn" : "p2p");
  }

  private receiveP2P(fileId: string, sink: FileSink) {
    return new Promise<void>((resolve, reject) => {
      this.current = { fileId, sink, writes: Promise.resolve(), started: false, resolve, reject };
      this.rtc!.send({ t: "get", fileId, offset: sink.size });
    }).finally(() => {
      this.current = null;
    });
  }

  // ---- Vòng tải ----

  private wake() {
    const wakers = this.wakers;
    this.wakers = [];
    wakers.forEach((w) => w());
  }

  private nextChange(timeoutMs = 10_000) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.wakers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private patchFile(fileId: string, patch: Partial<ReceiverFile>) {
    this.setState((s) => ({ files: { ...s.files, [fileId]: { ...s.files[fileId], ...patch } } }));
  }

  private patchDetailFile(fileId: string, patch: Partial<TransferFile>) {
    this.setState((s) =>
      s.detail
        ? { detail: { ...s.detail, files: s.detail.files.map((f) => (f.id === fileId ? { ...f, ...patch } : f)) } }
        : {},
    );
  }

  private progress(fileId: string, bytes: number, via: Via) {
    const now = performance.now();
    if (now - this.lastUi > UI_EVERY_MS) {
      this.lastUi = now;
      this.patchFile(fileId, { bytes, via, status: "receiving" });
    }
    this.report("receiving", via);
  }

  private totalBytes() {
    return Object.values(this.state.files).reduce((sum, f) => sum + f.bytes, 0);
  }

  private report(status: "receiving" | "done" | "failed", via: Via | null, force = false) {
    const now = performance.now();
    if (!force && now - this.lastReport < REPORT_EVERY_MS) return;
    this.lastReport = now;
    getSignalingClient().send(SIGNAL.XFER_REPORT, { transferId: this.id, status, via, bytes: this.totalBytes() });
  }

  /** Nhận các file (mặc định: tất cả) — lần lượt từng file, ghi vào OPFS. */
  async receive(fileIds?: string[]) {
    const detail = this.state.detail;
    if (!detail || this.state.running) return;
    const wanted = fileIds ?? detail.files.map((f) => f.id);
    const targets = detail.files.filter(
      (f) => wanted.includes(f.id) && this.state.files[f.id]?.status !== "done",
    );
    if (!targets.length) return;
    targets.forEach((f) => this.patchFile(f.id, { status: "queued", error: undefined }));
    this.setState({ running: true });
    let lastVia: Via | null = null;
    for (const f of targets) {
      if (this.stopped || this.state.closed) break;
      try {
        lastVia = await this.receiveFile(f);
      } catch (err) {
        if (err instanceof Cancelled) break;
        this.patchFile(f.id, { status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }
    this.setState({ running: false });
    const allDone = wanted.every((id) => this.state.files[id]?.status === "done");
    this.report(allDone ? "done" : "receiving", lastVia, true);
  }

  private async receiveFile(initial: TransferFile): Promise<Via> {
    let meta = initial;
    const fileIndex = this.state.detail!.files.findIndex((f) => f.id === meta.id);
    const sink = await openSink(this.id, meta.id);
    this.patchFile(meta.id, { status: "receiving", bytes: sink.size });
    let via: Via = meta.source === "library" ? "server" : "p2p";
    let p2pBlocked = false;

    while (sink.size < meta.size) {
      if (this.stopped || this.state.closed) throw new Cancelled();
      if (meta.source === "library") {
        await this.receiveFromServer(meta, sink);
        break;
      }
      if (this.rtc?.isOpen && !p2pBlocked) {
        via = this.state.link === "turn" ? "turn" : "p2p";
        try {
          await this.receiveP2P(meta.id, sink);
          continue;
        } catch (err) {
          if (err instanceof Cancelled) throw err;
          if (err instanceof P2PUnavailable) {
            p2pBlocked = true;
            this.relayRequested.delete(meta.id);
            this.askRelay();
            continue;
          }
          // Kênh rớt giữa chừng → xin kết nối lại (trừ khi người gửi vừa tạo kết nối mới),
          // vòng sau dùng P2P mới hoặc relay từ offset hiện tại.
          if (this.hostConnId && !this.rtc) {
            this.signal({ kind: "hello" });
            this.expectConnection();
          }
          continue;
        }
      }
      // Đọc lại số part mới nhất (sự kiện xfer:relay cập nhật detail).
      meta = this.state.detail!.files.find((f) => f.id === meta.id) ?? meta;
      const relayUsable =
        this.key && (p2pBlocked || meta.relayParts > 0 || !this.hostConnId || this.state.link === "failed");
      if (relayUsable) {
        via = "relay";
        if (this.state.link === "failed") this.askRelay();
        await downloadFileFromRelay({
          transferId: this.id,
          token: this.token,
          fileId: meta.id,
          fileIndex,
          size: meta.size,
          key: this.key!,
          sink,
          waitForPart: (part) => this.waitForPart(meta.id, part),
          onBytes: () => this.progress(meta.id, sink.size, "relay"),
        });
        continue;
      }
      if (this.state.link === "failed" && !this.key) this.requestKey();
      await this.nextChange();
    }

    if (meta.size === 0 || sink.size >= meta.size) {
      const file = await sink.finish(meta.name, meta.mime);
      if (file.size !== meta.size) throw new Error("Dung lượng file nhận được không khớp");
      this.patchFile(meta.id, { status: "done", bytes: meta.size, via, file });
      this.report("receiving", via, true);
    }
    return via;
  }

  /** Chờ part `part` có trên relay (hoặc kênh P2P mở lại / dừng). */
  private async waitForPart(fileId: string, part: number) {
    for (;;) {
      if (this.stopped || this.state.closed) throw new Cancelled();
      const f = this.state.detail?.files.find((x) => x.id === fileId);
      if ((f?.relayParts ?? 0) > part) return;
      await this.nextChange();
    }
  }

  private async receiveFromServer(meta: TransferFile, sink: FileSink) {
    const { body, from } = await openLibraryContent(this.id, meta.id, sink.size, this.token);
    if (from !== sink.size) await sink.truncate(from);
    const reader = body.getReader();
    try {
      for (;;) {
        if (this.stopped) throw new Cancelled();
        const { done, value } = await reader.read();
        if (done) break;
        await sink.write(value.slice().buffer);
        this.progress(meta.id, sink.size, "server");
      }
    } finally {
      reader.releaseLock();
    }
  }
}
