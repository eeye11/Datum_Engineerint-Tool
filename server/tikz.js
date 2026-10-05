/*
 * TikZ -> SVG rendering, in-process, with TikZJax.
 *
 * TikZJax (a WebAssembly build of TeX) takes several seconds to load, so it
 * is loaded once, in the background, and the server does not wait for it:
 * the site is usable immediately and the render endpoint reports "not
 * ready" until TikZ is. A failed load leaves the endpoint unavailable rather
 * than taking the whole server down.
 *
 * TeX runs one job at a time, so renders are queued, and a render that
 * does not finish within RENDER_TIMEOUT_MS is reported as failed.
 */
const RENDER_TIMEOUT_MS = 30_000;

let engine = null;              // { tex, dvi2svg } once loaded
let loadError = null;
let queue = Promise.resolve();

export function tikzStatus() {
    return engine ? "ready" : loadError ? "unavailable" : "loading";
}

export async function loadTikz() {
    try {
        const tikzjax = await import("node-tikzjax");
        await tikzjax.load();
        engine = { tex: tikzjax.tex, dvi2svg: tikzjax.dvi2svg };
    } catch (error) {
        loadError = error;
        throw error;
    }
}

/*
 * The student's code may be a complete LaTeX document or just the picture;
 * the preamble and document environment are supplied here, so they are
 * removed from the input.
 */
export function cleanTikZ(input) {
    return input
        .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/g, "")
        .replace(/\\usepackage(?:\[[^\]]*\])?\{tikz\}/g, "")
        .replace(/\\usetikzlibrary\{arrows\.meta\}/g, "")
        .replace(/\\begin\{document\}/g, "")
        .replace(/\\end\{document\}/g, "")
        .trim();
}

function documentFor(tikz) {
    return String.raw`
\usepackage{tikz}
\usetikzlibrary{arrows.meta}

\begin{document}

${cleanTikZ(tikz)}

\end{document}
`;
}

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`TikZ rendering took longer than ${ms / 1000} s.`)), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

/* Render TikZ source to SVG markup. Rejects if TikZ is not ready or the source does not compile. */
export function renderTikz(tikz, { debug = false } = {}) {
    if (!engine) {
        return Promise.reject(new Error(
            loadError ? "TikZ rendering is unavailable on this server." : "TikZ is still loading; try again shortly."
        ));
    }

    const job = queue.then(async () => {
        const dvi = await engine.tex(documentFor(tikz), { showConsole: debug });
        return engine.dvi2svg(dvi);
    });

    // The next job waits for this one whether it succeeds or not.
    queue = job.catch(() => {});

    return withTimeout(job, RENDER_TIMEOUT_MS);
}
