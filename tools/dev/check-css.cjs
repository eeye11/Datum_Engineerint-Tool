/*
 * A small CSS checker, for the problems a browser silently tolerates.
 *
 * CSS is forgiving: a duplicate property, an unbalanced brace or a
 * declaration outside a rule is simply dropped and the stylesheet still
 * loads. Nothing reports them, which is why they are worth finding
 * mechanically.
 *
 * Reports:
 *   1. a property declared twice in the SAME rule (the first is dead)
 *   2. unbalanced braces
 *   3. a declaration that sits outside any rule
 *   4. an empty rule
 *
 * A NOTE ON AT-RULES. `@media` is a CONTAINER: it holds rules, not
 * declarations. Treating everything between its braces as one rule made
 * every property inside look duplicated against its siblings - a
 * `font-size` on two different selectors in one media block read as one
 * property set twice. The stack below keeps containers and rules apart,
 * so a media block reports only what is genuinely wrong inside it.
 *
 * Usage:  node tools/dev/check-css.cjs css/engineering-drawing.css
 */
const fs = require("fs");
const path = require("path");

const target = process.argv[2] || "css/engineering-drawing.css";
const file = path.join(__dirname, "..", "..", target);

const raw = fs.readFileSync(file, "utf8");

/* Blank comments in place so line numbers stay true. */
const text = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const lines = text.split("\n");

const problems = [];

/*
 * The open blocks, innermost last. A block is either a CONTAINER
 * (an at-rule) or a RULE (a selector). Declarations belong to the
 * nearest enclosing RULE.
 */
const stack = [];

/* selector -> first line, per enclosing container scope. */
const selectorScopes = new Map();

let pendingSelector = "";
let pendingSelectorAt = 0;

function currentRule() {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].kind === "rule") return stack[i];
  }
  return null;
}

function closeBlock(block) {
  if (block.kind === "rule") {
    if (block.props.length === 0) {
      problems.push({
        kind: "empty rule",
        line: block.at,
        detail: block.selector + " has no declarations",
      });
    }

    const seen = new Map();

    for (const p of block.props) {
      if (seen.has(p.prop)) {
        problems.push({
          kind: "duplicate property",
          line: p.line,
          detail:
            '"' + p.prop + '" in ' + block.selector +
            " is already set at line " + seen.get(p.prop),
        });
      } else {
        seen.set(p.prop, p.line);
      }
    }

    /*
     * A SELECTOR DECLARED TWICE IN THE SAME SCOPE.
     *
     * Not always a defect - a second block is a legitimate way to add
     * an override - but it is how a stale copy of a rule survives: the
     * later one silently wins, and the earlier one reads as live code
     * that is doing nothing. Reported so it can be judged.
     *
     * Scoped to the ENCLOSING CONTAINER, so the same selector inside a
     * media query is not confused with its base definition.
     */
    const scope = scopeKey();
    const scopeSeen = selectorScopes.get(scope) || new Map();

    if (scopeSeen.has(block.selector)) {
      problems.push({
        kind: "selector declared twice",
        line: block.at,
        detail:
          block.selector + " was already declared at line " +
          scopeSeen.get(block.selector) +
          (scope ? " (in " + scope + ")" : ""),
      });
    } else {
      scopeSeen.set(block.selector, block.at);
      selectorScopes.set(scope, scopeSeen);
    }
  }

  stack.pop();
}

/* The name of the container a rule sits in, for scoping "declared twice". */
function scopeKey() {
  const containers = stack.filter((b) => b.kind === "container");

  return containers.length ? containers[containers.length - 1].selector : "";
}

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const lineNo = i + 1;
  const trimmed = line.trim();

  /* --- text before '{' is selector material --------------------------- */
  const openIndex = line.indexOf("{");
  const beforeBrace = openIndex === -1 ? line : line.slice(0, openIndex);

  if (beforeBrace.trim()) {
    if (!pendingSelector) pendingSelectorAt = lineNo;
    const part = beforeBrace.trim();
    pendingSelector = pendingSelector ? pendingSelector + " " + part : part;
  }

  /* --- a declaration belongs to the nearest RULE ---------------------- */
  if (openIndex === -1 && trimmed !== "}" && !trimmed.startsWith("@")) {
    const decl = line.match(/^\s*([a-zA-Z-]+)\s*:/);

    if (decl) {
      const rule = currentRule();

      if (rule) {
        rule.props.push({ prop: decl[1], line: lineNo });
      } else {
        problems.push({
          kind: "declaration outside a rule",
          line: lineNo,
          detail: trimmed,
        });
      }
    }
  }

  /* --- open ----------------------------------------------------------- */
  if (openIndex !== -1) {
    const sel = pendingSelector.replace(/\s+/g, " ").trim();

    /*
     * A conditional at-rule is a container; `@font-face` and friends are
     * rules. They are told apart by name, because the difference is
     * whether the block declares properties.
     */
    const isContainer = /^@(media|supports|layer|container|keyframes)\b/.test(sel);

    if (isContainer) {
      stack.push({ kind: "container", selector: sel, at: pendingSelectorAt, props: [] });
    } else {
      stack.push({
        kind: "rule",
        selector: sel || (stack.length ? "(nested)" : "(root)"),
        at: pendingSelectorAt || lineNo,
        props: [],
      });
    }

    pendingSelector = "";
    pendingSelectorAt = 0;
  }

  /* --- close ---------------------------------------------------------- */
  let closeIndex = line.indexOf("}");

  while (closeIndex !== -1) {
    if (stack.length === 0) {
      problems.push({ kind: "unbalanced brace", line: lineNo, detail: "extra '}'" });
    } else {
      closeBlock(stack[stack.length - 1]);
    }

    closeIndex = line.indexOf("}", closeIndex + 1);
  }
}

if (stack.length) {
  for (const block of stack) {
    problems.push({
      kind: "unbalanced brace",
      line: block.at,
      detail: block.selector + " is never closed",
    });
  }
}

console.log("\n  " + target + "\n");

if (!problems.length) {
  console.log("  no problems found\n");
  process.exit(0);
}

for (const p of problems) {
  console.log("  " + p.kind + " at line " + p.line + ": " + p.detail);
}

console.log("\n  " + problems.length + " problem(s)\n");
process.exit(1);
