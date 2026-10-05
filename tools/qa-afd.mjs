export default async function run(page) {
  const out = { steps: [], errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 300)),
  );
  page.on("console", (m) => {
    if (m.type() === "error") {
      out.errors.push("console: " + m.text().slice(0, 250));
    }
  });

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.35 };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(800);
  };

  const status = () =>
    page.evaluate(() => {
      const el = document.getElementById("drawingToolMessage");
      return el ? el.innerText.trim() : null;
    });

  // 1. A beam to analyse.
  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('.drawing-tool[data-tool-id="body"]').click();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document
      .querySelector('.drawing-coordinate-submenu-item[data-submenu-id="beam"]')
      .click();
  });
  await page.waitForTimeout(450);

  await click(box.x, box.y);
  await click(box.x + 260, box.y);
  await page.waitForTimeout(600);

  out.steps.push({
    step: "beam",
    rows: await page.evaluate(() =>
      [...document.querySelectorAll(".drawing-component-row")].map((r) =>
        r.textContent.replace(/\s+/g, " ").trim(),
      ),
    ),
  });

  // 2. Press SFD.
  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(300);

  out.steps.push({
    step: "statics tools",
    ids: await page.evaluate(() =>
      [...document.querySelectorAll(".drawing-tool")].map(
        (b) => b.dataset.toolId,
      ),
    ),
  });

  const picked = await page.evaluate(() => {
    const b = document.querySelector(
      '.drawing-tool[data-tool-id="shear-force-diagram"]',
    );
    if (!b) return { found: false };
    b.click();
    return { found: true };
  });
  await page.waitForTimeout(700);

  out.steps.push({
    step: "after pressing SFD",
    picked,
    status: await status(),
    pressed: await page.evaluate(() => {
      const b = document.querySelector(
        '.drawing-tool[data-tool-id="shear-force-diagram"]',
      );
      return b ? b.getAttribute("aria-pressed") : null;
    }),
  });

  // 3. Click on the beam.
  await click(box.x + 130, box.y);
  out.steps.push({ step: "after click on beam", status: await status() });

  // 4. Try moving and clicking again, and Enter.
  await click(box.x + 130, box.y - 90);
  out.steps.push({ step: "after click above beam", status: await status() });

  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  out.steps.push({
    step: "after Enter",
    status: await status(),
    rows: await page.evaluate(() =>
      [...document.querySelectorAll(".drawing-component-row")].map((r) =>
        r.textContent.replace(/\s+/g, " ").trim(),
      ),
    ),
  });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  return out;
}
