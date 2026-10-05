export default async function run(page, ui) {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  // Open the ANNOTATE category and list its tools.
  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(600);

  return await page.evaluate(() => {
    const tl = document.querySelector("#drawingToolList");
    const groups = [...tl.children].map((g) => ({
      heading: (g.querySelector("h3, .drawing-tool-group-title") || {})
        .textContent,
      tools: [...g.querySelectorAll("[data-tool]")].map((t) => ({
        tool: t.getAttribute("data-tool"),
        label: t.textContent.trim().replace(/\s+/g, " "),
      })),
    }));
    return {
      heading: document.querySelector("#drawingToolHeading")?.textContent,
      groups,
    };
  });
}
