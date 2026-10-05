/*
 * CODEMOD: classic browser scripts -> ES modules.
 *
 * Every application module used to be an IIFE that published one object on
 * `window` (`root.enggX = {...}`) and reached its neighbours through other
 * globals (`window.enggY`, or a bare `enggY`). This rewrites each file into
 * an ES module:
 *
 *   - the IIFE wrapper is removed and its body dedented
 *     (template-literal lines are left byte-identical);
 *   - `root.enggX = EXPR` becomes `const enggX = EXPR; export default enggX;`
 *   - `window.enggY` / `root.enggY` / bare `enggY` become an import of the
 *     module that owns enggY;
 *   - any other use of the IIFE's `root` parameter becomes `globalThis`;
 *   - `"use strict"` directives are dropped (modules are always strict).
 *
 * Non-IIFE files (the controller, the tool registry) are handled the same way
 * minus the unwrapping, with their `window.X = ...` publications turned into
 * named exports.
 *
 * Usage: node tools/refactor/to-esm.mjs <srcRoot>
 * Prints a report of anything it could not classify.
 */
import fs from "fs";
import path from "path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import * as eslintScope from "eslint-scope";
import globals from "globals";

const SRC = path.resolve(process.argv[2] || "src");
const files = [];
(function collect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full);
        else if (entry.name.endsWith(".js")) files.push(full);
    }
})(SRC);

const KNOWN_GLOBALS = new Set([
    ...Object.keys(globals.browser), ...Object.keys(globals.builtin), ...Object.keys(globals.es2021),
    "globalThis", "MathJax", "math"
]);

const parse = src => acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", ranges: true, locations: true });
const read = f => fs.readFileSync(f, "utf8").replace(/^﻿/, "");
const report = [];

/* ---------- pass 1: who publishes what ---------- */
const owner = new Map();       // global name -> { file, kind: "default"|"named" }
const info = new Map();        // file -> analysis
for (const file of files) {
    const src = read(file);
    const ast = parse(src);
    const iife = findIife(ast);
    const scopeBody = iife ? iife.fn.body.body : ast.body;
    const pubs = [];
    for (const stmt of scopeBody) {
        const pub = publication(stmt, iife?.param);
        if (pub) pubs.push(pub);
        if (stmt.type === "IfStatement") {
            // `if (typeof window !== "undefined") { window.X = X; }`
            const inner = stmt.consequent.type === "BlockStatement" ? stmt.consequent.body : [stmt.consequent];
            for (const s of inner) {
                const p = publication(s, iife?.param);
                if (p) pubs.push({ ...p, wrapper: stmt });
            }
        }
    }
    info.set(file, { src, ast, iife, pubs });
    const isDefault = Boolean(iife) && pubs.length === 1;
    for (const p of pubs) owner.set(p.name, { file, kind: isDefault ? "default" : "named" });
    if (!iife) {
        for (const stmt of ast.body) {
            for (const name of declaredNames(stmt)) {
                if (!owner.has(name)) owner.set(name, { file, kind: "named", declaration: true });
            }
        }
    }
}

