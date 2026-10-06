import { readFileSync } from "node:fs";

const s = readFileSync("js/features/dimensions/dimension-model.js", "utf8");
const i = s.indexOf("function formatMeasurement");
console.log(s.slice(i, i + 2400));
