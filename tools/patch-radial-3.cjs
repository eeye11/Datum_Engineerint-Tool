/*
 * radialGraphics was resolving `measured` correctly but still reading
 * the radius from the original `object`, which is null whenever the
 * dimension referred to its feature by anchor rather than by
 * property - the circle case, which is most of them.
 *
 * Only the read inside radialGraphics is changed. measureRadius has
 * its own `object` and its own `featureRadius(object)` call, which is
 * correct there and must not be touched - so the replacement is
 * scoped to radialGraphics rather than applied document-wide, which is
 * what an earlier attempt got wrong.
 */
const fs = require("fs");

const path = "js/engineering-drawing/dimension-model.js";
let source = fs.readFileSync(path, "utf8");

const start = source.indexOf("function radialGraphics");
const end = source.indexOf("function angularGraphics", start);

if (start === -1 || end === -1) {
  console.log("radialGraphics not found");
  process.exit(1);
}

const body = source.slice(start, end);

if (!body.includes("featureRadius(object)")) {
  console.log("nothing to change inside radialGraphics");
  process.exit(1);
}

const patched = body.replace(
  "const radius = featureRadius(object);",
  "const radius = featureRadius(measured);",
);

source = source.slice(0, start) + patched + source.slice(end);

fs.writeFileSync(path, source);
console.log("radialGraphics reads its radius from the resolved feature");
