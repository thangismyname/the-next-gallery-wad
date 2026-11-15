import { Navigate, Outlet } from "react-router-dom";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { useSession } from "@/services/authClient";

export const ProtectedRoute = () => {
  const { data: session, isPending } = useSession();

  if (isPending) return <RouteFallback />;
  if (!session) return <Navigate to="/auth" replace />;

  return <Outlet />;
};

export const AdminRoute = () => {
  const { data: session, isPending } = useSession();

  if (isPending) return <RouteFallback fullScreen />;
  if (!session) return <Navigate to="/auth" replace />;
  if (session.user.role !== "admin") return <Navigate to="/gallery" replace />;

  return <Outlet />;
};
