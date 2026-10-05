export default async function run(page, ui) {
  const out = { steps: [] };
  const node = "C:/Program Files/nodejs/node.exe";

  await page.waitForTimeout(1500);

  // What tools exist?
  out.tools = await page.evaluate(() => {
    const d = window.enggDrawingState;
    return {
      hasState: !!d,
      activeTool: d?.activeTool,
      toolIds: Object.keys(window.enggDrawing?.STATICS_TOOL_MENUS || {}),
      menus: window.enggDrawing?.STATICS_TOOL_MENUS?.body,
    };
  });
  out.steps.push("read state");

  // Click the Particle button in the toolbar by text.
  const before = await ui.snapshot();
  const particleBtn = before.match(/@(e\d+) [^\n]*Particle/)?.[1];
  out.particleBtnRef = particleBtn || null;
  out.btnLines = before
    .split("\n")
    .filter((l) => /Particle|Rigid Body/i.test(l));

  if (particleBtn) {
    await ui.click(particleBtn);
    await page.waitForTimeout(500);
    out.afterClickParticle = await page.evaluate(() => ({
      activeTool: window.enggDrawingState?.activeTool,
    }));
    out.steps.push("clicked particle");
  }

  return out;
}
