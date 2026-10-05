/*
 * Verification aid: ask the browser what it received for
 * drawing.js, rather than what the server says it sent. Not
 * part of the application.
 */

export default async function run(page, ui) {
  const result = {};

  const snap = await ui.snapshot();
  await ui.click(snap.match(/@(e\d+) button "Engineering Drawing"/i)[1]);

  await page
    .locator(".drawing-tool-list button")
    .first()
    .waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);

  result.stamp = await page.evaluate(() => window.__drawingBuild || "STALE");

  /* Re-fetch the script with cache bypass and read it back. */
  result.refetched = await page.evaluate(async () => {
    const response = await fetch(
      "/js/engineering-drawing/drawing.js?nocache=" + Date.now(),
      { cache: "reload" },
    );

    const text = await response.text();

    return {
      length: text.length,
      hasStamp: text.includes("__drawingBuild"),
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
    };
  });

  /* And what the page's OWN script tag points at. */
  result.tagSrc = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll("script")).find((s) =>
      s.src.includes("engineering-drawing/drawing.js"),
    );

    return node ? node.src : "NO TAG";
  });

  return result;
}
