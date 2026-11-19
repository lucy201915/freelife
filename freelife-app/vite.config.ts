import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  publicDir: isSsrBuild ? false : "public",
}));
