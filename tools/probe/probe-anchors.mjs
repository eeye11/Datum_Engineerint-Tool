export default async function run(page, ui) {
  await page.goto("http://localhost:8099/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = `
    (function(){
      const M=window.enggMeasurement, D=window.enggDimensionModel;
      const R={};
      const line={id:'l1',type:'line',name:'Line',style:{},metadata:{},geometry:{x1:0,y1:0,x2:100,y2:0}};
      const s1={scale:{mmPerUnit:1,unit:'mm'},objects:[line]};
      R.anchorOptions=M.anchorOptions(line);
      const circle={id:'c1',type:'circle',name:'C',style:{},metadata:{},geometry:{center:{x:0,y:0},radius:25}};
      R.circleAnchors=M.anchorOptions(circle);
      R.twoPointSpan=(M.twoPointSpan(line)||null);
      R.resolves=(M.anchorResolves?M.anchorResolves(line,'start',s1):'n/a');
      const dim=D.createDimension({dimensionType:'linear',
        refs:[{featureId:'l1',anchor:'start'},{featureId:'l1',anchor:'end'}],
        placement:{x:50,y:-20}});
      R.isResolved=D.isResolved(dim,s1);
      R.pts=D.measurePoints(dim,s1);
      R.txt=D.formatMeasurement(dim,s1);
      line.geometry.x2=140;
      R.pts2=D.measurePoints(dim,s1);
      R.txt2=D.formatMeasurement(dim,s1);
      document.documentElement.setAttribute('data-res',JSON.stringify(R));
    })();`;
    document.body.appendChild(s);
  });
  await page.waitForTimeout(400);
  return JSON.parse(await page.getAttribute("html", "data-res"));
}
