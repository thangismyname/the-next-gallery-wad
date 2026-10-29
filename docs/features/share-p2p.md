# P2P Sharing Feature (WebRTC P2P Transfer) — Full Spec

> Source of truth for the P2P photo/video sharing feature (WebSocket signaling +
> WebRTC DataChannels). `AGENTS.md` holds a summary + link to this file. Read this
> file before implementing any phase.

## Overview

P2P photo/video transfer using WebSocket signaling + WebRTC DataChannels. Supports:
- Internet transfer (WebRTC via STUN/TURN)
- LAN transfer (WebRTC with empty iceServers)
- WiFi Hotspot offline transfer
- Multi-file, multi-receiver, unlimited files
- QR code quick connect
- Friend-based sharing notifications
- Save to gallery (S3) or direct download

## Architecture

```
WebSocket (signaling) → helps peers find each other
WebRTC DataChannels → direct encrypted P2P file transfer
S3 (MinIO) → only used when receiver saves to gallery
```

## Backend Structure (new files)

```
backend/src/
├── ws/                            ← WebSocket module
│   ├── index.js                   ← Exports setupWebSocket(server)
│   ├── protocol.js                ← Message type constants + validation
│   ├── handlers/
│   │   ├── connection.handler.js  ← Auth + message router
│   │   ├── room.handler.js        ← Room create/join/leave
│   │   ├── signal.handler.js      ← WebRTC signal relay
│   │   └── transfer.handler.js    ← File transfer protocol
│   └── services/
│       ├── signaling.service.js   ← In-memory rooms + peers
│       └── transfer.service.js    ← Transfer tracking
├── services/
│   └── share.service.js           ← DB operations for share sessions
├── routes/
│   └── share.routes.js            ← REST endpoints for sharing
```

## Transfer Modes

| Mode | Trigger | Transport | Server Bandwidth | Speed |
|------|---------|-----------|-----------------|-------|
| Internet | Both online, different networks | WebRTC (STUN/TURN) | None | Depends on ISP |
| LAN | Same WiFi network | WebRTC (empty iceServers) | None | ~100+ MB/s |
| WiFi Hotspot | No shared WiFi, no internet | User creates hotspot → WebRTC LAN | None | ~30-50 MB/s |

## Frontend Structure (new files)

```
frontend/src/
├── services/
│   ├── signaling.ts              ← WebSocket client class
│   └── webrtc.ts                 ← P2P connection manager
├── hooks/
│   ├── useSignaling.ts           ← WebSocket connection hook
│   ├── useFileTransfer.ts        ← Chunked file transfer hook
│   └── useShare.ts               ← Main share orchestrator
├── features/share/
│   ├── ShareDialog.tsx           ← Main modal (QR/Friends/LAN tabs)
│   └── components/
│       ├── QRTab.tsx             ← Room code + QR + timer
│       ├── FriendsTab.tsx        ← Friend list + multi-select
│       ├── LanTab.tsx            ← LAN discovery + manual IP
│       ├── TransferProgress.tsx  ← Progress bar + speed + ETA
│       ├── ShareNotification.tsx ← Incoming share toast
│       └── PeerCard.tsx          ← Discovered peer card
└── types/index.ts                ← (add new interfaces here)
```

> Dependency to install: `qrcode.react` (QR code rendering)

## Detailed WebSocket Protocol

Each message = JSON: `{ type: string, payload: object }`

