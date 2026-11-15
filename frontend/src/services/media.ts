import { createMediaService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";
import { API_URL } from "@/lib/config";

export const {
  fetchMedia,
  fetchMediaByIds,
  uploadMedia,
  fetchFavorites,
  fetchMediaByFilter,
  searchGallerySemantic,
  searchGalleryObjects,
  fetchObjectClasses,
  fetchMediaDetections,
  fetchSimilarMedia,
  fetchMediaEdit,
  saveMediaEdit,
  deleteMediaEdit,
  searchAlbums,
  fetchTrash,
  setFavorite,
  moveToTrash,
  restoreMedia,
  permanentDeleteMedia,
  emptyTrash,
  fetchTagSummary,
  fetchTagMedia,
  fetchTagCatalog,
  fetchMediaTags,
  downloadUrl,
} = createMediaService(webHttp);

/** Tải bản gốc: 1 ảnh → file gốc; nhiều ảnh → 1 file .zip do server nén. */
export function downloadMedia(ids: string[]) {
  if (ids.length === 0) return;
  const target = "tng-download";
  if (!document.querySelector(`iframe[name="${target}"]`)) {
    const frame = document.createElement("iframe");
    frame.name = target;
    frame.hidden = true;
    document.body.appendChild(frame);
  }
  if (ids.length === 1) {
    const a = document.createElement("a");
    a.href = `${API_URL}/gallery/media/${ids[0]}/file?download=1`;
    a.target = target;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${API_URL}/gallery/media/download/zip`;
  form.target = target;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "ids";
  input.value = ids.join(",");
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
