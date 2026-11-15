import { useNavigate } from "react-router-dom";
import { authClient } from "@/services/authClient";

export function useLogout() {
  const navigate = useNavigate();

  const logout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate("/auth"),
        onError: (ctx) => console.error("Logout failed:", ctx.error),
      },
    });
  };

  return { logout };
}