```
── Auth ──
Client → { type: "auth", payload: {} }
  (cookies sent with the upgrade request → Better Auth session)
Server → { type: "auth:success", payload: { userId: string, username: string } }
Server → { type: "auth:error", payload: { code: string, message: string } }

── Room Management ──
Client → { type: "room:create", payload: { mediaIds: string[] } }
Server → { type: "room:created", payload: {
  roomId: string, roomCode: string, sessionId: string|null,
  expiresAt: number, peerCount: number
}}
Client → { type: "room:join", payload: { roomCode: string } }
Server → { type: "room:joined", payload: {
  room: { id, code, hostUserId, mediaIds, expiresAt }, peers: Peer[]
}}
Server → { type: "room:peer-joined", payload: { peer: Peer } }
Client → { type: "room:leave", payload: {} }
Server → { type: "room:peer-left", payload: { peerId: string } }

── WebRTC Signaling Relay (server only relays, never reads content) ──
Client → { type: "signal:offer", payload: { to: string, offer: RTCSessionDescriptionInit } }
Client → { type: "signal:answer", payload: { to: string, answer: RTCSessionDescriptionInit } }
Client → { type: "signal:ice-candidate", payload: { to: string, candidate: RTCIceCandidateInit } }

── File Transfer Control ──
Client → { type: "transfer:metadata", payload: { to: string, sessionId: string, files: FileMetadata[] } }
Server → { type: "transfer:metadata", payload: { from: string, sessionId, files } }
Client → { type: "transfer:accept", payload: { to: string, sessionId: string } }
Server → { type: "transfer:accept", payload: { from: string, sessionId } }
Client → { type: "transfer:reject", payload: { to: string, sessionId: string } }
Server → { type: "transfer:reject", payload: { from: string, sessionId } }
Client → { type: "transfer:progress", payload: { sessionId, fileId, sent, total } }
Client → { type: "transfer:complete", payload: { sessionId: string, to: string } }
Server → { type: "transfer:complete", payload: { from: string, sessionId } }

── Errors ──
Server → { type: "error", payload: { code: string, message: string } }
Codes: BAD_MESSAGE, UNAUTHORIZED, UNKNOWN_TYPE, HANDLER_ERROR,
       ROOM_NOT_FOUND, ROOM_EXPIRED, ROOM_CREATE_FAILED,
       PEER_NOT_FOUND, NOT_IN_ROOM, NOT_SAME_ROOM, INVALID_PAYLOAD
```

## File Transfer Protocol

File bytes travel over the WebRTC DataChannel (P2P), **NOT through the server**.
The server only relays control messages + tracks state.

```
Chunk config:
  CHUNK_SIZE = 16384 (16KB)
  DataChannel: { ordered: true } (reliable transfer)

Transfer flow:
  1. Sender → Receiver: transfer:metadata (file list: id, name, size, type)
  2. Receiver → Sender: transfer:accept | transfer:reject
  3. For each file:
     For each 16KB chunk:
       a) Sender → Receiver: DataChannel binary [fileId, chunkIndex, ArrayBuffer]
       b) Receiver → Sender: DataChannel control { fileId, chunkIndex, ack: true }
       c) Sender waits for ACK before sending the next chunk (backpressure)
     Sender → Receiver: DataChannel control { fileId, type: "file-end", checksum }
  4. After all files: Sender → Receiver: transfer:complete (over WebSocket)

Receiver save options:
  a) "Save to Gallery":
     - Receiver uploads each file to POST /api/gallery/media
     - Backend stores it in MinIO + creates a media record
     - Image appears immediately in the receiver's gallery
  b) "Download":
     - Receiver builds a Blob from the received ArrayBuffers
     - Triggers a browser download
```

## LAN Discovery Approach

Three methods, tried in priority order:

```
1. WebRTC LAN mode (primary)
   Config: { iceServers: [] } — no STUN/TURN
   ICE candidates auto-detect local IPs (192.168.x.x, 10.x.x.x)
   Receiver joins room → WebSocket signals → ICE exchange → P2P direct
   Works when both devices are on the same WiFi (even without internet)

2. Manual IP entry (fallback)
   UI: text input "192.168.1.100:3000"
   WebSocket connects directly to that IP:port
   Bypasses the signaling server entirely
   Then WebRTC over that connection

3. WiFi Hotspot (user-guided)
   Situation: different WiFi, no internet
   UI guides the sender: "Turn on WiFi Hotspot on your phone"
   Receiver connects to the hotspot → same network → method 1 works
   After transfer → turn off the hotspot
```

