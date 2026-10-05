export default async function run(page, ui) {
  const logs = [];
  page.on("console", (m) =>
    logs.push(m.type() + ": " + m.text().slice(0, 200)),
  );
  page.on("pageerror", (e) =>
    logs.push("PAGEERROR: " + e.message.slice(0, 300)),
  );
  page.on("requestfailed", (r) =>
    logs.push("REQFAIL: " + r.url() + " " + r.failure()?.errorText),
  );
  page.on("response", (r) => {
    if (r.status() >= 400) logs.push("HTTP" + r.status() + ": " + r.url());
  });

  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(3000);

  const perf = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((e) => /engineering-drawing/.test(e.name))
      .map(
        (e) =>
          e.name.split("/").pop() +
          " " +
          e.transferSize +
          "b " +
          e.duration.toFixed(0) +
          "ms",
      ),
  );

  return { logs: logs.slice(0, 30), perf };
}
