export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const tab = page
    .locator("button", { hasText: "Engineering Drawing" })
    .first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
    (function(){
      const R={}, D=window.enggDrawing, St=window.enggDrawingState, Sc=window.enggDimensions;
      // Build a real document containing a dimension and an annotation.
      const f={id:'force-1',name:'Point Force',type:'force',style:{},metadata:{},
        geometry:{start:{x:0,y:0},end:{x:0,y:-30},position:{x:0,y:0},magnitude:250,angle:-90,unit:'N'}};
      const line={id:'line-1',name:'Line',type:'line',style:{},metadata:{},
        geometry:{start:{x:0,y:0},end:{x:100,y:0}}};
      const state={scale:{mmPerUnit:1,unit:'mm'},objects:[line,f]};
      R.stateApi = St ? Object.keys(St).filter(k=>/add|history|undo|redo|serialize|sheet|dimension|annotation/i.test(k)).sort() : null;
      R.drawApi = D ? Object.keys(D).filter(k=>/render|export|save|reference|print/i.test(k)).sort() : null;

      // Does the serialiser know about these object types?
      try{
        const ser = St && (St.serialize || St.toJSON || St.snapshot || St.state);
        R.serialiserName = ser ? (typeof ser==='function'?'fn':typeof ser) : null;
        if(typeof ser==='function'){ const out=ser(state); R.serTypes=(out.objects||out.sheets?.[0]?.objects||[]).map(o=>o.type); }
      }catch(e){R.ser='ERR '+e.message}

      // Renderer
      try{
        const Rr = window.enggRenderer || (D&&D.render);
        R.rendererName = Rr? (typeof Rr):null;
      }catch(e){R.renderer='ERR '+e.message}

      R.globals={renderer:typeof window.enggRenderer, docFile:typeof window.enggDocumentFile,
                 fileSave:typeof window.enggFileSave, docExport:typeof window.enggDocumentExport,
                 drawingRef:typeof window.enggDrawingReference, sheets:typeof window.enggDrawingSheets,
                 writtenRefs:typeof window.enggWrittenReferences};
      document.documentElement.setAttribute('data-res',JSON.stringify(R));
    })();`;
    document.body.appendChild(s);
  });
  await page.waitForTimeout(400);
  return JSON.parse(await page.getAttribute("html", "data-res"));
}
