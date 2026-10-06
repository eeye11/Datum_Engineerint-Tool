export default async function run(page, ui) {
  const snap = await ui.snapshot();
  const drawing = snap.match(/@(e\d+) [^\n]*"Engineering Drawing"/)?.[1];
  if (!drawing) return { error: "no Engineering Drawing control", snap };

  await ui.click(drawing);
  await page.waitForTimeout(700);

  const after = await ui.snapshot();
  return {
    mounted: after.includes("svg") || after.includes("Beam"),
    after: after.slice(0, 1500),
  };
}
