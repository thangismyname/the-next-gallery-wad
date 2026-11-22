import React, { Suspense, lazy, useEffect } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { NotFoundView } from "@/features/not-found/NotFoundView";
import { FAVORITES_PATH, favoritesPath } from "@/features/favorites/favoritesPath";
import { TRASH_PATH } from "@/features/trash/trashPath";
import { REVIEW_PATH } from "@/features/review/reviewPath";
import { useAccountSheet } from "@/features/settings/useAccountSheet";
import { AdminRoute, DeveloperRoute, ProtectedRoute } from "./ProtectedRoutes";

// Mỗi trang là 1 chunk riêng (tải khi vào route) — trang landing / link chia sẻ
// công khai không phải tải admin (recharts), camera, engine P2P… Layout (MainLayout,
// AdminLayout) có <Suspense> quanh <Outlet/> nên header / sidebar không nháy khi chuyển trang.
// `named` = trang export tên (không default).
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));

const LandingView = lazy(() => import("@/features/landing/LandingView"));
const AuthView = lazy(() => import("@/features/auth/AuthView"));
const ForgotPasswordView = named(() => import("@/features/auth/ForgotPasswordView"), "ForgotPasswordView");
const ResetPasswordView = named(() => import("@/features/auth/ResetPasswordView"), "ResetPasswordView");
const PublicAlbumView = named(() => import("@/features/albums/PublicAlbumView"), "PublicAlbumView");
const ReceiveView = named(() => import("@/features/share/ReceiveView"), "ReceiveView");
const ReceiveCodeView = named(() => import("@/features/share/ReceiveView"), "ReceiveCodeView");

const GalleryView = named(() => import("@/features/gallery/GalleryView"), "GalleryView");
const FavoritesView = named(() => import("@/features/favorites/FavoritesView"), "FavoritesView");
const FriendsView = named(() => import("@/features/friends/FriendsView"), "FriendsView");
const FriendInviteHandler = named(
  () => import("@/features/friends/components/FriendInviteHandler"),
  "FriendInviteHandler",
);
const MomentsView = named(() => import("@/features/moments/MomentsView"), "MomentsView");
const TrashView = named(() => import("@/features/trash/TrashView"), "TrashView");
const SwipeReviewView = named(() => import("@/features/review/SwipeReviewView"), "SwipeReviewView");
const ImportView = named(() => import("@/features/import/ImportView"), "ImportView");
const StudioView = named(() => import("@/features/studio/StudioView"), "StudioView");
const EditorView = named(() => import("@/features/editor/EditorView"), "EditorView");
const AlbumsView = named(() => import("@/features/albums/AlbumsView"), "AlbumsView");
const AlbumDetailView = named(() => import("@/features/albums/AlbumDetailView"), "AlbumDetailView");
const AutoAlbumView = named(() => import("@/features/albums/AutoAlbumView"), "AutoAlbumView");
const CameraView = named(() => import("@/features/camera/CameraView"), "CameraView");
const SendView = named(() => import("@/features/share/SendView"), "SendView");

const AdminLayout = named(() => import("@/components/layout/AdminLayout"), "AdminLayout");
const AdminDashboard = named(() => import("@/features/admin/dashboard/AdminDashboard"), "AdminDashboard");
const AdminUsersView = named(() => import("@/features/admin/users/AdminUsersView"), "AdminUsersView");
const AdminDeveloperView = named(() => import("@/features/admin/developer/AdminDeveloperView"), "AdminDeveloperView");
const DevLayout = named(() => import("@/components/layout/DevLayout"), "DevLayout");
const LabView = named(() => import("@/features/lab/LabView"), "LabView");
const RunnerView = named(() => import("@/features/lab/runner/RunnerView"), "RunnerView");

/** Chuyển route cũ sang route mới, giữ nguyên query (?filter=…). */
const RedirectKeepingSearch: React.FC<{ to: string }> = ({ to }) => {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
};

