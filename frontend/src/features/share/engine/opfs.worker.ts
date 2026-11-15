// Ghi file đang nhận vào OPFS (Origin Private File System) bằng sync access
// handle — chỉ có trong Worker. File nằm trên đĩa, không trong RAM → nhận được
// video nhiều GB; kích thước file trên đĩa = vị trí để tải tiếp.

interface SyncHandle {
  write(data: BufferSource, opts: { at: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}

type WorkerRequest =
  | { id: number; op: "open"; path: string[] }
  | { id: number; op: "write"; path: string[]; offset: number; data: ArrayBuffer }
  | { id: number; op: "truncate"; path: string[]; size: number }
  | { id: number; op: "close"; path: string[] }
  | { id: number; op: "remove"; path: string[] };

const handles = new Map<string, SyncHandle>();
// tsconfig dùng lib DOM (không có kiểu WorkerGlobalScope).
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
};

async function dirFor(path: string[], create: boolean) {
  let dir = await navigator.storage.getDirectory();
  for (const name of path.slice(0, -1)) dir = await dir.getDirectoryHandle(name, { create });
  return dir;
}

async function handleFor(path: string[]) {
  const key = path.join("/");
  let h = handles.get(key);
  if (!h) {
    const dir = await dirFor(path, true);
    const file = await dir.getFileHandle(path[path.length - 1], { create: true });
    h = await (file as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
    handles.set(key, h);
  }
  return h;
}

function closeHandle(path: string[]) {
  const key = path.join("/");
  const h = handles.get(key);
  if (!h) return;
  h.flush();
  h.close();
  handles.delete(key);
}

scope.onmessage = async (event) => {
  const msg = event.data;
  try {
    let result: unknown = null;
    switch (msg.op) {
      case "open":
        result = (await handleFor(msg.path)).getSize();
        break;
      case "write": {
        const h = await handleFor(msg.path);
        h.write(msg.data, { at: msg.offset });
        result = h.getSize();
        break;
      }
      case "truncate":
        (await handleFor(msg.path)).truncate(msg.size);
        break;
      case "close":
        closeHandle(msg.path);
        break;
      case "remove": {
        // Xoá cả thư mục (path = [root, transferId]) hoặc 1 file.
        const prefix = msg.path.join("/");
        for (const key of [...handles.keys()]) {
          if (key === prefix || key.startsWith(`${prefix}/`)) closeHandle(key.split("/"));
        }
        const dir = await dirFor(msg.path, false).catch(() => null);
        await dir?.removeEntry(msg.path[msg.path.length - 1], { recursive: true }).catch(() => {});
        break;
      }
    }
    scope.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    scope.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

export {};