## Receiver Save Flow

```
Receiver finishes receiving → chooses one of two:

┌─ "Save to Gallery" ─┐
│ Receiver uploads to  │
│ POST /api/gallery/media │
│ → S3 (MinIO)         │
│ → create media record│
│ → appears in gallery │
└──────────────────────┘

┌─ "Download to device" ─┐
│ Build a Blob from chunks│
│ → browser download      │
│ → does NOT use S3       │
└─────────────────────────┘

Note: the server only uses S3 when the receiver chooses to save to gallery.
During P2P transfer the server holds no file — bytes go direct sender→receiver.
```

## Room Lifecycle

```
1. Sender selects images in Gallery → clicks "Share"
2. ShareDialog opens → 3 tabs: QR Code / Friends / LAN
3. Sender creates a room over WebSocket: { type: "room:create", mediaIds }
4. Backend creates an in-memory room + optional DB persistence (share_sessions)
5. QR tab shows: 6-char room code + QR code + 1-hour countdown
6. Receiver enters the code or scans the QR → WebSocket: { type: "room:join", roomCode }
7. Backend adds the receiver to the room → notifies sender: "room:peer-joined"
8. WebRTC signaling begins: offer → answer → ICE candidates (via WebSocket relay)
9. WebRTC DataChannel established → encrypted P2P connection ready
10. File transfer: sender sends metadata → receiver previews → accept → chunks flow
11. Transfer done → receiver saves (Gallery or Download) → room auto-cleanup
12. Room expires after 1 hour idle, or is destroyed when the host leaves
```

## Implementation Progress

### Phase 1.1: Backend WebSocket Signaling Server — ✅ DONE
- [x] 1.1.1: Install `ws` dependency
- [x] 1.1.2: Create `ws/protocol.js` (message constants)
- [x] 1.1.3: Create `ws/services/signaling.service.js` (rooms + peers)
- [x] 1.1.4: Create `ws/services/transfer.service.js` (transfer tracking)
- [x] 1.1.5: Create `ws/handlers/signal.handler.js`
- [x] 1.1.6: Create `ws/handlers/room.handler.js`
- [x] 1.1.7: Create `ws/handlers/transfer.handler.js`
- [x] 1.1.8: Create `ws/handlers/connection.handler.js`
- [x] 1.1.9: Create `ws/index.js` (setup WebSocketServer)
- [x] 1.1.10: Modify `server.js` (http.createServer + WebSocket)
- [x] 1.1.11: Create `services/share.service.js` (DB queries)
- [x] 1.1.12: Create `routes/share.routes.js` (REST endpoints)
- [x] 1.1.13: Update `routes/index.js` (mount share routes)
- [x] 1.1.14: Update `schema.sql` (share_sessions table)

### Phase 1.2: Frontend - Types + Config — ✅ DONE

- [x] 1.2.1: Add share/transfer types to `frontend/src/types/index.ts`

  ```typescript
  interface ShareSession {
    id: string
    roomCode: string
    hostUser: { id: string; name: string; avatarUrl?: string }
    mediaIds: string[]
    mediaPreviews: MediaPreview[]
    status: 'active' | 'completed' | 'expired' | 'cancelled'
    transferMode: 'webrtc' | 'relay' | 'lan'
    createdAt: string
    expiresAt: string
  }

  interface Peer {
    userId: string
    username: string
    avatarUrl?: string | null
    connectionType: 'lan' | 'internet'
    isOnline: boolean
  }

  interface FileMetadata {
    id: string
    name: string
    size: number
    type: string
    checksum?: string
  }

  interface TransferProgress {
    sessionId: string
    totalFiles: number
    completedFiles: number
    currentFile: string
    bytesTransferred: number
    totalBytes: number
    speed: number          // bytes per second
    eta: number            // seconds remaining
    status: 'preparing' | 'transferring' | 'completed' | 'failed' | 'cancelled'
  }

  interface ShareNotification {
    id: string
    sender: { id: string; name: string; avatarUrl?: string }
    mediaCount: number
    totalSize: number       // bytes
    roomCode: string
    sessionId: string
    createdAt: string
    expiresAt: string
  }

  interface MediaPreview {
    id: string
    thumbnailUrl: string
    name: string
    size: number
    type: string
  }
  ```

