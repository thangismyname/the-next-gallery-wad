import { useCallback, useEffect, useRef, useState } from "react";

import {
  Peer,
  FileMetadata,
  TransferProgress,
  ShareRoomInfo,
  ShareInvite,
} from "@/types";
import { SIGNAL } from "@/services/signaling";
import { useSignaling } from "@/hooks/useSignaling";
import {
  RTC_CONFIG_INTERNET,
  RTC_CONFIG_LAN,
  WebRTCPeer,
  WebRTCManager,
} from "@/services/webrtc";
import {
  TransferSource,
  useFileTransfer,
} from "@/hooks/useFileTransfer";

// ==========================================================
// useShare — Orchestrator cho chia sẻ ảnh P2P
// ==========================================================
// Kết hợp signaling (WS) + WebRTC + file transfer:
//   - Host: createSession(mediaIds) → chờ peer join → auto connect RTC
//   - Peer: joinRoom(code) → nhận offer → answer → P2P
//   - Host: sendToPeer(peerId, sources) → metadata → accept → chunks
//   - Peer: acceptTransfer/rejectTransfer khi có pendingTransfer
// ==========================================================

export type ShareMode = "webrtc" | "relay" | "lan";
export type RtcState = "idle" | "connecting" | "connected" | "failed";
export type UseShare = ReturnType<typeof useShare>;

interface PendingTransfer {
  senderId: string;
  sessionId: string;
  files: FileMetadata[];
}

interface ReceivedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  chunks: ArrayBuffer[];
}

type SignalPayload = Record<string, unknown>;
type SignalHandler = (payload: SignalPayload) => void;

const CONNECT_TIMEOUT_MS = 30_000;

