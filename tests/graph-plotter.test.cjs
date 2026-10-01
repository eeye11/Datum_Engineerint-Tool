const assert = require("node:assert/strict");
const test = require("node:test");

const plotter = require("../js/engineering-drawing/graph-plotter.js");

function withMathParser(parse, callback) {
    const previousMath = global.math;
    global.math = { parse };

    try {
        callback();
    } finally {
        if (previousMath === undefined) {
            delete global.math;
        } else {
            global.math = previousMath;
        }
    }
}

test("validates ordered finite x-domain limits", () => {
    assert.deepEqual(plotter.validateDomain("-4.5", "8"), {
        min: -4.5,
        max: 8
    });
    assert.throws(() => plotter.validateDomain("", "8"), /finite numbers/);
    assert.throws(() => plotter.validateDomain("5", "5"), /less than/);
    assert.throws(() => plotter.validateDomain("-1000001", "8"), /between/);
});

test("samples both domain endpoints and marks invalid results as gaps", () => {
    const points = plotter.sampleValues(
        x => {
            if (x === 0) {
                return Infinity;
            }

            return x * x;
        },
        -1,
        1,
        5
    );

    assert.deepEqual(points[0], { x: -1, y: 1 });
    assert.deepEqual(points[2], { x: 0, y: null });
    assert.deepEqual(points[4], { x: 1, y: 1 });
});

test("combines independent function domains into one shared x-axis", () => {
    assert.deepEqual(
        plotter.combinedDomain([
            { min: -3, max: 1 },
            { min: 4, max: 9 }
        ]),
        { min: -3, max: 9 }
    );
    assert.deepEqual(plotter.combinedDomain([]), { min: 0, max: 10 });
});

test("finds bounds across graph lines, curves, markers, and labels", () => {
    assert.deepEqual(plotter.boundsOfObjects([
        {
            type: "line",
            geometry: { start: { x: 2, y: 1 }, end: { x: 8, y: 1 } }
        },
        {
            type: "polyline",
            geometry: { points: [{ x: -1, y: 0 }, { x: 3, y: 8 }] }
        },
        {
            type: "circle",
            geometry: { center: { x: 5, y: 3 }, radius: 1 }
        },
        {
            type: "rectangle",
            geometry: { position: { x: 9, y: 7 }, width: 4, height: 3 }
        },
        {
            type: "annotation",
            placement: { x: 10, y: 5 },
            text: "f1",
            style: { fontSize: 2 }
        }
    ]), {
        left: -1,
        right: 13,
        bottom: 0,
        top: 8
    });
});

test("finds large vertical jumps and short gaps between sampled values", () => {
    assert.deepEqual(
        plotter.findVerticalConnectors([
            { x: -1, y: -0.8 },
            { x: 0, y: 0.8 }
        ], -1, 1),
        [{ x: -0.5, yStart: -0.8, yEnd: 0.8 }]
    );
    assert.deepEqual(
        plotter.findVerticalConnectors([
            { x: -1, y: -0.8 },
            { x: 0, y: null },
            { x: 1, y: 0.8 }
        ], -1, 1),
        [{ x: 0, yStart: -0.8, yEnd: 0.8 }]
    );
    assert.deepEqual(
        plotter.findVerticalConnectors([
            { x: -2, y: null },
            { x: -1, y: null },
            { x: 0, y: null },
            { x: 1, y: 0.7 }
        ], -1, 1),
        []
    );
});

test("connects a sampled pole without connecting a smooth curve", () => {
    const pole = plotter.sampleValues(x => 1 / x, -10, 10, 1000);
    const smooth = plotter.sampleValues(x => x * x, -10, 10, 1000);

    assert.ok(plotter.findVerticalConnectors(pole, -10, 10).length > 0);
    assert.deepEqual(plotter.findVerticalConnectors(smooth, -1, 101), []);
});

test("prepares every valid function for drawing-sheet insertion", () => {
    const graph = {
        domain: { min: -4, max: 8 },
        yMin: -2,
        yMax: 5,
        plot: { width: 600, height: 400 },
        xTicks: [-4, 0, 4, 8],
        yTicks: [-2, 0, 2, 4],
        series: [
            {
                expression: "x^2",
                color: "#1f6b43",
                domain: { min: -2, max: 3 },
                points: [{ x: -2, y: 4 }, { x: 3, y: 9 }],
                endpoints: [{ x: -2, y: 4 }, { x: 3, y: 9 }],
                connectors: [{ x: 0.5, yStart: -2, yEnd: 5 }],
                evaluate: () => 0
            }
        ]
    };

    const snapshot = plotter.createDrawingSnapshot(graph);
    assert.equal(snapshot.aspect, 2 / 3);
    assert.deepEqual(snapshot.series[0], {
        expression: "x^2",
        color: "#1f6b43",
        domain: { min: -2, max: 3 },
        points: [{ x: -2, y: 4 }, { x: 3, y: 9 }],
        endpoints: [{ x: -2, y: 4 }, { x: 3, y: 9 }],
        connectors: [{ x: 0.5, yStart: -2, yEnd: 5 }]
    });
    assert.equal("evaluate" in snapshot.series[0], false);
});

test("compiles a numeric function expression after a Desmos-style prefix", () => {
    withMathParser(expression => {
        assert.equal(expression, "x^2");

        return {
            isOperatorNode: true,
            op: "^",
            args: [
                { isSymbolNode: true, name: "x" },
                { isConstantNode: true, value: 2 }
            ],
            compile: () => ({ evaluate: scope => scope.x ** 2 })
        };
    }, () => {
        const evaluate = plotter.compileExpression("f(x) = x^2");
        assert.equal(evaluate(-3), 9);
        assert.equal(evaluate(2), 4);
    });
});

test("rejects symbols and function calls outside the math whitelist", () => {
    withMathParser(() => ({
        isFunctionNode: true,
        fn: { isSymbolNode: true, name: "import" },
        args: []
    }), () => {
        assert.throws(
            () => plotter.compileExpression("import(x)"),
            /Function not supported/
        );
    });

    withMathParser(() => ({
        isSymbolNode: true,
        name: "document"
    }), () => {
        assert.throws(
            () => plotter.compileExpression("document"),
            /Unknown symbol/
        );
    });
});