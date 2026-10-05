
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const { locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ========================================================
 * IS EVERY FEATURE CLASSIFIED ONCE, AND IN ONE PLACE?
 * ========================================================
 *
 * The AFD/SFD/BMD diagrams were filed under GEOMETRY in the Feature Tree.
 *
 * That was not a mislabelled heading. `componentGroups` read
 * `engineering.discipline`, and the diagram factory was the one statics
 * factory that never set it - so the diagrams had no statics identity at
 * all and every reader of that field answered "geometry". Any fix that
 * only relabelled the heading would have left the model disagreeing with
 * it, and the next new statics feature would have been filed the same way.
 *
 * So these check the MODEL, not the markup: every feature's group comes
 * from one function, every statics feature is a statics feature, and a
 * diagram is grouped as a reading rather than as a mark on the sheet.
 *
 * The functions are lifted from the real source. A copy here would keep
 * passing after the real classifier regressed, which is the failure this
 * whole file exists to prevent.
 */


const projectRoot = path.join(__dirname, "..");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`,
    );
  }
};

const drawingSource = fs.readFileSync(
  locate("drawing.js"),
  "utf8",
);

/* Read from the module rather than restated here. */
const COORDINATE_SYSTEM_TYPE =
  /const COORDINATE_SYSTEM_TYPE = "([^"]+)"/.exec(
    drawingSource,
  )?.[1];

/* The classifier, as it is. */
const classifierStart = drawingSource.indexOf(
  "function staticsCategory",
);

const classifierEnd = drawingSource.indexOf(
  "function componentGroups()",
);

check(
  "there is one authoritative classifier in drawing.js",
  classifierStart > 0 && classifierEnd > classifierStart,
);

const classifier = drawingSource.slice(
  classifierStart,
  classifierEnd,
);

/*
 * One complete top-level function, found by its braces.
 *
 * Comments and strings are skipped so a brace inside either is not counted
 * - the drawing module's comments discuss braces as punctuation often
 * enough for a naive counter to lose its place.
 */
function functionAt(source, start) {
  const open = source.indexOf("{", start);

  let depth = 0;
  let index = open;

  while (index < source.length) {
    const char = source[index];

    if (char === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index) + 2;
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index);
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      index += 1;

      while (
        index < source.length &&
        source[index] !== char
      ) {
        index +=
          source[index] === "\\" ? 2 : 1;
      }

      index += 1;
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }

    index += 1;
  }

  throw new Error(
    "unbalanced braces from offset " + start,
  );
}

const sandbox = { console };

vm.runInNewContext(
  `${classifier}
   globalThis.__category = staticsCategory;`,
  sandbox,
);

const staticsCategory = sandbox.__category;

console.log("\n  a statics feature is a statics feature\n");

const statics = (extra, type) => ({
  type: type || "force",
  engineering: {
    discipline: "statics",
    ...(extra || {}),
  },
});

check(
  "a point force is Statics",
  staticsCategory(statics()) === "Statics",
  `got: ${staticsCategory(statics())}`,
);

check(
  "a support is Statics",
  staticsCategory(statics(null, "pin-support")) === "Statics",
);

check(
  "a couple is Statics",
  staticsCategory(statics(null, "couple")) === "Statics",
);

check(
  "a diagram is a Statics feature, not a separate category",
  staticsCategory(
    statics({ analysisKind: "analysis-diagram" }, "analysis-diagram"),
  ) === "Statics",
  `got: ${staticsCategory(
    statics({ analysisKind: "analysis-diagram" }, "analysis-diagram"),
  )}`,
);

check(
  "a force-components pair is Statics too",
  staticsCategory(
    statics(
      { analysisKind: "resultant" },
      "force-components",
    ),
  ) === "Statics",
);

check(
  "a resultant is Statics too",
  staticsCategory(
    statics(
      { analysisKind: "force-components" },
      "resultant",
    ),
  ) === "Statics",
);

check(
  "a diagram with no analysisKind is still recognised as Statics",
  staticsCategory(statics({}, "analysis-diagram")) === "Statics",
);

check(
  "there is no separate Analysis category to be assigned",
  !/"Analysis"/.test(drawingSource.slice(classifierStart, classifierEnd)),
  "the tree has one Statics group; the parent relationship does the rest",
);

console.log("\n  nothing else has been swept into it\n");

check(
  "a plain line is not statics at all",
  staticsCategory({ type: "line" }) === null,
);

check(
  "a beam with no statics discipline is not classified",
  staticsCategory({ type: "beam", engineering: {} }) === null,
);

check(
  "an undefined feature is not classified",
  staticsCategory(undefined) === null,
);

check(
  "a statics reference line is still a statics feature",
  staticsCategory(statics(null, "line")) === "Statics",
  "geometry and statics share the line implementation, so this must be decided by discipline",
);

console.log("\n  the tree and the panel read ONE answer\n");

/*
 * THE GROUPING ITSELF. componentGroups is pulled out with the drawing
 * state it reads, and asked where a whole sheet's worth of features land -
 * because the bug that started this was a mismatch between a feature's
 * type and its recorded discipline, and only a real sheet shows that.
 *
 * The body is taken verbatim and given the state it closes over, rather
 * than reshaped here: a rewrite would be a second implementation, which is
 * precisely what this file exists to rule out.
 */
function groupSheet(list) {
  const bodyStart = drawingSource.indexOf(
    "function componentGroups()",
  );

  /*
   * Only the grouping is wanted, and everything after it is the tree
   * markup that reaches for the page. The function is lifted by matching
   * its braces rather than by slicing to the next heading: its own body is
   * full of comments, and any guess about where the text "after" it starts
   * is a guess that will truncate a brace sooner or later.
   */
  const body = functionAt(
    drawingSource,
    bodyStart,
  );

  const source = `
    /*
     * The coordinate system's own type name, read from the module so this
     * harness is not carrying a second copy of it. It is the one other
     * constant componentGroups names, and hard-coding it here would make
     * the harness agree with a rename that had already broken the page.
     */
    const COORDINATE_SYSTEM_TYPE = ${JSON.stringify(
      COORDINATE_SYSTEM_TYPE,
    )};

    const drawingState = { objects: __objects };

    ${drawingSource.slice(classifierStart, classifierEnd)}

    ${body}

    __result = Object.fromEntries(
      [...componentGroups().entries()].map(
        ([k, v]) => [k, v.map(o => o.id)]
      )
    );
  `;

  const context = { console, __objects: list, __result: null };

  vm.runInNewContext(source, context);

  return context.__result;
}

const objects = [
  { id: "beam-1", type: "beam", geometry: {} },
  { id: "force-1", type: "force", geometry: {}, engineering: { discipline: "statics" } },
  { id: "support-1", type: "pin-support", geometry: {}, engineering: { discipline: "statics" }, parentId: "beam-1" },
  { id: "afd-1", type: "analysis-diagram", geometry: {}, engineering: { discipline: "statics", analysisKind: "analysis-diagram" } },
  { id: "sfd-1", type: "analysis-diagram", geometry: {}, engineering: { discipline: "statics", analysisKind: "analysis-diagram" }, parentId: "beam-1" },
  { id: "bmd-1", type: "analysis-diagram", geometry: {}, engineering: { discipline: "statics", analysisKind: "analysis-diagram" }, parentId: "beam-1" },
  { id: "line-1", type: "line", geometry: {} },
  { id: "construction-1", type: "construction", geometry: {} },
];

const grouped = groupSheet(objects);

console.log(
  `\n  ${JSON.stringify(grouped)}\n`,
);

check(
  "an unparented diagram lands under Statics",
  grouped.Statics?.includes("afd-1"),
  JSON.stringify(grouped),
);

check(
  "there is no Analysis group at all",
  !grouped.Analysis,
  JSON.stringify(grouped),
);

check(
  "the diagram is not in Geometry",
  !grouped.Geometry?.includes("afd-1"),
  JSON.stringify(grouped),
);

check(
  "a child diagram is nested under its body, not listed as a root",
  !Object.values(grouped).flat().includes("sfd-1"),
  "a child belongs under its parent",
);

check(
  "a child support is nested too",
  !Object.values(grouped).flat().includes("support-1"),
);

check(
  "geometry stays geometry",
  grouped.Geometry?.includes("line-1"),
);

check(
  "a construction line is still filed as Construction",
  grouped.Construction?.includes("construction-1"),
);

check(
  "an unattached force is a Statics root row",
  grouped.Statics?.includes("force-1"),
  JSON.stringify(grouped),
);

console.log(
  `\n  a force's components sit under the FORCE, not beside it\n`,
);

