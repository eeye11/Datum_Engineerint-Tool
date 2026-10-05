/*
 * ONE FEATURE, INSPECTED, AND ITS SECTIONS READ BACK.
 *
 * The per-feature acceptance run reports a feature's TYPE and whether its
 * rows are sound, but not WHICH SECTIONS it showed - and a panel can
 * pass every layout check while showing the wrong ones. The
 * specification gives an explicit section list per feature, so that list
 * is what this reads back.
 *
 * A feature that needs a body is drawn on one first, because a click on
 * empty canvas leaves the tool waiting at "Select body" and nothing is
 * committed.
 */
const TARGET = {
  group: "Loads",
  item: "Distributed Load",
  name: "Distributed Load",
  expected: [
    "LOAD",
    "DIRECTION",
    "SPAN",
    "RELATIONSHIP",
    "DISTRIBUTION",
    "SAMPLING",
  ],
};

export default async function run(page) {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".tab"))
      .find((b) => b.textContent.trim() === "Engineering Drawing")
      ?.click();
  });

  await page.waitForFunction(
    () => {
      const v = document.querySelector("#drawing");
      return v && getComputedStyle(v).display !== "none";
    },
    { timeout: 15000 },
  );

  await page.waitForTimeout(800);

  await page.evaluate(() => {
    document
      .querySelector('.drawing-toolbar [data-category="STATICS"]')
      ?.click();
  });
  await page.waitForTimeout(700);

  const box = await page.locator(".drawing-canvas").first().boundingBox();

  const at = (fx, fy) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });

  const arm = async (group, item) =>
    page.evaluate(
      ({ group, item }) => {
        const g = Array.from(
          document.querySelectorAll("#drawingToolPanel button[data-tool-id]"),
        ).find(
          (n) =>
            n.querySelector(".drawing-tool-caret") &&
            n
              .querySelector(".drawing-tool-label")
              ?.textContent?.replace(/[\u25BE\u25B4]/g, "")
              ?.trim()
              ?.startsWith(group),
        );

        const open = (
          g?.querySelector(".drawing-tool-caret")?.textContent || ""
        ).includes("\u25B4");

        if (g && !open) g.click();

        Array.from(
          document.querySelectorAll(".drawing-coordinate-submenu button"),
        )
          .find((b) => b.textContent.trim() === item)
          ?.click();
      },
      { group, item },
    );

  /* A beam to hang the load on. */
  await arm("Bodies", "Beam");
  await page.waitForTimeout(250);

  const s = at(0.15, 0.45);
  const e = at(0.9, 0.45);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(150);
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(400);

  /* The load itself, across part of the beam. */
  await arm(TARGET.group, TARGET.item);
  await page.waitForTimeout(250);

  const a = at(0.3, 0.45);
  const b = at(0.65, 0.45);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(150);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(500);

  /* Open it in the panel. */
  await page.evaluate(() => {
    document
      .querySelector('#drawingToolPanel [data-tool-id="select"]')
      ?.click();
  });
  await page.waitForTimeout(150);

  const p = at(0.45, 0.45);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll(".drawing-component-row"),
    );

    rows[rows.length - 1]?.click();
  });
  await page.waitForTimeout(600);

  const measured = await page.evaluate(() => {
    const panel = document.querySelector("#drawingProperties");

    const block = Array.from(
      panel.querySelectorAll(".drawing-properties-block"),
    ).find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.left > 0;
    });

    if (!block) return { error: "no block on screen" };

    const pr = panel.getBoundingClientRect();

    /* Rows with the wrong number of cells grow an implicit column. */
    const badCellCounts = {};

    block.querySelectorAll(".drawing-property-grid").forEach((row) => {
      badCellCounts[row.children.length] =
        (badCellCounts[row.children.length] || 0) + 1;
    });

    return {
      sections: Array.from(
        block.querySelectorAll(".drawing-properties-section"),
      ).map((s) => s.textContent.trim()),
      labels: Array.from(block.querySelectorAll(".drawing-property-grid-label"))
        .map((l) => l.textContent.trim())
        .filter(Boolean),
      rows: block.querySelectorAll(".drawing-property-grid").length,
      cellCounts: badCellCounts,
      panelWidth: Math.round(pr.width),
      horizontalScrollbar: panel.scrollWidth > panel.clientWidth + 1,
    };
  });

  return {
    measured,
    expected: TARGET.expected,
    sectionsMatch:
      JSON.stringify(measured.sections) === JSON.stringify(TARGET.expected),
  };
}
