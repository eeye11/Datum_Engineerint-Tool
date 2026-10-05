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
    return { x: r.left + r.width * 0.25, y: r.top + r.height * 0.45 };
  });

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

  // Draw a diagonal beam, so orientation preservation is observable.
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.mouse.move(box.x + 150, box.y + 75);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(900);

  // Every drawn coordinate, so any change in the beam's extent shows up.
  const drawn = () =>
    page.evaluate(() => {
      const svg = document.querySelector(".drawing-renderer");
      const xs = [],
        ys = [];
      svg.querySelectorAll("line, polyline, polygon, path").forEach((el) => {
        const nums =
          (el.getAttribute("d") || el.getAttribute("points") || "").match(
            /-?\d+(\.\d+)?/g,
          ) || [];
        for (let i = 0; i < nums.length - 1; i += 2) {
          xs.push(Number(nums[i]));
          ys.push(Number(nums[i + 1]));
        }
        ["x1", "x2", "x", "cx"].forEach((a) => {
          const v = el.getAttribute(a);
          if (v !== null && Number.isFinite(Number(v))) xs.push(Number(v));
        });
        ["y1", "y2", "y", "cy"].forEach((a) => {
          const v = el.getAttribute(a);
          if (v !== null && Number.isFinite(Number(v))) ys.push(Number(v));
        });
      });
      if (!xs.length) return null;
      return {
        minX: Math.round(Math.min(...xs)),
        maxX: Math.round(Math.max(...xs)),
        minY: Math.round(Math.min(...ys)),
        maxY: Math.round(Math.max(...ys)),
        width: Math.round(Math.max(...xs) - Math.min(...xs)),
        height: Math.round(Math.max(...ys) - Math.min(...ys)),
      };
    });

  // The Length field, found by its own data-property hook.
  const lengthField = () =>
    page.evaluate(() => {
      const el = document.querySelector(
        '#drawingProperties [data-property="length"]',
      );
      if (!el) {
        const any = [
          ...document.querySelectorAll("#drawingProperties [data-property]"),
        ].map((i) => i.getAttribute("data-property"));
        return { found: false, properties: any };
      }
      return { found: true, value: el.value, disabled: Boolean(el.disabled) };
    });

  // Open the edit view: select, then click the selected row again.
  const openEdit = async () => {
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        const row = [
          ...document.querySelectorAll(".drawing-component-row"),
        ].find((r) => /Beam/i.test(r.textContent));
        if (row) row.click();
      });
      await page.waitForTimeout(450);
    }
  };

  await openEdit();
  out.steps.push({
    step: "before",
    drawn: await drawn(),
    length: await lengthField(),
  });

  const typed = await page.evaluate(() => {
    const el = document.querySelector(
      '#drawingProperties [data-property="length"]',
    );
    if (!el) return false;
    el.focus();
    el.value = String(Number(el.value) * 2);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  await page.waitForTimeout(900);

  out.steps.push({
    step: "after",
    typed,
    drawn: await drawn(),
    length: await lengthField(),
  });

  return out;
}
