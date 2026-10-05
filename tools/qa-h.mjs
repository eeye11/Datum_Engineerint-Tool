export default async function run(page) {
  const out = { steps: [], errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.4 };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(700);
  };

  await page.evaluate(() => {
    document
      .querySelector('.drawing-category[data-category="STATICS"]')
      .click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelector('.drawing-tool[data-tool-id="point-force"]').click();
  });
  await page.waitForTimeout(450);

  await click(box.x, box.y);
  await click(box.x + 120, box.y);
  await page.waitForTimeout(600);

  /*
   * The arrow's drawn tip, and the force's selection handles.
   * A handle sitting at the arrow's midpoint is the floating-dot fault.
   */
  const read = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-renderer");

      let tip = null;
      svg.querySelectorAll("line").forEach((l) => {
        const x1 = Number(l.getAttribute("x1"));
        const x2 = Number(l.getAttribute("x2"));
        const y1 = Number(l.getAttribute("y1"));
        const y2 = Number(l.getAttribute("y2"));
        if (
          Number.isFinite(x1) &&
          Number.isFinite(x2) &&
          Math.abs(y1 - y2) < 1.5 &&
          Math.abs(x2 - x1) > 20
        ) {
          tip = { x: Math.round(Math.max(x1, x2)), y: Math.round(y1) };
        }
      });

      // Handles are small squares on the overlay.
      const handles = [...svg.querySelectorAll("rect, circle")]
        .map((el) => ({
          x: Number(el.getAttribute("x") ?? el.getAttribute("cx")),
          y: Number(el.getAttribute("y") ?? el.getAttribute("cy")),
          r: Number(el.getAttribute("width") ?? el.getAttribute("r") ?? 0),
        }))
        .filter(
          (h) => Number.isFinite(h.x) && Number.isFinite(h.y) && h.r <= 12,
        );

      return { tip, handles };
    });

  const forceValues = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#drawingProperties input")]
        .map((i) => i.value)
        .filter(Boolean),
    );

  // Select and open the edit view.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const row = [...document.querySelectorAll(".drawing-component-row")].find(
        (r) => /Point Force/i.test(r.textContent),
      );
      if (row) row.click();
    });
    await page.waitForTimeout(450);
  }

  out.steps.push({ step: "at 1.0x", ...(await read()) });

  for (const scale of ["2", "4"]) {
    const changed = await page.evaluate((v) => {
      const sel = document.querySelector("[data-statics-vector-scale]");
      if (!sel) return false;
      sel.value = v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, scale);
    await page.waitForTimeout(900);

    out.steps.push({
      step: `at ${scale}x`,
      changed,
      ...(await read()),
    });
  }

  out.steps.push({ step: "engineering", values: await forceValues() });

  return out;
}
