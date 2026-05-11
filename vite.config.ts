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
  },
  optimizeDeps: {
    force: true,
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "lucide-react",
      "react-markdown",
      "remark-gfm",
      "pdfjs-dist",
      "tesseract.js",
      "jszip",
      "recharts",
      "@tanstack/react-table",
      "@tanstack/react-virtual",
      "xlsx",
    ],
  },
})
