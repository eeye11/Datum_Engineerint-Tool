const http = require("http"), fs = require("fs"), p = require("path");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const root = process.argv[2] || process.cwd();
http.createServer((q, s) => {
  let u = decodeURIComponent(q.url.split("?")[0]);
  if (u === "/") u = "/index.html";
  const f = p.join(root, u);
  fs.readFile(f, (e, d) => {
    if (e) { s.writeHead(404); return s.end("not found"); }
    s.writeHead(200, { "Content-Type": T[p.extname(f)] || "application/octet-stream" });
    s.end(d);
  });
}).listen(8123, () => console.log("serving " + root + " on 8123"));