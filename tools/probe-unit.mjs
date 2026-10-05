/* After choosing m and typing 0.5, what does the model actually hold? */
import {
  mainWorld,
  openDrawingTab,
  activateStrict,
  clickWorld,j
} from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);

  await activateStrict(page, "beam");
  await clickWorld(page, 0.2, 0.3);
  await clickWorld(page, 0.5, 0.3);

  const unit = page.locator(".drawing-creation-dimension-unit");
  const input = page.locator(".drawing-creation-dimension-input");

  await unit.selectOption("m");
  await page.waitForTimeout(250);

  const afterSelect = await input.inputValue();

  await input.fill("0.5");
  await input.press("Enter");
  await page.waitForTimeout(400);

  return mainWorld(page, () => {
    const s = window.enggDrawing.state;
    const b = s.objects.find((o) => o.type === "beam");
    const scale = window.enggDimensions.readScale(s);

    const worldSpan = Math.hypot(
      b.geometry.end.x - b.geometry.start.x,
      b.geometry.end.y - b.geometry.start.y,
    );

    const panel = document.getElementById("drawingProperties");

    return {
      suggestedWhenUnitChosen: null,
      scale,
      worldSpan,
      asMm: window.enggDimensions.toEngineering(s, worldSpan),
      panelLength:
        panel?.querySelector('input[data-property="length"]')?.value ?? null,
      panelUnitText: (
        panel
          ?.querySelector('input[data-property="length"]')
          ?.closest(".drawing-property-grid")?.innerText || ""
      ).replace(/\s+/g, " "),
    };
  });
}
