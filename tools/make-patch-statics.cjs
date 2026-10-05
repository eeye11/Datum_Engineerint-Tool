const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");

const find = `        const previous =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        /*
         * A Reference Line reuses the ordinary line`;

const replace = `        /*
         * A Reference Line reuses the ordinary line`;

const find2 = `        enggDrawingState.addObject(
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
            staticsInstruction(
                drawingState.activeTool
            )
        );

        renderProperties();
        renderCurrentDrawing();
        return;
    }`;

const replace2 = `        /*
         * THE INTERACTION IS RELEASED BEFORE THE SIZE IS ASKED FOR.
         *
         * The span is complete, so the tool has no more points to
         * take. The member is not added yet - it is committed by
         * \`commitCreatedFeature\` once its size is known, so the
         * creation and its dimension are one undoable action and a
         * cancelled dimension leaves nothing behind.
         */
        enggDrawingState.clearInteraction(
            drawingState
        );

        beginCreationDimensioning(
            object,
            () => {
                commitCreatedFeature(object);

                setToolMessage(
                    staticsInstruction(
                        drawingState.activeTool
                    )
                );

                renderProperties();
                renderCurrentDrawing();
            }
        );

        return;
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
  path.join(projectRoot, "tools", "patch-statics-span.json"),
  JSON.stringify(patch),
);

console.log("patch written");