export function useShare() {
  const signaling = useSignaling();
  const { sendFiles, startReceiving } = useFileTransfer();

  const managerRef = useRef<WebRTCManager | null>(null);
  const sessionRef = useRef<ShareRoomInfo | null>(null);
  const hostUserIdRef = useRef<string | null>(null);
  const modeRef = useRef<ShareMode>("webrtc");
  const isHostRef = useRef(false);
  const metadataRef = useRef<FileMetadata[]>([]);
  const receiveCleanupRef = useRef<(() => void) | null>(null);

  const [session, setSession] = useState<ShareRoomInfo | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connStates, setConnStates] = useState<Record<string, RtcState>>({});
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [invites, setInvites] = useState<ShareInvite[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Friend presence: userId → { userId, username, avatarUrl } of online friends
  const [presence, setPresence] = useState<Record<string, { userId: string; username: string; avatarUrl?: string | null }>>({});

  const getManager = useCallback(() => {
    if (!managerRef.current) managerRef.current = new WebRTCManager();
    return managerRef.current;
  }, []);

  const rtcConfig = () => (modeRef.current === "lan" ? RTC_CONFIG_LAN : RTC_CONFIG_INTERNET);

  // ---- Wire RTC peer events (ice relay + connection state) ----
  const wirePeer = useCallback(
    (rtcPeer: WebRTCPeer) => {
      rtcPeer.on("ice-candidate", (candidate) => {
        signaling.send(SIGNAL.SIGNAL_ICE, {
          to: rtcPeer.peerId,
          candidate,
        });
      });
      rtcPeer.on("connection-state", (state) => {
        const value = state as RTCPeerConnectionState;
        const mapped: RtcState =
          value === "connected"
            ? "connected"
            : value === "failed" || value === "disconnected" || value === "closed"
              ? "failed"
              : "connecting";
        setConnStates((prev) => ({ ...prev, [rtcPeer.peerId]: mapped }));
      });
    },
    [signaling],
  );

  const ensurePeer = useCallback(
    (peerId: string): WebRTCPeer => {
      const existing = getManager().getPeer(peerId);
      if (existing) return existing;
      const rtcPeer = getManager().createPeer(peerId, rtcConfig());
      wirePeer(rtcPeer);
      return rtcPeer;
    },
    [getManager, wirePeer],
  );

  // ---- Offerer: tạo DataChannel + offer ----
  const connectToPeer = useCallback(
    async (peerId: string): Promise<void> => {
      const rtcPeer = ensurePeer(peerId);
      setConnStates((prev) => ({ ...prev, [peerId]: "connecting" }));
      if (rtcPeer.dc) return; // đã setup
      rtcPeer.createDataChannel();
      const offer = await rtcPeer.createOffer();
      signaling.send(SIGNAL.SIGNAL_OFFER, { to: peerId, offer });
    },
    [ensurePeer, signaling],
  );

  // ---- Answerer: nhận offer → tạo answer ----
  const handleIncomingOffer = useCallback(
    async (from: string, offer: RTCSessionDescriptionInit): Promise<void> => {
      const rtcPeer = ensurePeer(from);
      setConnStates((prev) => ({ ...prev, [from]: "connecting" }));
      const answer = await rtcPeer.createAnswer(offer);
      signaling.send(SIGNAL.SIGNAL_ANSWER, { to: from, answer });
    },
    [ensurePeer, signaling],
  );

  // ---- Chờ DataChannel mở ----
  const waitForChannel = useCallback((peerId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const rtcPeer = getManager().getPeer(peerId);
      if (!rtcPeer) return reject(new Error("Không có peer"));
      if (rtcPeer.dc?.readyState === "open") return resolve();

      const off = rtcPeer.on("connected", () => {
        cleanup();
        resolve();
      });
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Không kết nối được DataChannel"));
      }, CONNECT_TIMEOUT_MS);
      function cleanup() {
        clearTimeout(timer);
        off();
      }
    });
  }, [getManager]);

  // ---- WS subscriptions (mount 1 lần) ----
  useEffect(() => {
    const offs: Array<() => void> = [];

    offs.push(
      signaling.on(SIGNAL.ROOM_CREATED, (payload) => {
        const p = payload as { roomId: string; roomCode: string; sessionId: string | null; expiresAt: number };
        const info: ShareRoomInfo = {
          roomId: p.roomId,
          roomCode: p.roomCode,
          sessionId: p.sessionId,
          expiresAt: p.expiresAt,
        };
        sessionRef.current = info;
        hostUserIdRef.current = "self";
        isHostRef.current = true;
        setSession(info);
        setIsHost(true);
      }),
    );

    offs.push(
      signaling.on(SIGNAL.ROOM_JOINED, (payload) => {
        const p = payload as { room: { id: string; code: string; hostUserId: string; expiresAt: number }; peers: Peer[] };
        const info: ShareRoomInfo = {
          roomId: p.room.id,
          roomCode: p.room.code,
          sessionId: null,
          expiresAt: p.room.expiresAt,
        };
        sessionRef.current = info;
        hostUserIdRef.current = p.room.hostUserId;
        isHostRef.current = false;
        setSession(info);
        setIsHost(false);
        setPeers(p.peers.map((peer) => ({ ...peer, isOnline: true })));
      }),
    );

    offs.push(
      signaling.on(SIGNAL.ROOM_PEER_JOINED, (payload) => {
        const p = payload as { peer: Peer };
        const onlinePeer: Peer = { ...p.peer, isOnline: true };
        setPeers((prev) =>
          prev.some((pp) => pp.userId === onlinePeer.userId)
            ? prev
            : [...prev, onlinePeer],
        );
        // Host tự connect RTC tới peer vừa vào
        if (isHostRef.current) {
          void connectToPeer(onlinePeer.userId).catch(() => undefined);
        }
      }),
    );

    offs.push(
      signaling.on(SIGNAL.ROOM_PEER_LEFT, (payload) => {
        const p = payload as { peerId: string };
        setPeers((prev) => prev.filter((pp) => pp.userId !== p.peerId));
        setConnStates((prev) => {
          const next = { ...prev };
          delete next[p.peerId];
          return next;
        });
        getManager().closePeer(p.peerId);
      }),
    );

    offs.push(
      signaling.on(SIGNAL.SIGNAL_OFFER, (payload) => {
        const p = payload as { from: string; offer: RTCSessionDescriptionInit };
        void handleIncomingOffer(p.from, p.offer).catch(() => undefined);
      }),
    );

    offs.push(
      signaling.on(SIGNAL.SIGNAL_ANSWER, (payload) => {
        const p = payload as { from: string; answer: RTCSessionDescriptionInit };
        const rtcPeer = getManager().getPeer(p.from);
        void rtcPeer?.setRemoteAnswer(p.answer).catch(() => undefined);
      }),
    );

    offs.push(
      signaling.on(SIGNAL.SIGNAL_ICE, (payload) => {
        const p = payload as { from: string; candidate: RTCIceCandidateInit };
        const rtcPeer = getManager().getPeer(p.from);
        if (rtcPeer) void rtcPeer.addIceCandidate(p.candidate).catch(() => undefined);
      }),
    );

    offs.push(
      signaling.on(SIGNAL.ERROR, (payload) => {
        const p = payload as { code?: string; message?: string };
        if (p.code === "ROOM_DESTROYED") {
          sessionRef.current = null;
          isHostRef.current = false;
          setSession(null);
          setPeers([]);
          setPendingTransfer(null);
          setProgress(null);
        }
        setError(p.message || p.code || "Có lỗi xảy ra");
      }),
    );

    offs.push(
      signaling.on(SIGNAL.SHARE_INVITE, (payload) => {
        const p = payload as Partial<ShareInvite>;
        if (!p.sessionId || !p.roomCode || !p.senderId || !p.senderName) return;
        setInvites((prev) =>
          prev.some((invite) => invite.sessionId === p.sessionId)
            ? prev
            : [...prev, p as ShareInvite],
        );
      }),
    );

    // App-wide friend presence (from presence.service.js broadcast)
    offs.push(
      signaling.on(SIGNAL.PRESENCE_SNAPSHOT, (payload) => {
        const online = payload.online as
          | Array<{ userId: string; username: string; avatarUrl?: string | null }>
          | undefined;
        if (!Array.isArray(online)) return;
        const next: typeof presence = {};
        for (const user of online) {
          if (user.userId) next[user.userId] = user;
        }
        setPresence(next);
      }),
    );

    offs.push(
      signaling.on(SIGNAL.PRESENCE_ONLINE, (payload) => {
        const user = payload.user as
          | { userId: string; username: string; avatarUrl?: string | null }
          | undefined;
        if (!user?.userId) return;
        setPresence((prev) => ({ ...prev, [user.userId]: user }));
      }),
    );

    offs.push(
      signaling.on(SIGNAL.PRESENCE_OFFLINE, (payload) => {
        const userId = payload.userId as string | undefined;
        if (!userId) return;
        setPresence((prev) => {
          if (!(userId in prev)) return prev;
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }),
    );

    offs.push(
      signaling.on(SIGNAL.TRANSFER_METADATA, (payload) => {
        const p = payload as { from: string; sessionId: string; files: FileMetadata[] };
        if (!Array.isArray(p.files)) return;
        metadataRef.current = p.files;
        setPendingTransfer({ senderId: p.from, sessionId: p.sessionId, files: p.files });
      }),
    );

    return () => {
      offs.forEach((off) => off());
      receiveCleanupRef.current?.();
      getManager().closeAll();
      setPeers([]);
      setSession(null);
      setPendingTransfer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Actions ----

  const createSession = useCallback(
    (mediaIds: string[], mode: ShareMode = "webrtc") => {
      modeRef.current = mode;
      setError(null);
      signaling.send(SIGNAL.ROOM_CREATE, { mediaIds });
    },
    [signaling],
  );

  const joinRoom = useCallback(
    (roomCode: string, mode: ShareMode = "webrtc") => {
      modeRef.current = mode;
      setError(null);
      signaling.send(SIGNAL.ROOM_JOIN, { roomCode });
    },
    [signaling],
  );

  const leaveRoom = useCallback(() => {
    signaling.send(SIGNAL.ROOM_LEAVE, {});
    receiveCleanupRef.current?.();
    receiveCleanupRef.current = null;
    getManager().closeAll();
    isHostRef.current = false;
    setSession(null);
    setPeers([]);
    setIsHost(false);
    setPendingTransfer(null);
    setProgress(null);
    setReceivedFiles([]);
    setError(null);
  }, [getManager, signaling]);

  const sendToPeer = useCallback(
    async (peerId: string, sources: TransferSource[], onDone?: () => void): Promise<void> => {
      try {
        const rtcPeer = getManager().getPeer(peerId);
        if (!rtcPeer) {
          await connectToPeer(peerId);
        }
        await waitForChannel(peerId);

        const sid = sessionRef.current?.sessionId;
        if (!sid) throw new Error("Chưa có session chia sẻ");

        setProgress({
          sessionId: sid,
          totalFiles: sources.length,
          completedFiles: 0,
          currentFile: sources[0]?.name ?? "",
          bytesTransferred: 0,
          totalBytes: sources.reduce((sum, s) => sum + s.size, 0),
          speed: 0,
          eta: 0,
          status: "preparing",
        });

        const sleevePeer = getManager().getPeer(peerId);
        if (!sleevePeer) throw new Error("Mất peer");
        await sendFiles(
          { peerId, sessionId: sid, peer: sleevePeer, signaling, files: sources },
          setProgress,
          () => {
            onDone?.();
          },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gửi file thất bại");
        setProgress(null);
      }
    },
    [connectToPeer, getManager, sendFiles, signaling, waitForChannel],
  );

  const acceptTransfer = useCallback(
    (saveFile: (received: ReceivedFile) => void) => {
      const pending = pendingTransfer;
      if (!pending) return;

      signaling.send(SIGNAL.TRANSFER_ACCEPT, {
        sessionId: pending.sessionId,
        from: pending.senderId,
      });
      setPendingTransfer(null);
      setProgress({
        sessionId: pending.sessionId,
        totalFiles: pending.files.length,
        completedFiles: 0,
        currentFile: "",
        bytesTransferred: 0,
        totalBytes: pending.files.reduce((sum, f) => sum + f.size, 0),
        speed: 0,
        eta: 0,
        status: "transferring",
      });

      const rtcPeer = getManager().getPeer(pending.senderId);
      if (!rtcPeer) {
        setProgress(null);
        return;
      }

      const cleanupReceiving = startReceiving(
        { senderId: pending.senderId, sessionId: pending.sessionId, peer: rtcPeer, signaling },
        (files) => metadataRef.current = files,
        (fileId, chunks) => {
          setReceivedFiles((prev) => {
            const meta = metadataRef.current.find((m) => m.id === fileId);
            const received: ReceivedFile = {
              id: fileId,
              name: meta?.name ?? "file",
              type: meta?.type ?? "application/octet-stream",
              size: chunks.reduce((sum, c) => sum + c.byteLength, 0),
              chunks,
            };
            saveFile(received);
            return [...prev, received];
          });
        },
        () => {
          setProgress((prev) => (prev ? { ...prev, status: "completed" } : prev));
          receiveCleanupRef.current = null;
          setTimeout(() => setProgress(null), 1500);
        },
      );
      receiveCleanupRef.current = cleanupReceiving;
    },
    [getManager, pendingTransfer, signaling, startReceiving],
  );

  const rejectTransfer = useCallback(() => {
    const pending = pendingTransfer;
    if (!pending) return;
    signaling.send(SIGNAL.TRANSFER_REJECT, {
      sessionId: pending.sessionId,
      from: pending.senderId,
    });
    setPendingTransfer(null);
  }, [pendingTransfer, signaling]);

  const dismissInvite = useCallback((sessionId: string) => {
    setInvites((prev) => prev.filter((invite) => invite.sessionId !== sessionId));
  }, []);

  return {
    session,
    isHost,
    peers,
    connStates,
    pendingTransfer,
    progress,
    receivedFiles,
    invites,
    error,
    presence,
    isFriendOnline: (userId: string) => Boolean(presence[userId]),
    createSession,
    joinRoom,
    leaveRoom,
    connectToPeer,
    sendToPeer,
    acceptTransfer,
    rejectTransfer,
    dismissInvite,
    clearError: () => setError(null),
  };
}

export type { SignalPayload, SignalHandler, ReceivedFile, PendingTransfer };