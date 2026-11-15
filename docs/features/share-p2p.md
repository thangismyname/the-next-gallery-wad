# Gửi file (Quick send) — P2P + TURN + relay mã hoá

Gửi ảnh / video (kể cả file nhiều GB) cho **nhiều người cùng lúc**, qua **nhiều
cách kết nối**, người nhận **không cần tài khoản**.

| Gửi cho | Cách vào | Dữ liệu đi đường nào |
| --- | --- | --- |
| Bạn bè | Chọn bạn trong danh sách (không phòng, không mã) | Ảnh thư viện: server **copy** sang thư viện bạn · File trên máy: P2P → TURN → relay |
| Bất kỳ ai | Link / QR (`/r/<id>#t=<token>&k=<khoá>`) hoặc mã 6 ký tự (`/r`) | Ảnh thư viện: tải bản gốc từ **server** · File trên máy: P2P → TURN → relay |

Code: backend `modules/transfers/` + `ws/handlers/xfer.handler.js` + `ws/services/transfer.hub.js`;
frontend `features/share/` (`engine/` = phần không phụ thuộc React).

## 1. Đường truyền (thứ tự ưu tiên)

1. **WebRTC trực tiếp** (DataChannel; ICE candidate host/srflx qua STUN). Server chỉ chuyển tiếp tín hiệu.
2. **WebRTC qua TURN** (coturn): cùng 1 `RTCPeerConnection`, ICE tự chọn khi không nối thẳng được
   (4G/CGNAT, mạng công ty). Mật khẩu TURN tạm thời (`GET /api/transfers/ice`, HMAC-SHA1, mặc định 1 giờ).
3. **Relay qua server**: DataChannel không mở được trong **15 s**, hoặc người gửi offline → người nhận gửi
   `xfer:relay-request`, người gửi **mã hoá** từng part 4 MiB rồi `PUT` lên backend → MinIO
   `transfers/<id>/<fileId>/<part>`. Hạn mức **5 GB / phiên**, giữ **1 ngày** (job dọn mỗi 15 phút +
   lifecycle MinIO 2 ngày làm lưới an toàn).
4. **Ảnh thư viện** không đi P2P: gửi bạn bè = `copyObject` trong MinIO + copy kết quả AI (CLIP, DINOv3,
   YOLO, tag); gửi link = `GET /:id/files/:fileId/content` (Range, tải tiếp được).

Đường thực tế của từng người nhận được lưu vào `transfer_recipients.via`
(`p2p | turn | relay | server | copy`) — số liệu so sánh cho luận văn.

## 2. Luồng

### Người gửi (`startTransfer.ts` → `TransferHost`)

1. Sinh khoá phiên AES-GCM 256; tạo thumbnail ≤160 px WebP cho từng file, **mã hoá** bằng khoá phiên.
2. Gửi bạn bè: lấy khoá công khai thiết bị của họ (`GET /keys?userIds=`), bọc khoá phiên cho từng thiết bị (ECDH).
3. `POST /api/transfers` → `{ id, token }`. Khoá + token lưu IndexedDB (mở lại link trên máy này).
4. Có file trên máy → `TransferHost` gửi `xfer:host`, giữ `File` trong RAM suốt lúc dùng app
   (`hostRegistry`, chuyển trang không dừng; đóng tab có cảnh báo khi đang gửi).
5. Bạn bè đang offline → tự đẩy lên relay ngay (nếu ≤ 5 GB).
6. Mỗi người nhận vào phiên (`xfer:peer-joined`) → người gửi tạo offer. Phục vụ theo yêu cầu, tối đa
   **3 người nhận song song**, người còn lại xếp hàng (`queued`).

### Người nhận (`/r/:id` → `TransferReceiver`)

1. `GET /api/transfers/:id` (header `X-Transfer-Token` hoặc cookie) → danh sách file.
2. Lấy khoá: `#k=` trong link → IndexedDB → khoá bọc cho thiết bị này → **ECDH tạm với người gửi**
   (vào bằng mã 6 số; cần người gửi online).
3. `xfer:join` → người gửi online thì chờ offer; quá 15 s → relay.
4. "Nhận tất cả": từng file lần lượt, tự chọn đường: thư viện → server; còn lại → P2P nếu kênh mở,
   không thì relay. Rớt mạng giữa chừng → tải tiếp từ byte đã có (P2P: `offset` bất kỳ; relay: đầu part).
5. Ghi vào **OPFS** qua Web Worker (`createSyncAccessHandle`) — file nằm trên đĩa, không trong RAM;
   tải lại trang vẫn tiếp tục. Không có OPFS → RAM.
6. Lưu: về máy (tải từng file / chọn thư mục trên Chrome) hoặc vào thư viện (đăng nhập; ảnh thư viện
   người gửi → server copy, file khác → upload thường).

## 3. Giao thức

### WebSocket `/ws` (server chỉ chuyển tiếp, không đọc nội dung)

- `auth { guestId, name }` — có cookie → user; không → **khách** (chỉ được `xfer:join/leave/signal/report/relay-request`).
- Mỗi socket 1 `connId` → tín hiệu gửi đúng 1 tab.
- Người gửi: `xfer:host` / `xfer:unhost` → `xfer:hosting { peers }`, `xfer:peer-joined/left`, `xfer:recipient`, `xfer:relay-request`.
- Người nhận: `xfer:join { transferId, token }` → `xfer:joined { recipientId, hostConnId }`,
  `xfer:host-online/offline`, `xfer:relay { fileId, relayParts }`, `xfer:closed`.
