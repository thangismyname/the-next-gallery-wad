import React, { useState } from "react";
import { Eye, EyeOff } from "lucide";
import { MorphIcon } from "morphicons/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "type">;

/** Ô mật khẩu có nút con mắt ẩn/hiện — dùng chung cho login/register/reset. */
export const PasswordInput: React.FC<Props> = ({ className, ...props }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <MorphIcon icon={visible ? EyeOff : Eye} size={16} />
      </button>
    </div>
  );
};
