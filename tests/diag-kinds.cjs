global.window = { crypto: { randomUUID: () => "k" } };
require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/measurement-core.js");
require("../js/engineering-drawing/feature-geometry.js");
require("../js/engineering-drawing/annotation-model.js");
require("../js/engineering-drawing/drawing-state.js");

const F = global.window.enggDrawingState.geometryFactories;
const A = global.window.enggAnnotationModel;

const scene = (o) => ({ scale: { mmPerUnit: 1, unit: "mm" }, objects: [o] });

const force = F.force({ x: 0, y: 0 }, { x: 0, y: -30 });
force.geometry.magnitude = 250;
force.geometry.angle = -90;
force.geometry.unit = "N";
console.log("force kinds:", JSON.stringify(A.kindsFor(force, scene(force))));

const moment = F.moment({ x: 0, y: 0 }, 500, false);
console.log("moment kinds:", JSON.stringify(A.kindsFor(moment, scene(moment))));

const load = F.load({ x: 0, y: 0 }, { x: 100, y: 0 }, 5);
console.log("load kinds:", JSON.stringify(A.kindsFor(load, scene(load))));

const line = F.line({ x: 0, y: 0 }, { x: 100, y: 0 });
console.log("line kinds:", JSON.stringify(A.kindsFor(line, scene(line))));

const bare = F.force({ x: 0, y: 0 }, { x: 0, y: -30 });
console.log("force with NO magnitude:", JSON.stringify(A.kindsFor(bare, scene(bare))));

console.log("nothing selected:", JSON.stringify(A.kindsFor(null, scene(null))));
