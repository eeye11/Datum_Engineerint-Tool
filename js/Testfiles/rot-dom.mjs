export default async function run(page, ui) {
  await page.getByRole("button", { name: "Engineering Drawing" }).click();
  await page.waitForTimeout(200);
  await page.locator('.drawing-category[data-category="GEOMETRY"]').click();
  await page.waitForTimeout(200);

  const box = await page.locator(".drawing-canvas").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const click = async (x, y) => {
    await page.mouse.click(x, y);
    await page.waitForTimeout(150);
  };

  await page.locator('.drawing-tool[data-tool-id="rectangle"]').click();
  await click(cx - 100, cy - 60);
  await click(cx + 100, cy + 60);

  const props = await page.evaluate(() => {
    const p = document.querySelector("#drawingProperties");
    return {
      text: p ? p.textContent.replace(/\s+/g, " ").slice(0, 160) : null,
      rotationValue:
        p?.querySelector('[data-property="rotation"]')?.value ?? null,
    };
  });

  const rot = page.locator('#drawingProperties [data-property="rotation"]');
  await rot.fill("45");
  await rot.dispatchEvent("change");
  await page.waitForTimeout(400);

  const dom = await page.evaluate(() => {
    const rects = [...document.querySelectorAll("rect")];
    return {
      rectCount: rects.length,
      rects: rects.map((r) => ({
        transform: r.getAttribute("transform"),
        x: r.getAttribute("x"),
        y: r.getAttribute("y"),
        w: r.getAttribute("width"),
        h: r.getAttribute("height"),
        bbox: (({ x, y, width, height }) => ({
          x: +x.toFixed(1),
          y: +y.toFixed(1),
          width: +width.toFixed(1),
          height: +height.toFixed(1),
        }))(r.getBoundingClientRect()),
      })),
      rotationAfter:
        document.querySelector('#drawingProperties [data-property="rotation"]')
          ?.value ?? null,
    };
  });

  return { props, dom };
}
