const fs = require("fs");
const s = fs
  .readFileSync("js/core/geometry/body-frames.js", "utf8")
  .split("\r\n")
  .join("\n");
const i = s.indexOf("SUPPORT_APEX_SETBACK");
console.log(JSON.stringify(s.slice(i - 900, i + 400)));
