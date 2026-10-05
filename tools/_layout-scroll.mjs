export default async function run(page) {
  const out = {};

  await page.setViewportSize({ width: 1024, height: 640 });
  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(800);

  const list = ".drawing-tool-list";

  out.before = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      hiddenFromView: [...document.querySelectorAll(".drawing-tool")]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          const l = el.getBoundingClientRect();
          return r.bottom > l.bottom + 1 || r.top < l.top - 1;
        })
        .map((b) => b.dataset.toolId),
    };
  }, list);

  // Scroll the tool list to the bottom.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, list);
  await page.waitForTimeout(500);

  out.afterScroll = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return {
      scrollTop: el.scrollTop,
      stillHidden: [...document.querySelectorAll(".drawing-tool")]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          const l = el.getBoundingClientRect();
          return r.bottom > l.bottom + 1 || r.top < l.top - 1;
        })
        .map((b) => b.dataset.toolId),
    };
  }, list);

  // Can the analysis tool actually be clicked once scrolled to?
  out.clickable = await page.evaluate(() => {
    const afd = document.querySelector(
      '.drawing-tool[data-tool-id="afd"], ' +
        '.drawing-tool[data-tool-id="axial-force-diagram"]',
    );
    const all = [...document.querySelectorAll(".drawing-tool")].map(
      (b) => b.dataset.toolId,
    );
    if (!afd) return { found: false, all };
    const r = afd.getBoundingClientRect();
    const top = document.elementFromPoint(
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2),
    );
    return {
      found: true,
      id: afd.dataset.toolId,
      hitIsButton: !!((top && afd.contains(top)) || top === afd),
    };
  });

  return out;
}
