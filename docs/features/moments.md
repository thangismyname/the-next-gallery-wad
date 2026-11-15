# Moments

Moment = khoảnh khắc chụp/quay nhanh chia sẻ với vòng bạn bè (kiểu Locket).

## Mô hình dữ liệu

5 bảng: `moments`, `moment_collab`, `moment_reactions`, `moment_memes`, `meme_reactions`.

- `moments`: moment chính. `template` = single/duo_square/trio_wide. `media_id` bắt buộc với single, NULL với collab. `visibility` = circle/public/private. `expires_at` = dự phòng (chưa dùng).
- `moment_collab`: 1 row/slot. `slot_index` 0-based. `filled_at` NULL = chưa điền. `media_id` SET NULL khi ảnh bị xoá vĩnh viễn.
- `moment_reactions`: 1 row/user/moment (UNIQUE). `reaction_emoji`.
- `moment_memes`: meme trên moment (ảnh lưu MinIO `moments/<momentId>/memes/<memeId>.<ext>`).
- `meme_reactions`: ❤️ trên meme.

## Luồng tạo

1. **single**: 1 ảnh/video → `POST /api/moments { mediaId, ... }`.
2. **self-fill** (duo/trio): creator gửi đủ ảnh bằng `mediaIds` → tất cả slot của creator filled, moment hoàn chỉnh ngay.
3. **collab**: creator gửi 1..slotCount-1 ảnh + `collaboratorIds` → draft (còn slot trống). Bạn bè được mời điền ảnh qua `POST /:momentId/fill`. Moment chỉ hiện ở feed khi đủ slot (`COMPLETED_FILTER`).

Draft tự huỷ sau 24h (`DRAFT_TTL`).

## Quyền xem (`canViewMoment`)

Owner luôn xem. Bạn bè xem được nếu `visibility IN ('circle', 'public')` và moment đã hoàn chỉnh. Moment hết hạn (`expires_at < NOW()`) không xem được.

## Reaction & Meme

- Reaction: emoji (1 grapheme Extended_Pictographic, tuỳ chọn ZWJ). Optimistic update qua `patchFeedMoment`.
- Meme: template từ memegen.link → tải ảnh → lưu MinIO. Stream qua `GET /:momentId/memes/:memeId/image?exp&sig` (signed URL). Giới hạn 30 meme/moment.

## WS Events

`moment:meme-added`, `moment:meme-removed`, `moment:meme-reacted`, `moment:collab-invite`, `moment:collab-complete`, `moment:reaction`, `moment:deleted`, `moment:left`, `moment:updated`.

## Endpoint chính

- `GET /api/moments` — feed (phân trang)
- `POST /api/moments` — tạo
- `PUT /api/moments/:id` — sửa draft collab
- `PATCH /api/moments/:id` — sửa caption/visibility
- `DELETE /api/moments/:id` — xoá
- `POST /api/moments/:id/fill` — điền slot
- `POST /api/moments/:id/leave` — rời collab
- `GET /api/moments/invitations` + `/count` — lời mời
- `POST/DELETE /api/moments/:id/reactions` — reaction
- `GET/POST/DELETE /api/moments/:id/memes` + `/memes/:memeId/image` + `/react`

## Giới hạn đã biết

- `visibility = "public"` đã bỏ khỏi UI (giữ type cho dữ liệu cũ).
- Story 24h chưa implement (`expires_at` dự phòng).
- Emoji ZWJ chuẩn hoá chưa xử lý (❤️ vs ❤).
- Test chưa có (P3.14).
