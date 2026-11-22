import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileArchive, FolderUp } from "lucide-react";
import type { ImportSource } from "@tng/shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { entriesFromDrop, isFileDrag } from "@/features/gallery/upload/mediaFiles";
import { fileSource, fromDirectoryInput } from "../sources/fileSource";
import { zipSource } from "../sources/zipSource";

const isZip = (name: string) => name.toLowerCase().endsWith(".zip");

/** Chọn nguồn: các file .zip của Takeout (không cần giải nén) · thư mục đã giải nén · kéo thả cả hai. */
export const SourcePicker: React.FC<{ onSource: (source: ImportSource<File>) => void }> = ({ onSource }) => {
  const { t } = useTranslation();
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = async (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setOver(false);
    const entries = await entriesFromDrop(e.dataTransfer);
    if (!entries.length) return;
    onSource(entries.every((x) => isZip(x.file.name)) ? zipSource(entries.map((x) => x.file)) : fileSource(entries));
  };

  return (
    <div
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => void onDrop(e)}
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        over ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <p className="max-w-md text-sm text-muted-foreground">{t("takeout.sourceHint")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => zipRef.current?.click()}>
          <FileArchive className="size-4" />
          {t("takeout.pickZip")}
        </Button>
        <Button variant="outline" onClick={() => folderRef.current?.click()}>
          <FolderUp className="size-4" />
          {t("takeout.pickFolder")}
        </Button>
      </div>
      <input
        ref={zipRef}
        type="file"
        accept=".zip,application/zip"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onSource(zipSource(files));
        }}
      />
      <input
        ref={folderRef}
        type="file"
        // webkitdirectory: chọn cả thư mục; React chưa có kiểu cho thuộc tính này.
        {...{ webkitdirectory: "", directory: "" }}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onSource(fileSource(fromDirectoryInput(files)));
        }}
      />
    </div>
  );
};