- [x] 1.2.2: Add WebSocket URL helper to `frontend/src/lib/config.ts`

  ```typescript
  // WebSocket URL — convert HTTP(S) to WS(S)
  export const WS_URL =
    import.meta.env.VITE_WS_URL ||
    API_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '/ws')
  // Default: ws://localhost:3000/ws
  ```

### Phase 1.3: Frontend - Signaling Client — ✅ DONE

- [x] 1.3.1: Create `frontend/src/services/signaling.ts`

  ```typescript
  class SignalingClient {
    private ws: WebSocket | null
    private url: string
    private handlers: Map<string, Set<Function>>
    private reconnectAttempts: number
    private maxReconnectAttempts: number  // 10
    private reconnectTimer: ReturnType<typeof setTimeout> | null

    constructor(url: string)

    connect(): void
      // Open a WebSocket to this.url
      // On open: send { type: "auth" } (cookies sent automatically)
      // Message router: parse JSON → call handlers[type]
      // On close: auto-reconnect with exponential backoff
      // On error: log + attempt reconnect

    disconnect(): void     // Close + clear reconnect timer
    send(type: string, payload: object): void  // JSON.stringify → ws.send
    on(type: string, handler: Function): () => void  // subscribe, returns unsubscribe
    off(type: string, handler: Function): void       // remove handler
    isConnected(): boolean  // ws.readyState === WebSocket.OPEN

    private reconnect(): void
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
      // After maxReconnectAttempts → give up, emit "disconnected"
  }
  export default SignalingClient
  ```

- [x] 1.3.2: Create `frontend/src/hooks/useSignaling.ts`

  ```typescript
  import SignalingClient from '@/services/signaling'
  import { WS_URL } from '@/lib/config'

  function useSignaling() {
    const clientRef = useRef<SignalingClient | null>(null)
    const getClient = useCallback(() => {
      if (!clientRef.current) {
        clientRef.current = new SignalingClient(WS_URL)
        clientRef.current.connect()
      }
      return clientRef.current
    }, [])
    useEffect(() => () => clientRef.current?.disconnect(), [])
    return {
      send: (type: string, payload: object) => getClient().send(type, payload),
      on: (type: string, handler: Function) => getClient().on(type, handler),
      isConnected: () => getClient().isConnected(),
      disconnect: () => clientRef.current?.disconnect(),
    }
  }
  ```

### Phase 1.4: Frontend - WebRTC Manager — ✅ DONE

- [x] 1.4.1: Create `frontend/src/services/webrtc.ts`

  ```typescript
  const RTC_CONFIG_INTERNET: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  }
  const RTC_CONFIG_LAN: RTCConfiguration = { iceServers: [] }

  class WebRTCPeer {
    pc: RTCPeerConnection
    dc: RTCDataChannel | null
    peerId: string
    constructor(peerId: string, config?: RTCConfiguration)

    createOffer(): Promise<RTCSessionDescriptionInit>
    createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>
    setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void>
    addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>

    setupDataChannel(): void
      // dc = pc.createDataChannel('file-transfer', { ordered: true })
      // dc.binaryType = 'arraybuffer'
      // dc.onopen → emit 'connected'
      // dc.onmessage → parse & route (file chunk vs control)
      // dc.onclose → emit 'disconnected'

    sendBinary(data: ArrayBuffer): void
    sendControl(msg: object): void
    on(event: string, handler: Function): () => void
    getConnectionState(): RTCPeerConnectionState
    close(): void
  }

  class WebRTCManager {
    private peers: Map<string, WebRTCPeer>
    createPeer(peerId: string, config?: RTCConfiguration): WebRTCPeer
    getPeer(peerId: string): WebRTCPeer | undefined
    closePeer(peerId: string): void
    closeAll(): void
  }
  ```

  > **Actual implementation notes** (slightly different from the spec snippet):
  > - `setupDataChannel()` became `createDataChannel()` — the offerer CALLS it BEFORE
  >   `createOffer()` so the channel is included in negotiation. The answerer receives it
  >   via the `ondatachannel` event (wired automatically).
  > - Also exports `CHUNK_SIZE = 16384`, `DC_CONTROL = { ACK, FILE_END }`,
  >   `encodeChunk(fileId, chunkIndex, chunk)` / `decodeChunk(buf)`.
  > - The peer emits events: `connected`, `disconnected`, `dc-error`,
  >   `ice-candidate` (RTCIceCandidateInit), `connection-state`, `binary` (ArrayBuffer), `control` (JSON parsed).

