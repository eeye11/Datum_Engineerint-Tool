/*
 * A SIDE-BY-SIDE HEIGHT COMPARISON, FOR ONE VIEWPORT.
 *
 * The report is deliberately narrow: the heights of the parts of the
 * page, at a fixed window size, so the same numbers can be taken with
 * and without a change and differenced.
 *
 * IT READS THE DRAWING SHEET ONLY, because that is where the workspace,
 * the panels and the sheet list are all on screen at once. Measuring a
 * hidden sheet returns zero for everything, which is how an earlier
 * version of this reported every panel as 0px tall and looked like it
 * had measured nothing.
 */

const READ = () => {
  const box = (sel) => {
    const n = document.querySelector(sel);

    if (!n) return null;

    const r = n.getBoundingClientRect();

    if (!r.height) return null;

    return {
      h: Math.round(r.height * 100) / 100,
      w: Math.round(r.width * 100) / 100,
    };
  };

  const tallest = (rootSel) => {
    const root = document.querySelector(rootSel);

    if (!root) return null;

    let max = 0;
    let who = "";

    root.querySelectorAll("*").forEach((n) => {
      const r = n.getBoundingClientRect();

      if (r.height > max && r.width > 4) {
        max = r.height;
        who =
          n.tagName.toLowerCase() +
          (n.id ? "#" + n.id : "") +
          (typeof n.className === "string" && n.className
            ? "." + n.className.trim().split(/\s+/)[0]
            : "");
      }
    });

    return { h: Math.round(max * 100) / 100, who };
  };

  return {
    viewport: window.innerHeight,

    /* THE PARTS THE USER NAMED */
    fileTools: box("#fileTools") || box(".file-tools"),
    sheetList: box("#drawingSheetBar") || box(".drawing-sheetbar"),
    tabs: Array.from(document.querySelectorAll(".tab")).map((n) => {
      const r = n.getBoundingClientRect();
      return {
        text: (n.textContent || "").trim().slice(0, 20),
        h: Math.round(r.height * 100) / 100,
      };
    }),

    /* AND THE PARTS A TALLER HEADER WOULD PUSH */
    page: {
      docHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    },
    workspace: box(".drawing-workspace"),
    workspaceTallestChild: tallest(".drawing-workspace"),
    toolPanel: box(".drawing-tool-panel"),
    inspector: box(".drawing-inspector"),
    canvasArea: box(".drawing-canvas-area"),
    sheet: box(".drawing-canvas"),

    /* THE WORKSPACE'S OWN ROW TEMPLATE, which is what makes it tall */
    workspaceRows: getComputedStyle(
      document.querySelector(".drawing-workspace"),
    ).gridTemplateRows,

    /* THE TOOL PANEL'S TALLEST CHILD - a wrapped tool name is the usual
       cause of a panel that has quietly grown */
    toolPanelTallestChild: tallest(".drawing-tool-panel"),
  };
};

export default async function run(page) {
  await page.setViewportSize({ width: 1280, height: 720 });

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

  await page.waitForTimeout(900);

  return page.evaluate(READ);
}
