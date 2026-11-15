# Moments — Việc còn lại (từ P2 đổ đi)

> Trạng thái ghi ngày **2026-11-01**, sau khi hoàn tất **P0 + P1**.
> File này là danh sách việc để tiếp tục ở session mới. Số dòng có thể lệch nếu code đã đổi —
> hãy tìm theo **tên hàm/file** (đã ghi kèm) chứ không chỉ theo số dòng.

**Mục lục**

| Mục | Nội dung | Số việc |
|---|---|---|
| 0 | Bối cảnh: P0 + P1 đã xong, lệnh kiểm tra nhanh | — |
| P2 | **Bắt buộc** trước khi coi Moments là "xong" (DB, race, media xoá, rate limit, WS, video, virtualize) | 13 |
| P3 | Polish / a11y / hiệu năng nhỏ, nên làm trước demo & báo cáo | 17 |
| P4 | Tương lai / nice-to-have, **không** tính nghiệm thu | 12 |
| 5 | Bẫy & quy ước phải giữ (đọc trước khi sửa code) | 10 |
| 6 | Thứ tự đề xuất (làm gì trước, gì sau) | — |
| 7 | Definition of Done — tự kiểm trước khi báo xong | — |

---

## 0. Bối cảnh: đã xong gì

**P0 — Design system + layout (xong)**

- `/moments` nằm trong `MainLayout` (bỏ header/footer nav riêng). `MainLayout` coi `/moments` là
  immersive (`pathname.startsWith("/moments")`), `MomentsView` là `absolute inset-0`.
- FAB cluster (mời + tạo moment) thay header/footer cũ; chừa chỗ cho `BottomBar` mobile.
- `hooks/useElementSize.ts` mới + `MomentFeed` đo layout thật (ResizeObserver) thay media query:
  `MIN_CARD_W = 260`, `GAP = 20`, `PAD = 16/24`, `MAX_COLS = 3`, card `aspect-4/5`.
- `MomentInviteButton` dùng `Popover`; `window.confirm/alert` → `AlertDialog` + inline notice.
- `MomentMemePanel` dùng design token (không còn `zinc/white` hard-code).
- Meme panel lazy-mount (`everFlipped`), `unreadRef` → `useState`, toast expiry bằng interval.
- `@media (prefers-reduced-motion: reduce)` tắt `.reaction-flip-card` + `.animate-float`.

**P1 — Hoàn thiện feature (xong)**

| Mục | Nội dung |
|---|---|
| P1.1 | `moments.mapper.js`: card dùng `mediaThumbUrl(id, "med")`, thêm `thumbSmallUrl` (200px) |
| P1.2 | Ảnh tương tự trong Lightbox: `hooks/useSimilarMedia.ts` + `services/media.ts::fetchSimilarMedia` + section trong `MediaDetailsPanel` (badge DINOv3/CLIP, `onSelectSimilar`) |
| P1.3 | `TemplateMedia.tsx` rewrite: `FrameMedia` dùng chung img/video, badge thời lượng |
| P1.4 | Infinite scroll: backend `limit + 1` → `hasMore`; FE `useInfiniteQuery` + `InfiniteScrollSentinel` (giữ callback qua `ref`, guard `isFetchingNextPage`, `root` = scroller) |
| P1.5 | Reaction optimistic đúng shape: `patchFeedMoment()` trong `momentsCache.ts` (`pages[].items`), `reactions: { emoji, count }[]`, `recentReactions` là object, user hiện tại qua `authClient.useSession()` |
| P1.6 | Bỏ `gridClassName="h-64"` khỏi `MediaPicker` trong `CreateMomentDialog` |

**Đã kiểm tra:** `npm run build` ✓, `npm run lint` ✓ (5 warning `react(only-export-components)` có sẵn
trong `components/ui/*`), `node --check` backend ✓, import module graph backend ✓.

> ⚠️ Working tree đang **dirty** (nhiều thay đổi không liên quan: transfers, friends, camera,
> `graphify-out/` untracked). Trước khi commit, chỉ stage đúng file Moments.

**Kiểm tra nhanh ở session mới**

```bash
cd frontend && npm run build && npm run lint
cd backend  && node --check src/modules/moments/moments.routes.js
# import toàn bộ module graph (cần env giả vì .env có thể thiếu BETTER_AUTH_SECRET):
cd backend && BETTER_AUTH_SECRET=12345678901234567890123456789012 BETTER_AUTH_URL=http://localhost:3000 \
  DB_HOST=localhost DB_PORT=5433 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=tng \
  MINIO_ENDPOINT=localhost MINIO_PORT=9002 MINIO_ACCESS_KEY=x MINIO_SECRET_KEY=y MINIO_BUCKET=tng \
  CORS_ORIGINS=http://localhost:5173 \
  node -e "import('./src/modules/index.js').then(()=>console.log('MODULE GRAPH OK'))"
```

