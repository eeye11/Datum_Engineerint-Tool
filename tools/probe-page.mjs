export default async function run(page, ui) {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".tab"))
      .find((b) => b.textContent.trim() === "Engineering Drawing")
      ?.click();
  });

  await page.waitForFunction(
    () => {
      const v = document.querySelector("#drawing");
      return v && getComputedStyle(v).display !== "none";
    },
    { timeout: 15000 },
  );

  await page.waitForTimeout(800);

  /*
   * THE WHOLE PAGE, MEASURED.
   *
   * The complaint is that the page is distorted, so this reports the
   * things a distorted page actually shows: the document wider than
   * its own viewport, a horizontally scrolling page, content clipped
   * or pushed outside, and elements overflowing their parents.
   */
  const report = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;

    const overflowers = [];

    document.querySelectorAll("body *").forEach((node) => {
      const r = node.getBoundingClientRect();

      if (!r.width && !r.height) return;

      const pastRight = r.right - window.innerWidth;

      if (pastRight > 1) {
        overflowers.push({
          tag: node.tagName.toLowerCase(),
          id: node.id || "",
          cls: String(node.className || "")
            .trim()
            .split(/\s+/)
            .join(".")
            .slice(0, 50),
          pastRight: Math.round(pastRight),
          width: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }
    });

    const rect = (sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      doc: {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        scrollHeight: doc.scrollHeight,
        clientHeight: doc.clientHeight,
        pageScrollsSideways: doc.scrollWidth > doc.clientWidth + 1,
      },
      bodyScroll: {
        scrollWidth: body.scrollWidth,
        clientWidth: body.clientWidth,
      },
      boxes: {
        drawing: rect("#drawing"),
        workspace: rect(".drawing-workspace"),
        toolPanel: rect(".drawing-tool-panel"),
        canvasArea: rect(".drawing-canvas-area"),
        canvas: rect(".drawing-canvas"),
        inspector: rect(".drawing-inspector"),
        features: rect("#drawingProperties"),
        toolbar: rect(".drawing-toolbar"),
      },
      track: getComputedStyle(document.querySelector(".drawing-workspace"))
        .gridTemplateColumns,
      featuresVar: getComputedStyle(
        document.querySelector(".drawing-workspace"),
      ).getPropertyValue("--drawing-features-width"),
      overflowers: overflowers.slice(0, 12),
      overflowerCount: overflowers.length,
    };
  });

  return report;
}
