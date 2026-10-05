/*
 * THE PAGE GEOMETRY, MEASURED.
 *
 * The complaint is that lengths in the page changed. This measures every
 * box the page is built from - the panels, the canvas area, the sheet
 * inside it - and compares them with the values the stylesheet declares,
 * so a change that came from a rule being edited by accident is visible
 * as a number rather than as a vague impression.
 *
 * WHAT COUNTS AS A CHANGE.
 *
 * The drawing sheet is drawn at a scale of one millimetre per unit
 * inside the canvas area, and both are laid out to fill the workspace.
 * Their size therefore follows the panel widths by design - a narrower
 * Features panel means a wider canvas, which is the whole point of
 * reclaiming space. So the sheet moving is expected.
 *
 * What is NOT expected is the TOOL PANEL moving. It is a fixed 202px
 * column of tool names, it is not what is being narrowed, and it lost 4px
 * on each side because a padding change meant for the Features panel was
 * written into the rule the two panels share. That is what this looks
 * for.
 */

const READ = () => {
  const box = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };

  const style = (sel, prop) => {
    const n = document.querySelector(sel);
    return n ? getComputedStyle(n)[prop] : null;
  };

  return {
    viewport: window.innerWidth,
    track: getComputedStyle(document.querySelector(".drawing-workspace"))
      .gridTemplateColumns,

    toolPanel: box(".drawing-tool-panel"),
    toolPanelPadding: style(".drawing-tool-panel", "padding"),
    inspector: box(".drawing-inspector"),
    inspectorPadding: style(".drawing-inspector", "padding"),
    canvasArea: box(".drawing-canvas-area"),
    sheet: box(".drawing-canvas"),
    workspace: box(".drawing-workspace"),
  };
};

export default async function run(page) {
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

  const wide = await page.evaluate(READ);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const veryWide = await page.evaluate(READ);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);

  return { wide, veryWide };
}