Lưu ý: project **chưa cài `typescript`** → `vite build` không type-check. Muốn chắc thì
`npm i -D typescript && npx tsc --noEmit`.

---

## P2 — Hoàn thành ✅

Tất cả 13 mục P2 đã xong (xem AGENTS.md + git log).

## P3 — Chỉ còn P3.14 (thiếu test)

> P3 không chặn nghiệm thu, nhưng làm trước khi demo/viết báo cáo thì sản phẩm "mượt" hơn rõ rệt.
> Thứ tự trong mục này **không** phải thứ tự làm — xem mục 5.





### P3.14 · Thiếu test (backend + FE)

**Vấn đề:** `backend/package.json` **không có** script `test`, không có file `*.test.js`; FE cũng không.
Các logic dễ sai nhất (quyền xem, slot, transaction) hiện chỉ được kiểm bằng tay.

**Việc cần làm**

- Backend: thêm `"test": "node --test src/**/*.test.js"` (hoặc `node --test --experimental-test-coverage`).
  Case tối thiểu:
  - `canViewMoment`: owner / friend + circle / friend + private / người lạ + public / moment hết hạn /
    moment draft (chưa đủ slot) / moment đã xoá.
  - `fillMomentSlots`: điền 1 slot, điền quá số slot, ảnh không thuộc user, ảnh trùng, draft quá 24 h,
    fill 2 lần (idempotent/đúng lỗi).
  - `updateDraftMoment`: moment đã hoàn chỉnh → 409; draft quá hạn → 410; đổi template khi slot người
    khác đã filled → 409 (sau P2.5).
  - `createMoment`: self-fill thiếu ảnh, collab mời người không phải bạn, mời chính mình.
  - Schema Zod: `limit` biên, `caption` 281 ký tự, `emoji` rỗng.
- Cách chạy: service import `dbPool` trực tiếp → hoặc (a) test tích hợp với Postgres thật
  (`docker compose -f docker-compose.dev.yml up postgres`, DB riêng `tng_test`), hoặc (b) refactor
  nhẹ để nhận `db` qua tham số/`db/tx.js` (ưu tiên (a) cho nhanh, đổi sau nếu cần).
- FE: tối thiểu test `momentsCache.ts::patchFeedMoment` (shape `pages[].items`) và `participants.ts`
  (dedupe) bằng `vitest` — nếu thêm vitest thì thêm script `test` + config.
- CI: nếu có GitHub Actions thì chạy `lint + build + test`.

**Xong khi:** `npm test` ở backend chạy ≥ 15 case, đỏ khi cố tình phá `COMPLETED_FILTER`.

---


## P4 — Tương lai / nice-to-have (không bắt buộc để nghiệm thu)

> Những mục này **không** cần cho demo đồ án, nhưng nếu còn thời gian thì đây là hướng mở rộng
> tự nhiên. Ghi lại để không phải nghĩ lại từ đầu.

### P4.1 · Story 24 h (gắn với P3.2)

Hiện đã có cột + filter; chỉ thiếu set giá trị + UI đếm ngược + job xoá. Làm cùng P3.2 nếu muốn
"Locket thật": mỗi moment sống 24 h rồi biến mất, có vòng sáng quanh avatar bạn bè còn story.

### P4.2 · Thông báo ngoài app (Web Push)

Hiện chỉ có toast WS khi đang online (`MomentInviteToast`). Muốn user không online vẫn biết:
Service Worker + Web Push (VAPID), đăng ký ở Settings, bảng `push_subscriptions`, gửi khi
`moment:collab-invite` / bạn thân đăng moment mới. Cần xử lý quyền + token hết hạn.

### P4.3 · Camera: chọn caption / người xem / template ngay khi chụp

`useCamera.ts::savePreview` hiện tự đăng `createMoment({ mediaId, visibility: "circle" })` — không
caption, không chọn người xem, không template. Nâng cấp: sau khi chụp ở chế độ Moments, mở một sheet
nhỏ (caption + visibility + template 1/2/3 ô) trước khi đăng; giữ nút "Đăng ngay" cho luồng nhanh.
Lưu ý: `createMoment` đã hỗ trợ đủ tham số, chỉ thiếu UI.

### P4.4 · "Kỷ niệm" / archive theo ngày

