import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const logger = createLogger();
const logError = logger.error.bind(logger);
logger.error = (message, options) => {
  if (message.includes("/api/auth/google/callback")) {
    logError("OAuth callback proxy unavailable.", { timestamp: true });
    return;
  }
  logError(message, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
