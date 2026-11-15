import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Trỏ Vite đọc .env từ project root (../) thay vì frontend/,
  // để dùng chung 1 file .env cho cả FE và BE
  envDir: path.resolve(__dirname, ".."),
  build: {
    // Trang đã tách chunk theo route (routes/AppRoutes.tsx); chunk chính còn
    // ~575 KB (React, Radix, framer-motion, react-query, layout + dialog toàn app).
    chunkSizeWarningLimit: 650,
  },
  test: {
    // Unit test hàm thuần (*.test.ts cạnh file) — không cần DOM.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
