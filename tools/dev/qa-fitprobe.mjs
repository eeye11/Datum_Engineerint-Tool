/*
 * Reports whether a simple Line can be drawn at all, so a Fit that
 * "does not work" can be told apart from a harness that never drew
 * anything to fit. Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  await page.waitForLoadState("load", { timeout: 30000 });

  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-tool-id]").length > 0,
      { timeout: 30000 }
    )
    .catch(() => null);

  /* Are the global-tool buttons clickable at all? */
  const before = await page.evaluate(() => {
    const b = document.querySelector(
      '[data-global-tool="fit"]'
    );
    return {
      exists: Boolean(b),
      visible: b ? b.getBoundingClientRect().width > 0 : false,
      disabled: b ? b.disabled : null
    };
  });

  const after = await page.evaluate(() => {
    const b = document.querySelector(
      '[data-global-tool="fit"]'
    );
    b?.click();
    return {
      clicked: true,
      message:
        document.getElementById("drawingToolMessage")
          ?.innerText,
      zoom: document.getElementById("drawingZoomValue")
        ?.value,
    };
  });

  await page.waitForTimeout(500);

  return {
    before,
    after,
    later: await page.evaluate(
      () =>
        document.getElementById("drawingToolMessage")
          ?.innerText
    ),
  };
}
