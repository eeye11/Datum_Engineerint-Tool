export default async function run(page, ui) {
  const log = [];
  const clickNamed = async (label, pattern) => {
    const s = await ui.snapshot();
    const ref = s.match(pattern)?.[1];
    if (!ref) {
      log.push(`${label}: NOT FOUND`);
      return false;
    }
    await ui.click(ref);
    log.push(`${label}: ${ref}`);
    return true;
  };

  await clickNamed(
    "Engineering Drawing",
    /@(e\d+) [^\n]*"Engineering Drawing"/,
  );
  await page.waitForTimeout(800);
  await clickNamed("STATICS", /@(e\d+) [^\n]*"STATICS"/);
  await page.waitForTimeout(300);
  await clickNamed("Supports", /@(e\d+) [^\n]*"Supports"/);
  await page.waitForTimeout(400);

  const afterSupports = await ui.snapshot();
  return { log, afterSupports };
}
