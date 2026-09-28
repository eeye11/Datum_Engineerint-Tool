export default async function run(page) {
  const out = { steps: [] };
  const log = (s, v) => out.steps.push({ step: s, value: v });
  const tab = page.getByRole("button", { name: "Engineering Drawing" });
  if (await tab.count()) {
    await tab.first().click();
    await page.waitForTimeout(500);
  }
  out.steps.push({
    step: "geometry tools",
    value: await page.evaluate(() =>
      [...document.querySelectorAll(".drawing-tool")].map(
        (b) => b.dataset.toolId,
      ),
    ),
  });
  await page.locator('.drawing-category[data-category="STATICS"]').click();
  await page.waitForTimeout(300);
  out.steps.push({
    step: "statics tools",
    value: await page.evaluate(() =>
      [...document.querySelectorAll(".drawing-tool")].map(
        (b) => b.dataset.toolId,
      ),
    ),
  });
  return out;
}
