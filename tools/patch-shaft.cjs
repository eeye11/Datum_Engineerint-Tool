/*
 * A shaft could not be dimensioned by its own diameter.
 *
 * The measurement layer registered shafts as a plain span, so the only
 * measurements it offered were the ones between a span's two ends -
 * a length, and its horizontal and vertical components. Its diameter
 * was never a candidate, so Smart Dimension's preference for it was
 * rejected by the availability check and the shaft silently came out
 * with a length and no diameter.
 *
 * The fix belongs HERE rather than in Smart Dimension, because this is
 * a statement about what a shaft IS: it has a stored diameter, that
 * diameter is the feature's real exterior measurement, and no tool
 * should have to rediscover that. Registering it once means every
 * consumer - Smart Dimension, the ordinary Dimension tool, anything
 * added later - gets it.
 *
 * The diameter is offered AFTER the span, because a shaft's length is
 * what a reader usually checks and its diameter is a second fact about
 * the same feature. And the length is not repeated: the shaft is
 * dimensioned by its span and by its diameter, not by its span and a
 * horizontal projection of its span.
 */
const fs = require("fs");

const path = "js/engineering-drawing/measurement-core.js";
let source = fs.readFileSync(path, "utf8");

let changed = 0;

function swap(before, after, label) {
  if (!source.includes(before)) {
    console.log(`${label}: pattern not found`);
    return;
  }

  source = source.replace(before, after);
  changed += 1;
}

/*
 * Shafts get their own registration, separate from the plain spans,
 * because a shaft is not only a line between two points.
 */
swap(
  `    ["line", "beam", "cable", "shaft", "force"].forEach(
      (type) => {
        register(type, {
          dimensions: (object) => {
            const span = twoPointSpan(object);

            return span
              ? spanDimensionTypes(span)
              : ["linear"];
          },`,
  `    /*
     * Shafts are registered apart from the plain spans.
     *
     * A shaft stores a DIAMETER as one of its own values, and that
     * diameter is the feature's real exterior measurement - not a
     * distance between two points on its centreline, which would state
     * half the true number. Registering shafts as ordinary spans meant
     * that measurement was never offered, and every consumer had to
     * know about the shaft's diameter for itself or would quietly
     * leave it out.
     */
    register("shaft", {
      dimensions: (object) => {
        const span = twoPointSpan(object);
        const geometry = object.geometry || {};

        const candidates = span
          ? spanDimensionTypes(span)
          : ["linear"];

        /*
         * Only where the shaft really stores a diameter. Offering it
         * unconditionally would put a measurement in front of the
         * student for a feature that has none to answer it with.
         */
        const hasDiameter = Number.isFinite(
          Number(geometry.diameter)
        );

        return hasDiameter
          ? [...candidates, "diameter"]
          : candidates;
      },
      anchorNames: () => ["start", "end"],
      anchors: (object) => {
        const span = twoPointSpan(object);

        return span
          ? { start: span.start, end: span.end }
          : null;
      },
    });

    ["line", "beam", "cable", "force"].forEach(
      (type) => {
        register(type, {
          dimensions: (object) => {
            const span = twoPointSpan(object);

            return span
              ? spanDimensionTypes(span)
              : ["linear"];
          },`,
  "shaft registration",
);

fs.writeFileSync(path, source);
console.log(`applied ${changed} of 1 correction`);
