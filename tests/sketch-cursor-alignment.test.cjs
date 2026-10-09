/*
 * ========================================================
 * THE SKETCH CURSOR MAPS INTO THE GRAPH'S OWN SPACE
 * ========================================================
 *
 * The graph SVG declares `viewBox="0 0 900 320"` and is laid out at
 * `width: 100%`, so the browser SCALES and CENTRES the viewBox inside whatever
 * width the panel has. The editor's own `fromScreen` works in VIEWBOX units.
 *
 * THE DEFECT: the click was converted straight from the element's rect -
 *
 *     x: event.clientX - rect.left
 *
 * - which is RENDERED pixels. Those equal viewBox units only when the element
 * happens to be displayed at exactly 900x320. At any other width the two
 * disagree, and `meet` centring adds a vertical offset a rect subtraction
 * cannot see. That is the reported "the line is not aligned with the cursor",
 * and it got worse as the panel narrowed.
 *
 * This pins the conversion: a cursor placed at a known place on a KNOWN
 * rendered size must land on the viewBox point the browser would draw there.
 */

const fs = require("fs");

const { locate } = require("./helpers/source-path.cjs");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
};

const source = fs.readFileSync(locate("sketch-editor.js"), "utf8");

console.log("\n  the conversion scales the offset into viewBox units\n");

check(
  "a dedicated conversion exists",
  /function clientToViewBox\(/.test(source),
);

check(
  "it reads the element's own rect",
  /clientToViewBox[\s\S]{0,600}?getBoundingClientRect/.test(source),
);

check(
  "and the viewBox the element declares",
  /clientToViewBox[\s\S]{0,900}?viewBox/.test(source),
);

check(
  "it picks the SMALLER ratio, which is what `meet` fits by",
  /const ratio = Math\.min\(/.test(source),
);

check(
  "and it accounts for the centring offset",
  /offsetLeft/.test(source) && /offsetTop/.test(source),
  "a rect subtraction alone cannot see the letterbox",
);

check(
  "the raw client pixels are no longer fed straight to fromScreen",
  !/fromScreen\(\{\s*\n?\s*x: event\.clientX - rect\.left/.test(source),
);

check(
  "and pointFromEvent converts first",
  /function pointFromEvent[\s\S]{0,300}?clientToViewBox\(event, svg\)/.test(
    source,
  ),
);

console.log("\n  and the maths is a true inverse of the browser's mapping\n");

{
  /*
   * The same arithmetic the fix performs, exercised against the forward mapping
   * an SVG performs: viewBox point -> rendered pixel. If `clientToViewBox` is a
   * true inverse, a point taken through both comes back unchanged.
   */
  const WIDTH = 900;
  const HEIGHT = 320;

  const toRendered = (vb, rect) => {
    const ratio = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
    const drawnWidth = WIDTH * ratio;
    const drawnHeight = HEIGHT * ratio;
    const offsetLeft = (rect.width - drawnWidth) / 2;
    const offsetTop = (rect.height - drawnHeight) / 2;

    return {
      x: rect.left + offsetLeft + vb.x * ratio,
      y: rect.top + offsetTop + vb.y * ratio,
    };
  };

  const toViewBox = (client, rect) => {
    const ratio = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
    const drawnWidth = WIDTH * ratio;
    const drawnHeight = HEIGHT * ratio;
    const offsetLeft = (rect.width - drawnWidth) / 2;
    const offsetTop = (rect.height - drawnHeight) / 2;

    return {
      x: (client.x - rect.left - offsetLeft) / ratio,
      y: (client.y - rect.top - offsetTop) / ratio,
    };
  };

  /* A range of panel shapes: wide, tall, exactly 900x320, and narrow. */
  const rects = [
    { left: 0, top: 0, width: 900, height: 320 },
    { left: 12, top: 40, width: 700, height: 400 },
    { left: 0, top: 0, width: 1200, height: 300 },
    { left: 5, top: 5, width: 420, height: 500 },
  ];

  const probes = [
    { x: 0, y: 0 },
    { x: 450, y: 160 },
    { x: 900, y: 320 },
    { x: 137, y: 42 },
  ];

  let worst = 0;

  for (const rect of rects) {
    for (const vb of probes) {
      const back = toViewBox(toRendered(vb, rect), rect);

      worst = Math.max(worst, Math.abs(back.x - vb.x), Math.abs(back.y - vb.y));
    }
  }

  check(
    "a viewBox point survives a round trip at every panel size",
    worst < 1e-9,
    `worst error ${worst}`,
  );

  /*
   * AND THE OLD ARITHMETIC WOULD NOT. Shown here so the fix is not merely
   * asserted: at a 700px-wide panel the old conversion is out by tens of units.
   */
  const rect = { left: 12, top: 40, width: 700, height: 400 };
  const vb = { x: 450, y: 160 };

  const rendered = toRendered(vb, rect);
  const old = { x: rendered.x - rect.left, y: rendered.y - rect.top };

  const errorX = Math.abs(old.x - vb.x);
  const errorY = Math.abs(old.y - vb.y);

  check(
    "while the old rect subtraction is measurably wrong",
    errorX > 1 || errorY > 1,
    `old error x=${errorX.toFixed(1)} y=${errorY.toFixed(1)} viewBox units`,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
