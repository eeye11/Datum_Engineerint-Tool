export default async function run(page) {
  const out = { errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

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
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(700);
  };

  const openStatics = () =>
    page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });
  const pick = (id) =>
    page.evaluate((t) => {
      document.querySelector(`.drawing-tool[data-tool-id="${t}"]`).click();
    }, id);
  const sub = (id) =>
    page.evaluate((t) => {
      document
        .querySelector(
          `.drawing-coordinate-submenu-item[data-submenu-id="${t}"]`,
        )
        .click();
    }, id);

  await openStatics();
  await page.waitForTimeout(400);
  await pick("body");
  await page.waitForTimeout(300);
  await sub("beam");
  await page.waitForTimeout(400);
  await click(box.x, box.y);
  await click(box.x + 320, box.y);
  await page.waitForTimeout(400);

  // An SFD Sketch frame - empty, so NO highlight expected.
  await openStatics();
  await page.waitForTimeout(400);
  await pick("shear-force-diagram");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    [...document.querySelectorAll(".drawing-coordinate-submenu-item")]
      .find((b) => b.textContent.trim() === "Sketch")
      .click();
  });
  await page.waitForTimeout(600);
  await click(box.x + 160, box.y + 130);
  await page.waitForTimeout(1000);

  out.emptyFrame = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-renderer");
    const g = [...svg.querySelectorAll("g")].find((x) =>
      (x.dataset.featureId || "").startsWith("shear-"),
    );
    if (!g) return "no diagram group";
    return {
      marks: g.children.length,
      rects: [...g.querySelectorAll("rect")].map((r) => r.getAttribute("fill")),
      labels: [...g.querySelectorAll("text")].map((t) => t.textContent.trim()),
    };
  });

  return out;
}
