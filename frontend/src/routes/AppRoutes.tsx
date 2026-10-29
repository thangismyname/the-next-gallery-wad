import React from "react";
import { Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { HomeView } from "@/features/home/HomeView";
import { NotFoundView } from "@/features/not-found/NotFoundView";
import { GalleryView } from "@/features/gallery/GalleryView";
import { FavoritesView } from "@/features/favorites/FavoritesView";
import { FriendsView } from "@/features/friends/FriendsView";
import { FriendInviteHandler } from "@/features/friends/components/FriendInviteHandler";
import { MomentsView } from "@/features/moments/MomentsView";
import { TrashView } from "@/features/trash/TrashView";
import { ProfileView } from "@/features/profile/ProfileView";
import { SettingsView } from "@/features/settings/SettingsView";
import { StudioView } from "@/features/studio/StudioView";
import { AlbumsView } from "@/features/albums/AlbumsView";
import { AlbumDetailView } from "@/features/albums/AlbumDetailView";
import { AutoAlbumView } from "@/features/albums/AutoAlbumView";
import { PublicAlbumView } from "@/features/albums/PublicAlbumView";
import { CaptureView } from "@/features/capture/CaptureView";
import { ShareView } from "@/features/share/ShareView";
import { SendView } from "@/features/share/SendView";
import LandingView from "@/features/landing/LandingView";
import { AdminRoute, ProtectedRoute } from "./ProtecedRoutes";
import AuthView from "@/features/auth/AuthView";
import { AdminDashboard } from "@/features/admin/AdminDashboard";
import { AdminUsersView } from "@/features/admin/AdminUsersView";
import { AdminDeveloperView } from "@/features/admin/AdminDeveloperView";
import { ResetPasswordView } from "@/features/auth/ResetPasswordView";
import { ForgotPasswordView } from "@/features/auth/ForgotPasswordView";
import { AdminLayout } from "@/components/layout/AdminLayout";

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/landing" element={<LandingView />} />
      <Route path="/auth" element={<AuthView />} />
      <Route path="/forgot-password" element={<ForgotPasswordView />} />
      <Route path="/reset-password" element={<ResetPasswordView />} />
      {/* Album qua link công khai — không cần đăng nhập */}
      <Route path="/s/:token" element={<PublicAlbumView />} />

      <Route element={<MainLayout />}>
        <Route path="/" element={<HomeView />} />
        {/* Route cần đăng nhập */}
        <Route element={<ProtectedRoute />}>
          <Route path="/gallery" element={<GalleryView />} />
          <Route path="/favorites" element={<FavoritesView />} />
          <Route path="/friends" element={<FriendsView />} />
          <Route path="/friends/invite" element={<FriendInviteHandler />} />
          <Route path="/trash" element={<TrashView />} />
          <Route path="/profile" element={<ProfileView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/studio" element={<StudioView />} />
          <Route path="/albums" element={<AlbumsView />} />
          <Route path="/albums/auto/:key" element={<AutoAlbumView />} />
          <Route path="/albums/:id" element={<AlbumDetailView />} />
          <Route path="/capture" element={<CaptureView />} />
          <Route path="/share" element={<SendView />} />
          <Route path="/share/:roomCode" element={<ShareView />} />
        </Route>
      </Route>

      {/* Moments — fullscreen, không dùng MainLayout (vẫn cần đăng nhập) */}
      <Route element={<ProtectedRoute />}>
        <Route path="/moments" element={<MomentsView />} />
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
  );
};
