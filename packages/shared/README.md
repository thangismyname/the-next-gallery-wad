# @tng/shared

Code dùng chung giữa web (`frontend/`) và mobile (`apps/mobile/`).

## Cấu trúc

```
src/
├── http.ts       # interface HttpClient + HttpError (web cookie / mobile Bearer)
├── types/        # MediaListItem, MediaPage, ...
├── services/     # media, albums, friends, moments, ...
├── stores/       # zustand stores (selection, grid density)
├── protocol/     # transfers constants FE↔BE
├── i18n/         # vi/en/ja
└── utils/        # format, string
```

## Nguyên tắc

- Không gọi `fetch` trực tiếp — mọi request đi qua `HttpClient` được inject.
- Không import React DOM / React Native — chỉ logic thuần + types.
- Service dạng factory: `createMediaService(http)`.

## Typecheck

```bash
cd packages/shared && npm run typecheck
```