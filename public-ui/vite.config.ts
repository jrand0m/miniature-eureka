import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        register: resolve(__dirname, "register.html"),
        login: resolve(__dirname, "login.html"),
        catalog: resolve(__dirname, "catalog.html"),
      },
    },
  },
});
