export default async function run(page) {
  const out = {};

  out.importMain = await page.evaluate(async () => {
    try {
      await import("/src/main.js");
      return { ok: true, datum: typeof window.datum };
    } catch (e) {
      return {
        ok: false,
        message: String(e.message),
        stack: String(e.stack || "").slice(0, 500),
      };
    }
  });

  await page.waitForTimeout(500);

  out.after = await page.evaluate(() => ({
    datum: typeof window.datum,
    enggDrawing: typeof window.enggDrawing,
  }));

  return out;
}