- Hai chiều: `xfer:signal { to, data }`, `data` = `offer | answer | ice | key-req | key | hello`.
  Chỉ hợp lệ giữa người gửi ↔ 1 người nhận của **cùng phiên** (`transfer.hub.js::isPair`).
- Bạn bè nhận được: `xfer:incoming` → toast.

### DataChannel (`engine/protocol.ts`)

- Người nhận → gửi: `{ t: "get", fileId, offset }`, `{ t: "cancel" }`.
- Gửi → nhận: `{ t: "queued" }`, `{ t: "begin", fileId, offset, size }`, *binary 64 KiB …*, `{ t: "end", fileId }`, `{ t: "error" }`.
- Kiểm soát tốc độ bằng `bufferedAmount` (dừng > 8 MiB, chạy tiếp < 1 MiB) — **không ACK từng mảnh**.
- Các `get` của 1 người nhận chạy lần lượt → mảnh cũ không chen vào file mới.
- ICE candidate tới trước remote description được giữ trong hàng đợi (`RtcLink`).

## 4. Mã hoá đầu-cuối (`engine/crypto.ts`)

- P2P: WebRTC đã mã hoá sẵn (DTLS).
- Relay + thumbnail: AES-GCM 256, IV = `[fileIndex u32][part u32][0 u32]` (thumbnail part = `0xFFFFFFFF`).
  IV cố định theo vị trí → tải lại cùng part ra đúng bản mã cũ (tải tiếp an toàn); đổi thứ tự part → giải mã lỗi.
- Phân phối khoá:
  - Link / QR: khoá trong `#fragment` — trình duyệt không gửi phần này lên server.
  - Bạn bè: ECDH P-256 (khoá tạm người gửi × khoá thiết bị người nhận) → HKDF-SHA256 → AES-GCM bọc khoá phiên.
    Khoá riêng thiết bị không export được, nằm trong IndexedDB; khoá công khai `PUT /api/transfers/keys` (tối đa 5 thiết bị/user).
  - Mã 6 số: ECDH tạm qua signaling khi người gửi online. Chống được server *thụ động*; server *chủ động* có
    thể thay khoá giữa đường (không có xác thực khoá) — dùng link/QR khi cần chống cả trường hợp này.
- Tên file + dung lượng **không** mã hoá (server cần để hiển thị/hạn mức).

## 5. REST `/api/transfers`

| Method | Path | Ai | Ghi chú |
| --- | --- | --- | --- |
| GET | `/ice?transferId=` | user / token | STUN + TURN tạm thời |
| PUT | `/keys` | user | Đăng ký khoá thiết bị |
| GET | `/keys?userIds=` | user | Khoá thiết bị của bạn bè |
| POST | `/code` | ai cũng được (20/phút/IP) | Mã 6 số → `{ transferId, token }` riêng |
| GET | `/` | user | `{ sent, inbox }` |
| POST | `/` | user | Tạo phiên (`kind`, `files`, `recipients`, `maxReceivers`) |
| GET | `/:id` | sender / bạn bè / token | Chi tiết (sender thấy mã + người nhận) |
| POST | `/:id/revoke` · `/:id/code` | sender | Thu hồi (xoá relay) · mã mới |
| POST | `/:id/decline` · `/:id/save` | người nhận | Từ chối · copy ảnh thư viện vào thư viện mình |
| PUT | `/:id/files/:fileId/parts/:n` | sender | Part đã mã hoá (≤ 4 MiB + 1 KiB) |
| GET | `/:id/files/:fileId/parts[/:n]` | người nhận | Danh sách part · tải 1 part |
| GET | `/:id/files/:fileId/content` | người nhận | Ảnh thư viện (Range) |

Không có quyền → 404 (không lộ phiên có tồn tại); hết hạn / thu hồi → 410; quá số người nhận → 409.

## 6. Dữ liệu

`transfers`, `transfer_files`, `transfer_relay_parts`, `transfer_recipients`, `user_device_keys`
(xem `backend/src/db/schema.sql`, `backend/src/db/migrate.js`). Server chỉ lưu **hash** của token.
Dòng DB giữ lại sau khi hết hạn (lịch sử / thống kê); object relay bị xoá (`purged_at`).

## 7. Vận hành

- Env backend: `STUN_URLS`, `TURN_URLS` (vd `turn:gallery.example.com:3478?transport=udp,turn:gallery.example.com:3478?transport=tcp`),
  `TURN_SECRET`, `TURN_TTL_SECONDS`.
- coturn: `docker compose … --profile turn up` (prod: `network_mode: host`, mở UDP/TCP 3478 + UDP 49160–49200,
  đặt `TURN_EXTERNAL_IP`; chặn peer IP nội bộ). Không đặt TURN → chỉ STUN + relay.
- Thử TURN: `chrome://webrtc-internals` → candidate pair `relay`, hoặc đặt `iceTransportPolicy: "relay"` khi debug.

## 8. Giới hạn đã biết

- File trên máy chỉ phát P2P khi tab người gửi còn mở; tải lại trang → chỉ còn phần đã lên relay.
- "Lưu vào thư viện" dùng upload thường (giới hạn 500 MB/file của multer).
- Nhiều instance backend cần store chung (Redis) cho hub signaling + rate limit.
