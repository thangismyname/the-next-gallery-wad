// Nối engine gửi / nhận (ngoài React) vào component qua useSyncExternalStore.
import { useEffect, useState, useSyncExternalStore } from "react";
import { hostRegistry } from "./engine/hostRegistry";
import type { HostState } from "./engine/host";
import { TransferReceiver, type ReceiverState } from "./engine/receiver";
import { cleanupTransferData } from "./engine/sink";

const noopSubscribe = () => () => {};
const nullState = () => null;

/** Phiên đang phát trong tab này (null = không còn File trên máy / chưa phát). */
export function useTransferHost(id: string | null) {
  const hosts = useSyncExternalStore(hostRegistry.subscribe, () => hostRegistry.getState().hosts);
  const host = id ? (hosts[id] ?? null) : null;
  const state = useSyncExternalStore<HostState | null>(
    host ? host.subscribe : noopSubscribe,
    host ? host.getState : nullState,
  );
  return { host, state };
}

/** Đọc `#t=<token>&k=<khoá>` của link nhận. */
export function parseReceiveFragment(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return { token: params.get("t"), key: params.get("k") };
}

/** 1 người nhận cho trang /r/:id — tạo khi mount, dừng khi rời trang. */
export function useTransferReceiver(id: string, token: string | null, key: string | null) {
  const [receiver, setReceiver] = useState<TransferReceiver | null>(null);

  useEffect(() => {
    const r = new TransferReceiver(id, token, key);
    setReceiver(r);
    void r.start();
    // Dữ liệu tạm của các phiên khác (bỏ dở từ trước) → dọn.
    void cleanupTransferData([id]);
    return () => r.stop();
  }, [id, token, key]);

  const state = useSyncExternalStore<ReceiverState | null>(
    receiver ? receiver.subscribe : noopSubscribe,
    receiver ? receiver.getState : nullState,
  );
  return { receiver, state };
}
