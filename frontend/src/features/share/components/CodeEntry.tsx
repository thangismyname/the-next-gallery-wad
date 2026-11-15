// Nhập mã 6 ký tự từ màn hình người gửi → token riêng cho phiên (không cần đăng nhập).
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redeemTransferCode, TransferHttpError } from "@/services/transfers";

interface CodeEntryProps {
  onResolved: (transferId: string, token: string) => void;
  initialValue?: string;
}

export const CodeEntry: React.FC<CodeEntryProps> = ({ onResolved, initialValue = "" }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(initialValue.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { transferId, token } = await redeemTransferCode(code);
      onResolved(transferId, token);
    } catch (err) {
      setError(err instanceof TransferHttpError ? err.message : t("transfer.codeFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder={t("transfer.codePlaceholder")}
          className="text-center font-mono text-lg tracking-[0.35em] uppercase"
          maxLength={6}
          autoComplete="off"
        />
        <Button onClick={submit} disabled={code.length !== 6 || busy} className="gap-1.5">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {t("transfer.codeSubmit")}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};
