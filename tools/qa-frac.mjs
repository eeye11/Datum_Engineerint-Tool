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

  // A 300-unit beam, then a support a third of the way along.
  await pick("body", "beam");
  await click(box.x, box.y);
  await click(box.x + 300, box.y);
  await page.waitForTimeout(600);

  await pick("support", "pin-support");
  await click(box.x + 150, box.y); // names the body
  await click(box.x + 150, box.y - 20); // places it

  // Read the support panel's "Position Along Body" - shown in mm.
  const openSupport = async () => {
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        const row = [
          ...document.querySelectorAll(".drawing-component-row"),
        ].find((r) => /Pin Support/i.test(r.textContent));
        if (row) row.click();
      });
      await page.waitForTimeout(450);
    }
  };

  const alongField = () =>
    page.evaluate(() => {
      const el = document.querySelector(
        "#drawingProperties [data-support-distance]",
      );
      return el ? el.value : null;
    });

  await openSupport();
  out.steps.push({
    step: "support-attached",
    positionAlong: await alongField(),
  });

  // Now open the BEAM and double its length.
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

  out.steps.push({ step: "beam-doubled", typed });

  // Re-open the support: its position along the body should have doubled,
  // because it keeps its FRACTION and the member is now twice as long.
  await openSupport();
  out.steps.push({ step: "support-after", positionAlong: await alongField() });

  return out;
}