Moments hiện chỉ có feed mới→cũ. Thêm màn hình theo ngày/tháng (như `albums.auto.service.js` nhóm
`time`) hoặc "1 năm trước hôm nay" — tận dụng `taken_at`/`created_at`, không cần bảng mới.

### P4.5 · Chia sẻ moment bằng link/QR

Nối với P2.10 (public). Moment → link `#token` kiểu `albums.public.routes.js::share_links`, kèm
QR cho meme/moment hài. Cần signed media URL theo scope link (đã có hạ tầng), và rate limit riêng.

### P4.6 · Moderation / report

Moment + meme là nội dung UGC. Thêm `POST /api/moments/:id/report` (lý do), bảng `content_reports`,
admin xem trong `AdminDashboard`, và "chặn user" (block) để feed lọc. Tối thiểu: nút report +
admin list — đủ cho phần "an toàn nội dung" của báo cáo.

### P4.7 · Số liệu cho báo cáo (analytics)

Bảng `moment_views(moment_id, user_id, viewed_at, dwell_ms)`:
- đếm view, thời gian xem trung bình, tỉ lệ reaction/view, meme/view → số liệu đẹp cho chương đánh giá.
- FE gửi khi card rời viewport (IntersectionObserver + `sendBeacon`), sample 1 view/người/ngày.
- Không làm nếu lo privacy — ghi rõ trong báo cáo.

### P4.8 · Offline / PWA cho feed

Ảnh đã xem cache qua Service Worker; draft/upload lỗi xếp hàng chờ (IndexedDB) và retry khi có mạng.
`transfers/engine/idb.ts` đã có sẵn hạ tầng IndexedDB để tham khảo. Chỉ nên làm sau khi P2.13 xong.

### P4.9 · Single moment nhiều ảnh (carousel)

Hiện `single` = đúng 1 media. Nếu muốn "moment nhiều ảnh" kiểu Instagram: thêm template
`carousel` (hoặc `mediaIds` cho single) + chấm chỉ vị trí + vuốt ngang trong card. Sẽ chạm
`chk_template_media` và `COLLAB_SLOT_COUNT` → cân nhắc kỹ trước khi làm.

### P4.10 · E2E + hiệu năng

Playwright cho 3 luồng: tạo single → react → xoá; tạo collab → bạn fill → hoàn chỉnh; thả meme →
tim meme. Đo LCP/CLS của `/moments` (mục tiêu LCP < 2.5 s trên Fast 3G giả lập) và ghi số vào báo cáo.

### P4.11 · Cache HTTP cho feed

`GET /api/moments` hiện không có `ETag`/`Last-Modified` (chỉ media stream có). Thêm `ETag` theo
`(userId, max(created_at), limit, offset)` + trả 304 → tiết kiệm khi mở lại tab. Cẩn thận với
reaction/meme count thay đổi liên tục → dùng ETag yếu hoặc chỉ cache 5–10 s.

### P4.12 · Meme động (GIF/tenor) hoặc meme AI

Hiện chỉ ảnh tĩnh từ memegen.link. Có thể thêm nguồn GIF (tenor/giphy API key) hoặc dùng CLIP/tag
để gợi ý meme theo nội dung ảnh (AI Studio đã có tag + caption). Đây là hướng "wow" cho demo nhưng
tốn thời gian — chỉ làm nếu P2/P3 xong sớm.

---

## 5. Bẫy & quy ước phải giữ

1. **KHÔNG tạo lại `backend/src/modules/ai/ai.routes.js`.** File đó từng được sinh ra do lỗi
   (import module không tồn tại) và đã bị xoá; mọi endpoint AI đã nằm ở `/api/gallery/media/*`.
2. **Cache feed là `useInfiniteQuery`** → mọi cập nhật phải qua `pages[].items`
   (`momentsCache.ts::patchFeedMoment`). Đọc `old.items` ở gốc sẽ crash.
3. **`reactions` = `{ emoji, count }[]`; `recentReactions` = `{ emoji, userId, userName, userAvatarUrl }[]`.**
4. **URL media phải lấy từ API** (`mediaThumbUrl` / `mediaFileUrl` → signed `exp`+`sig`).
   Không tự ghép URL `/api/gallery/media/:id/...` ở FE, không đổi sang URL MinIO.
5. **i18n 3 ngôn ngữ** (`vi` mặc định, `en`, `ja`) — hiện `moments` có đủ **93 key** ở cả 3.
   Thêm key mới → thêm cả 3 file; không hard-code tiếng Việt trong `.tsx`.
