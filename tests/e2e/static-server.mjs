/*
 * A minimal static file server for browser tests.
 *
 *   node tests/e2e/static-server.mjs [root=.] [port=8123]
 *
 * Serves the source tree as-is (no build), or a built dist/ folder.
 */
import http from "http";
import fs from "fs";
import path from "path";

const root = path.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 8123);
const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json"
};

http.createServer((request, response) => {
    let urlPath = decodeURIComponent(request.url.split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(root, urlPath);
    if (!file.startsWith(root)) {
        response.writeHead(403);
        response.end();
        return;
    }
    fs.readFile(file, (error, data) => {
        if (error) {
            response.writeHead(404);
            response.end("not found");
            return;
        }
        response.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
        response.end(data);
    });
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}/`));
