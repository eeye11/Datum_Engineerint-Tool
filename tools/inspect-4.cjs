/*
 * Reports the exact bytes of the describesSameAs function, which three
 * patches have now failed to match. Written to find the difference
 * rather than to guess at it again.
 */
const fs = require("fs");

const source = fs.readFileSync(
  "js/engineering-drawing/dimension-model.js",
  "utf8",
);

const at = source.indexOf("function describesSameAs");

console.log(JSON.stringify(source.slice(at, at + 700)));
