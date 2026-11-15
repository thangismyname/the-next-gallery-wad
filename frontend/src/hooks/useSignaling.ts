import { useCallback, useEffect } from "react";

import SignalingClient from "@/services/signaling";
import { WS_URL } from "@/lib/config";

type SignalPayload = Record<string, unknown>;
type SignalHandler = (payload: SignalPayload) => void;

// Một WebSocket duy nhất dùng chung cho toàn app (signaling + presence +
// moment collab invite). Mọi component gọi `useSignaling()` đều nhận cùng client,
// hỗ trợ nhiều subscriber trên một kết nối. Disconnect chỉ xảy ra khi không còn
// component nào mount (subscriberCount về 0 — thường là lúc logout/MainLayout unmount).
let sharedClient: SignalingClient | null = null;
let subscriberCount = 0;

/** Client dùng chung (tạo + kết nối nếu chưa) — cho engine ngoài React (gửi file). */
export function getSignalingClient(): SignalingClient {
  if (!sharedClient) {
    sharedClient = new SignalingClient(WS_URL);
  }
  if (!sharedClient.isConnected() && !sharedClient.isConnecting()) {
    sharedClient.connect();
  }
  return sharedClient;
}

export function useSignaling() {
  const getClient = useCallback(getSignalingClient, []);

  useEffect(() => {
    subscriberCount += 1;
    return () => {
      subscriberCount -= 1;
      if (subscriberCount <= 0) {
        sharedClient?.disconnect();
        sharedClient = null;
        subscriberCount = 0;
      }
    };
  }, []);

  return {
    send: (type: string, payload: SignalPayload = {}) =>
      getClient().send(type, payload),
    on: (type: string, handler: SignalHandler) => getClient().on(type, handler),
    isConnected: () => getClient().isConnected(),
    disconnect: () => sharedClient?.disconnect(),
  };
}