import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    headers: {
      "Permissions-Policy": "microphone=(self), geolocation=(self), camera=(self), speaker-selection=(self), autoplay=(self), fullscreen=(self)",
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Cross-Origin-Embedder-Policy": "unsafe-none",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  },
  optimizeDeps: {
    force: true,
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "react-markdown",
      "remark-gfm",
      "recharts",
      "@tanstack/react-table",
      "@tanstack/react-virtual",
    ],
    exclude: [
      "pdfjs-dist",
      "tesseract.js",
      "jszip",
      "xlsx",
      "hls.js",
      "lucide-react",
    ],
  },
})
