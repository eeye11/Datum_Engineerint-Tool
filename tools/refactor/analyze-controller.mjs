// Static analysis of a classic (global-scope) script: top-level declarations,
// cross references between them, and writes to top-level mutable bindings.
import fs from "fs";
import * as acorn from "acorn";
import * as eslintScope from "eslint-scope";

const file = process.argv[2];
const out = process.argv[3];
const src = fs.readFileSync(file, "utf8");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: process.env.SOURCE_TYPE || "script", locations: true, ranges: true });
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: process.env.SOURCE_TYPE || "script" });
const globalScope = sm.scopes.find(s => s.type === (process.env.SOURCE_TYPE === "module" ? "module" : "global"));


// Map each top-level statement to an index; every node maps to its top-level statement.
const top = ast.body.map((node, index) => {
  let names = [];
  if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") names = [node.id.name];
  else if (node.type === "VariableDeclaration") names = node.declarations.flatMap(d => d.id.type === "Identifier" ? [d.id.name] : []);
  return { index, type: node.type, kind: node.kind || null, names, start: node.start, end: node.end,
           line: node.loc.start.line, endLine: node.loc.end.line, refs: new Set(), writes: new Set(), externals: new Set() };
});
const stmtOf = pos => { let lo = 0, hi = top.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (top[m].end < pos) lo = m + 1; else if (top[m].start > pos) hi = m - 1; else return top[m]; } return null; };

const declaredAt = new Map(); // name -> list of statement indices
for (const t of top) for (const n of t.names) { if (!declaredAt.has(n)) declaredAt.set(n, []); declaredAt.get(n).push(t.index); }

for (const ref of globalScope.through) {
  const s = stmtOf(ref.identifier.start); if (!s) continue;
  s.externals.add(ref.identifier.name);
}
for (const v of globalScope.variables) {
  for (const ref of v.references) {
    const s = stmtOf(ref.identifier.start); if (!s) continue;
    s.refs.add(v.name);
    if (ref.isWrite() && !(v.defs[0] && v.defs[0].node && ref.init)) s.writes.add(v.name);
  }
}
// implicit globals (assigned without declaration) show up in through as writes
const result = top.map(t => ({ ...t, refs: [...t.refs].filter(n => !t.names.includes(n)), writes: [...t.writes], externals: [...t.externals] }));
const dupes = [...declaredAt].filter(([, l]) => l.length > 1);
fs.writeFileSync(out, JSON.stringify({ statements: result, duplicates: dupes }, null, 0));
const kinds = {}; for (const t of result) { const k = t.type + (t.kind ? ":" + t.kind : ""); kinds[k] = (kinds[k] || 0) + 1; }
console.log("statements", result.length, kinds);
console.log("duplicates", dupes.map(([n, l]) => n + "@" + l.map(i => result[i].line).join(",")).join("  "));
const ext = {}; for (const t of result) for (const e of t.externals) ext[e] = (ext[e] || 0) + 1;
console.log("externals", Object.entries(ext).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ":" + v).join(" "));
