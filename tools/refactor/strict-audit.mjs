// Reports constructs whose meaning changes when a sloppy script becomes a strict ES module.
import fs from "fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import * as eslintScope from "eslint-scope";
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const issues = [];
  try { acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" }); }
  catch (e) { issues.push("module-parse: " + e.message); }
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", locations: true, ranges: true });
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
  for (const ref of sm.globalScope.through) if (ref.isWrite()) issues.push(`implicit-global-write ${ref.identifier.name}@${ref.identifier.loc.start.line}`);
  walk.ancestor(ast, {
    FunctionDeclaration(node, anc) {
      const parent = anc[anc.length - 2];
      if (parent && !["Program", "BlockStatement"].includes(parent.type)) issues.push(`fn-decl-in-${parent.type} ${node.id.name}@${node.loc.start.line}`);
      if (parent && parent.type === "BlockStatement") {
        const gp = anc[anc.length - 3];
        if (gp && !/Function/.test(gp.type)) issues.push(`block-fn-decl ${node.id.name}@${node.loc.start.line} (in ${gp.type})`);
      }
    },
    ThisExpression(node, anc) {
      const fns = anc.filter(a => /Function/.test(a.type) && a.type !== "ArrowFunctionExpression");
      const fn = fns[fns.length - 1];
      if (!fn) { issues.push(`top-level-this@${node.loc.start.line}`); return; }
      const parent = anc[anc.indexOf(fn) - 1];
      const isMethod = parent && (parent.type === "Property" || parent.type === "MethodDefinition");
      if (!isMethod && fn.type === "FunctionDeclaration") issues.push(`this-in-function ${fn.id.name}@${node.loc.start.line}`);
    },
    Identifier(node) { if (node.name === "arguments") issues.push(`arguments@${node.loc.start.line}`); },
    WithStatement(node) { issues.push(`with@${node.loc.start.line}`); },
  });
  if (issues.length) console.log(file + "\n  " + [...new Set(issues)].join("\n  "));
}
