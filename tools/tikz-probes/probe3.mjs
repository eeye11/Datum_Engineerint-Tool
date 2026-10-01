export default async function run(page, ui) {
  const out = {};
  const before = await ui.snapshot();
  const tab = before.match(/@(e\d+) [^\n]*Engineering Drawing/)?.[1];
  if (!tab) return { error: "drawing tab missing", before };
  await ui.click(tab);
  await page.waitForTimeout(2000);

  const canvas = page.locator(".drawing-canvas");
  const box = await canvas.boundingBox();
  const at = (x, y) => ({
    x: box.x + box.width * x,
    y: box.y + box.height * y,
  });

  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(400);

  const place = async (category, label, pts) => {
    await page
      .locator(`#drawingToolList button[data-tool-id="${category}"]`)
      .click();
    await page.waitForTimeout(320);
    await page
      .locator(".drawing-coordinate-submenu-item", { hasText: label })
      .first()
      .click();
    await page.waitForTimeout(380);
    for (const [x, y] of pts) {
      await page.mouse.click(at(x, y).x, at(x, y).y);
      await page.waitForTimeout(260);
    }
    await page.waitForTimeout(550);
    return page.evaluate(
      () =>
        document.getElementById("drawingProperties").innerText.split("\n")[0],
    );
  };

  // One of each remaining symbol.
  out.titles = {};
  out.titles.particle = await place("body", "Particle", [[0.12, 0.15]]);
  out.titles.rigidBody = await place("body", "Rigid Body", [[0.25, 0.15]]);
  out.titles.beam = await place("body", "Beam", [
    [0.4, 0.12],
    [0.58, 0.12],
  ]);
  out.titles.truss = await place("body", "Truss", [
    [0.4, 0.24],
    [0.58, 0.24],
  ]);
  out.titles.cable = await place("body", "Cable", [
    [0.4, 0.36],
    [0.58, 0.36],
  ]);
  out.titles.shaft = await place("body", "Shaft", [
    [0.4, 0.48],
    [0.58, 0.48],
  ]);
  out.titles.moment = await place("moment", "Applied Moment", [[0.72, 0.15]]);
  out.titles.couple = await place("moment", "Couple", [[0.72, 0.32]]);
  out.titles.distributed = await place("load", "Distributed Load", [
    [0.12, 0.62],
    [0.32, 0.62],
  ]);
  out.titles.varying = await place("load", "Varying Distributed Load", [
    [0.12, 0.76],
    [0.32, 0.76],
  ]);
  out.titles.smooth = await place("support", "Smooth Support", [[0.48, 0.62]]);
  out.titles.fixedSupport = await place("support", "Fixed Support", [
    [0.48, 0.76],
  ]);
  out.titles.pinConn = await place("connection", "Pin Connection", [
    [0.62, 0.62],
    [0.76, 0.62],
  ]);
  out.titles.fixedConn = await place("connection", "Fixed Connection", [
    [0.62, 0.76],
    [0.76, 0.76],
  ]);
  out.titles.sliderConn = await place("connection", "Slider Connection", [
    [0.84, 0.62],
    [0.96, 0.62],
  ]);

  // Does any label text render for features?
  out.labels = await page.evaluate(() => {
    const svg = document.querySelector(".drawing-canvas svg");
    return [...svg.querySelectorAll("text")].map((t) =>
      (t.textContent || "").trim(),
    );
  });

  // Feature tree: one coherent feature each.
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.02, 0.02).x, at(0.02, 0.02).y);
  await page.waitForTimeout(700);

  out.tree = await page.evaluate(() => {
    const groups = [];
    document.querySelectorAll(".drawing-component-group").forEach((g) => {
      const rows = [];
      let node = g.nextElementSibling;
      while (node && node.classList.contains("drawing-component-row")) {
        rows.push(node.innerText.trim());
        node = node.nextElementSibling;
      }
      groups.push({ group: g.textContent.trim(), count: rows.length, rows });
    });
    return groups;
  });

  return out;
}
