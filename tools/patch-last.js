/*
 * Selects a feature by NAME rather than by row index.
 *
 * The Feature Tree rows are not in creation order, so "the last row"
 * was selecting the Line rather than the Truss or the Support - and
 * Fit Selected then fitted the Line, producing the page zoom and
 * looking as though the command did nothing at all.
 *
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "qa-fit-last.mjs");

let text = fs.readFileSync(file, "utf8");

/* The helper, inserted before the first use. */
const helper = `  /*
   * Select a feature BY NAME.
   *
   * The rows are in the tree's own order, which is not the order the
   * features were created in, so "the last row" was picking the Line
   * instead of the Truss or the Support. Fit Selected then fitted the
   * Line, gave back the page zoom, and looked like the command did
   * nothing.
   */
  const selectByName = async (needle) => {
    await arm("GEOMETRY", "select");

    return await page.evaluate((n) => {
      const rows = Array.from(
        document.querySelectorAll(".drawing-component-row")
      );
      const hit = rows.find((r) =>
        r.innerText.toLowerCase().includes(n.toLowerCase())
      );
      hit?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 })
      );
      return hit ? hit.innerText.trim().slice(0, 30) : null;
    }, needle);
  };

  /* --- S6: a Truss selected alone --- */
`;

/* Replace the first occurrence of the S6 banner with the helper. */
const banner = "  /* --- S6: a Truss selected alone --- */\n";

if (text.includes(banner)) {
  text = text.replace(banner, helper);
} else {
  console.log("S6 banner not found");
}

/* Replace the index-based selection with the named one. */
const indexSelection = `  await arm("GEOMETRY", "select");
  await page.evaluate(() => {
    const rows = document.querySelectorAll(
      ".drawing-component-row"
    );
    rows?.[rows.length - 1]?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 })
    );
  });
  await page.waitForTimeout(300);`;

const count = text.split(indexSelection).length - 1;

text = text
  .split(indexSelection)
  .join(
    "  const picked = await selectByName(NEEDLE);\n" +
      "  await page.waitForTimeout(300);",
  );

/* The two calls need different names. */
let nth = 0;
text = text.replace(/const picked = await selectByName\(NEEDLE\);/g, () => {
  const name = nth === 0 ? "truss" : "support";
  nth += 1;
  return `const picked = await selectByName("${name}");`;
});

/* Report what was clicked. */
text = text
  .split('case: "S6. truss selected alone",')
  .join('case: "S6. truss selected alone",\n    clickedRow: picked,')
  .split('case: "S8. support selected alone",')
  .join('case: "S8. support selected alone",\n    clickedRow: picked,');

fs.writeFileSync(file, text);
console.log("replaced " + count + " selection blocks");
