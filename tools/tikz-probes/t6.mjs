export default async function run(page, ui) {
  const out = { steps: [] };
  const before = await ui.snapshot();
  const tab = before.match(/@(e\d+) [^\n]*Engineering Drawing/)?.[1];
  if (!tab) return { error: "drawing tab missing", before };
  await ui.click(tab);
  await page.waitForTimeout(2000);

  const canvas = page.locator(".drawing-canvas");
  const box = await canvas.boundingBox();

  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(400);

  const record = async (label) => {
    const state = await page.evaluate(() => ({
      panel: document
        .getElementById("drawingProperties")
        .innerText.split("\n")[0],
      props: [
        ...document.querySelectorAll("#drawingProperties [data-property]"),
      ].map((el) => el.dataset.property + "=" + el.value),
      msg: document.getElementById("drawingToolMessage").textContent,
      active:
        document.querySelector("#drawingToolList button.active")?.dataset
          .toolId || null,
    }));
    out.steps.push([label, state]);
  };

  // Place force 1.
  await page.locator('#drawingToolList button[data-tool-id="force"]').click();
  await page.waitForTimeout(400);
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);
  await page.waitForTimeout(900);
  await record("force 1 placed");

  // Set its magnitude and angle through the real input.
  const setField = async (key, value) => {
    const ok = await page.evaluate(
      ([k, v]) => {
        const input = document.querySelector(
          `#drawingProperties [data-property="${k}"]`,
        );
        if (!input) return false;
        input.focus();
        input.value = String(v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      [key, value],
    );
    await page.waitForTimeout(500);
    return ok;
  };

  out.setMag1 = await setField("magnitude", 100);
  out.setAng1 = await setField("angle", 0);
  await record("force 1 configured");

  // Place force 2.
  await page.locator('#drawingToolList button[data-tool-id="force"]').click();
  await page.waitForTimeout(400);
  await record("force tool re-clicked");
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.6);
  await page.waitForTimeout(900);
  await record("force 2 placed");

  out.setMag2 = await setField("magnitude", 100);
  out.setAng2 = await setField("angle", 90);
  await record("force 2 configured");

  // Feature count.
  await page.locator('#drawingToolList button[data-tool-id="select"]').click();
  await page.waitForTimeout(300);
  await page.mouse.click(box.x + 6, box.y + 6);
  await page.waitForTimeout(600);
  out.tree = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-component-row")].map((r) =>
      r.innerText.trim(),
    ),
  );

  return out;
}
