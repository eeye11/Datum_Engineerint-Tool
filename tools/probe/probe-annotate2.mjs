export default async function run(page, ui) {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);
  await page.locator('button[data-category="ANNOTATE"]').click();
  await page.waitForTimeout(600);

  return await page.evaluate(() => {
    const tl = document.querySelector("#drawingToolList");
    const btns = [...tl.querySelectorAll("button")].map((b) =>
      b.textContent.trim().replace(/\s+/g, " "),
    );
    const dataAttrs = [
      ...new Set(
        [...tl.querySelectorAll("*")].flatMap((e) =>
          [...e.attributes].map((a) => a.name + "=" + a.value),
        ),
      ),
    ].filter((s) => /tool|action|dim|annot|note/i.test(s));
    return {
      buttonCount: btns.length,
      buttons: btns,
      dataAttrs: dataAttrs.slice(0, 40),
    };
  });
}