function declaredNames(stmt) {
    if (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") return [stmt.id.name];
    if (stmt.type === "VariableDeclaration") return stmt.declarations.filter(d => d.id.type === "Identifier").map(d => d.id.name);
    return [];
}

function findIife(ast) {
    const stmts = ast.body.filter(s => !(s.type === "ExpressionStatement" && s.directive));
    if (stmts.length !== 1 || stmts[0].type !== "ExpressionStatement") return null;
    let call = stmts[0].expression;
    if (call.type === "UnaryExpression") call = call.argument;
    if (call.type !== "CallExpression") return null;
    const fn = call.callee;
    if (fn.type !== "FunctionExpression" && fn.type !== "ArrowFunctionExpression") return null;
    return { stmt: stmts[0], call, fn, param: fn.params[0]?.name || null };
}

function publication(stmt, param) {
    if (stmt.type !== "ExpressionStatement") return null;
    const e = stmt.expression;
    if (e.type !== "AssignmentExpression" || e.operator !== "=") return null;
    const l = e.left;
    if (l.type !== "MemberExpression" || l.computed || l.object.type !== "Identifier") return null;
    if (![param, "window", "globalThis"].includes(l.object.name)) return null;
    return { name: l.property.name, stmt, rhs: e.right };
}

/* ---------- pass 2: rewrite ---------- */
const importedNames = new Set();
const outputs = new Map();
for (const [file, { src, ast, iife, pubs }] of info) {
    const edits = [];                       // { start, end, text }
    const imports = new Map();              // name -> owner
    const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
    const ownNames = new Set(pubs.map(p => p.name));
    const relTo = target => {
        let rel = path.relative(path.dirname(file), target).replace(/\\/g, "/");
        return rel.startsWith(".") ? rel : "./" + rel;
    };
    const useGlobal = (name, node) => {
        if (ownNames.has(name)) return;
        const o = owner.get(name);
        if (!o || o.file === file) return;
        imports.set(name, o);
        importedNames.add(name);
        if (atModuleLevel(node)) report.push(`${rel(file)}: module-level use of import ${name} @${node.loc.start.line}`);
    };

    // Function nesting, to tell module-evaluation-time uses from deferred ones.
    const fnRanges = [];
    walk.full(ast, n => { if (/Function/.test(n.type) && n !== iife?.fn) fnRanges.push(n.range); });
    const atModuleLevel = n => !fnRanges.some(([s, e]) => n.start >= s && n.end <= e);

    // a. publications
    for (const p of pubs) {
        const isDefault = owner.get(p.name).kind === "default";
        const rhs = src.slice(p.rhs.start, p.rhs.end);
        const decl = `const ${p.name} = ${rhs};\n\nexport ${isDefault ? `default ${p.name}` : `{ ${p.name} }`};`;
        if (p.wrapper) {
            // the conditional browser-only publish: keep the binding, export it unconditionally
            edits.push({ start: p.wrapper.start, end: p.wrapper.end, text: `export { ${p.name.replace(/^/, "")} };` });
            // the value is already declared elsewhere in the file under the same name
        } else if (p.rhs.type === "Identifier" && p.rhs.name === p.name) {
            edits.push({ start: p.stmt.start, end: p.stmt.end, text: `export ${isDefault ? `default ${p.name}` : `{ ${p.name} }`};` });
        } else {
            edits.push({ start: p.stmt.start, end: p.stmt.end, text: decl });
        }
    }
    const pubRanges = pubs.map(p => (p.wrapper || p.stmt).range);
    const inPub = n => pubRanges.some(([s, e]) => n.start >= s && n.start < e) &&
        !pubs.some(p => n.start >= p.rhs.start && n.end <= p.rhs.end);

    // b. window.enggY / root.enggY / globalThis.enggY member reads
    walk.full(ast, node => {
        if (node.type !== "MemberExpression" || node.computed || node.object.type !== "Identifier") return;
        if (![iife?.param, "window", "globalThis", "root"].includes(node.object.name)) return;
        const name = node.property.name;
        if (!owner.has(name) || inPub(node)) return;
        edits.push({ start: node.start, end: node.end, text: name });
        useGlobal(name, node);
    });

    // c. bare free identifiers
    for (const ref of sm.globalScope.through) {
        const name = ref.identifier.name;
        if (owner.has(name) && owner.get(name).file !== file) { useGlobal(name, ref.identifier); continue; }
        if (owner.has(name)) continue;
        if (!KNOWN_GLOBALS.has(name) && name !== iife?.param) report.push(`${rel(file)}: unresolved free identifier ${name} @${ref.identifier.loc.start.line}`);
    }

    // d. other uses of the IIFE parameter
    if (iife?.param && iife.param !== "window") {
        const fnScope = sm.acquire(iife.fn);
        const variable = fnScope?.variables.find(v => v.name === iife.param);
        for (const r of variable?.references || []) {
            const id = r.identifier;
            if (edits.some(e => id.start >= e.start && id.end <= e.end)) continue;
            edits.push({ start: id.start, end: id.end, text: "globalThis" });
        }
    }

    // e. "use strict"
    const scopeBody = iife ? iife.fn.body.body : ast.body;
    for (const s of scopeBody) if (s.type === "ExpressionStatement" && s.directive === "use strict") edits.push({ start: s.start, end: s.end, text: "" });

    // apply edits inside the relevant region
    const regionStart = iife ? iife.fn.body.start + 1 : 0;
    const regionEnd = iife ? iife.fn.body.end - 1 : src.length;
    if (iife) edits.push(...dedentEdits(ast, src, regionStart, regionEnd, edits));
    const body = applyEdits(src, edits, regionStart, regionEnd);

    // A plain file's leading comment block stays at the very top, above the imports.
    let head = iife ? src.slice(0, iife.stmt.start) : "";
    let bodyText = body;
    if (!iife) {
        const firstStatement = ast.body[0];
        const leading = firstStatement ? src.slice(0, firstStatement.start) : "";
        if (/^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)+$/.test(leading)) {
            head = leading;
            bodyText = body.slice(leading.length);
        }
    }
    const tail = iife ? src.slice(iife.stmt.end).replace(/^;/, "") : "";

    // One import statement per module: the default first, then named bindings.
    const byModule = new Map();
    for (const [name, o] of imports) {
        const from = relTo(o.file);
        if (!byModule.has(from)) byModule.set(from, { defaultName: null, named: [] });
        if (o.kind === "default") byModule.get(from).defaultName = name;
        else byModule.get(from).named.push(name);
    }
    const importLines = [...byModule].sort(([a], [b]) => a.localeCompare(b)).map(([from, { defaultName, named }]) => {
        const parts = [];
        if (defaultName) parts.push(defaultName);
        if (named.length) parts.push(`{ ${named.sort().join(", ")} }`);
        return `import ${parts.join(", ")} from "${from}";`;
    });
    let out = head.trimEnd() + (head.trim() ? "\n" : "") + (importLines.length ? importLines.join("\n") + "\n\n" : "") +
        bodyText.replace(/^\s*\n/, "").trimEnd() + "\n" + (tail.trim() ? tail.trimEnd() + "\n" : "");
    outputs.set(file, out);
}

