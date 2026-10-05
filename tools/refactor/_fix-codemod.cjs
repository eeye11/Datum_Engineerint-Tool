const fs = require("fs");
const f = "tools/refactor/to-esm.mjs";
let s = fs.readFileSync(f, "utf8");
const rep = (a, b) => { if (!s.includes(a)) { console.log("MISSING:", a.slice(0, 70)); process.exitCode = 1; } s = s.replace(a, b); };
rep(`    let body;
    const regionStart = iife ? iife.fn.body.start + 1 : 0;
    const regionEnd = iife ? iife.fn.body.end - 1 : src.length;
    body = applyEdits(src, edits, regionStart, regionEnd);
    if (iife) body = dedent(body, templateLineSet(ast, src, regionStart));`,
`    const regionStart = iife ? iife.fn.body.start + 1 : 0;
    const regionEnd = iife ? iife.fn.body.end - 1 : src.length;
    if (iife) edits.push(...dedentEdits(ast, src, regionStart, regionEnd, edits));
    const body = applyEdits(src, edits, regionStart, regionEnd);`);
rep(`/* Lines (relative to the region) that begin inside a template literal, which must not be re-indented. */
function templateLineSet(ast, src, regionStart) {
    const protectedOffsets = [];
    walk.full(ast, n => { if (n.type === "TemplateLiteral") protectedOffsets.push([n.start, n.end]); });
    return { regionStart, protectedOffsets };
}

function dedent(text, { protectedOffsets }) {
    // Find the common indentation of the body's own lines.
    const lines = text.split("\n");
    let offset = 0;
    const meta = lines.map(line => {
        const m = { line, start: offset };
        offset += line.length + 1;
        return m;
    });
    const indents = meta.filter(m => m.line.trim()).map(m => m.line.match(/^[ \t]*/)[0].length);
    const strip = Math.min(...indents);
    if (!strip || !Number.isFinite(strip)) return text;
    return meta.map(m => m.line.slice(0, strip).trim() === "" ? m.line.slice(strip) : m.line).join("\n");
}`,
`/*
 * Edits that remove one level of indentation from every line of the IIFE body,
 * except lines that start inside a template literal (their whitespace is part
 * of a string) and lines inside another edit, whose replacement text is
 * dedented separately below.
 */
function dedentEdits(ast, src, start, end, otherEdits) {
    const templates = [];
    walk.full(ast, n => { if (n.type === "TemplateLiteral") templates.push([n.start, n.end]); });
    const lineStarts = [];
    for (let i = start; i < end; i++) if (i === start || src[i - 1] === "\n") lineStarts.push(i);
    const indentOf = i => src.slice(i).match(/^[ \t]*/)[0].length;
    const insideTemplate = i => templates.some(([s, e]) => i > s && i < e);
    const candidates = lineStarts.filter(i => !insideTemplate(i) && src[i + indentOf(i)] !== "\n" && i + indentOf(i) < end);
    const strip = Math.min(...candidates.map(indentOf));
    if (!strip || !Number.isFinite(strip)) return [];
    const result = [];
    for (const i of candidates) {
        const owner = otherEdits.find(e => i > e.start && i < e.end);
        if (owner) continue;
        result.push({ start: i, end: i + Math.min(strip, indentOf(i)), text: "" });
    }
    // re-indent multi-line replacement texts the same way
    for (const e of otherEdits) {
        if (e.text.includes("\n")) e.text = e.text.split("\n").map((l, k) => k && l.startsWith(" ".repeat(strip)) ? l.slice(strip) : l).join("\n");
    }
    return result;
}`);
fs.writeFileSync(f, s);
console.log("patched");
