export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  const result = {};

  for (const category of ["STATICS", "GEOMETRY"]) {
    await page.locator(`button[data-category="${category}"]`).click();
    await page.waitForTimeout(400);

    // Open every submenu so their tools are in the list.
    const subs = await page.locator("#drawingToolList [data-submenu]").count();
    for (let i = 0; i < subs; i++) {
      await page.locator("#drawingToolList [data-submenu]").nth(i).click();
      await page.waitForTimeout(200);
    }

    result[category] = await page.evaluate(() =>
      [...document.querySelectorAll("#drawingToolList [data-tool-id]")].map(
        (b) => b.getAttribute("data-tool-id"),
      ),
    );
  }

  return result;
}
