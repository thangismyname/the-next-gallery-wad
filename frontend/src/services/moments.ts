import { createMomentsService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const {
  fetchMoments,
  createMoment,
  fillMomentSlots,
  updateDraftMoment,
  fetchMomentInvitations,
  fetchMomentInvitationCount,
  patchMoment,
  deleteMoment,
  leaveMoment,
  reactToMoment,
  removeMomentReaction,
  fetchMemeTemplates,
  fetchMomentMemes,
  createMomentMeme,
  deleteMomentMeme,
  toggleMemeReaction,
} = createMomentsService(webHttp);
