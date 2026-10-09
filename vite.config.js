import { defineConfig } from "vite";

/*
 * DAETUM is a static site: `npm run build` writes plain files to dist/ that
 * any web server (GitHub Pages, a university web host) can serve.
 *
 * base "./" makes every asset URL relative, so the build works from a
 * sub-path such as https://example.github.io/daetum/ without being told
 * where it will live.
 *
 * The /api requests (TikZ rendering) are only available when the optional
 * Node server is running; in development they are proxied to it.
 */
export default defineConfig({
    base: "./",
    server: {
        port: 5173,
        proxy: {
            "/api": "http://localhost:3000"
        }
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        target: "es2022"
    }
});
