/*
 * Reports what element actually sits at a click point over the
 * canvas, so a test that "clicks the canvas" can be trusted.
 * Verification aid, not part of the application.
 */
export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const tab = snap.match(/@e\d+ button "Engineering Drawing"/)?.[0];

  if (!tab) return { error: "no drawing tab", snap };

  await ui.click(tab.match(/@e\d+/)[0]);
  await page.waitForTimeout(700);

  const canvas = await page.locator(".drawing-canvas").boundingBox();

  const x = Math.round(canvas.x + canvas.width / 2);
  const y = Math.round(canvas.y + canvas.height / 2);

  const probe = await page.evaluate(
    ({ px, py }) => {
      const el = document.elementFromPoint(px, py);

      const chain = [];
      let node = el;

      while (node && chain.length < 6) {
        chain.push({
          tag: node.tagName,
          cls: String(node.className || "").slice(0, 48),
        });
        node = node.parentElement;
      }

      return {
        at: el
          ? {
              tag: el.tagName,
              cls: String(el.className || "").slice(0, 60),
            }
          : null,
        chain,
        canvasRect: (() => {
          const c = document.querySelector(".drawing-canvas");
          const r = c.getBoundingClientRect();
          return {
            left: Math.round(r.left),
            top: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        })(),
      };
    },
    { px: x, py: y },
  );

  return { clickPoint: { x, y }, probe };
}
