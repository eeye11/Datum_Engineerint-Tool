/*
 * The optional Datum server.
 *
 * Datum itself is a static site: `npm run build` produces dist/, which any
 * web host can serve, and the editor needs nothing else. This server adds
 * one thing a static host cannot: rendering TikZ to SVG (POST
 * /api/render-tikz). It also serves the site, so one command runs both.
 *
 *   npm run build && npm start        serve dist/ with TikZ rendering
 *   PORT=8080 npm start               on another port
 *   DATUM_DEBUG=1 npm start           log TikZ sources and TeX output
 *
 * Without a build it serves the source tree (index.html + src/), which
 * modern browsers can run directly; `npm run dev` is the better way to
 * work on the code.
 */
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadTikz, renderTikz, tikzStatus } from "./tikz.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 3000;
const DEBUG = Boolean(process.env.DATUM_DEBUG);

const app = express();
app.use(express.json({ limit: "2mb" }));

/*
 * WHAT IS SERVED. The built site when there is one. Otherwise only the
 * page and its sources - never the repository as a whole, which would hand
 * out package files, tests and node_modules.
 */
const dist = path.join(ROOT, "dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist));
} else {
    app.get("/", (req, res) => res.sendFile(path.join(ROOT, "index.html")));
    app.use("/src", express.static(path.join(ROOT, "src")));
}

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", tikz: tikzStatus() });
});

app.post("/api/render-tikz", async (req, res) => {
    const tikz = req.body?.tikz;

    if (typeof tikz !== "string" || !tikz.trim()) {
        return res.status(400).json({ success: false, error: "No TikZ code was provided." });
    }

    if (tikzStatus() !== "ready") {
        return res.status(503).json({ success: false, error: `TikZ rendering is ${tikzStatus()}.` });
    }

    if (DEBUG) console.log("TikZ source:\n" + tikz);

    try {
        const svg = await renderTikz(tikz, { debug: DEBUG });
        res.json({ success: true, svg });
    } catch (error) {
        console.error("TikZ rendering failed:", error.message);
        res.status(422).json({ success: false, error: error.message || "TikZ rendering failed." });
    }
});

/* A malformed request gets a JSON answer, never a stack trace. */
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || error.statusCode || 500;
    res.status(status).json({ success: false, error: status === 400 ? "The request body is not valid JSON." : "Server error." });
});

app.listen(PORT, () => {
    console.log(`Datum is running at http://localhost:${PORT}`);
});

loadTikz()
    .then(() => console.log("TikZ rendering is ready."))
    .catch(error => console.error("TikZ rendering is unavailable:", error.message));