/*
 * WHERE A DECOMPOSITION BELONGS IN THE TREE.
 *
 * Force Components reads a force - that is recorded in
 * `engineering.sourceFeatureIds` - and it was being filed under the force's
 * BODY, because its `parentId` was copied from the force's. So the Feature
 * Tree showed a force and its decomposition as two siblings, and a student
 * looking for the components of a force had to scan the whole branch.
 *
 * The fix could NOT be to give the components the force as their `parentId`.
 * That field names the BODY a feature is drawn on everywhere else - the
 * renderer looks it up to find the member a preview belongs to, the panel
 * prints it as "Relative to" - so overloading it would have fixed the tree
 * and broken the attachment. These two checks are the pair that keeps both
 * true at once: the decomposition is filed under the force, and the force's
 * own attachment is untouched.
 */
const decompositionSheet = [
  {
    id: "beam-1",
    type: "beam",
    geometry: {},
    engineering: { discipline: "statics" },
  },
  {
    id: "force-1",
    type: "force",
    geometry: {},
    engineering: { discipline: "statics" },
    parentId: "beam-1",
  },
  {
    /*
     * Exactly as the creation path builds it: attached to the BODY, and
     * recording the force it reads.
     */
    id: "comp-1",
    type: "force-components",
    geometry: {},
    engineering: {
      discipline: "statics",
      analysisKind: "force-components",
      sourceFeatureIds: ["force-1"],
    },
    parentId: "beam-1",
  },
];

