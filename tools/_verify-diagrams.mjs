export default async function run(page) {
  const out = { errors: [] };
  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 200)),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(900);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".drawing-canvas").getBoundingClientRect();
    return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.5 };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(220);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(700);
  };

  const openStatics = async () => {
    await page.evaluate(() => {
      document
        .querySelector('.drawing-category[data-category="STATICS"]')
        .click();
    });
    await page.waitForTimeout(300);
  };

  /* A SLOPING beam, because a level one can hide an axis taken from the
     screen instead of from the member. */
  await openStatics();
  await page.evaluate(() => {
    document.querySelector('.drawing-tool[data-tool-id="body"]').click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document
      .querySelector('.drawing-coordinate-submenu-item[data-submenu-id="beam"]')
      .click();
  });
  await page.waitForTimeout(400);
  await click(box.x, box.y);
  await click(box.x + 220, box.y + 130);
  await page.waitForTimeout(500);

  const DIAGRAMS = [
    ["axial-force-diagram", "AFD"],
    ["shear-force-diagram", "SFD"],
    ["bending-moment-diagram", "BMD"],
  ];

  out.diagrams = [];

  for (const [toolId, label] of DIAGRAMS) {
    await openStatics();
    await page.evaluate((id) => {
      document.querySelector(`.drawing-tool[data-tool-id="${id}"]`).click();
    }, toolId);
    await page.waitForTimeout(600);

    await click(box.x + 110, box.y + 40 + out.diagrams.length * 95);
    await page.waitForTimeout(800);

    out.diagrams.push(
      await page.evaluate(
        ({ lbl, tid }) => {
          const svg = document.querySelector(".drawing-renderer");
          const rows = [
            ...document.querySelectorAll(".drawing-component-row"),
          ].map((r) => r.textContent.replace(/\s+/g, " ").trim());

          /*
           * Count real drawn marks inside each feature group, not just
           * groups. The defect was a group that existed and stayed empty,
           * so a group count alone would have reported success again.
           */
          const groups = [...(svg ? svg.querySelectorAll("g") : [])]
            .map((g) => ({
              id: g.getAttribute("data-feature-id") || g.dataset.featureId,
              marks: g.childElementCount,
              rects: g.querySelectorAll("rect").length,
              lines: g.querySelectorAll("line,path,text,polyline").length,
            }))
            .filter((g) => g.marks > 0);

          return {
            label: lbl,
            tool: tid,
            listedInPanel: rows.filter((r) =>
              /AFD|SFD|BMD|Axial|Shear|Bending/i.test(r),
            ),
            drawnGroups: groups,
          };
        },
        { lbl: label, tid: toolId },
      ),
    );
  }

  return out;
}
