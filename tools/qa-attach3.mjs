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
    return { x: r.left + r.width * 0.15, y: r.top + r.height * 0.4 };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(220);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(750);
  };

  const pick = async (parentId, subId) => {
    await page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });
    await page.waitForTimeout(300);
    await page.evaluate((p) => {
      document.querySelector(`.drawing-tool[data-tool-id="${p}"]`).click();
    }, parentId);
    await page.waitForTimeout(350);
    await page.evaluate((s) => {
      document
        .querySelector(
          `.drawing-coordinate-submenu-item[data-submenu-id="${s}"]`,
        )
        .click();
    }, subId);
    await page.waitForTimeout(450);
  };

  // A long horizontal beam: the midpoint is far from both endpoints, so
  // the shared snap cannot pull the attachment onto either of them.
  await pick("body", "beam");
  await click(box.x, box.y);
  await click(box.x + 300, box.y);
  await page.waitForTimeout(600);

  // Attach a pin support at the MIDPOINT, on the centreline.
  await pick("support", "pin-support");
  await click(box.x + 150, box.y); // names the body
  await click(box.x + 150, box.y - 20); // places it there

  // The support is the only thing drawn with a vertical stem.
  const supportX = () =>
    page.evaluate(() => {
      const svgs = [...document.querySelectorAll(".drawing-renderer")];
      for (const svg of svgs) {
        for (const l of svg.querySelectorAll("line")) {
          const x1 = Number(l.getAttribute("x1"));
          const x2 = Number(l.getAttribute("x2"));
          const y1 = Number(l.getAttribute("y1"));
          const y2 = Number(l.getAttribute("y2"));
          if (Number.isFinite(x1) && Math.abs(x1 - x2) < 1.5) {
            return {
              x: Math.round((x1 + x2) / 2),
              y1: Math.round(y1),
              y2: Math.round(y2),
            };
          }
        }
      }
      return null;
    });

  const beamExtent = () =>
    page.evaluate(() => {
      let minX = Infinity,
        maxX = -Infinity;
      document
        .querySelectorAll(
          ".drawing-renderer line, .drawing-renderer polyline, .drawing-renderer polygon",
        )
        .forEach((el) => {
          const nums =
            (el.getAttribute("d") || el.getAttribute("points") || "").match(
              /-?\d+(\.\d+)?/g,
            ) || [];
          for (let i = 0; i < nums.length - 1; i += 2) {
            minX = Math.min(minX, Number(nums[i]));
            maxX = Math.max(maxX, Number(nums[i]));
          }
        });
      return Number.isFinite(minX)
        ? { minX: Math.round(minX), maxX: Math.round(maxX) }
        : null;
    });

  out.steps.push({
    step: "beam+support-at-midpoint",
    beam: await beamExtent(),
    support: await supportX(),
  });

  // Open the beam's edit view and double its Length.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const row = [...document.querySelectorAll(".drawing-component-row")].find(
        (r) => /^Beam/i.test(r.textContent.replace(/\s+/g, " ").trim()),
      );
      if (row) row.click();
    });
    await page.waitForTimeout(450);
  }

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
  await page.waitForTimeout(1000);

  out.steps.push({
    step: "length-doubled",
    typed,
    beam: await beamExtent(),
    support: await supportX(),
  });

  return out;
}
