import { resolveMediaUrl, type MediaListItem } from "@tng/shared";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MomentReview } from "@/features/camera/components/MomentReview";
import { LibraryPickGrid } from "@/features/gallery/components/LibraryPickGrid";
import { FormModal } from "@/features/profile/components/FormModal";

/**
 * `/moment-library` (header "+" → "Moment from your library"): pick a photo / video that's already
 * in the account → the same review screen as the camera (frame + caption + Post). No upload — the
 * moment is created straight from its media id.
 */
export function MomentLibraryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<MediaListItem | null>(null);
  const [reviewing, setReviewing] = useState(false);

  return (
    <>
      <FormModal
        title={t("moments.fromAccountMenu")}
        action={t("profile.avatarNext")}
        canSubmit={!!selected}
        saving={false}
        onSubmit={() => setReviewing(true)}
        scroll={false}
      >
        <LibraryPickGrid
          includeVideos
          browse
          hint={t("moments.fromAccountHint")}
          selectedIds={selected ? [selected.id] : []}
          onSelect={setSelected}
          bottomInset={insets.bottom}
        />
      </FormModal>
      {reviewing && selected ? (
        <MomentReview
          draft={{
            mediaId: selected.id,
            video: selected.mediaType === "video",
            uri: resolveMediaUrl(
              selected.mediaType === "video" ? selected.url : (selected.displayUrl ?? selected.thumbnailUrl),
            ),
          }}
          onClose={() => setReviewing(false)}
          onPosted={() => router.back()}
        />
      ) : null}
    </>
  );
}
