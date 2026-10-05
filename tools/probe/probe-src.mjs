export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);
  return await page.evaluate(() => {
    const r = {};
    r.ownProps = Object.getOwnPropertyNames(window).filter((k) =>
      /engg/i.test(k),
    );
    r.toolListHTML = document
      .querySelector("#drawingToolList")
      ?.outerHTML.slice(0, 300);
    r.svg = document
      .querySelector(".drawing-workspace svg")
      ?.outerHTML.slice(0, 200);
    r.hasSvgWorkspace = !!document.querySelector(".drawing-workspace svg");
    return r;
  });
}