6. **Không dùng `window.confirm/alert`** — pattern là `AlertDialog` + inline notice (`role="alert"`).
7. **Hằng số FE ↔ BE phải đồng bộ:** `DRAFT_TTL`/`DRAFT_TTL_MS`, `MAX_REACTION_BUBBLES`,
   `COLLAB_SLOT_COUNT`, danh sách emoji, tên event WS.
8. **Design system:** chỉ dùng token (`bg-card`, `text-muted-foreground`, `border-border/60`…),
   surface kính = `glass`, không thêm màu mới ngoài `lib/aiColors.ts`. Framer-motion ≤ 0.32 s
   trong app; landing được phép biểu cảm.
9. **Không gọi `ai-service` từ FE**; chỉ backend gọi.
10. **Mọi route đọc `body/params/query` phải có Zod schema** trong `moments.schema.js`
    (`user` id là TEXT → `z.string().min(1).max(64)`, không `.uuid()`).

---

## 6. Thứ tự đề xuất

> P2 = bắt buộc trước khi coi Moments là "xong". P3 = nên làm trước demo/báo cáo.
> P4 = tuỳ thời gian, **không** tính vào nghiệm thu.

1. **P2.12** (bảng DB) — chặn mọi thứ khác nếu DB dev thiếu bảng.
2. **P2.4 + P2.5** (transaction/race) — sửa lỗi mất dữ liệu, không đổi UI.
3. **P2.6** (media bị xoá) — lỗi hiển thị + mất moment.
4. **P2.1 + P2.2 + P2.3** (rate limit → MinIO → job) — nhóm vận hành.
5. **P2.7 + P2.8** (phân trang + query) — hiệu năng.
6. **P2.9** (WS) → **P2.10** (public) → **P2.11** (video) → **P2.13** (virtualize).
7. P3 nhóm UX/a11y trước: **P3.1** (sửa caption), **P3.6 + P3.7** (bug nhỏ, sửa nhanh),
   **P3.10 + P3.9** (reduced-motion, bàn phím), **P3.5** (emoji), **P3.13** (lỗi camera).
8. P3 nhóm "dọn dẹp sự thật trong code": **P3.2 + P3.3 + P3.4** (cột/TTL/trigger) —
   chọn hướng A hoặc B rồi sửa cho khớp, đừng để comment hứa tính năng không có.
9. P3 nhóm hiệu năng nhỏ: **P3.8** (srcset), **P3.11** (timeAgo), **P3.12** (fallback template),
   **P3.17** (giới hạn meme).
10. Cuối cùng: **P3.14/15/16** (test + spec `docs/features/moments.md` + gom hằng WS) và cập nhật
    `AGENTS.md` (mục Moments, rate limit, DB bootstrap).
11. **P4 chỉ làm sau khi P2 + P3 xong.** Nếu còn thời gian cho báo cáo, thứ tự đáng làm nhất:
    **P4.7** (analytics — có số liệu cho chương đánh giá) → **P4.10** (E2E + LCP) →
    **P4.3** (camera chọn caption/visibility) → **P4.5** (chia sẻ link/QR) → còn lại tuỳ hứng.
    **P4.1** đi kèm P3.2 nếu chọn hướng A (story 24 h).

---

## 7. Definition of Done (dùng để tự kiểm trước khi báo xong)

- [ ] `cd frontend && npm run lint` — 0 error (5 warning `react(only-export-components)` có sẵn là bình thường).
- [ ] `cd frontend && npm run build` — xanh.
- [ ] `node --check` từng file backend đã sửa — xanh.
- [ ] `GET /api/moments`, `/invitations`, tạo single, tạo collab + bạn fill, thả meme, react, xoá, rời —
      chạy tay được trên dev với **2 tài khoản** (1 owner + 1 friend).
- [x] DB dev tạo mới từ `schema.sql` **và** từ `ensureSchema()` đều có đủ 5 bảng Moments (P2.12).
- [ ] Không còn `console.log`/`console.error` làm UI; không còn `window.confirm/alert`.
- [ ] i18n: mọi key mới có đủ `vi` / `en` / `ja`, không hard-code tiếng Việt trong `.tsx`.
- [ ] Reduced motion: bật OS "Reduce motion" → không animation xoay/trượt trong Moments.
- [ ] Mobile 360 px + desktop 1440 px: không tràn ngang, FAB không che nội dung, snap đúng 1 hàng/màn.
- [ ] `docs/features/moments-todo.md` được cập nhật (mục nào xong thì gạch/ghi ngày) hoặc xoá khi hết việc.

