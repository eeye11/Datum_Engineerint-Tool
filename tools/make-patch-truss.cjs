const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");

const find = `    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * The construction members become the truss's own topology.`;

const replace = `    /*
     * The construction members become the truss's own topology.`;

const find2 = `    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Truss created"
    );

    renderProperties();
    renderCurrentDrawing();
}`;

const replace2 = `    /*
     * The truss is committed by \`commitCreatedFeature\` once its
     * span is known, so drawing it and sizing it are one action.
     */
    enggDrawingState.clearInteraction(
        drawingState
    );

    beginCreationDimensioning(
        object,
        () => {
            commitCreatedFeature(object);

            setToolMessage(
                "Truss created"
            );

            renderProperties();
            renderCurrentDrawing();
        }
    );
}`;

const patch = [
  {
    file: "js/engineering-drawing/drawing.js",
    find,
    replace,
    count: 1,
  },
  {
    file: "js/engineering-drawing/drawing.js",
    find: find2,
    replace: replace2,
    count: 1,
  },
];

fs.writeFileSync(
  path.join(projectRoot, "tools", "patch-truss.json"),
  JSON.stringify(patch),
);

console.log("patch written");