/** /settings, /profile: không còn trang riêng → về Thư viện và mở bảng tài khoản. */
const OpenAccountSheet: React.FC = () => {
  const setOpen = useAccountSheet((s) => s.setOpen);
  useEffect(() => setOpen(true), [setOpen]);
  return <Navigate to="/gallery" replace />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<RouteFallback fullScreen />}>
      <Routes>
        <Route path="/landing" element={<LandingView />} />
        <Route path="/auth" element={<AuthView />} />
        <Route path="/forgot-password" element={<ForgotPasswordView />} />
        <Route path="/reset-password" element={<ResetPasswordView />} />
        {/* Album qua link công khai — không cần đăng nhập */}
        <Route path="/s/:token" element={<PublicAlbumView />} />
        {/* Nhận file qua link / QR / mã — không cần đăng nhập */}
        <Route path="/r" element={<ReceiveCodeView />} />
        <Route path="/r/:id" element={<ReceiveView />} />

        <Route element={<MainLayout />}>
          {/* Route cần đăng nhập */}
          <Route element={<ProtectedRoute />}>
            {/* Không có trang Home riêng — vào thẳng Library (như tab đầu của app mobile) */}
            <Route path="/" element={<Navigate to="/gallery" replace />} />
            <Route path="/gallery" element={<GalleryView />} />
            {/* Yêu thích nằm trong Albums (như app mobile); link cũ /favorites?filter=… vẫn chạy */}
            <Route path="/favorites" element={<RedirectKeepingSearch to={FAVORITES_PATH} />} />
            <Route path="/friends" element={<FriendsView />} />
            <Route path="/friends/invite" element={<FriendInviteHandler />} />
            {/* Thùng rác cũng nằm trong Albums (như Yêu thích) */}
            <Route path="/trash" element={<Navigate to={TRASH_PATH} replace />} />
            {/* Profile + settings = bảng trượt từ avatar (cùng ở app · Admin · Developer); link cũ mở bảng đó. */}
            <Route path="/profile" element={<OpenAccountSheet />} />
            <Route path="/settings" element={<OpenAccountSheet />} />
            <Route path="/studio" element={<StudioView />} />
            <Route path="/albums" element={<AlbumsView />} />
            <Route path={FAVORITES_PATH} element={<FavoritesView />} />
            <Route path={TRASH_PATH} element={<TrashView />} />
            <Route path={REVIEW_PATH} element={<SwipeReviewView />} />
            <Route path="/import" element={<ImportView />} />
            {/* Album tự động "Yêu thích" cũ → trang Yêu thích, lọc ảnh thả tim */}
            <Route
              path="/albums/auto/type-favorites"
              element={<Navigate to={favoritesPath("favorites")} replace />}
            />
            <Route path="/albums/auto/:key" element={<AutoAlbumView />} />
            <Route path="/albums/:id" element={<AlbumDetailView />} />
            <Route path="/camera" element={<CameraView />} />
            <Route path="/share" element={<SendView />} />
            {/* Moments dùng chung chrome của app (Header · Sidebar · BottomBar);
                <main> tự chuyển sang chế độ immersive — xem MainLayout. */}
            <Route path="/moments" element={<MomentsView />} />
          </Route>
        </Route>

        {/* Editor toàn màn hình (như Apple Photos) — ngoài MainLayout */}
        <Route element={<ProtectedRoute />}>
          <Route path="/edit/:id" element={<EditorView />} />
        </Route>

        {/* Admin nằm ngoài MainLayout, dùng layout + guard riêng */}
        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsersView />} />
            <Route path="/admin/developer" element={<AdminDeveloperView />} />
            {/* Lab đã chuyển sang khu Developer */}
            <Route path="/admin/lab" element={<Navigate to="/dev/lab" replace />} />
          </Route>
        </Route>

        {/* Khu Developer: admin hoặc Developer đã duyệt — layout giống Admin */}
        <Route element={<DeveloperRoute />}>
          <Route element={<DevLayout />}>
            <Route path="/dev" element={<Navigate to="/dev/lab" replace />} />
            <Route path="/dev/lab" element={<LabView />} />
            <Route path="/dev/run" element={<RunnerView />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </Suspense>
  );
};
