/*
 * Gives the two selection blocks in the last Fit cases distinct
 * variable names, since a module cannot redeclare one. Verification
 * aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "qa-fit-last.mjs");

let text = fs.readFileSync(file, "utf8");

let seen = 0;

text = text.replace(
  /const picked = await selectByName\("([a-z]+)"\);/g,
  (match, name) => {
    seen += 1;
    const variable = seen === 1 ? "pickedTruss" : "pickedSupport";
    return `const ${variable} = await selectByName("${name}");`;
  },
);

/* The report lines need to match. */
text = text
  .split('case: "S6. truss selected alone",\n    clickedRow: picked,')
  .join('case: "S6. truss selected alone",\n    clickedRow: pickedTruss,')
  .split('case: "S8. support selected alone",\n    clickedRow: picked,')
  .join('case: "S8. support selected alone",\n    clickedRow: pickedSupport,');

fs.writeFileSync(file, text);
console.log("renamed " + seen + " declarations");
