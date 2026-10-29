// Hành động chính của landing theo trạng thái đăng nhập: đã đăng nhập → vào
// thẳng thư viện; chưa → trang đăng nhập (xong quay về thư viện).
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/components/AuthContext";

export function useLandingCta() {
  const navigate = useNavigate();
  const { isAuthenticated, isPending, user } = useAuth();

  return {
    isAuthenticated,
    isPending,
    user,
    go: () =>
      isAuthenticated
        ? navigate("/gallery")
        : navigate("/auth", { state: { from: "/gallery" } }),
  };
}
