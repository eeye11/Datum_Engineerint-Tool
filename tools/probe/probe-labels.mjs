export default async function run(page) {
  page.setDefaultTimeout(120000);
  await page.getByRole("button", { name: "Engineering Drawing" }).click();
  await page.waitForSelector(".drawing-sheet-tab");
  await page.waitForTimeout(400);

  const ask = async (body) => {
    await page.addScriptTag({
      content:
        "(function(){var out;try{out=(function(){" +
        body +
        "})();}catch(e){out={error:String(e)};}" +
        "document.documentElement.setAttribute('data-probe'," +
        "JSON.stringify(out===undefined?null:out));" +
        "})();",
    });
    const raw = await page.evaluate(() =>
      document.documentElement.getAttribute("data-probe"),
    );
    await page.evaluate(() =>
      document.documentElement.removeAttribute("data-probe"),
    );
    return JSON.parse(raw);
  };

  return ask(
    "var S = window.enggDrawing.state;" +
      "var M = window.enggDrawing.model;" +
      "var beam = M.addObject(S, M.geometryFactories.beam({ x: 0, y: 0 }, { x: 10, y: 0 }));" +
      "var b = S.objects.find(function (o) { return o.id === beam; });" +
      "var d1 = M.addObject(S, M.geometryFactories.dimension({" +
      "  dimensionType: 'horizontal'," +
      "  refs: [{ featureId: beam, anchor: 'start' }, { featureId: beam, anchor: 'end' }]," +
      "  placement: { x: 5, y: 5 } }));" +
      "var d2 = M.addObject(S, M.geometryFactories.dimension({" +
      "  dimensionType: 'vertical'," +
      "  refs: [{ featureId: beam, anchor: 'start' }, { featureId: beam, anchor: 'end' }]," +
      "  placement: { x: 5, y: 5 } }));" +
      "var a = M.addObject(S, M.geometryFactories.annotation({" +
      "  kind: 'free-text', text: 'note', position: { x: 1, y: 1 } }));" +
      "return {" +
      "scriptSrc: (function(){" +
      "  var s = document.querySelector('script[src*=drawing-state]');" +
      "  return s ? s.src : null; })()," +
      "names: S.objects.map(function (o) { return o.name; })" +
      "};",
  );
}
