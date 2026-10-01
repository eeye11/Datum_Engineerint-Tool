/*
 * A tiny static server, used only to open the drawing app in a
 * headless browser while verifying a change. Verification aid,
 * not part of the application.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || process.cwd();
const port = Number(process.argv[3] || 8931);

const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml"
};

http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(root, url === "/" ? "index.html" : url);

    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("not found");
            return;
        }

        res.writeHead(200, {
            "Content-Type":
                types[path.extname(file)] ||
                "application/octet-stream",

            /*
             * Never let the browser reuse a script it has already
             * fetched.
             *
             * Without this the browser is free to serve a CACHED
             * copy of a file that has since changed, so a
             * verification run silently exercises the OLD code
             * while the server holds the new. That produced a long
             * series of results that contradicted the source, and
             * the header is worth having purely to stop that
             * recurring.
             */
            "Cache-Control":
                "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        });

        res.end(data);
    });
}).listen(port, () => console.log("serving " + root));
