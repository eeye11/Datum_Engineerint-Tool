/*
 * Reports the moment-value entry in the annotation KINDS table.
 *
 * It was written with a nonsense ternary, `generated: false === true
 * ? null : {...}`, which is not a mistake of intent but of typing -
 * and it produces a table entry that is not the table entry the rest
 * of the module expects. Worth seeing exactly what is there.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/annotation-model.js",
  "utf8",
);

const at = source.indexOf("moment-value");

console.log(
  at === -1 ? "(absent)" : JSON.stringify(source.slice(at - 40, at + 260)),
);
