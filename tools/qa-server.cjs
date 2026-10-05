/* A minimal static server rooted at the project directory, for QA runs. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = path.join(root, p);
    fs.readFile(f, (e, d) => {
      if (e) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(f)] || "application/octet-stream",
      });
      res.end(d);
    });
  })
  .listen(8123, () => console.log("qa static server on 8123"));
