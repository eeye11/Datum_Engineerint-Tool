export default async function run(page, ui) {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);

  return await page.evaluate(async () => {
    const r = {};
    // 1. Does the file execute when injected fresh?
    try {
      const src = await (
        await fetch("js/engineering-drawing/measurement-core.js")
      ).text();
      new Function(src).call(window);
      r.afterInject = typeof window.enggMeasurement;
    } catch (e) {
      r.injectError = e.name + ": " + e.message;
    }

    // 2. Is there a document-level error boundary / CSP?
    r.csp =
      document.querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.content || null;

    // 3. Is the app maybe sandboxed in an iframe?
    r.frames = window.frames.length;

    return r;
  });
}