const decompositionGrouped = groupSheet(decompositionSheet);

check(
  "the components are not a loose root row",
  !Object.values(decompositionGrouped).flat().includes("comp-1"),
  JSON.stringify(decompositionGrouped),
);

check(
  "and the force is still filed under its body, not displaced",
  !Object.values(decompositionGrouped).flat().includes("force-1") &&
    decompositionGrouped.Statics?.includes("beam-1"),
  JSON.stringify(decompositionGrouped),
);

console.log(
  `\n  WITHOUT the discipline, a diagram is not Analysis\n`,
);

/*
 * THE REGRESSION ITSELF.
 *
 * The diagram factory used to omit `discipline`, so a diagram was a root
 * row with no statics identity and the tree answered Geometry. Removing
 * the fix - by dropping the field - must put it back there, which is what
 * proves these checks are reading the classification and not just the
 * type.
 */
const withoutDiscipline = objects.map(object =>
  object.id === "afd-1"
    ? {
        ...object,
        engineering: {
          analysisKind: "analysis-diagram",
        },
      }
    : object,
);

const groupedLegacy = groupSheet(withoutDiscipline);

check(
  "a diagram with no discipline falls back to Geometry - the old bug",
  groupedLegacy.Geometry?.includes("afd-1"),
  JSON.stringify(groupedLegacy),
);

check(
  "which is exactly why the factory has to set it",
  !groupedLegacy.Statics?.includes("afd-1"),
);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);

if (fail) {
  process.exitCode = 1;
}
