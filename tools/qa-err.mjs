export default async function run(page) {
  const errs = [];
  page.on("pageerror", (e) =>
    errs.push(String((e && e.stack) || e).slice(0, 1500)),
  );
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  return {
    errs,
    globals: await page.evaluate(() => ({
      showTab: typeof window.showTab,
      state: typeof window.enggDrawingState,
    })),
  };
}