/* ---------- pass 3: export what other modules import, then write ---------- */
for (const [file, out] of outputs) {
    const { iife } = info.get(file);
    let text = out;
    if (!iife) {
        const ast = acorn.parse(text, { ecmaVersion: "latest", sourceType: "module", ranges: true });
        const starts = [];
        for (const stmt of ast.body) {
            if (declaredNames(stmt).some(n => importedNames.has(n) && owner.get(n)?.file === file && owner.get(n).declaration)) {
                starts.push(stmt.start);
            }
        }
        for (const at of starts.sort((a, b) => b - a)) text = text.slice(0, at) + "export " + text.slice(at);
    }
    fs.writeFileSync(file, text);
}

console.log(report.join("\n") || "no issues");

function rel(f) { return path.relative(SRC, f).replace(/\\/g, "/"); }

function applyEdits(src, edits, start, end) {
    const sorted = edits.filter(e => e.start >= start && e.end <= end).sort((a, b) => b.start - a.start);
    // drop edits nested inside other edits (outer wins)
    const kept = [];
    for (const e of sorted) if (!kept.some(k => e.start >= k.start && e.end <= k.end && k !== e)) kept.push(e);
    let s = src.slice(start, end);
    for (const e of kept.sort((a, b) => b.start - a.start)) s = s.slice(0, e.start - start) + e.text + s.slice(e.end - start);
    return s;
}

/*
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
    const indentOf = i => src.slice(i, i + 200).match(/^[ \t]*/)[0].length;
    const insideTemplate = i => templates.some(([s, e]) => i > s && i < e);
    const blank = i => /^[ \t]*(\r?\n|$)/.test(src.slice(i, i + 200));
    const candidates = lineStarts.filter(i => !insideTemplate(i) && !blank(i));
    const strip = Math.min(...candidates.map(indentOf));
    if (!strip || !Number.isFinite(strip)) return [];
    const result = [];
    for (const i of lineStarts) {
        if (insideTemplate(i)) continue;
        if (otherEdits.some(e => i > e.start && i < e.end)) continue;
        const n = Math.min(strip, indentOf(i));
        if (n) result.push({ start: i, end: i + n, text: "" });
    }
    // re-indent multi-line replacement texts the same way
    for (const e of otherEdits) {
        if (e.text.includes("\n")) {
            e.text = e.text.split("\n").map((l, k) => (k && l.startsWith(" ".repeat(strip)) ? l.slice(strip) : l)).join("\n");
        }
    }
    return result;
}
