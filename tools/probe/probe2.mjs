export default async function run(page, ui) {
  await page.waitForFunction(() => document.readyState === "complete", null, {
    timeout: 20000,
  });

  // Open the Engineering Drawing tab so the CAD workspace actually mounts.
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(2000);

  return await page.evaluate(() => {
    const keys = [];
    for (const k in window) if (/^engg/i.test(k)) keys.push(k);
    return {
      keys,
      canvas: document.querySelectorAll("canvas").length,
      drawDisplay: getComputedStyle(document.querySelector("#drawing")).display,
    };
  });
}
