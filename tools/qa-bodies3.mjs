export default async function run(page) {
  const out = {};

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-category")]
      .find((b) => /STATICS/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(500);

  out.openBodies = await page.evaluate(() => {
    var el = [...document.querySelectorAll(".drawing-tool")].find((b) =>
      /Bodies/i.test(b.textContent),
    );
    if (!el) return { found: false };
    el.click();
    return {
      found: true,
      attrs: [...el.attributes].map((a) => a.name + "=" + a.value),
    };
  });
  await page.waitForTimeout(500);

  out.toolsAfter = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-tool")].map((b) =>
      b.textContent.trim(),
    ),
  );

  out.particle = await page.evaluate(() => {
    var el = [...document.querySelectorAll(".drawing-tool")].find((b) =>
      /^Particle$/i.test(b.textContent.trim()),
    );
    if (!el) return { found: false };
    el.click();
    return { found: true };
  });
  await page.waitForTimeout(500);

  out.activeAfterParticle = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-tool")]
      .filter((b) =>
        /active|pressed|selected/.test(
          b.className + b.getAttribute("aria-pressed"),
        ),
      )
      .map((b) => b.textContent.trim()),
  );

  return out;
}
