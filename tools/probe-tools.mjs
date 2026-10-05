export default async function run(page, ui) {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".tab"))
      .find((b) => b.textContent.trim() === "Engineering Drawing")
      ?.click();
  });

  await page.waitForTimeout(700);

  await page.evaluate(() => {
    document
      .querySelector('.drawing-toolbar [data-category="STATICS"]')
      ?.click();
  });

  await page.waitForTimeout(700);

  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        ".drawing-tool-panel button, .drawing-tool-panel [data-tool]",
      ),
    )
      .map((b) => ({
        t: b.textContent.trim().slice(0, 30),
        id: b.id || "",
        ds: JSON.stringify(b.dataset),
        cls: String(b.className || "").slice(0, 40),
      }))
      .filter((x) => x.t),
  );
}