- [x] 1.4.2: Create `frontend/src/hooks/useFileTransfer.ts`

  ```typescript
  const CHUNK_SIZE = 16384  // 16KB

  function useFileTransfer() {
    // ── SENDER ──
    async function sendFiles(
      peer: WebRTCPeer, files: File[],
      onProgress: (p: TransferProgress) => void, onComplete: () => void
    ): Promise<void>
      // 1. Build metadata → send transfer:metadata
      // 2. Wait for accept from receiver
      // 3. For each file: read a 16KB slice → sendBinary → wait for ACK → next
      // 4. Send file-end control
      // 5. Finally send transfer:complete → onComplete()

    // ── RECEIVER ──
    function startReceiving(
      peer: WebRTCPeer,
      onMetadata: (files: FileMetadata[]) => void,
      onFileReceived: (fileId: string, chunks: ArrayBuffer[]) => void,
      onComplete: () => void
    ): () => void  // returns a cleanup function
      // 1. Listen for transfer:metadata → onMetadata
      // 2. Accept: listen for binary chunks over the DataChannel
      // 3. Collect chunks by fileId into ArrayBuffer[]
      // 4. file-end → call onFileReceived
      // 5. Send ACK after each chunk
      // 6. transfer:complete → onComplete

    return { sendFiles, startReceiving }
  }
  ```

  > **Actual implementation notes** (different from the spec snippet — required by the
  > backend protocol): `transfer:metadata/accept/reject/complete` travel over **WebSocket
  > signaling** (server relay + same-room validation); only chunk bytes + ACK + `file-end`
  > go over the DataChannel. So `useFileTransfer` needs BOTH the `WebRTCPeer` and a
  > `TransferSignaling` (duck-typed `{ send, on }` — use `useSignaling()`):
  >
  > ```typescript
  > const { sendFiles, startReceiving } = useFileTransfer()
  >
  > // SENDER — peerId = receiver userId, sessionId from room:created
  > await sendFiles(
  >   { peerId, sessionId, peer, signaling, files },
  >   (p: TransferProgress) => setProgress(p), onComplete
  > )
  >
  > // RECEIVER — senderId = sending userId, sessionId matches WS transfer:metadata
  > const stop = startReceiving(
  >   { senderId, sessionId, peer, signaling },
  >   (files) => onMetadata(files),          // file preview
  >   (fileId, chunks) => onFileReceived(fileId, chunks), // save/download
  >   () => onComplete()
  > )
  > // unmount: stop()
  >
  > // ACCEPT — the orchestrator sends this when the user agrees:
  > signaling.send(SIGNAL.TRANSFER_ACCEPT, { sessionId, from: senderId })
  > ```
  >
  > The sender streams each file via `file.stream().getReader()` (doesn't load the whole
  > file into RAM), waits for the ACK of each 16KB chunk (30s timeout), sends `file-end`
  > after each file; progress is reported around every ~2% + per file; accept times out
  > after 60s → reject if declined or timed out.

### Phase 1.5: Frontend - Share UI — ✅ DONE

