// Dialog dùng chung cho pickMedia() — đặt 1 lần trong MainLayout.
import { type MediaListItem } from "@tng/shared";
import React, { useEffect, useState } from "react";
import { MediaPickerDialog } from "./MediaPickerDialog";
import { usePickRequest } from "./pickMedia";

export const MediaPickerHost: React.FC = () => {
  const request = usePickRequest((s) => s.request);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(Boolean(request)), [request]);
  if (!request) return null;

  const finish = (items: MediaListItem[] | null) => {
    request.resolve(items);
    setOpen(false);
    // Đợi hiệu ứng đóng rồi mới gỡ dialog.
    setTimeout(() => {
      if (usePickRequest.getState().request === request) usePickRequest.setState({ request: null });
    }, 200);
  };

  return (
    <MediaPickerDialog
      {...request}
      open={open}
      onOpenChange={(next) => !next && finish(null)}
      onConfirm={(items) => finish(items)}
    />
  );
};
