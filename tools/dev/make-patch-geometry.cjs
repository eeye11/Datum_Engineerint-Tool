const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");

const find = `    if (object) {
        const previousObjects =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        enggDrawingState.addObject(
            drawingState,
            object
        );

        enggDrawingState.commitDrawingChange(
            drawingState,
            previousObjects
        );

        /*
         * Select the new feature so its Features panel
         * opens immediately, matching the Point and
         * Polygon tools.
         */
        enggDrawingState.selectObject(
            drawingState,
            object.id
        );
    }

    enggDrawingState.clearInteraction(
        drawingState
    );

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Create a Point feature and select it, so its
 * Features panel opens straight away.
 */`;

const replace = `    if (object) {
        /*
         * THE INTERACTION IS RELEASED BEFORE THE SIZE IS ASKED FOR.
         *
         * The geometry is complete, so the tool has no more points
         * to take - and leaving it mid-construction while a popup
         * is open would let a stray click add another point behind
         * the popup. The feature itself is not added yet: it is
         * committed by \`commitCreatedFeature\` once its size is
         * known, as one undoable action.
         */
        enggDrawingState.clearInteraction(
            drawingState
        );

        beginCreationDimensioning(
            object,
            () => {
                commitCreatedFeature(object);

                setToolMessage("Ready");

                renderProperties();
                renderCurrentDrawing();
            }
        );

        return;
    }

    enggDrawingState.clearInteraction(
        drawingState
    );

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Create a Point feature and select it, so its
 * Features panel opens straight away.
 */`;

const patch = [
  {
    file: "js/",
    find,
    replace,
    count: 1,
  },
];

fs.writeFileSync(
  path.join(projectRoot, "tools", "patch-geometry-commit.json"),
  JSON.stringify(patch),
);

console.log("patch written");