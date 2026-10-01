const fs = require("fs");

let src = fs.readFileSync("tools/check-placement-clicks.js", "utf8");

src = src.replace(
    "handleCanvasClick(__clickEvent({ x: 200, y: 80 }));",
    [
        'const __ev = __clickEvent({ x: 200, y: 80 });',
        'console.log("EV", JSON.stringify({clientX: __ev.clientX, clientY: __ev.clientY}));',
        'console.log("CANVAS", JSON.stringify({',
        '  cw: drawingCanvas.clientWidth,',
        '  ch: drawingCanvas.clientHeight,',
        '  rect: drawingCanvas.getBoundingClientRect()',
        '}));',
        'console.log("CAMERA", JSON.stringify(drawingState.camera));',
        'console.log("PT", JSON.stringify(__canvasPointFromEvent(__ev, false)));',
        'handleCanvasClick(__ev);'
    ].join("\n")
);

src = src.replace(
    "globalThis.__api = {",
    [
        '__canvasPointFromEvent:',
        '    typeof canvasPointFromEvent === "function"',
        '        ? canvasPointFromEvent : undefined,',
        'globalThis.__api = {'
    ].join("\n")
);

fs.writeFileSync("tools/_pc.js", src);
console.log("patched");