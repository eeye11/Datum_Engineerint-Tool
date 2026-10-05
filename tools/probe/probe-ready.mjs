export default async function run(page, ui) {
  // The marker page boots lazily; wait for the drawing app to actually mount.
  await page.waitForFunction(() => document.readyState === "complete", null, {
    timeout: 20000,
  });
  await page.waitForTimeout(1500);
  return await page.evaluate(() => {
    const keys = [];
    for (const k in window) if (/engg/i.test(k)) keys.push(k);
    return {
      readyState: document.readyState,
      enggKeys: keys,
      canvas: document.querySelectorAll("canvas").length,
      drawDisplay: getComputedStyle(document.querySelector("#drawing")).display,
    };
  });
}