> **Actual implementation notes**: `useShare()` is the single orchestrator that owns
> signaling (child components don't call `useSignaling()`). Components receive props
> instead of the hook. `sendToPeer` automatically `connectToPeer` + `waitForChannel` if
> not yet connected. The sender builds a `TransferSource` from mediaIds via `fetchMedia`
> + streaming `/gallery/media/:id/file` right inside `ShareDialog`. Accept = download to
> device (Save to Gallery belongs to 1.6). Preview thumbnails + 60s auto-dismiss + save
> dropdown were not done yet (deferred to 1.6).

- [x] 1.5.1: `features/share/ShareDialog.tsx` — Main modal
  ```
  Props: { open, onOpenChange, mediaIds }
  Uses shadcn Dialog + Tabs. Tabs: "QR Code" | "Friends" | "LAN"
  On open: calls useShare().createSession(mediaIds)
  Passes session + signaling to each tab
  Shows TransferProgress when a transfer starts
  ```

- [x] 1.5.2: `features/share/components/QRTab.tsx`
  ```
  Shows:
  - 6-char room code (large, monospace, copy-to-clipboard)
  - QR code via qrcode.react (`npm install qrcode.react`)
  - Countdown timer (1h from session.expiresAt)
  - Status "Waiting for receiver..." with pulse animation
  - Auto-refresh: if expired → "Generate new code"
  ```

- [x] 1.5.3: `features/share/components/FriendsTab.tsx`
  ```
  Fetch GET /api/share/friends
  Show friend list with avatar + online status
  Multi-select checkboxes
  Button "Send to {n} people"
  On send: send a WebSocket notification to each friend
  Show "Invites sent" confirmation
  ```

- [x] 1.5.4: `features/share/components/LanTab.tsx`
  ```
  Shows:
  - "Searching for devices on the network..." + loading animation
  - Discovered peers: a list of PeerCard components
  - "Manual connect" link → expands the IP:port input
  - "Hotspot guide" expandable card:
    Step 1: Turn on WiFi Hotspot on the sender's phone
    Step 2: Connect the receiver's phone to the hotspot
    Step 3: Scan the QR or enter the room code
  ```

- [x] 1.5.5: `features/share/components/TransferProgress.tsx`
  ```
  Shows during transfer:
  - Overall progress bar + percentage
  - Current file name
  - Speed: "2.4 MB/s"
  - ETA: "~12s remaining"
  - File count: "Transferred 5/50 photos"
  - Cancel button
  - Success state: checkmark + "Complete!"
  ```

- [x] 1.5.6: `features/share/components/ShareNotification.tsx`
  ```
  Toast/notification for an incoming share:
  - Sender avatar + name
  - "Wants to send you 15 photos (125MB)"
  - Preview thumbnails (first 4)
  - "Accept" (primary) / "Reject" (ghost)
  - Save option dropdown: "Save to Gallery" / "Download to device"
  - Auto-dismiss after 60s if no action
  ```

- [x] 1.5.7: `features/share/components/PeerCard.tsx`
  ```
  Card for each discovered peer:
  - Avatar + username
  - Connection type badge: "LAN" / "Internet"
  - "Connect" button + loading state while connecting
  ```

### Phase 1.6: Integration — ✅ DONE

> **Actual implementation notes**: `useShare()` was lifted into a React Context
> (`features/share/ShareProvider.tsx`) — MainLayout + ShareDialog + ShareView share a
> single orchestrator. ShareNotification + TransferProgress render **globally** in
> MainLayout (no longer duplicated in the dialog). Receiver accept includes a save choice:
> "Save to Gallery" (`uploadMedia`) or "Download to device" (Blob + anchor), via a
> dropdown in ShareNotification. `handleShare` in useGalleryActions opens ShareDialog with
> mediaIds from the selection store. Deep-link `/share/:roomCode` → ShareView (the
> enter-code / wait-for-sender screen).

### Phase 1.7: Gallery Selection + Share directly from device — ✅ DONE

> **Added after review**: the share flow could not be triggered from the UI because
> `useSelectionStore` was never written (nobody called `toggle()`/`selectAll()`). The
> infrastructure (store + BottomBarSelection + handleShare → ShareDialog) already existed —
> only the "missing link" of selecting images in the Gallery was absent.

- [x] 1.7.1: Shared `SelectionActionBar` (desktop toolbar + mobile BottomBar)

  File: `frontend/src/features/gallery/components/SelectionActionBar.tsx`
  - Buttons: Clear selection (X), `selection.count`, Share/Download/Delete.
  - Reads `selectedIds` + `clear()` from `useSelectionStore`, receives `onShare/onDownload/onDelete` via props.
  - `BottomBarSelection.tsx` (mobile) refactored into a thin wrapper of this component.

- [x] 1.7.2: `ImageCard` — long-press (450ms) / right-click enters selection mode

  - New props: `selected?: boolean`, `onToggle?: (m) => void`, `onLongPress?: (m) => void`.
  - PointerDown → 450ms timer → `onLongPress`; the click after a long-press is cancelled (`fired` flag).
  - `onContextMenu` → `preventDefault()` + `onLongPress` (enters selection mode on right-click).
  - Selection overlay: `border-primary ring-2` border + a round check in the corner.

- [x] 1.7.3: `GalleryView` — selection mode

  - `isSelecting`, `selectedIds`, `toggle`, `clear` from `useSelectionStore`.
  - `onLongPress`/`onToggle` wired; while selecting, click = toggle (doesn't open the Lightbox).
  - `Escape` exits selection; desktop: floating `SelectionActionBar` at bottom-center (`hidden sm:block`),
    mobile uses the existing BottomBar.
  - Share/Download/Delete via `useGalleryActions` (ShareDialog global in MainLayout).

- [x] 1.7.4: `SendView` — `/share` (share files from device, does NOT upload to DB)

  File: `frontend/src/features/share/SendView.tsx`
  - `input[type=file]` (image/*, video/*, multiple) → `File.stream()` into a `TransferSource`
    with the REAL `size` (accurate progress + ETA, unlike the `size:0` in ShareDialog).
  - When there is ≥1 file: `leaveRoom()` + `createSession([])` (empty mediaIds — the backend allows it).
  - UI: image previews (object URL), name + size, remove button per file; QR + peer list
    (reuse `QRTab`/`LanTab`) + a "Send to N people" button.
  - Unmount → `leaveRoom()` + revoke object URLs.

- [x] 1.7.5: Nav item + routes

  - `useNavItems.ts`: GROUP 2B "Quick send" → `/share` (icon `Share2`).
  - `AppRoutes.tsx`: `/share` → `SendView`, `/share/:roomCode` → `ShareView` (static wins over param).

- [x] 1.7.6: i18n — `selection.*` (cancel/count/share/download/delete), `send.*`
  (title/subtitle/pickFiles/filesEmpty/remove/readyToSend/totalSize), `sidebar.share` (vi+en).

### Phase 1.8: Realtime WS invite + real file size + online dot — ✅ DONE

> **The 3 remaining limitations after 1.7 were fixed to allow full end-to-end testing.**

- [x] 1.8.1: `POST /api/share/to-friends` — send invites in realtime over WS

  File: `backend/src/modules/share/share.routes.js`
  - Import `createRoom`, `getPeer`, `getRoom`, `sendToUser` from `ws/services/signaling.service.js`.
  - Use the sender's **currently open** signaling room (while in ShareDialog) for `roomCode`/`expiresAt`;
    if there is no room yet, `createRoom(userId, mediaIds)` so the receiver can join.
  - For each friend: `sendToUser(friendId, "share:invite", { sessionId, roomCode, senderId,
    senderName, senderAvatar, mediaCount, expiresAt })` — only to online WS users (best-effort;
    a pending `share_session_receivers` row is still stored in DB as fallback).
  - `ws/protocol.js`: add `SHARE_INVITE: "share:invite"` to `MSG_OUT`.

- [x] 1.8.2: Frontend receives the invite + "Receive photos" toast

  - `signaling.ts`: `SHARE_INVITE: "share:invite"`.
  - `useShare.ts`: `invites: ShareInvite[]` state; subscribe to `share:invite` (dedupe by
    `sessionId`); add action `dismissInvite(sessionId)`; type `ShareInvite` in `types/index.ts`.
  - `ShareInvite.tsx`: toast with avatar + name + "Wants to send you N photos" + room code;
    a **Receive** button (navigate `/share/:roomCode`) and a close button.
  - `MainLayout.tsx` `ShareOverlays`: render a stack of invites (bottom-right), `useNavigate` to
    the join screen when Receive is clicked.

- [x] 1.8.3: Real file size on the sender side (DB images) — fixes progress "jumping straight to 100%"

  - `backend/src/modules/media/media.list.service.js` `listMedia`: SELECT also `file_size_kb` →
    return `sizeBytes = file_size_kb * 1024`.
  - `frontend/src/services/media.ts` `MediaListItem`: add `sizeBytes?: number`.
  - `ShareDialog.buildSource`: `size: item.sizeBytes ?? 0` (previously = 0 → `fraction` defaulted to 1).

- [x] 1.8.4: Real peer online dot

  - `useShare.ts`: `ROOM_JOINED`/`ROOM_PEER_JOINED` set `isOnline: true` for every peer
    received from the server (a peer in the room ⇒ online); PeerCard dot is green instead of gray.

- [x] 1.6.1: Wire `useGalleryActions.handleShare` → ShareDialog

  File: `frontend/src/hooks/useGalleryActions.ts`
  ```typescript
  // Fix handleShare — replace console.log:
  const handleShare = (ids: string[]) => {
    setShareMediaIds(ids)   // → state
    setShareDialogOpen(true)
  }
  ```
  File: `frontend/src/components/layout/MainLayout.tsx`
  ```tsx
  // Add ShareDialog:
  <ShareDialog
    open={shareDialogOpen}
    onOpenChange={setShareDialogOpen}
    mediaIds={shareMediaIds}
  />
  ```

- [x] 1.6.2: Add i18n keys

  File: `frontend/src/locales/en/translation.json` (the `vi` file mirrors these)
  ```json
  {
    "share": {
      "title": "Share photos", "qrTab": "QR Code", "friendsTab": "Friends", "lanTab": "LAN Network",
      "creating": "Creating room...", "waiting": "Waiting for receiver...",
      "connect": "Connect", "accept": "Accept", "reject": "Reject", "cancel": "Cancel",
      "saveToGallery": "Save to Gallery", "download": "Download",
      "transferProgress": "Transferring...", "transferComplete": "Complete!",
      "speed": "Speed", "eta": "Remaining", "filesCount": "Transferred {done}/{total} photos",
      "copyCode": "Copy code", "codeCopied": "Copied",
      "expired": "Code expired", "newCode": "Generate new code",
      "noFriends": "No friends yet", "noPeers": "No devices found",
      "manualConnect": "Manual connect", "manualPlaceholder": "IP:Port (e.g. 192.168.1.100:3000)",
      "hotspotGuide": {
        "title": "Hotspot Guide",
        "step1": "Turn on WiFi Hotspot on sender's phone",
        "step2": "Connect receiver's phone to the hotspot",
        "step3": "Scan QR or enter room code"
      },
      "senderNotification": "{name} wants to send you {count} photos", "totalSize": "{size} MB"
    }
  }
  ```

- [x] 1.6.3: Add routes and nav items (if needed)

  File: `frontend/src/routes/AppRoutes.tsx`
  ```
  // Route /share/:roomCode for deep-link sharing
  <Route path="/share/:roomCode" element={<ShareView />} />
  ```
  File: `frontend/src/features/navigation/SidebarNavItems.tsx`
  ```
  // Nav item "Share" — skipped (share is not a persistent view)
  ```
