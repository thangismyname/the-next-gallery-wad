// Lưu file đã nhận: về máy (tải xuống / ghi vào thư mục) hoặc vào thư viện.
import { uploadMediaInBatches } from "@/services/upload";

type DirectoryPicker = (opts?: { mode?: "readwrite" }) => Promise<FileSystemDirectoryHandle>;

function downloadOne(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  // Thu hồi ngay sẽ làm Safari/Firefox tải hỏng — chờ trình duyệt bắt đầu tải.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Chrome/Edge desktop: chọn 1 thư mục rồi ghi thẳng mọi file vào đó. */
export const canPickFolder = () =>
  typeof (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker === "function";

async function uniqueName(dir: FileSystemDirectoryHandle, name: string) {
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? name : `${base} (${i})${ext}`;
    try {
      await dir.getFileHandle(candidate);
    } catch {
      return candidate;
    }
  }
}

export async function saveToFolder(files: File[]) {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  const dir = await picker({ mode: "readwrite" });
  for (const file of files) {
    const handle = await dir.getFileHandle(await uniqueName(dir, file.name), { create: true });
    const writable = await (handle as unknown as { createWritable(): Promise<WritableStream> }).createWritable();
    await file.stream().pipeTo(writable);
  }
}

/** Tải lần lượt (trình duyệt có thể hỏi "cho phép tải nhiều file"). */
export async function saveToDevice(files: File[]) {
  for (const [i, file] of files.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400));
    downloadOne(file);
  }
}

/** Upload vào thư viện (cần đăng nhập). */
export const saveToLibrary = (files: File[], onProgress?: (done: number, total: number) => void) =>
  uploadMediaInBatches(files, (p) => onProgress?.(p.uploadedCount, p.totalCount), 5);
