// Nơi ghi file đang nhận: OPFS (đĩa, qua worker) nếu trình duyệt hỗ trợ, không
// thì RAM (trình duyệt cũ / chế độ ẩn danh). `size` = số byte đã có → vị trí
// tải tiếp sau khi rớt mạng / tải lại trang (OPFS).

const ROOT = "tng-transfers";
/** Gom nhiều mảnh 64 KiB thành ~1 MiB mỗi lần ghi (ít round-trip sang worker). */
const FLUSH_BYTES = 1024 * 1024;

export interface FileSink {
  readonly size: number;
  write(data: ArrayBuffer): Promise<void>;
  /** Cắt về `size` byte (vd tải tiếp relay phải bắt đầu ở đầu 1 part). */
  truncate(size: number): Promise<void>;
  /** Ghi xong → File (OPFS: nằm trên đĩa, không tốn RAM). */
  finish(name: string, type: string): Promise<File>;
}

// ---- Worker OPFS (1 worker cho cả trang) ----

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function call<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL("./opfs.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data;
      const p = pending.get(id);
      pending.delete(id);
      if (ok) p?.resolve(result);
      else p?.reject(new Error(error));
    };
  }
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ ...msg, id }, transfer);
  });
}

let opfsSupport: Promise<boolean> | null = null;

/** OPFS + sync access handle dùng được không (thử thật 1 lần). */
export function opfsAvailable() {
  opfsSupport ??= (async () => {
    if (!navigator.storage?.getDirectory || typeof Worker === "undefined") return false;
    try {
      const path = [ROOT, "_probe"];
      await call({ op: "open", path });
      await call({ op: "remove", path });
      return true;
    } catch {
      return false;
    }
  })();
  return opfsSupport;
}

class OpfsSink implements FileSink {
  private buffered: Uint8Array[] = [];
  private bufferedBytes = 0;
  private written: number;

  constructor(
    private readonly path: string[],
    existing: number,
  ) {
    this.written = existing;
  }

  get size() {
    return this.written + this.bufferedBytes;
  }

  async write(data: ArrayBuffer) {
    this.buffered.push(new Uint8Array(data));
    this.bufferedBytes += data.byteLength;
    if (this.bufferedBytes >= FLUSH_BYTES) await this.flush();
  }

  private async flush() {
    if (this.bufferedBytes === 0) return;
    const block = new Uint8Array(this.bufferedBytes);
    let at = 0;
    for (const chunk of this.buffered) {
      block.set(chunk, at);
      at += chunk.byteLength;
    }
    const offset = this.written;
    this.buffered = [];
    this.bufferedBytes = 0;
    await call({ op: "write", path: this.path, offset, data: block.buffer }, [block.buffer]);
    this.written = offset + block.byteLength;
  }

  async truncate(size: number) {
    await this.flush();
    if (size >= this.written) return;
    await call({ op: "truncate", path: this.path, size });
    this.written = size;
  }

  async finish(name: string, type: string) {
    await this.flush();
    await call({ op: "close", path: this.path });
    let dir = await navigator.storage.getDirectory();
    for (const part of this.path.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(this.path[this.path.length - 1])).getFile();
    // File OPFS giữ tên nội bộ (fileId) → bọc lại với tên thật (vẫn trỏ dữ liệu trên đĩa).
    return new File([file], name, { type });
  }
}

class MemorySink implements FileSink {
  private chunks: ArrayBuffer[] = [];
  private bytes = 0;

  get size() {
    return this.bytes;
  }

  async write(data: ArrayBuffer) {
    this.chunks.push(data);
    this.bytes += data.byteLength;
  }

  async truncate(size: number) {
    if (size >= this.bytes) return;
    const kept: ArrayBuffer[] = [];
    let total = 0;
    for (const c of this.chunks) {
      if (total + c.byteLength <= size) {
        kept.push(c);
        total += c.byteLength;
      } else {
        if (size > total) kept.push(c.slice(0, size - total));
        total = size;
        break;
      }
    }
    this.chunks = kept;
    this.bytes = total;
  }

  async finish(name: string, type: string) {
    return new File(this.chunks, name, { type });
  }
}

/** Mở (hoặc mở lại để tải tiếp) nơi ghi cho 1 file của 1 phiên. */
export async function openSink(transferId: string, fileId: string): Promise<FileSink> {
  if (await opfsAvailable()) {
    const path = [ROOT, transferId, fileId];
    const existing = await call<number>({ op: "open", path });
    return new OpfsSink(path, existing);
  }
  return new MemorySink();
}

/** Xoá dữ liệu tạm của 1 phiên (đã lưu xong / bỏ). */
export async function removeTransferData(transferId: string) {
  if (await opfsAvailable()) await call({ op: "remove", path: [ROOT, transferId] }).catch(() => {});
}

/** Dọn dữ liệu tạm của các phiên khác (bỏ dở) — chỉ giữ `keep`. */
export async function cleanupTransferData(keep: string[]) {
  if (!(await opfsAvailable())) return;
  try {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT, { create: true });
    const names: string[] = [];
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
    for (const name of names) {
      if (!keep.includes(name)) await call({ op: "remove", path: [ROOT, name] }).catch(() => {});
    }
  } catch {
    // không dọn được — bỏ qua
  }
}
