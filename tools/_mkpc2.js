const fs = require("fs");

let src = fs.readFileSync("tools/check-placement-clicks.js", "utf8");

src = src.replace(
    "handleCanvasClick(__clickEvent({ x: 0, y: 0 }));",
    [
        'drawingState.activeTool = "pin-support";',
        'console.log("S0", JSON.stringify({',
        '  objs: drawingState.objects.length,',
        '  phase: drawingState.interaction.phase,',
        '  target: drawingState.interaction.staticsTarget',
        '}));',
        'handleCanvasClick(__clickEvent({ x: 0, y: 0 }));',
        'console.log("S1", JSON.stringify({',
        '  objs: drawingState.objects.length,',
        '  phase: drawingState.interaction.phase,',
        '  target: drawingState.interaction.staticsTarget',
        '      ? drawingState.interaction.staticsTarget.id : null',
        '}));',
        'handleCanvasClick(__clickEvent({ x: 120, y: 0 }));',
        'console.log("S2", JSON.stringify({',
        '  objs: drawingState.objects.length,',
        '  phase: drawingState.interaction.phase',
        '}));',
        'return { armed: drawingState.interaction.phase,',
        '  added: 0, type: null, position: null,',
        '  attachment: null, parentId: null };'
    ].join("\n")
);

src = src.replace(
    "// Second click: choose the place along it.\n        handleCanvasClick(__clickEvent({ x: 120, y: 0 }));",
    ""
);

fs.writeFileSync("tools/_pc2.js", src);
console.log("patched");