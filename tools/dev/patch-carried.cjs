/*
 * createGeometryObject dropped everything it was not told about.
 *
 * A dimension and an annotation carry their measurements, references
 * and text in a `content` block rather than in their geometry, and
 * the factory that mints every feature named its fields explicitly -
 * id, name, type, geometry, style, metadata, parentId, engineering.
 * Anything not on that list was silently discarded.
 *
 * So the features were created and the document numbered them
 * correctly - "Note 1" appeared in the list - but every one of them
 * arrived with no content at all: a dimension with no references to
 * measure and an annotation with no text. They looked like they
 * worked and had nothing in them.
 *
 * The fix is to carry any block the caller supplies. The named fields
 * keep their own handling, and anything else - content, and whatever a
 * future feature type brings with it - is passed through rather than
 * dropped. That is the general rule, not a special case for the two
 * types that needed it today: a feature model that can hold a block
 * the factory discards is a model that cannot be extended.
 */
const fs = require("fs");

const path = "js/";
let source = fs.readFileSync(path, "utf8");

const CRLF = source.includes("\r\n");

const eol = (text) => (CRLF ? text.replace(/\n/g, "\r\n") : text);

const before = eol(`        return {
            id: options.id || \`\${type}-\${generatedId}\`,
            name: options.name || typeLabel,
            type,
            geometry,
            style: createStyle(options.style),
            metadata: options.metadata || {},`);

const after = eol(`        return {
            id: options.id || \`\${type}-\${generatedId}\`,
            name: options.name || typeLabel,
            type,
            geometry,
            style: createStyle(options.style),
            metadata: options.metadata || {},

            /*
             * Anything the caller supplied that is not one of the
             * fields above.
             *
             * Named fields are handled explicitly, and a block like a
             * dimension's references or an annotation's text was
             * being dropped on the floor: the feature was created,
             * named and numbered correctly, and arrived empty. It
             * looked like it worked and had nothing in it.
             *
             * Passing the rest through is what makes the factory
             * general. A feature type that brings a block of its own
             * data does not have to be added here to be kept -
             * which is the same rule the measurement layer follows,
             * for the same reason.
             */
            ...carriedFields(options),`);

if (!source.includes(before)) {
  console.log("createGeometryObject return not found");
  process.exit(1);
}

source = source.replace(before, after);

/* The helper, placed just before the function that uses it. */
const helper = eol(`    /*
     * The fields of an options block that createGeometryObject does
     * not handle itself.
     *
     * Everything except the ones it owns - the identity, the name, the
     * type, the geometry, the style, the metadata and the parent -
     * is carried onto the feature as it is. A dimension's references
     * and an annotation's text live there, and a feature type added
     * later would bring its own.
     *
     * A shallow copy, so the feature does not end up sharing a
     * reference with the options it was created from: editing one
     * would silently edit the other.
     */
    function carriedFields(options) {
        const handled = new Set([
            "id",
            "name",
            "type",
            "geometry",
            "style",
            "metadata",
            "parentId",
            "engineering"
        ]);

        const carried = {};

        Object.keys(options || {}).forEach((key) => {
            if (!handled.has(key)) {
                carried[key] = options[key];
            }
        });

        return carried;
    }

`);

const marker = eol("    function createGeometryObject(type, geometry, options = {}) {");

if (!source.includes(marker)) {
  console.log("createGeometryObject not found");
  process.exit(1);
}

source = source.replace(marker, helper + marker);

fs.writeFileSync(path, source);
console.log(
  `carried fields added (file is ${CRLF ? "CRLF" : "LF"})`
);
