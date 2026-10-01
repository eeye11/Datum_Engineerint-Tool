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

  // ---- Structure ----
  out.sections = await page.evaluate(() =>
    [...document.querySelectorAll("#drawingToolList .drawing-tool-group")].map(
      (s) => ({
        label: (
          s.querySelector(".drawing-tool-group-label")?.textContent || ""
        ).trim(),
        tools: [...s.querySelectorAll("button")].map((b) => b.dataset.toolId),
      }),
    ),
  );

  // ---- Submenu contents ----
  out.menus = {};
  for (const id of [
    "body",
    "force",
    "moment",
    "load",
    "support",
    "connection",
  ]) {
    await page.locator(`#drawingToolList button[data-tool-id="${id}"]`).click();
    await page.waitForTimeout(350);
    out.menus[id] = (
      await page.locator(".drawing-coordinate-submenu-item").allTextContents()
    ).map((t) => t.trim());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.mouse.click(5, 5);
    await page.waitForTimeout(250);
  }

  // ---- Create a Point Load and a Force Pair ----
  const createSingle = async (category, label, fx, fy) => {
    await page
      .locator(`#drawingToolList button[data-tool-id="${category}"]`)
      .click();
    await page.waitForTimeout(350);
    await page
      .locator(".drawing-coordinate-submenu-item", { hasText: label })
      .first()
      .click();
    await page.waitForTimeout(450);
    const instruction = await page.locator("#drawingToolMessage").innerText();
    await page.mouse.click(at(fx, fy).x, at(fx, fy).y);
    await page.waitForTimeout(800);
    return {
      instruction,
      title: await page.evaluate(
        () =>
          document.getElementById("drawingProperties").innerText.split("\n")[0],
      ),
      sections: await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "#drawingProperties .drawing-properties-section",
          ),
        ].map((s) => s.textContent.trim()),
      ),
      props: await page.evaluate(() =>
        [
          ...document.querySelectorAll("#drawingProperties [data-property]"),
        ].map((el) => el.dataset.property + "=" + el.value),
      ),
    };
  };

  out.pointLoad = await createSingle("load", "Point Load", 0.3, 0.3);
  out.forcePair = await createSingle("force", "Force Pair", 0.3, 0.5);

  // ---- Create a Distributed Load (two points) ----
  await page.locator('#drawingToolList button[data-tool-id="load"]').click();
  await page.waitForTimeout(350);
  await page
    .locator(".drawing-coordinate-submenu-item", {
      hasText: "Distributed Load",
    })
    .first()
    .click();
  await page.waitForTimeout(450);
  out.distributedInstruction = await page
    .locator("#drawingToolMessage")
    .innerText();
  await page.mouse.click(at(0.55, 0.3).x, at(0.55, 0.3).y);
  await page.waitForTimeout(280);
  await page.mouse.click(at(0.8, 0.3).x, at(0.8, 0.3).y);
  await page.waitForTimeout(800);
  out.distributedLoad = {
    title: await page.evaluate(
      () =>
        document.getElementById("drawingProperties").innerText.split("\n")[0],
    ),
    props: await page.evaluate(() =>
      [...document.querySelectorAll("#drawingProperties [data-property]")].map(
        (el) => el.dataset.property + "=" + el.value,
      ),
    ),
  };

  // ---- Varying distributed load ----
  await page.locator('#drawingToolList button[data-tool-id="load"]').click();
  await page.waitForTimeout(350);
  await page
    .locator(".drawing-coordinate-submenu-item", {
      hasText: "Varying Distributed Load",
    })
    .first()
    .click();
  await page.waitForTimeout(450);
  await page.mouse.click(at(0.55, 0.55).x, at(0.55, 0.55).y);
  await page.waitForTimeout(280);
  await page.mouse.click(at(0.8, 0.55).x, at(0.8, 0.55).y);
  await page.waitForTimeout(800);
  out.varyingLoad = {
    title: await page.evaluate(
      () =>
        document.getElementById("drawingProperties").innerText.split("\n")[0],
    ),
    props: await page.evaluate(() =>
      [...document.querySelectorAll("#drawingProperties [data-property]")].map(
        (el) => el.dataset.property + "=" + el.value,
      ),
    ),
  };

  // ---- Tree grouping ----
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(at(0.03, 0.03).x, at(0.03, 0.03).y);
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
      groups.push({ group: g.textContent.trim(), rows });
    });
    return groups;
  });

  return out;
}
