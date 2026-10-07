export default async function run(page) {
  const out = {};

  out.imported = await page.evaluate(async () => {
    const result = await Promise.race([
      import("/src/main.js")
        .then(() => ({ settled: "resolved" }))
        .catch((e) => ({
          settled: "rejected",
          message: String(e && e.message),
          stack: String((e && e.stack) || "").slice(0, 600)
        })),
      new Promise((resolve) =>
        setTimeout(() => resolve({ settled: "timeout" }), 4000)
      )
    ]);

    return result;
  });

  await page.waitForTimeout(300);

  out.after = await page.evaluate(() => ({
    datum: typeof window.datum,
    enggDrawing: typeof window.enggDrawing,
    sheets: typeof window.enggDrawingSheets
  }));

  return out;
}
