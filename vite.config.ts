import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/playwright-report/**",
        "**/test-results/**",
        "**/docs/**",
        "**/reports/**",
      ],
    },
  },
  preview: { port: 4173, strictPort: true },
});
