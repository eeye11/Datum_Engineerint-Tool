/*
 * IS THE VECTOR SCALE LISTED IN A REASONABLE ORDER?
 *
 * A control read top to bottom should read small to large, the way every
 * other quantity on a sheet does. The list used to run 1, 0.1, 0.01,
 * 0.001, 10, 100, 1000 - shrinking then growing - which is the order a
 * user reaches for the values in but makes the list impossible to scan
 * and impossible to tell at a glance which side of 1 an entry is on.
 *
 * The check is on the ORDER, and separately on the things that must not
 * change while reordering: the default is still 1, every value is still
 * present exactly once, and the list still spans the same range.
 */
global.window = {};

require("../js/engineering-drawing/load-profile.js");

const profile = global.window.enggLoadProfile;

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`
    );
  }
};

const options = profile.VECTOR_SCALE_OPTIONS;

console.log("\n  the Vector Scale is listed small to large\n");

/* THE CENTRAL CLAIM: the values ascend. */
const values = options.map(option => option.value);

const ascending = values.every(
  (value, index) =>
        index === 0 || value > values[index - 1]
);

check(
  "the options are in increasing numerical order",
  ascending,
  `order: ${values.join(", ")}`
);

/*
 * ...WHICH THE LABELS MUST ALSO HONOUR. A list sorted by value and labelled
 * in another order would be worse than either: the eye reads the label,
 * not the number.
 */
const labelsAscend = options.every(
  (option, index) =>
        index === 0 ||
        Number(option.label.replace("×", "")) >
            Number(
                options[index - 1].label.replace("×", "")
            )
);

check(
  "and the LABELS are in increasing order too, as read",
  labelsAscend,
  `labels: ${options.map(o => o.label).join(", ")}`
);

/*
 * THE DEFAULT IS UNCHANGED. Reordering a list is a change of
 * presentation, and the sheet every document opens on must look the same
 * it did.
 *
 * Read through the VALUE rather than a constant: `DEFAULT_VECTOR_SCALE`
 * is a module constant that is not published on the registry, and an
 * earlier version of this asserted it was, failed, and looked like the
 * default had been lost when nothing had been reordered at all. What the
 * panel actually does is treat an unset value as 1, and that is the
 * thing worth pinning.
 */
check(
  "an unset sheet still reads as 1x",
  profile.vectorScaleFor({}) === 1,
  `got ${profile.vectorScaleFor({})}`
);

check(
  "a sheet with no statics block still reads as 1x",
  profile.vectorScaleFor({ statics: {} }) === 1,
  `got ${profile.vectorScaleFor({ statics: {} })}`
);

/*
 * EVERY VALUE IS STILL PRESENT, ONCE. A sort that dropped or duplicated
 * an entry would leave a student unable to choose a scale they had used
 * before, with nothing to say so.
 */
check(
  "no value is duplicated",
  new Set(values).size === values.length,
  `values: ${values.join(", ")}`
);

check(
  "no value is missing",
  values.length === 7 &&
    [0.001, 0.01, 0.1, 1, 10, 100, 1000].every(v =>
      values.includes(v)
    ),
  `values: ${values.join(", ")}`
);

/*
 * THE RANGE IS UNCHANGED, which is what makes the list still able to
 * serve a 5 N reaction beside a 50 kN load.
 */
check(
  "the range still spans a thousandth to a thousand",
  values[0] === 0.001 &&
    values[values.length - 1] === 1000,
  `range ${values[0]} to ${values[values.length - 1]}`
);

/*
 * 1 IS STILL IN THE LIST, and is the middle of it. A student who wants the
 * true length - which is where every sheet starts - should find it
 * without scrolling past everything smaller or larger.
 */
const middle = values[Math.floor(values.length / 2)];

check(
  "1 sits in the middle, where the eye expects it",
  middle === 1,
  `middle is ${middle}`
);

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}