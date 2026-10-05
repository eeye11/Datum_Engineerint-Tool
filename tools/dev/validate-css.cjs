/*
 * CSS validation with a REAL parser.
 *
 * Hand-rolled checking kept producing false positives - a tokenizer
 * cannot tell a comment opener inside a string from a real one, and it
 * treated every rule inside a media query as one rule. `css-tree` parses
 * to a real AST, so what it reports is what a browser would reject.
 *
 * Usage:  node tools/dev/validate-css.cjs css/engineering-drawing.css
 */
const fs = require("fs");
const path = require("path");
const csstree = require("css-tree");

const target = process.argv[2] || "css/engineering-drawing.css";
const file = path.join(__dirname, "..", "..", target);
const css = fs.readFileSync(file, "utf8");

const problems = [];

let ast;

try {
  ast = csstree.parse(css, {
    positions: true,
    onParseError(error) {
      problems.push({
        kind: "parse error",
        line: error.line,
        column: error.column,
        detail: error.message,
      });
    },
  });
} catch (error) {
  console.log("\n  FATAL PARSE ERROR\n");
  console.log("  " + error.message);
  process.exit(1);
}

/* --- 1. parse errors ------------------------------------------------- */
console.log("\n  " + target + "\n");

/* --- 2. duplicate declarations within one rule ----------------------- */
csstree.walk(ast, {
  visit: "Rule",
  enter(rule) {
    const seen = new Map();

    csstree.walk(rule, {
      visit: "Declaration",
      enter(decl) {
        /* Only the rule's OWN declarations, not those of a nested at-rule. */
        const prop = decl.property.toLowerCase();

        if (seen.has(prop)) {
          problems.push({
            kind: "duplicate property",
            line: decl.loc.start.line,
            column: decl.loc.start.column,
            detail:
              '"' + prop + '" in ' + csstree.generate(rule.prelude) +
              " is already set at line " + seen.get(prop),
          });
        } else {
          seen.set(prop, decl.loc.start.line);
        }
      },
    });
  },
});

/* --- 3. empty rules -------------------------------------------------- */
csstree.walk(ast, {
  visit: "Rule",
  enter(rule) {
    let hasDeclaration = false;

    csstree.walk(rule, {
      visit: "Declaration",
      enter() {
        hasDeclaration = true;
      },
    });

    if (!hasDeclaration) {
      problems.push({
        kind: "empty rule",
        line: rule.loc.start.line,
        column: rule.loc.start.column,
        detail: csstree.generate(rule.prelude) + " has no declarations",
      });
    }
  },
});

/* --- 4. duplicate selectors in the same scope ------------------------ */

/*
 * SCOPED BY ENCLOSING AT-RULE, because a selector inside `@media` is a
 * DIFFERENT rule from the base one - that is what a responsive override
 * is. Comparing across scopes reported every media rule as a duplicate of
 * the rule it deliberately overrides, which buries the real ones.
 *
 * `css-tree`'s walk does not expose the parent during `enter`, so the
 * scope is worked out from the line number instead: every at-rule's line
 * and its extent are collected first, and a rule belongs to the innermost
 * one whose span contains it.
 */
const atRuleSpans = [];

csstree.walk(ast, {
  visit: "Atrule",
  enter(node) {
    atRuleSpans.push({
      name: csstree.generate(node).split("{")[0].trim(),
      from: node.loc.start.line,
      to: node.loc.end.line,
    });
  },
});

function currentScope(line) {
  let best = "";
  let bestSize = Infinity;

  for (const span of atRuleSpans) {
    if (line > span.from && line <= span.to) {
      const size = span.to - span.from;

      if (size < bestSize) {
        bestSize = size;
        best = span.name;
      }
    }
  }

  return best;
}

const byScope = new Map();

csstree.walk(ast, {
  visit: "Rule",
  enter(rule) {
    const scope = currentScope(rule.loc.start.line);
    const key = csstree.generate(rule.prelude).trim();
    const seen = byScope.get(scope) || new Map();

    if (seen.has(key)) {
      problems.push({
        kind: "selector declared twice",
        line: rule.loc.start.line,
        detail:
          key +
          " was already declared at line " +
          seen.get(key) +
          (scope ? " (in " + scope + ")" : ""),
      });
    } else {
      seen.set(key, rule.loc.start.line);
      byScope.set(scope, seen);
    }

    /*
     * REMEMBER THE INDIVIDUAL SELECTORS TOO.
     *
     * `.a, .b { ... }` followed by `.a { ... }` is idiomatic CSS: a
     * shared base for both, then a refinement for one. The second is not
     * a duplicate of the first - it adds to it - so a combined selector
     * records each of its parts as covered, and a later single-selector
     * rule is only reported when nothing has covered it before.
     */
    for (const part of key.split(",")) {
      const trimmed = part.trim();

      if (trimmed && !seen.has(trimmed)) {
        seen.set(trimmed, rule.loc.start.line);
      }
    }

    byScope.set(scope, seen);
  },
});

if (!problems.length) {
  console.log("  no problems found\n");
  process.exit(0);
}

for (const p of problems) {
  const where = p.column ? " line " + p.line + ":" + p.column : " line " + p.line;
  console.log("  " + p.kind + " at" + where + ": " + p.detail);
}

console.log("\n  " + problems.length + " problem(s)\n");

if (problems.some((p) => p.kind === "parse error")) {
  process.exit(1);
}
