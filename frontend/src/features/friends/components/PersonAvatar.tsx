import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getInitials } from "@tng/shared";

/** Avatar + chấm online (undefined = không hiện chấm). */
export const PersonAvatar: React.FC<{
  name: string;
  src?: string | null;
  online?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}> = ({ name, src, online, size = "default", className }) => (
  <span className={cn("relative shrink-0", className)}>
    <Avatar size={size}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
    {online !== undefined && (
      <span
        className={cn(
          "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background",
          online ? "bg-emerald-500" : "bg-muted-foreground/30",
        )}
      />
    )}
  </span>
);
