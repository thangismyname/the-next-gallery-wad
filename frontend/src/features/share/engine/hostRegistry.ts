// Các phiên đang phát trong tab này — sống suốt lúc dùng app (chuyển trang không
// dừng gửi). Đóng / tải lại trang thì File trên máy mất → chỉ còn relay.
import { Observable } from "./observable";
import type { TransferHost } from "./host";

class HostRegistry extends Observable<{ hosts: Record<string, TransferHost> }> {
  constructor() {
    super({ hosts: {} });
    window.addEventListener("beforeunload", (e) => {
      if (Object.values(this.state.hosts).some((h) => h.busy)) e.preventDefault();
    });
  }

  get(id: string) {
    return this.state.hosts[id] ?? null;
  }

  add(host: TransferHost) {
    this.state.hosts[host.id]?.stop();
    host.start();
    this.setState((s) => ({ hosts: { ...s.hosts, [host.id]: host } }));
  }

  remove(id: string) {
    this.state.hosts[id]?.stop();
    this.setState((s) => {
      const hosts = { ...s.hosts };
      delete hosts[id];
      return { hosts };
    });
  }

  clear() {
    Object.values(this.state.hosts).forEach((h) => h.stop());
    this.setState({ hosts: {} });
  }
}

export const hostRegistry = new HostRegistry();
