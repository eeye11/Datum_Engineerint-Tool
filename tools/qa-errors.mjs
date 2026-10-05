export default async function run(page) {
  const errors = [];

  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  await page.addInitScript(() => {
    window.__errs = [];
    window.addEventListener("error", (e) => {
      window.__errs.push(String(e.message));
    });
  });

  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => ({
    errs: window.__errs,
    showTab: typeof window.showTab,
    keys: Object.keys(window).filter((k) => k.startsWith("engg")),
    scripts: [...document.scripts].length,
    lastScriptParent: (() => {
      const s = document.scripts[document.scripts.length - 1];
      return s
        ? s.src.split("/").pop() + " in " + s.parentElement.tagName
        : null;
    })(),
  }));

  return { errors, info };
}
