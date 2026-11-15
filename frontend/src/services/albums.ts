import { createAlbumsService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const {
  fetchAlbums,
  fetchAlbum,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  convertAlbum,
  fetchAlbumMedia,
  addAlbumMedia,
  removeAlbumMedia,
  fetchAlbumMembers,
  inviteAlbumMembers,
  updateAlbumMember,
  removeAlbumMember,
  respondAlbumInvitation,
  fetchAlbumLinks,
  createAlbumLink,
  deleteAlbumLink,
  publicAlbumUrl,
  fetchPublicAlbum,
  reorderAlbumMedia,
  fetchAlbumsContaining,
  fetchAutoAlbums,
  fetchAutoAlbumMedia,
  saveAutoAlbum,
} = createAlbumsService(webHttp);
export const albumsContainingQueryKey = (mediaId: string) =>
  ["albums", "containing", mediaId] as const;
