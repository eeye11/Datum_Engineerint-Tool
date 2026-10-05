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

  // Draw a diagonal beam so orientation preservation is observable.
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

  // The beam's drawn extent on screen.
  const drawn = () =>
    page.evaluate(() => {
      const xs = [],
        ys = [];
      document.querySelectorAll(".drawing-renderer line").forEach((l) => {
        ["x1", "x2"].forEach((a) => xs.push(Number(l.getAttribute(a))));
        ["y1", "y2"].forEach((a) => ys.push(Number(l.getAttribute(a))));
      });
      const ok = xs.filter(Number.isFinite);
      if (!ok.length) return null;
      return {
        minX: Math.min(...ok),
        maxX: Math.max(...ok),
        minY: Math.min(...ys.filter(Number.isFinite)),
        maxY: Math.max(...ys.filter(Number.isFinite)),
        slope: (() => {
          const lines = [
            ...document.querySelectorAll(".drawing-renderer line"),
          ];
          const l = lines[0];
          if (!l) return null;
          const dx =
            Number(l.getAttribute("x2")) - Number(l.getAttribute("x1"));
          const dy =
            Number(l.getAttribute("y2")) - Number(l.getAttribute("y1"));
          return dx === 0 ? null : Math.round((dy / dx) * 1000) / 1000;
        })(),
      };
    });

  // Open the edit view: select, then click the selected row again.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".drawing-component-row")].find(
      (r) => /Beam/i.test(r.textContent),
    );
    if (row) row.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".drawing-component-row")].find(
      (r) => /Beam/i.test(r.textContent),
    );
    if (row) row.click();
  });
  await page.waitForTimeout(700);

  const lengthField = () =>
    page.evaluate(() => {
      const inputs = [...document.querySelectorAll("#drawingProperties input")];
      const labels = [
        ...document.querySelectorAll(
          "#drawingProperties .drawing-property-grid-label",
        ),
      ];
      const i = labels.findIndex((l) => /Length/i.test(l.textContent));
      if (i === -1)
        return {
          found: false,
          labels: labels.map((l) => l.textContent.trim()),
        };
      const el = inputs[i];
      return el
        ? {
            found: true,
            value: el.value,
            tag: el.tagName,
            disabled: el.disabled,
          }
        : { found: false, reason: "no input paired with Length" };
    });

  out.steps.push({
    step: "before",
    drawn: await drawn(),
    length: await lengthField(),
  });

  // Type a new length.
  const typed = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("#drawingProperties input")];
    const labels = [
      ...document.querySelectorAll(
        "#drawingProperties .drawing-property-grid-label",
      ),
    ];
    const i = labels.findIndex((l) => /Length/i.test(l.textContent));
    if (i === -1 || !inputs[i]) return false;
    const el = inputs[i];
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
