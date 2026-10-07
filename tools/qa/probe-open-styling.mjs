/*
 * Report the computed style of every control in the Open popup, so the styling
 * can be checked against Datum's panel vocabulary.
 */
export default async function run(page) {
  await page.evaluate(async () => {
    await import("/src/main.js");
  });

  await page.waitForFunction(
    () => typeof window.enggDrawing === "object" && window.enggDrawing.state,
    null,
    { timeout: 60000 },
  );

  await page.waitForTimeout(400);

  await page.evaluate(() => {
    window.enggRecentFiles.clear();
    window.enggTemplates.clear();

    const doc = {
      units: "mm",
      sheets: [
        {
          id: "s",
          name: "Sheet 1",
          objects: [
            {
              id: "t",
              type: "line",
              name: "L",
              geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 40 } },
              style: { stroke: "#000000", lineWidth: 1 },
            },
          ],
        },
      ],
      activeSheetId: "s",
    };

    const image = window.enggDrawingExport.renderFittedDocument(doc, {
      width: 160,
    });

    const preview = image
      ? new XMLSerializer().serializeToString(image.svg)
      : null;

    window.enggRecentFiles.remember({
      name: "triangle.enggdraw",
      document: doc,
      preview,
    });

    window.enggTemplates.addTemplate({
      name: "My Template",
      document: doc,
      preview,
    });
  });

  await page.evaluate(() => {
    document.querySelector('[data-file-action="open"]').click();
  });

  await page.waitForTimeout(700);

  const report = await page.evaluate(() => {
    const describe = (selector) => {
      const node = document.querySelector(selector);

      if (!node) {
        return { selector, missing: true };
      }

      const s = getComputedStyle(node);

      return {
        selector,
        bg: s.backgroundColor,
        border: s.borderColor,
        radius: s.borderRadius,
        colour: s.color,
        font: s.fontSize,
        weight: s.fontWeight,
        w: Math.round(node.getBoundingClientRect().width),
        h: Math.round(node.getBoundingClientRect().height),
      };
    };

    return [...document.querySelectorAll(".engg-dialog-button")].map((node) => {
      const s = getComputedStyle(node);

      return {
        label: node.textContent.trim(),
        primary: node.classList.contains("engg-dialog-button-primary"),
        bg: s.backgroundColor,
        border: s.borderColor,
        radius: s.borderRadius,
        colour: s.color,
        font: s.fontSize,
        weight: s.fontWeight,
        w: Math.round(node.getBoundingClientRect().width),
        h: Math.round(node.getBoundingClientRect().height),
      };
    });
  });

  /* And the reference: a Features-panel action button, for comparison. */
  const reference = await page.evaluate(() => {
    const node = document.querySelector(".drawing-property-action");

    if (!node) {
      return null;
    }

    const s = getComputedStyle(node);

    return {
      bg: s.backgroundColor,
      border: s.borderColor,
      radius: s.borderRadius,
      colour: s.color,
      font: s.fontSize,
      weight: s.fontWeight,
    };
  });

  return { report, reference };
}
