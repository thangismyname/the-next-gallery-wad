// 1 kết nối WebRTC (RTCPeerConnection + 1 DataChannel) giữa người gửi và 1
// người nhận. Người gửi luôn là bên tạo offer (không bao giờ "đụng" offer).
// - Hàng đợi ICE: candidate tới trước remote description được giữ lại, không bị mất.
// - Kiểm soát tốc độ: `waitDrain()` theo bufferedAmount (không ACK từng mảnh).
// - `via()`: cặp candidate đang dùng có qua TURN (relay) hay đi thẳng.
import { DC_HIGH_WATER, DC_LOW_WATER, type DcMessage, type SignalData } from "./protocol";

const CHANNEL_LABEL = "tng-transfer";

export interface RtcLinkOptions {
  iceServers: RTCIceServer[];
  initiator: boolean;
  sendSignal: (data: SignalData) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (msg: DcMessage) => void;
  onBinary?: (data: ArrayBuffer) => void;
}

export class RtcLink {
  readonly pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private closed = false;
  private drainWaiters: Array<() => void> = [];

  constructor(private readonly opts: RtcLinkOptions) {
    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) opts.sendSignal({ kind: "ice", candidate: e.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") this.close();
    };
    this.pc.ondatachannel = (e) => this.wire(e.channel);
    if (opts.initiator) {
      this.wire(this.pc.createDataChannel(CHANNEL_LABEL, { ordered: true }));
      void this.makeOffer();
    }
  }

  get isOpen() {
    return this.dc?.readyState === "open";
  }

  private async makeOffer() {
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.opts.sendSignal({ kind: "offer", sdp: offer });
    } catch {
      this.close();
    }
  }

  async handleSignal(data: SignalData) {
    if (this.closed) return;
    try {
      if (data.kind === "offer") {
        await this.pc.setRemoteDescription(data.sdp);
        await this.flushIce();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.opts.sendSignal({ kind: "answer", sdp: answer });
      } else if (data.kind === "answer") {
        await this.pc.setRemoteDescription(data.sdp);
        await this.flushIce();
      } else if (data.kind === "ice") {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(data.candidate);
        else this.pendingIce.push(data.candidate);
      }
    } catch {
      // Candidate lỗi lẻ tẻ không làm hỏng kết nối; offer/answer lỗi → onconnectionstatechange xử lý.
    }
  }

  private async flushIce() {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const c of queued) await this.pc.addIceCandidate(c).catch(() => {});
  }

  private wire(dc: RTCDataChannel) {
    this.dc = dc;
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = DC_LOW_WATER;
    dc.onopen = () => this.opts.onOpen?.();
    dc.onclose = () => this.close();
    dc.onbufferedamountlow = () => {
      const waiters = this.drainWaiters;
      this.drainWaiters = [];
      waiters.forEach((w) => w());
    };
    dc.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          this.opts.onMessage?.(JSON.parse(e.data) as DcMessage);
        } catch {
          // bỏ message hỏng
        }
      } else {
        this.opts.onBinary?.(e.data as ArrayBuffer);
      }
    };
  }

  send(msg: DcMessage) {
    if (this.isOpen) this.dc!.send(JSON.stringify(msg));
  }

  /** Gửi 1 mảnh nhị phân; chờ nếu hàng đợi gửi đã đầy. Ném lỗi nếu kênh đóng. */
  async sendBinary(data: ArrayBuffer) {
    if (!this.isOpen) throw new Error("DataChannel đã đóng");
    if (this.dc!.bufferedAmount > DC_HIGH_WATER) await this.waitDrain();
    if (!this.isOpen) throw new Error("DataChannel đã đóng");
    this.dc!.send(data);
  }

  private waitDrain() {
    return new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  /** p2p = đi thẳng (host/srflx/prflx), turn = qua máy chủ TURN. */
  async via(): Promise<"p2p" | "turn"> {
    try {
      const stats = await this.pc.getStats();
      let pairId: string | undefined;
      stats.forEach((s) => {
        if (s.type === "transport" && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
      });
      let pair: RTCIceCandidatePairStats | undefined;
      stats.forEach((s) => {
        if (s.type === "candidate-pair" && (s.id === pairId || (!pairId && s.nominated && s.state === "succeeded"))) {
          pair = s as RTCIceCandidatePairStats;
        }
      });
      if (!pair) return "p2p";
      const local = stats.get(pair.localCandidateId);
      const remote = stats.get(pair.remoteCandidateId);
      return local?.candidateType === "relay" || remote?.candidateType === "relay" ? "turn" : "p2p";
    } catch {
      return "p2p";
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    waiters.forEach((w) => w());
    try {
      this.dc?.close();
      this.pc.close();
    } catch {
      // đã đóng
    }
    this.opts.onClose?.();
  }
}
