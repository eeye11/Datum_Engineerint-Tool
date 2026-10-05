export default async function run(page, ui) {
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("CONSOLE: " + m.text());
  });

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(2500);

  const snap = await page.evaluate(() => {
    const ws = document.querySelector(".drawing-workspace");
    const tl = document.querySelector("#drawingToolList");
    return {
      workspace: !!ws,
      workspaceRect: ws ? ws.getBoundingClientRect().toJSON() : null,
      toolListChildren: tl ? tl.children.length : null,
      toolButtons: tl
        ? [...tl.children]
            .map((c) => c.getAttribute("data-tool") || c.textContent.trim())
            .slice(0, 30)
        : [],
      canvases: [...document.querySelectorAll("canvas")].map(
        (c) => c.id || c.className,
      ),
      svgCount: document.querySelectorAll("svg").length,
    };
  });
  return { errs, snap };
}
