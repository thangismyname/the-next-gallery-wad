import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getInitials } from "@/utils/string";

/** Avatar + tên + email (1 dòng mỗi thứ, cắt khi dài). */
export function UserCell({
  name,
  email,
  image,
  className,
}: {
  name: string | null;
  email: string;
  image: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar className="size-8 shrink-0">
        {image ? <AvatarImage src={image} alt="" /> : null}
        <AvatarFallback className="text-xs">
          {getInitials(name || email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name || email}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
    </div>
  );
}
