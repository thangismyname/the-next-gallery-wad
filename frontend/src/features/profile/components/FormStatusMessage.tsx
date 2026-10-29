import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type FormStatus = { type: "success" | "error"; message: string } | null;

/** Thông báo kết quả lưu form (thành công / lỗi) dùng chung trong trang hồ sơ. */
export const FormStatusMessage: React.FC<{ status: FormStatus }> = ({
  status,
}) => {
  if (!status) return null;
  if (status.type === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{status.message}</AlertDescription>
      </Alert>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-4" />
      {status.message}
    </p>
  );
};
