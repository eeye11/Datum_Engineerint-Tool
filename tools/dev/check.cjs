const fs = require("fs");
const s = fs.readFileSync("js/core/geometry/drawing-bounds.js", "utf8");
const needles = [
  'case "analysis-diagram"',
  'case "pin-support"',
  'case "pin-connection"',
  'case "resultant"',
  'case "cable"',
  "function drawnBodyHalfDepth",
];
for (const t of needles) console.log(t, s.includes(t));
