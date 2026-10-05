/*
 * Confirms a tool button actually becomes the active tool, and
 * that a canvas click then reaches the construction. Verification
 * aid, not part of the application.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  /* Open Statics, letting the re-render settle. */
  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      ?.click();
  });
  await page.waitForTimeout(500);

  const present = await page.evaluate(() => {
    const b = document.querySelector('[data-tool-id="shear-force-diagram"]');
    return {
      found: Boolean(b),
      visible: b ? b.getBoundingClientRect().width > 0 : false,
      box: b
        ? (() => {
            const r = b.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            };
          })()
        : null,
    };
  });

  if (!present.found) {
    return { present };
  }

  /* Click the real button in the real UI, by ref. */
  const after = await ui.snapshot();

  const sfdRef = after.match(/@e\d+ [^\n]*Shear Force[^\n]*/)?.[0];

  if (sfdRef) {
    await ui.click(sfdRef.match(/@e\d+/)[0]);
  } else {
    await page.click('[data-tool-id="shear-force-diagram"]');
  }

  await page.waitForTimeout(400);

  const active = await page.evaluate(() => {
    const b = document.querySelector('[data-tool-id="shear-force-diagram"]');
    return {
      className: b?.className || "",
      message: document.getElementById("drawingToolMessage")?.innerText || "",
    };
  });

  const canvas = await page.locator(".drawing-canvas").boundingBox();

  const y = canvas.y + canvas.height / 2;

  await page.mouse.move(canvas.x + 150, y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(400);

  const afterClick = await page.evaluate(
    () => document.getElementById("drawingToolMessage")?.innerText || "",
  );

  return {
    present,
    refFound: Boolean(sfdRef),
    active,
    afterClick,
  };
}
