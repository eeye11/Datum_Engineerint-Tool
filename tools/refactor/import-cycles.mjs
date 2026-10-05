// Lists import cycles in src/ (strongly connected components of the import graph).
//   node tools/refactor/import-cycles.mjs [src]
import fs from "fs";
import path from "path";

const root = path.resolve(process.argv[2] || "src");
const files = [];
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith(".js")) files.push(full);
    }
})(root);

const importPattern = /^import\s+[^;]*?from\s+"([^"]+)";?/gm;
const graph = new Map(files.map(file => [
    file,
    [...fs.readFileSync(file, "utf8").matchAll(importPattern)].map(m => path.resolve(path.dirname(file), m[1]))
]));

// Tarjan's strongly connected components.
let counter = 0;
const index = new Map();
const low = new Map();
const stack = [];
const onStack = new Set();
const cycles = [];
function connect(v) {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) || []) {
        if (!index.has(w)) {
            connect(w);
            low.set(v, Math.min(low.get(v), low.get(w)));
        } else if (onStack.has(w)) {
            low.set(v, Math.min(low.get(v), index.get(w)));
        }
    }
    if (low.get(v) === index.get(v)) {
        const component = [];
        let w;
        do {
            w = stack.pop();
            onStack.delete(w);
            component.push(w);
        } while (w !== v);
        if (component.length > 1) cycles.push(component);
    }
}
for (const file of files) if (!index.has(file)) connect(file);

const rel = file => path.relative(root, file).split(path.sep).join("/");
console.log(cycles.length
    ? cycles.map(c => "cycle: " + c.map(rel).join(" <-> ")).join("\n")
    : "no import cycles");
process.exitCode = cycles.length ? 1 : 0;
