import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { setMediaBaseUrl } from "@tng/shared";
import { AUTH_BASE_URL } from "@/lib/config";
import { applyStoredFontScale } from "@/lib/fontScale";
import { queryClient } from "@/lib/queryClient";
import App from "./App";
import "./index.css";
import "./i18n"; // Import cấu hình i18n tại đây

setMediaBaseUrl(AUTH_BASE_URL);
applyStoredFontScale();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
