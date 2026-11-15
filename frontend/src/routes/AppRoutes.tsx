import React, { Suspense, lazy } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { NotFoundView } from "@/features/not-found/NotFoundView";
import { FAVORITES_PATH, favoritesPath } from "@/features/favorites/favoritesPath";
import { TRASH_PATH } from "@/features/trash/trashPath";
import { AdminRoute, ProtectedRoute } from "./ProtectedRoutes";

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
const AccountView = named(() => import("@/features/settings/AccountView"), "AccountView");
const StudioView = named(() => import("@/features/studio/StudioView"), "StudioView");
const EditorView = named(() => import("@/features/editor/EditorView"), "EditorView");
const AlbumsView = named(() => import("@/features/albums/AlbumsView"), "AlbumsView");
const AlbumDetailView = named(() => import("@/features/albums/AlbumDetailView"), "AlbumDetailView");
const AutoAlbumView = named(() => import("@/features/albums/AutoAlbumView"), "AutoAlbumView");
const CameraView = named(() => import("@/features/camera/CameraView"), "CameraView");
const SendView = named(() => import("@/features/share/SendView"), "SendView");

const AdminLayout = named(() => import("@/components/layout/AdminLayout"), "AdminLayout");
const AdminDashboard = named(() => import("@/features/admin/AdminDashboard"), "AdminDashboard");
const AdminUsersView = named(() => import("@/features/admin/AdminUsersView"), "AdminUsersView");
const AdminDeveloperView = named(() => import("@/features/admin/AdminDeveloperView"), "AdminDeveloperView");

/** Chuyển route cũ sang route mới, giữ nguyên query (?filter=…). */
const RedirectKeepingSearch: React.FC<{ to: string }> = ({ to }) => {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
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
            {/* Profile + settings = one page (like the mobile account sheet). */}
            <Route path="/profile" element={<RedirectKeepingSearch to="/settings" />} />
            <Route path="/settings" element={<AccountView />} />
            <Route path="/studio" element={<StudioView />} />
            <Route path="/edit/:id" element={<EditorView />} />
            <Route path="/albums" element={<AlbumsView />} />
            <Route path={FAVORITES_PATH} element={<FavoritesView />} />
            <Route path={TRASH_PATH} element={<TrashView />} />
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

        {/* Admin nằm ngoài MainLayout, dùng layout + guard riêng */}
        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsersView />} />
            <Route path="/admin/developer" element={<AdminDeveloperView />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundView />} />
      </Routes>
    </Suspense>
  );
};
