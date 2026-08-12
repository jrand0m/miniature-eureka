import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
        users: resolve(__dirname, "users.html"),
        books: resolve(__dirname, "books.html"),
        loans: resolve(__dirname, "loans.html"),
      },
    },
  },
});
