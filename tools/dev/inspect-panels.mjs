import { readFileSync } from "node:fs";

const s = readFileSync("js/app/drawing.js", "utf8");

const show = (label, needle, before = 200, after = 2400) => {
  const i = s.indexOf(needle);
  console.log(`\n===== ${label} @ ${i} =====`);
  console.log(s.slice(i - before, i + after));
};

show(
  "truss Length scalar",
  'scalar(\n                    "Length",\n                    "length",\n                    length,',
);
show("beam branch", 'object.type === "beam"');
show(
  "cable Length scalar",
  'scalar("Length", "length", length, "mm", true, true)',
);
