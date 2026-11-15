/**
 * API services for the app — the shared `@tng/shared` factories bound to the
 * mobile HTTP client (session cookie from SecureStore). Screens call these via
 * React Query hooks in their feature folder; never `fetch` in components.
 */
import {
  createAdminService,
  createAiProcessingService,
  createAlbumsService,
  createDeveloperService,
  createFriendsService,
  createLabelsService,
  createMediaService,
  createMomentsService,
  createProfileService,
} from "@tng/shared";

import { mobileHttp } from "@/lib/http/mobile";

export const mediaApi = createMediaService(mobileHttp);
export const albumsApi = createAlbumsService(mobileHttp);
export const labelsApi = createLabelsService(mobileHttp);
export const momentsApi = createMomentsService(mobileHttp);
export const friendsApi = createFriendsService(mobileHttp);
export const profileApi = createProfileService(mobileHttp);
export const aiProcessingApi = createAiProcessingService(mobileHttp);
export const developerApi = createDeveloperService(mobileHttp);
export const adminApi = createAdminService(mobileHttp);
