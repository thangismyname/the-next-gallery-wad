import { getInitials, resolveMediaUrl } from "@tng/shared";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";

/** Round avatar of a person in a moment (photo, else initials). */
export function PersonAvatar({ name, image, size = 36 }: { name: string; image?: string | null; size?: number }) {
  return (
    <Avatar alt={name} style={{ width: size, height: size }}>
      {image ? <AvatarImage source={{ uri: resolveMediaUrl(image) }} /> : null}
      <AvatarFallback>
        <Text className="font-semibold" style={{ fontSize: Math.max(9, size * 0.38) }}>
          {getInitials(name)}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}
