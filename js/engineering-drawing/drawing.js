/* Engineering drawing workspace controller. */

const toolHeading = document.getElementById("drawingToolHeading");
const toolList = document.getElementById("drawingToolList");
const drawingCanvas = document.querySelector(".drawing-canvas");
const drawingCoordinates = document.getElementById("drawingCoordinates");
const drawingZoomValue = document.getElementById("drawingZoomValue");
const drawingZoomOut = document.getElementById("drawingZoomOut");
const drawingZoomIn = document.getElementById("drawingZoomIn");
const drawingGridToggle = document.getElementById("drawingGridToggle");
const drawingSnapToggle = document.getElementById("drawingSnapToggle");
const drawingProperties = document.getElementById("drawingProperties");
const drawingToolMessage = document.getElementById("drawingToolMessage");
const drawingComponentsBack = document.getElementById("drawingFeaturesBack");
const drawingUndo = document.getElementById("drawingUndo");
const drawingRedo = document.getElementById("drawingRedo");
const drawingThickness = document.getElementById("drawingThickness");
const drawingColor = document.getElementById("drawingColor");
const drawingLineType = document.getElementById("drawingLineType");

const drawingState = enggDrawingState.createDrawingState();
const drawingSnap = enggDrawingSnap;

window.enggDrawing = {
    state: drawingState,
    model: enggDrawingState,
    renderer: enggDrawingRenderer
};

const COORDINATE_SYSTEM_TYPE = "coordinate-system-2d";
const COORDINATE_SYSTEM_LENGTH = 25;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/*
 * Smallest interior angle a triangle may take. Keeps
 * angle edits from collapsing a triangle into a
 * degenerate sliver.
 */
const MIN_TRIANGLE_ANGLE = 0.01;

/*
 * Default size of a newly created rigid body, in mm. The
 * student resizes it afterwards from the Features panel
 * or by dragging its corner handles.
 */
/*
 * The starting size of a new Rigid Body.
 *
 * Deliberately small: a body is a starting outline to be sized
 * and shaped, so a large default would fill the canvas and need
 * shrinking before it could be used.
 */
const RIGID_BODY_WIDTH = 50;
const RIGID_BODY_HEIGHT = 30;

let coordinateSystemMenu = null;
let coordinateSystemMenuAnchor = null;
let polygonSidesPrompt = null;
let selectionClickSuppressed = false;
let selectionDrag = null;
let panSession = null;
let drawingZoom = drawingState.camera.zoom * 100;

function activeCategory() {
    return (
        document.querySelector(
            ".drawing-category.active"
        )?.dataset.category ||
        "GEOMETRY"
    );
}

function toolDefinitionForLabel(label) {
    const toolIdByLabel =
        Object.fromEntries(
            Object.entries(
                drawToolLabelById
            ).map(
                ([id, toolLabel]) =>
                    [toolLabel, id]
            )
        );

    return {
        id:
            toolIdByLabel[label] ||
            label
                .toLowerCase()
                .replace(
                    /[^a-z]+/g,
                    "-"
                ),
        label
    };
}

function renderToolButton(tool) {
    /*
     * A submenu parent highlights when one of its own
     * children is the active tool, so the highlight always
     * shows which category the running tool belongs to.
     */
    const childActive =
        STATICS_TOOL_MENUS[tool.id]?.some(
            item =>
                item.id ===
                drawingState.activeTool
        ) ||
        false;

    const active =
        drawingState.activeTool ===
            tool.id ||
        childActive ||
        (
            tool.id ===
                "coordinate-system" &&
            drawingState.activeTool ===
                "coordinate-system-2d"
        );

    const shortcut =
        tool.shortcut
            ? ` (${tool.shortcut})`
            : "";

    /*
     * Tools that open a submenu advertise it, so the
     * affordance matches the existing coordinate-system
     * and polygon buttons.
     */
    const coordinateAttributes =
        tool.id ===
            "coordinate-system" ||
        tool.submenu
            ? ' aria-haspopup="menu" aria-expanded="false"'
            : "";

    const submenuCaret =
        tool.submenu
            ? ' <span class="drawing-tool-caret" aria-hidden="true">▾</span>'
            : "";

    return `
        <button
            class="drawing-tool${active ? " active" : ""}"
            type="button"
            data-tool-id="${tool.id}"
            title="${tool.label}${shortcut}"
            aria-label="${tool.label}${shortcut}"
            aria-pressed="${active}"
            ${coordinateAttributes}
        >
            <span class="drawing-tool-icon" aria-hidden="true">
                ${toolIcons[tool.label] || ""}
            </span>
            <span>${tool.label}${submenuCaret}</span>
        </button>
    `;
}

function closeCoordinateSystemMenu() {
    if (coordinateSystemMenu) {
        coordinateSystemMenu.remove();
        coordinateSystemMenu = null;
    }

    if (coordinateSystemMenuAnchor) {
        coordinateSystemMenuAnchor.setAttribute(
            "aria-expanded",
            "false"
        );

        coordinateSystemMenuAnchor = null;
    }
}

/*
 * Small prompt for the polygon's side count.
 *
 * This belongs to the creation workflow, so it is a
 * transient popup rather than part of the Features
 * panel. Confirming it commits the polygon.
 */
function openPolygonSidesPrompt(
    interaction
) {
    closePolygonSidesPrompt();

    const prompt =
        document.createElement("div");

    prompt.className =
        "drawing-polygon-prompt";

    prompt.setAttribute(
        "role",
        "dialog"
    );

    prompt.innerHTML = `
        <label class="drawing-polygon-prompt-label" for="polygonSidesInput">
            Number of Sides
        </label>
        <div class="drawing-polygon-prompt-row">
            <input id="polygonSidesInput" type="number"
                min="3" step="1" value="${polygonSideCount(interaction)}">
            <button type="button" data-polygon-confirm>OK</button>
        </div>
    `;

    document.body.appendChild(
        prompt
    );

    const input =
        prompt.querySelector(
            "#polygonSidesInput"
        );

    const confirm = () => {
        const sides =
            Math.round(
                Number(input.value)
            );

        /*
         * Reject anything that cannot form a polygon.
         */
        if (
            !Number.isFinite(sides) ||
            sides < 3
        ) {
            input.value =
                String(
                    polygonSideCount(
                        interaction
                    )
                );

            setToolMessage(
                "Number of sides must be 3 or more"
            );

            return;
        }

        interaction.polygonSides =
            sides;

        closePolygonSidesPrompt();

        commitPolygon(interaction);
    };

    prompt.querySelector(
        "[data-polygon-confirm]"
    ).addEventListener(
        "click",
        confirm
    );

    input.addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                event.preventDefault();
                confirm();
            }
        }
    );

    /*
     * Live preview while the count changes.
     */
    input.addEventListener("input", () => {
        const sides =
            Math.round(
                Number(input.value)
            );

        if (
            Number.isFinite(sides) &&
            sides >= 3
        ) {
            interaction.polygonSides =
                sides;

            const geometry =
                polygonFromCursor(
                    interaction,
                    interaction.currentPoint
                );

            interaction.preview =
                geometry
                    ? createPreview(
                        "polygon",
                        geometry
                    )
                    : null;

            renderCurrentDrawing();
        }
    });

    setToolMessage(
        "Specify number of sides"
    );

    input.focus();
    input.select();

    polygonSidesPrompt =
        prompt;
}

function closePolygonSidesPrompt() {
    if (polygonSidesPrompt) {
        polygonSidesPrompt.remove();
        polygonSidesPrompt = null;
    }
}

/*
 * Create the polygon from the confirmed definition and
 * select it, so its Features panel opens immediately.
 */
function commitPolygon(
    interaction
) {
    const geometry =
        polygonFromCursor(
            interaction,
            interaction.currentPoint
        );

    if (!geometry) {
        setToolMessage(
            "Specify polygon radius"
        );

        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const object =
        enggDrawingState.geometryFactories.polygon(
            geometry.center,

            geometry.radius,

            geometry.sides,

            geometry.rotation,

            {
                style: {
                    ...drawingState.styleDefaults
                },

                /*
                 * Remember how the polygon was defined so
                 * the Features panel can show the matching
                 * parameters. The feature type stays
                 * "polygon" either way.
                 */
                metadata: {
                    definition:
                        interaction.polygonMode ===
                        "sides"
                            ? "By Sides"
                            : "By Centre"
                },

                engineering:
                    currentEngineeringMetadata()
            }
        );

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Specify polygon centre"
    );

    renderProperties();
    renderCurrentDrawing();
}

function openPolygonMenu(button) {
    if (!button) {
        return;
    }

    if (
        coordinateSystemMenu &&
        coordinateSystemMenuAnchor ===
            button
    ) {
        closeCoordinateSystemMenu();
        return;
    }

    closeCoordinateSystemMenu();

    const currentMode =
        drawingState.interaction.polygonMode ||
        "sides";

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-coordinate-submenu";

    menu.setAttribute(
        "role",
        "menu"
    );

    menu.innerHTML = `
        <button
            type="button"
            class="drawing-coordinate-submenu-item${currentMode === "sides" ? " active" : ""}"
            role="menuitem"
            data-polygon-mode="sides"
        >
            By Sides
        </button>

        <button
            type="button"
            class="drawing-coordinate-submenu-item${currentMode === "centre" ? " active" : ""}"
            role="menuitem"
            data-polygon-mode="centre"
        >
            By Centre
        </button>
    `;

    document.body.appendChild(menu);

    const buttonRect =
        button.getBoundingClientRect();

    const menuRect =
        menu.getBoundingClientRect();

    const gap = 4;
    const margin = 8;

    let left =
        buttonRect.right +
        gap;

    if (
        left +
            menuRect.width >
        window.innerWidth -
            margin
    ) {
        left =
            buttonRect.left -
            menuRect.width -
            gap;
    }

    let top =
        buttonRect.top;

    if (
        top +
            menuRect.height >
        window.innerHeight -
            margin
    ) {
        top =
            Math.max(
                margin,
                window.innerHeight -
                    menuRect.height -
                    margin
            );
    }

    menu.style.left =
        `${Math.max(margin, left)}px`;

    menu.style.top =
        `${top}px`;

    button.setAttribute(
        "aria-expanded",
        "true"
    );

    menu.querySelectorAll(
        "[data-polygon-mode]"
    ).forEach(
        item => {
            item.addEventListener(
                "click",
                () => {
                    closeCoordinateSystemMenu();

                    enggDrawingState.setActiveTool(
                        drawingState,
                        "polygon"
                    );

                    drawingState.interaction.polygonMode =
                        item.dataset
                            .polygonMode;

                    /*
                     * The first instruction depends on the
                     * chosen creation method.
                     */
                    setToolMessage(
                        drawingState.interaction
                            .polygonMode ===
                            "sides"
                            ? "Specify first point"
                            : "Specify polygon centre"
                    );

                    renderEngineeringTools(
                        activeCategory()
                    );

                    renderCurrentDrawing();
                }
            );
        }
    );

    coordinateSystemMenu =
        menu;

    coordinateSystemMenuAnchor =
        button;
}

function openArcMenu(button) {
    if (!button) {
        return;
    }

    if (
        coordinateSystemMenu &&
        coordinateSystemMenuAnchor ===
            button
    ) {
        closeCoordinateSystemMenu();
        return;
    }

    closeCoordinateSystemMenu();

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-coordinate-submenu";

    menu.setAttribute(
        "role",
        "menu"
    );

    menu.innerHTML = `
        <button
            type="button"
            class="drawing-coordinate-submenu-item"
            role="menuitem"
            data-arc-mode="centrepoint"
        >
            Centrepoint Arc
        </button>

        <button
            type="button"
            class="drawing-coordinate-submenu-item"
            role="menuitem"
            data-arc-mode="three-point"
        >
            3-Point Arc
        </button>
    `;

    document.body.appendChild(menu);

    const buttonRect =
        button.getBoundingClientRect();

    const menuRect =
        menu.getBoundingClientRect();

    const gap = 4;
    const margin = 8;

    let left =
        buttonRect.right +
        gap;

    if (
        left +
            menuRect.width >
        window.innerWidth -
            margin
    ) {
        left =
            buttonRect.left -
            menuRect.width -
            gap;
    }

    let top =
        buttonRect.top;

    if (
        top +
            menuRect.height >
        window.innerHeight -
            margin
    ) {
        top =
            Math.max(
                margin,
                window.innerHeight -
                    menuRect.height -
                    margin
            );
    }

    menu.style.left =
        `${Math.max(margin, left)}px`;

    menu.style.top =
        `${top}px`;

    button.setAttribute(
        "aria-expanded",
        "true"
    );

    menu.querySelectorAll(
        "[data-arc-mode]"
    ).forEach(
        item => {
            item.addEventListener(
                "click",
                () => {
                    const mode =
                        item.dataset
                            .arcMode;

                    closeCoordinateSystemMenu();

                    enggDrawingState.setActiveTool(
                        drawingState,
                        "arc"
                    );

                    drawingState.interaction.arcMode =
                        mode;

                    setToolMessage(
                        mode ===
                            "three-point"
                            ? "Specify first point"
                            : "Specify arc centre"
                    );

                    renderEngineeringTools(
                        activeCategory()
                    );

                    renderCurrentDrawing();
                }
            );
        }
    );

    coordinateSystemMenu =
        menu;

    coordinateSystemMenuAnchor =
        button;
}

/*
 * Shared submenu component.
 *
 * Every tool that has options opens the same popup: the
 * same element, classes, positioning, keyboard and
 * click-outside behaviour. Callers only supply the items.
 *
 * Each item is { id, label }, and the chosen id is passed
 * to the onSelect callback.
 */
function openToolSubmenu(
    button,
    items,
    onSelect
) {
    if (!button) {
        return;
    }

    if (
        coordinateSystemMenu &&
        coordinateSystemMenuAnchor ===
            button
    ) {
        closeCoordinateSystemMenu();
        return;
    }

    closeCoordinateSystemMenu();

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-coordinate-submenu";

    menu.setAttribute(
        "role",
        "menu"
    );

    menu.innerHTML =
        items
            .map(
                item => `
                    <button
                        type="button"
                        class="drawing-coordinate-submenu-item"
                        role="menuitem"
                        data-submenu-id="${item.id}"
                    >
                        ${item.label}
                    </button>
                `
            )
            .join("");

    document.body.appendChild(menu);

    const buttonRect =
        button.getBoundingClientRect();

    const menuRect =
        menu.getBoundingClientRect();

    const gap = 4;
    const margin = 8;

    let left =
        buttonRect.right +
        gap;

    let top =
        buttonRect.top;

    if (
        left + menuRect.width >
        window.innerWidth - margin
    ) {
        left =
            Math.max(
                margin,
                buttonRect.left -
                    menuRect.width -
                    gap
            );
    }

    if (
        top + menuRect.height >
        window.innerHeight - margin
    ) {
        top =
            Math.max(
                margin,
                window.innerHeight -
                    menuRect.height -
                    margin
            );
    }

    menu.style.position =
        "fixed";

    menu.style.left =
        `${left}px`;

    menu.style.top =
        `${top}px`;

    menu.style.zIndex =
        "9999";

    menu.querySelectorAll(
        ".drawing-coordinate-submenu-item"
    ).forEach(
        option => {
            option.addEventListener(
                "click",
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    const id =
                        option.dataset
                            .submenuId;

                    closeCoordinateSystemMenu();

                    onSelect(id);
                }
            );
        }
    );

    coordinateSystemMenu =
        menu;

    coordinateSystemMenuAnchor =
        button;
}

/*
 * The six Statics creation categories and their tools.
 * Each parent opens a submenu; the child is the tool that
 * actually starts a drawing operation.
 */
const STATICS_TOOL_MENUS = {
    body: [
        { id: "particle", label: "Particle" },
        { id: "rigid-body", label: "Rigid Body" },
        { id: "beam", label: "Beam" },
        { id: "truss", label: "Truss" },
        { id: "cable", label: "Cable" },
        { id: "shaft", label: "Shaft" }
    ],

    moment: [
        { id: "applied-moment", label: "Applied Moment" },
        { id: "couple", label: "Couple" }
    ],

    load: [
        { id: "distributed-load", label: "Distributed Load" },
        {
            id: "varying-distributed-load",
            label: "Varying Distributed Load"
        }
    ],

    support: [
        { id: "pin-support", label: "Pin Support" },
        { id: "roller-support", label: "Roller Support" },
        { id: "fixed-support", label: "Fixed Support" },
        { id: "smooth-support", label: "Smooth Support" }
    ],

    connection: [
        { id: "pin-connection", label: "Pin Connection" },
        { id: "fixed-connection", label: "Fixed Connection" },
        { id: "slider-connection", label: "Slider Connection" }
    ]
};

/*
 * Every Statics feature tool, with the label shown in the
 * status line and the authoritative feature type it creates.
 *
 * A Point Force is listed here as a direct tool rather than
 * behind a submenu, and the type it records is `force`, which
 * is the Point Force feature. Force Pair, Point Load and the
 * old generic Force/Moment/Support entries are gone: there is
 * exactly one tool and one feature type per real feature.
 */
const STATICS_CHILD_TOOLS = {
    particle: { label: "Particle", type: "particle" },
    "rigid-body": { label: "Rigid Body", type: "rigid-body" },
    beam: { label: "Beam", type: "beam" },
    truss: { label: "Truss", type: "truss" },
    cable: { label: "Cable", type: "cable" },
    shaft: { label: "Shaft", type: "shaft" },

    "point-force": { label: "Point Force", type: "force" },

    "applied-moment": { label: "Applied Moment", type: "moment" },
    couple: { label: "Couple", type: "couple" },

    "distributed-load": { label: "Distributed Load", type: "load" },
    "varying-distributed-load": {
        label: "Varying Distributed Load",
        type: "varying-load"
    },

    "pin-support": { label: "Pin Support", type: "pin-support" },
    "roller-support": {
        label: "Roller Support",
        type: "roller-support"
    },
    "fixed-support": { label: "Fixed Support", type: "fixed-support" },
    "smooth-support": {
        label: "Smooth Support",
        type: "smooth-support"
    },

    "pin-connection": {
        label: "Pin Connection",
        type: "pin-connection"
    },
    "fixed-connection": {
        label: "Fixed Connection",
        type: "fixed-connection"
    },
    "slider-connection": {
        label: "Slider Connection",
        type: "slider-connection"
    },

    "reference-point": {
        label: "Reference Point",
        type: "point"
    }
};

/*
 * Open a Statics category submenu. Choosing an item records
 * the support/connection variant on the interaction so the
 * created feature keeps its specific type, then starts the
 * tool through the normal activation path.
 */
function openStaticsMenu(
    button,
    categoryId
) {
    const items =
        STATICS_TOOL_MENUS[categoryId];

    if (!items) {
        return;
    }

    openToolSubmenu(
        button,
        items,
        childId => {
            activateTool(
                childId
            );

            /*
             * activateTool already sets the opening
             * instruction for the tool, which is "Select
             * body" for the tools that need a body. Setting a
             * second message here would overwrite it with the
             * old free-space wording.
             */
            setToolMessage(
                initialToolMessage(
                    childId
                )
            );
        }
    );
}

/*
 * The canonical name of every Statics feature, keyed by its
 * authoritative feature type.
 *
 * This is the one place a Statics feature is named, so the
 * toolbar, the Feature Tree and the Features panel all call
 * it the same thing: a `load` is a Distributed Load
 * everywhere, never "load" and never a Distributed Force.
 */
/*
 * Statics features that reuse an existing geometry type.
 *
 * Their canonical name is that of the geometry itself, so a
 * Reference Point is not allowed to rename a plain Point.
 */
const SHARED_STATICS_GEOMETRY = [
    "point",
    "line"
];

const STATICS_FEATURE_LABELS = Object.fromEntries(
    Object.entries(
        STATICS_CHILD_TOOLS
    )
        /*
         * A Reference Point reuses the ordinary point
         * geometry, so its `point` type is shared with plain
         * Points. Only types unique to a Statics feature are
         * renamed here; shared geometry keeps its own name.
         */
        .filter(
            ([, definition]) =>
                !SHARED_STATICS_GEOMETRY.includes(
                    definition.type
                )
        )
        .map(([toolId, definition]) => [
            definition.type,
            definition.label
        ])
);

/*
 * Statics features that can be attached to a body.
 *
 * A force, a load or a support reads as acting on whatever
 * it was snapped onto, so it may become that body's child.
 * A body or a member cannot be a child of another body, and
 * a reference feature belongs to no one.
 */
function attachableStaticsType(
    type
) {
    return [
        "force",
        "load",
        "varying-load",
        "moment",
        "couple",
        "pin-support",
        "roller-support",
        "fixed-support",
        "smooth-support"
    ].includes(type);
}

/*
 * The bodies a Statics feature may attach to.
 *
 * Only real bodies are eligible, so a force snapped onto a
 * Beam becomes part of that Beam, while one snapped onto a
 * stray Line stays unattached rather than adopting geometry
 * that has no engineering meaning.
 */
const STATICS_ATTACHABLE_FEATURES = [
    "particle",
    "rigid-body",
    "beam",
    "truss",
    "cable",
    "shaft"
];

/*
 * The Statics tools that act on a body, so they begin by
 * asking for one rather than placing themselves in free
 * space.
 *
 * A tool is body-attached when the feature only has meaning
 * relative to something it acts on. A Reference Line or a
 * free Point Force is not, and those keep placing directly.
 */
const STATICS_BODY_ATTACHED_TOOLS = [
    "distributed-load",
    "varying-distributed-load",
    "applied-moment",
    "couple",
    "pin-support",
    "roller-support",
    "fixed-support",
    "smooth-support",
    "pin-connection",
    "fixed-connection",
    "slider-connection"
];

/*
 * How many points a body-attached tool needs before it can be
 * confirmed.
 *
 * A support or a moment is defined by a single point on its
 * body. A load needs the two ends of the region it loads. A
 * connection needs an attachment on each of the two bodies it
 * joins.
 */
const STATICS_TOOL_POINT_COUNT = {
    "distributed-load": 2,
    "varying-distributed-load": 2,
    "applied-moment": 1,
    "couple": 1,
    "pin-support": 1,
    "roller-support": 1,
    "fixed-support": 1,
    "smooth-support": 1,
    "pin-connection": 2,
    "fixed-connection": 2,
    "slider-connection": 2
};

/*
 * Whether a Statics tool must be given a body before it can
 * place anything.
 */
function isBodyAttachedTool(
    toolId
) {
    return STATICS_BODY_ATTACHED_TOOLS.includes(
        toolId
    );
}

/*
 * How many points a body-attached tool still needs.
 */
function staticsToolPointCount(
    toolId
) {
    return (
        STATICS_TOOL_POINT_COUNT[toolId] ?? 1
    );
}

/*
 * The status a body-attached tool shows at each step.
 *
 * The wording is written for the person using it, and each
 * step says what the next action is rather than describing
 * internal state.
 */
function staticsBodyMessage(
    toolId,
    step
) {
    const count =
        staticsToolPointCount(toolId);

    if (step === 0) {
        return "Select body";
    }

    if (isConnectionType(
        STATICS_CHILD_TOOLS[toolId]?.type
    )) {
        if (step === 1) {
            return "Select second body";
        }

        return "Pick connection location";
    }

    if (
        toolId === "distributed-load" ||
        toolId === "varying-distributed-load"
    ) {
        if (step === 1) {
            return "Pick magnitude of end load";
        }

        return "Pick magnitude and location of second end load";
    }

    if (isSupportType(
        STATICS_CHILD_TOOLS[toolId]?.type
    )) {
        return step === 1
            ? "Pick attachment location"
            : "Specify support orientation";
    }

    if (count > 1) {
        return "Pick first location";
    }

    return "Pick application point";
}

/*
 * The id of the body a snapped point belongs to, or null
 * when the snap did not land on an eligible engineering
 * body. This reads the existing snap candidate; it never
 * searches for one of its own.
 */
function staticsAttachmentId(
    snapCandidate
) {
    const objectId =
        snapCandidate?.objectId;

    if (!objectId) {
        return null;
    }

    const target =
        drawingState.objects.find(
            object =>
                object.id ===
                    objectId
        );

    if (
        !target ||
        !STATICS_ATTACHABLE_FEATURES.includes(
            target.type
        )
    ) {
        return null;
    }

    return target.id;
}

/*
 * The valid placement locations along a body.
 *
 * These are the points a load can start or end at, a moment
 * can be applied, or a support can attach. They are derived
 * from the body's own geometry, so they always sit on the
 * body as it is drawn right now.
 *
 * They are preview-only. They are never added to the feature
 * collection, so they cannot appear in the Feature Tree or be
 * selected on their own.
 */
function bodyPlacementLocations(
    body,
    count
) {
    const g = body.geometry || {};

    const total =
        count || 6;

    if (total < 1) {
        return [];
    }

    /*
     * A span body is divided along its own axis, which is what
     * makes a loaded region read as part of the member.
     */
    if (g.start && g.end) {
        return Array.from(
            { length: total },
            (_, index) => ({
                x:
                    g.start.x +
                    ((g.end.x - g.start.x) *
                        index) /
                        (total - 1 || 1),

                y:
                    g.start.y +
                    ((g.end.y - g.start.y) *
                        index) /
                        (total - 1 || 1)
            })
        );
    }

    /*
     * A located body offers a ring of points around its
     * centre, so a load or a support can be placed on it
     * rather than only at one spot.
     */
    const centre =
        enggFeatureGeometry.centerOf(
            g,
            body.type
        );

    if (!centre) {
        return [];
    }

    const radius =
        body.type === "rigid-body"
            ? Math.max(
                  (g.width || 0) / 2,
                  (g.height || 0) / 2
              )
            : 10;

    return Array.from(
        { length: total },
        (_, index) => {
            const angle =
                (Math.PI * 2 * index) /
                total;

            return {
                x: centre.x + radius * Math.cos(angle),
                y: centre.y + radius * Math.sin(angle)
            };
        }
    );
}

/*
 * The opening instruction for each Statics child tool, so
 * the status line always says what to do next.
 */
function staticsInstruction(
    toolId
) {
    return (
        {
            particle: "Specify particle location",
            "rigid-body": "Specify body location",
            beam: "Specify beam start point",
            truss: "Specify truss start point",
            cable: "Specify cable start point",
            shaft: "Specify shaft start point",

            "point-force": "Specify force start point",

            "distributed-load": "Specify loading start point",
            "varying-distributed-load": "Specify loading start point",

            "applied-moment": "Specify moment location",
            couple: "Specify couple location",

            "pin-support": "Specify support location",
            "roller-support": "Specify support location",
            "fixed-support": "Specify support location",
            "smooth-support": "Specify support location",

            "pin-connection": "Specify connection start point",
            "fixed-connection": "Specify connection start point",
            "slider-connection": "Specify connection start point",

            "reference-point": "Specify reference point location",
            "reference-line": "Specify first point"
        }[toolId] || "Specify location"
    );
}

/*
 * The second-click instruction for the span tools, so a
 * Point Force asks for its endpoint the same way a Line
 * does, rather than borrowing the load wording.
 */
function staticsSpanInstruction(
    toolId
) {
    return (
        {
            "point-force": "Specify force endpoint",
            beam: "Specify beam endpoint",
            truss: "Specify truss endpoint",
            cable: "Specify cable endpoint",
            shaft: "Specify shaft endpoint",

            "distributed-load": "Specify loading end point",
            "varying-distributed-load": "Specify loading end point",

            "pin-connection": "Specify connection end point",
            "fixed-connection": "Specify connection end point",
            "slider-connection": "Specify connection end point",

            "reference-line": "Specify second point"
        }[toolId] || "Specify second point"
    );
}

/*
 * Section headings for the support and connection variants.
 *
 * Every variant is a real feature in its own right, so the
 * Features panel names the one the student placed instead of
 * collapsing them into a single generic Support or Connection
 * heading.
 */
function staticsSupportSection(
    type
) {
    return {
        "pin-support": "PIN SUPPORT",
        "roller-support": "ROLLER SUPPORT",
        "fixed-support": "FIXED SUPPORT",
        "smooth-support": "SMOOTH SUPPORT"
    }[type] || "SUPPORT";
}

function staticsConnectionSection(
    type
) {
    return {
        "pin-connection": "PIN CONNECTION",
        "fixed-connection": "FIXED CONNECTION",
        "slider-connection": "SLIDER CONNECTION"
    }[type] || "CONNECTION";
}

function openCoordinateSystemMenu(button) {
    if (!button) {
        return;
    }

    if (
        coordinateSystemMenu &&
        coordinateSystemMenuAnchor ===
            button
    ) {
        closeCoordinateSystemMenu();
        return;
    }

    closeCoordinateSystemMenu();

    const menu =
        document.createElement("div");

    menu.className =
        "drawing-coordinate-submenu";

    menu.setAttribute(
        "role",
        "menu"
    );

    menu.innerHTML = `
        <button
            type="button"
            class="drawing-coordinate-submenu-item"
            role="menuitem"
            data-coordinate-mode="2d"
        >
            2D Coordinate System
        </button>

        <button
            type="button"
            class="drawing-coordinate-submenu-item"
            role="menuitem"
            data-coordinate-mode="3d"
        >
            3D Coordinate System
        </button>
    `;

    document.body.appendChild(menu);

    const buttonRect =
        button.getBoundingClientRect();

    const menuRect =
        menu.getBoundingClientRect();

    const gap = 4;
    const margin = 8;

    let left =
        buttonRect.right +
        gap;

    let top =
        buttonRect.top;

    if (
        left + menuRect.width >
        window.innerWidth - margin
    ) {
        left =
            Math.max(
                margin,
                buttonRect.left -
                    menuRect.width -
                    gap
            );
    }

    if (
        top + menuRect.height >
        window.innerHeight - margin
    ) {
        top =
            Math.max(
                margin,
                window.innerHeight -
                    menuRect.height -
                    margin
            );
    }

    menu.style.position =
        "fixed";

    menu.style.left =
        `${left}px`;

    menu.style.top =
        `${top}px`;

    menu.style.zIndex =
        "9999";

    menu.querySelectorAll(
        ".drawing-coordinate-submenu-item"
    ).forEach(
        option => {
            option.addEventListener(
                "click",
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    const mode =
                        option.dataset
                            .coordinateMode;

                    closeCoordinateSystemMenu();

                    if (mode === "2d") {
                        activate2DCoordinateSystemTool();
                    } else {
                        setToolMessage(
                            "3D Coordinate System is not available on the 2D drawing canvas"
                        );
                    }
                }
            );
        }
    );

    coordinateSystemMenu = menu;
    coordinateSystemMenuAnchor = button;

    button.setAttribute(
        "aria-expanded",
        "true"
    );
}

/*
 * Statics analysis tools.
 *
 * These assist a student's own reasoning rather than
 * solving the problem for them: they report the sums and
 * resolved components of whatever is currently selected,
 * and leave the interpretation to the user. Nothing here
 * invents unknowns or picks a solution.
 */
const STATICS_ANALYSIS_TOOLS = [
    "free-body-diagram",
    "equilibrium",
    "resultant",
    "force-components",
    "moment-analysis"
];

/*
 * Selected statics features, or every statics feature when
 * nothing is selected, so a tool still does something
 * useful on a bare diagram.
 */
function selectedStaticsFeatures() {
    const selected =
        drawingState.selection
            .selectedObjectIds;

    return drawingState.objects.filter(
        object =>
            object.engineering?.discipline ===
                "statics" &&
            (selected.length
                ? selected.includes(
                    object.id
                )
                : true)
    );
}

function forcesOf(
    features
) {
    return features.filter(
        object =>
            object.type === "force"
    );
}

function componentOf(
    force
) {
    const radians =
        (Number(force.geometry.angle) || 0) *
        Math.PI /
        180;

    const magnitude =
        Number(force.geometry.magnitude) || 0;

    return {
        x: magnitude * Math.cos(radians),
        y: magnitude * Math.sin(radians)
    };
}

/*
 * Format a number for the status line, trimming pointless
 * decimals while keeping the sign readable.
 */
function formatAmount(
    value
) {
    return Number(value).toFixed(2);
}

function runStaticsAnalysis(
    toolId
) {
    const features =
        selectedStaticsFeatures();

    const forces =
        forcesOf(features);

    if (
        !features.length
    ) {
        setToolMessage(
            "Add or select statics features first"
        );

        return;
    }

    if (
        toolId === "resultant"
    ) {
        if (!forces.length) {
            setToolMessage(
                "Resultant needs at least one force"
            );

            return;
        }

        const sum =
            forces.reduce(
                (
                    total,
                    force
                ) => {
                    const part =
                        componentOf(force);

                    return {
                        x: total.x + part.x,
                        y: total.y + part.y
                    };
                },
                { x: 0, y: 0 }
            );

        const magnitude =
            Math.hypot(sum.x, sum.y);

        const angle =
            Math.atan2(sum.y, sum.x) *
            180 /
            Math.PI;

        setToolMessage(
            `Resultant of ${forces.length}: ${formatAmount(magnitude)} N at ${formatAmount(angle)}°`
        );

        return;
    }

    if (
        toolId === "force-components"
    ) {
        if (!forces.length) {
            setToolMessage(
                "Select a force to resolve"
            );

            return;
        }

        const force =
            forces[0];

        const part =
            componentOf(force);

        setToolMessage(
            `${force.name}: X ${formatAmount(part.x)} N, Y ${formatAmount(part.y)} N`
        );

        return;
    }

    if (
        toolId === "moment-analysis"
    ) {
        /*
         * Moments are summed about the first support the
         * student has placed, which is the usual reference
         * point for the calculation, falling back to the
         * origin when there is none.
         */
        const pivotFeature =
            features.find(
                object =>
                    object.type ===
                        "pin-support" ||
                    object.type ===
                        "roller-support" ||
                    object.type ===
                        "fixed-support" ||
                    object.type ===
                        "smooth-support"
            );

        const pivot =
            pivotFeature?.geometry.position || {
                x: 0,
                y: 0
            };

        const total =
            features.reduce(
                (
                    sum,
                    object
                ) => {
                    if (
                        object.type === "moment"
                    ) {
                        const magnitude =
                            Number(
                                object.geometry
                                    .magnitude
                            ) || 0;

                        return (
                            sum +
                            (object.geometry
                                .clockwise
                                ? -magnitude
                                : magnitude)
                        );
                    }

                    if (
                        object.type === "force"
                    ) {
                        const part =
                            componentOf(
                                object
                            );

                        const dx =
                            object.geometry
                                .position.x -
                            pivot.x;

                        const dy =
                            object.geometry
                                .position.y -
                            pivot.y;

                        return (
                            sum +
                            dx * part.y -
                            dy * part.x
                        );
                    }

                    return sum;
                },
                0
            );

        setToolMessage(
            `Sum of moments about ${pivotFeature?.name || "origin"}: ${formatAmount(total)} N·m`
        );

        return;
    }

    if (
        toolId === "equilibrium"
    ) {
        /*
         * Reports how far the current system is from
         * balance. It deliberately does not adjust anything
         * to achieve balance.
         */
        const sum =
            forces.reduce(
                (
                    total,
                    force
                ) => {
                    const part =
                        componentOf(force);

                    return {
                        x: total.x + part.x,
                        y: total.y + part.y
                    };
                },
                { x: 0, y: 0 }
            );

        const balanced =
            Math.abs(sum.x) < 1e-6 &&
            Math.abs(sum.y) < 1e-6;

        setToolMessage(
            balanced
                ? "Selected forces are in equilibrium"
                : `Not balanced: ΣFx ${formatAmount(sum.x)} N, ΣFy ${formatAmount(sum.y)} N`
        );

        return;
    }

    if (
        toolId === "free-body-diagram"
    ) {
        /*
         * Outlines what would appear on a free-body
         * diagram and flags anything still marked Unknown,
         * which is what the student has to resolve.
         */
        const unknowns = [];

        features.forEach(
            object => {
                Object.keys(
                    object.unknownValues || {}
                ).forEach(
                    key => {
                        if (
                            object.unknownValues[
                                key
                            ] === true
                        ) {
                            unknowns.push(
                                `${object.name} ${key}`
                            );
                        }
                    }
                );
            }
        );

        setToolMessage(
            unknowns.length
                ? `${features.length} features · unknown: ${unknowns.join(", ")}`
                : `${features.length} features · no unknowns marked`
        );
    }
}

function renderEngineeringTools(
    category
) {
    const safeCategory =
        engineeringTools[category]
            ? category
            : "GEOMETRY";

    toolHeading.textContent =
        `${safeCategory} TOOLS`;

    if (
        safeCategory ===
            "GEOMETRY" ||
        disciplineToolGroups[safeCategory]
    ) {
        /*
         * GEOMETRY and STATICS are organised into labelled
         * sections; every other discipline stays a flat
         * list of tools.
         */
        const groups =
            safeCategory === "GEOMETRY"
                ? drawingToolGroups
                : disciplineToolGroups[safeCategory];

        toolList.innerHTML =
            groups
                .map(
                    group => `
                        <section
                            class="drawing-tool-group"
                            aria-labelledby="drawing-group-${group.id}"
                        >
                            <h3
                                class="drawing-tool-group-label"
                                id="drawing-group-${group.id}"
                            >
                                ${group.label}
                            </h3>

                            ${group.tools
                                .map(
                                    renderToolButton
                                )
                                .join("")}
                        </section>
                    `
                )
                .join("");
    } else {
        /*
         * Every discipline section leads with Select, so
         * each one can be left cleanly from the same
         * place. The remaining tools are unchanged.
         */
        const disciplineTools = [
            {
                id: "select",
                label: "Select",
                shortcut: "Esc"
            },

            ...engineeringTools[
                safeCategory
            ].map(
                label =>
                    toolDefinitionForLabel(
                        label
                    )
            )
        ];

        toolList.innerHTML =
            disciplineTools
                .map(
                    renderToolButton
                )
                .join("");
    }

    toolList
        .querySelectorAll(
            ".drawing-tool"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    event => {
                        const toolId =
                            button.dataset
                                .toolId;

                        if (
                            toolId ===
                            "coordinate-system"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openCoordinateSystemMenu(
                                button
                            );

                            return;
                        }

                        if (
                            toolId ===
                            "polygon"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openPolygonMenu(
                                button
                            );

                            return;
                        }

                        /*
                         * A Statics category opens its submenu
                         * and does not itself start a drawing
                         * operation; the child item does that.
                         */
                        if (
                            STATICS_TOOL_MENUS[
                                toolId
                            ]
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openStaticsMenu(
                                button,
                                toolId
                            );

                            return;
                        }

                        if (
                            STATICS_ANALYSIS_TOOLS.includes(
                                toolId
                            )
                        ) {
                            event.preventDefault();

                            /*
                             * Analysis reads the current
                             * selection and reports, so it
                             * never becomes the active tool.
                             */
                            enggDrawingState.setActiveTool(
                                drawingState,
                                "select"
                            );

                            runStaticsAnalysis(
                                toolId
                            );

                            renderEngineeringTools(
                                activeCategory()
                            );

                            renderCurrentDrawing();
                            return;
                        }

                        if (
                            toolId ===
                            "arc"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openArcMenu(
                                button
                            );

                            return;
                        }

                        activateTool(
                            toolId
                        );
                    }
                );
            }
        );
}

function setToolMessage(
    message
) {
    drawingToolMessage.textContent =
        message;
}

function activate2DCoordinateSystemTool() {
    enggDrawingState.setActiveTool(
        drawingState,
        "coordinate-system-2d"
    );

    drawingState.interaction.phase =
        "idle";

    setToolMessage(
        "Specify origin"
    );

    renderEngineeringTools(
        activeCategory()
    );

    renderCurrentDrawing();
}

function activateTool(
    toolId
) {
    if (
        toolId ===
        "coordinate-system"
    ) {
        openCoordinateSystemMenu(
            toolList.querySelector(
                '[data-tool-id="coordinate-system"]'
            )
        );

        return;
    }

    /*
     * Choosing Select always abandons whatever the
     * previous tool was doing, so a half-finished
     * operation can never be left running underneath.
     */
    if (
        toolId === "select"
    ) {
        closePolygonSidesPrompt();

        clearGlobalToolHighlight();

        enggDrawingState.clearInteraction(
            drawingState
        );

        drawingState.selection
            .boxSelectionIds = [];

        enggDrawingState.setActiveTool(
            drawingState,
            "select"
        );

        setToolMessage(
            "Select geometry"
        );

        renderEngineeringTools(
            activeCategory()
        );

        renderCurrentDrawing();
        return;
    }

    /*
     * Re-clicking the active tool cancels it, so the user is
     * never stuck inside it. Tools that place a feature are
     * the exception: once one has been committed the
     * operation is finished, so re-clicking simply keeps them
     * armed for placing another one.
     *
     * A body-attached tool counts as a placement tool, because
     * it too ends by creating a feature rather than by
     * finishing a drawing. Without this, picking a second
     * attached tool while the first is still active would
     * toggle it off instead of switching to it.
     */
    const isPlacementTool =
        Boolean(
            STATICS_PLACEMENT_TOOLS[
                toolId
            ]
        ) ||
        isBodyAttachedTool(toolId) ||
        toolId === "truss" ||
        toolId === "point";

    const nextTool =
        drawingState.activeTool ===
                toolId &&
            !isPlacementTool
            ? "select"
            : toolId;

    /*
     * Picking any tool from the geometry list ends any
     * running Modify or View tool.
     */
    cancelModifySession();
    clearGlobalToolHighlight();

    closePolygonSidesPrompt();

    enggDrawingState.setActiveTool(
        drawingState,
        nextTool
    );

    /*
     * A freshly activated tool gets its own opening
     * instruction; otherwise the previous tool's
     * instruction would linger.
     */
    setToolMessage(
        initialToolMessage(
            nextTool
        )
    );

    renderEngineeringTools(
        activeCategory()
    );

    renderCurrentDrawing();
}

/*
 * The instruction a tool should show the moment it is
 * activated, so stale messages never carry over.
 */
function initialToolMessage(
    toolId
) {
    /*
     * A Statics tool carries its own opening instruction, so
     * a direct tool like Point Force tells the student what to
     * click next without opening a popup first.
     */
    if (
        isBodyAttachedTool(toolId)
    ) {
        /*
         * A body-attached feature begins by asking for the body
         * it acts on, rather than letting the student place it
         * in free space and attach it afterwards.
         */
        return staticsBodyMessage(toolId, 0);
    }

    if (
        STATICS_CHILD_TOOLS[toolId]
    ) {
        return staticsInstruction(
            toolId
        );
    }

    return (
        {
            select: "Select geometry",
            point: "Specify point",
            line: "Specify line start point",
            polyline: "Specify first point",
            triangle: "Specify first point",
            circle: "Specify centre point",
            rectangle: "Specify first corner",
            pan: "Drag to pan the view"
        }[toolId] || "Ready"
    );
}

function updateHistoryControls() {
    drawingUndo.disabled =
        !enggDrawingState.canUndo(
            drawingState
        );

    drawingRedo.disabled =
        !enggDrawingState.canRedo(
            drawingState
        );
}

function performUndo() {
    if (
        enggDrawingState.undo(
            drawingState
        )
    ) {
        renderProperties();
        renderCurrentDrawing();
        setToolMessage(
            "Ready"
        );
    }
}

function performRedo() {
    if (
        enggDrawingState.redo(
            drawingState
        )
    ) {
        renderProperties();
        renderCurrentDrawing();
        setToolMessage(
            "Ready"
        );
    }
}

function canvasPointFromEvent(
    event,
    shouldSnap = false
) {
    const bounds =
        drawingCanvas.getBoundingClientRect();

    const width =
        drawingCanvas.clientWidth;

    const height =
        drawingCanvas.clientHeight;

    return enggDrawingState.screenToEngineering(
        {
            x:
                event.clientX -
                bounds.left,

            y:
                event.clientY -
                bounds.top
        },
        {
            width,
            height
        },
        drawingState,
        shouldSnap
    );
}

function isConstructionTool(
    toolId
) {
    /*
     * Statics placement and span tools are listed here too,
     * so they run through the same construction pipeline
     * as geometry and pick up snapping and inference.
     */
    return (
        [
            "point",
            "line",
            "polyline",
            "triangle",
            "polygon",
            "circle",
            "arc",
            "rectangle"
        ].includes(toolId) ||
        Boolean(STATICS_PLACEMENT_TOOLS[toolId]) ||
        Boolean(STATICS_BODY_ATTACHED_TOOLS[toolId]) ||
        toolId === "truss" ||
        Boolean(STATICS_SPAN_TOOLS[toolId])
    );
}

/*
 * Statics features are placed with a single click, then
 * edited through the Features panel. They reuse the
 * existing point-resolution pipeline so snapping and
 * inference work exactly as for geometry.
 */
/*
 * Statics tools that are placed with a single click.
 *
 * Derived from STATICS_CHILD_TOOLS so a tool listed in a
 * submenu always has a creation path and can never be
 * silently unhandled.
 */
const STATICS_SINGLE_CLICK_TOOLS = [
    "particle",
    "rigid-body",
    "applied-moment",
    "couple",
    "pin-support",
    "roller-support",
    "fixed-support",
    "smooth-support",
    "reference-point"
];

const STATICS_PLACEMENT_TOOLS = Object.fromEntries(
    STATICS_SINGLE_CLICK_TOOLS.map(id => [
        id,
        STATICS_CHILD_TOOLS[id] || {
            label: id,
            type: id
        }
    ])
);

/*
 * Tools that span two points, so they need a second click.
 */
const STATICS_SPAN_TOOLS = {
    "point-force": "Point Force",
    beam: "Beam",
    cable: "Cable",
    shaft: "Shaft",

    "distributed-load": "Distributed Load",
    "varying-distributed-load": "Varying Distributed Load",

    "pin-connection": "Pin Connection",
    "fixed-connection": "Fixed Connection",
    "slider-connection": "Slider Connection",

    "reference-line": "Reference Line"
};

/*
 * The stages a Truss is built in.
 *
 * A truss is a structure, not a span, so it is constructed the
 * way a structure is: a base line, then the outer shape that
 * encloses it, then the members inside. Each stage reuses the
 * ordinary Line interaction, so the snapping and the inference
 * are the same ones every other line uses.
 */
const TRUSS_STAGES = [
    {
        id: "base",
        prompt: "Specify base start point",
        followUp: "Specify base endpoint"
    },
    {
        id: "outer",
        prompt: "Construct outer shape"
    },
    {
        id: "internal",
        prompt: "Construct internal connectors"
    }
];

/*
 * A member of a truss that is being built.
 *
 * Construction members are temporary: they exist only while the
 * truss is being drawn and become the one Truss feature on
 * completion.
 */
function trussMember(
    start,
    end
) {
    return {
        start: { ...start },
        end: { ...end }
    };
}

/*
 * Every point in a truss construction, in order.
 *
 * These are the joints. A member endpoint that lands on one of
 * them is connected, and a floating endpoint that lands on none
 * is what makes the structure invalid.
 */
function trussJoints(
    members
) {
    return members.flatMap(member => [
        member.start,
        member.end
    ]);
}

/*
 * Whether a point matches a joint closely enough to be one.
 *
 * The tolerance is in world units and scales with the zoom, so
 * a snap reads the same however far the drawing is zoomed in or
 * out.
 */
function trussJointMatches(
    a,
    b
) {
    if (
        !a ||
        !b ||
        !Number.isFinite(a.x) ||
        !Number.isFinite(b.x)
    ) {
        return false;
    }

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
            drawingState.camera.zoom ||
        1;

    return (
        Math.hypot(a.x - b.x, a.y - b.y) *
            scale <=
        8
    );
}

/*
 * Whether every member belongs to one connected structure.
 *
 * Connectivity is checked by flood fill from the first member:
 * a member is part of the truss when it shares a joint with a
 * member already reached. Anything the fill never reaches is
 * floating, which is what a member drawn away from the rest of
 * the structure is.
 *
 * This is a real topological test rather than a count, so a
 * member that merely overlaps another one is still caught.
 */
function trussIsConnected(
    members
) {
    if (!members.length) {
        return false;
    }

    const reached = [members[0]];

    let grew = true;

    while (grew) {
        grew = false;

        members.forEach(member => {
            if (reached.includes(member)) {
                return;
            }

            const joins =
                reached.some(other =>
                    trussMembersTouch(other, member)
                );

            if (joins) {
                reached.push(member);
                grew = true;
            }
        });
    }

    return reached.length === members.length;
}

/*
 * Whether two members share a joint.
 *
 * A member connects to another when one member's end meets the
 * other's end. Overlapping middles are not a connection, because
 * a structural joint is at a joint.
 */
function trussMembersTouch(
    a,
    b
) {
    return [a.start, a.end].some(point =>
        [b.start, b.end].some(other =>
            trussJointMatches(point, other)
        )
    );
}

/*
 * Whether a point lies inside the closed outline the student drew.
 *
 * A crossing ray test: a point is inside a closed outline when a
 * ray cast from it crosses the outline an odd number of times.
 * It is what keeps an internal member from leaving the boundary
 * the student established.
 */
function trussPointInsideOutline(
    point,
    outline
) {
    if (
        !point ||
        !outline ||
        outline.length < 3
    ) {
        return false;
    }

    let inside = false;

    for (
        let i = 0, j = outline.length - 1;
        i < outline.length;
        j = i, i += 1
    ) {
        const a = outline[i];
        const b = outline[j];

        if (
            (a.y > point.y) !== (b.y > point.y) &&
            point.x <
                ((b.x - a.x) *
                    (point.y - a.y)) /
                    (b.y - a.y) +
                    a.x
        ) {
            inside = !inside;
        }
    }

    return inside;
}

/*
 * Snap a point that is being placed onto the truss's own joints.
 *
 * The ordinary Snap already finds the endpoints of a Line, so
 * this only has to recognise that an endpoint landing on an
 * existing truss joint is a connection rather than a new loose
 * point. It never searches for a snap of its own.
 */
function trussSnapToJoint(
    point,
    members
) {
    const joints = trussJoints(members);

    const match = joints.find(joint =>
        trussJointMatches(point, joint)
    );

    return match
        ? { x: match.x, y: match.y }
        : point;
}

/*
 * The instruction the Truss shows at each construction stage.
 */
function trussStageMessage(
    interaction
) {
    const stage =
        interaction.trussStage;

    const stageInfo =
        TRUSS_STAGES[stage];

    /*
     * The base needs two points before it is a member, so it
     * says which end it is waiting for.
     */
    if (
        stage === 0 &&
        !(
            interaction.trussMembers || []
        ).length
    ) {
        return TRUSS_STAGES[0].prompt;
    }

    if (
        stage === 0 &&
        (
            interaction.trussMembers || []
        ).length < 1
    ) {
        return TRUSS_STAGES[0].followUp;
    }

    if (stage === 1) {
        return (
            "Construct outer shape — " +
            "Enter to move to internal members"
        );
    }

    if (stage === 2) {
        return (
            "Construct internal connectors — " +
            "Enter to finish"
        );
    }

    return stageInfo?.prompt ||
        "Construct outer shape";
}

/*
 * Advance a truss construction by one placed point.
 *
 * The base is the first member. After it, each click either
 * continues the member in progress or starts the next one, so
 * the whole outline and then all the internal members are drawn
 * with the same click-drag-click rhythm as a line.
 *
 * An internal member may not leave the outline the student drew,
 * so a point outside it is rejected and the previous point is
 * kept instead.
 */
function continueTrussConstruction(
    resolution
) {
    const interaction =
        drawingState.interaction;

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    const stage = interaction.trussStage ?? 0;

    const members =
        interaction.trussMembers || [];

    const outline =
        interaction.trussOutline || [];

    const inProgress = point
        ? interaction.trussInProgress
        : null;

    /*
     * A point in an internal member has to stay inside the
     * boundary. Refusing it here is what stops a connector from
     * extending the structure past what the student enclosed.
     */
    if (
        stage === 2 &&
        outline.length >= 3 &&
        !(
            trussPointInsideOutline(point, outline) ||
            trussJoints(members).some(
                joint =>
                    trussJointMatches(
                        point,
                        joint
                    )
            )
        )
    ) {
        setToolMessage(
            "Internal members must stay inside the outer shape"
        );

        return;
    }

    /*
     * A snap that lands on an existing truss joint is treated as
     * a connection, so the member meets the structure exactly
     * rather than ending a hair away from it.
     */
    const resolved = trussSnapToJoint(
        point,
        members
    );

    if (!inProgress) {
        enggDrawingState.setInteraction(
            drawingState,
            {
                ...resolution,
                phase: "truss-construct",

                /*
                 * startPoint is what the shared preview reads to
                 * decide there is a span to draw. Without it the
                 * member in progress would be accepted but never
                 * shown.
                 */
                startPoint: resolved,
                currentPoint: resolved,
                trussStage: stage,
                trussMembers: members,
                trussOutline: outline,
                trussInProgress: resolved
            }
        );

        setToolMessage(
            trussStageMessage(
                drawingState.interaction
            )
        );

        renderCurrentDrawing();
        return;
    }

    const nextMembers = [
        ...members,
        trussMember(inProgress, resolved)
    ];

    /*
     * The outline is the chain of points the student traced
     * around the base, kept so an internal member can be checked
     * against it later.
     */
    const nextOutline =
        stage === 0
            ? [inProgress, resolved]
            : [...outline, resolved];

    /*
     * The base is finished as soon as it is one member long, so
     * the student moves straight on to the outer shape.
     */
    const nextStage =
        stage === 0 ? 1 : stage;

    enggDrawingState.setInteraction(
        drawingState,
        {
            ...resolution,
            phase: "truss-construct",
            startPoint: null,
            currentPoint: resolved,
            trussStage: nextStage,
            trussMembers: nextMembers,
            trussOutline: nextOutline,
            trussInProgress: null
        }
    );

    setToolMessage(
        trussStageMessage(
            drawingState.interaction
        )
    );

    renderCurrentDrawing();
}

/*
 * Finish a truss construction and create the one feature.
 *
 * The structure is checked first: a member left floating means
 * the truss is incomplete, and an incomplete truss is not
 * created. Only a valid structure is regularized and committed.
 */
function finishTrussConstruction() {
    const interaction =
        drawingState.interaction;

    const members =
        interaction.trussMembers || [];

    if (!members.length) {
        setToolMessage(
            "Draw at least the base line first"
        );

        return;
    }

    if (!trussIsConnected(members)) {
        setToolMessage(
            "Connect all member endpoints before finishing"
        );

        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * The construction members become the truss's own topology.
     * A light cleanup even out the joints, but it never removes
     * a member or invents one, so what the student drew is what
     * they get.
     */
    const regularized =
        regularizeTruss(members);

    const first = regularized[0];

    const last =
        regularized[
            regularized.length - 1
        ];

    const object =
        enggDrawingState.geometryFactories
            .truss(
                first.start,
                last.end,
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering: {
                        plane: "XY",
                        discipline: "statics",
                        staticsType: "truss"
                    }
                }
            );

    /*
     * The student's members are kept on the feature as its
     * topology, so a joint can be moved and the members that
     * meet it follow.
     */
    object.geometry.members =
        regularized;

    object.geometry.panels =
        Math.max(
            2,
            regularized.length
        );

    enggDrawingState.addObject(
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
}

/*
 * A light cleanup of the joints a student drew.
 *
 * The intent is to make a hand-drawn structure read evenly: a
 * point that is very nearly the same as another is brought onto
 * it, so members that were meant to meet do meet. Nothing is
 * moved far, no member is removed and none is added, so the
 * topology and the proportions the student chose survive.
 */
function regularizeTruss(
    members
) {
    const joints = trussJoints(members);

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
            drawingState.camera.zoom ||
        1;

    /*
     * Points closer together than this on screen are treated as
     * the same joint, so a small drawing error closes.
     */
    const tolerance = 1.5 / scale;

    const merged = [];

    joints.forEach(point => {
        const existing = merged.find(
            candidate =>
                Math.hypot(
                    candidate.x - point.x,
                    candidate.y - point.y
                ) <= tolerance
        );

        if (existing) {
            /*
             * Average the two points rather than snapping to
             * whichever came first, so neither end of the
             * structure is favoured.
             */
            existing.x =
                (existing.x + point.x) / 2;
            existing.y =
                (existing.y + point.y) / 2;

            return;
        }

        merged.push({
            x: point.x,
            y: point.y
        });
    });

    return members.map(member => ({
        start:
            merged.find(
                point =>
                    Math.hypot(
                        point.x - member.start.x,
                        point.y - member.start.y
                    ) <= tolerance
            ) || { ...member.start },

        end:
            merged.find(
                point =>
                    Math.hypot(
                        point.x - member.end.x,
                        point.y - member.end.y
                    ) <= tolerance
            ) || { ...member.end }
    }));
}

/*
 * Start a truss construction.
 *
 * The construction is temporary state held on the interaction:
 * the members drawn so far, the outline they sit in, and the
 * stage. It becomes one feature only when it is finished, so
 * cancelling leaves nothing behind.
 */
/*
 * Throw away a truss that is being built.
 *
 * The construction is temporary state, so cancelling simply
 * drops it: no feature is created and nothing the student drew
 * is kept. That is what makes both Esc and Undo recover the
 * original drawing rather than a cleaned-up version of it.
 */
function cancelTrussConstruction() {
    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.setActiveTool(
        drawingState,
        "select"
    );

    setToolMessage(
        "Select geometry"
    );

    renderEngineeringTools(activeCategory());
    renderProperties();
    renderCurrentDrawing();
}

function beginTrussConstruction() {
    enggDrawingState.setInteraction(
        drawingState,
        {
            phase: "truss-construct",
            trussStage: 0,
            trussMembers: [],
            trussOutline: [],
            trussInProgress: null
        }
    );

    setToolMessage(
        TRUSS_STAGES[0].prompt
    );

    renderCurrentDrawing();
}function createStaticsFeature(
    toolId,
    point,
    parentId
) {
    const definition =
        STATICS_PLACEMENT_TOOLS[toolId];

    if (!definition) {
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const style = {
        style: {
            ...drawingState.styleDefaults
        },

        engineering: {
            plane: "XY",
            discipline: "statics",

            /*
             * Records which statics tool created this
             * feature, so the panel can name it correctly
             * even when it reuses ordinary point or line
             * geometry.
             */
            staticsType: toolId
        },

        /*
         * Reference features are named for their statics
         * role rather than their underlying geometry, so a
         * Reference Point reads as such in the tree.
         */
        name:
            toolId === "reference-point" ||
            toolId === "reference-line"
                ? definition.label
                : undefined,

        /*
         * A single-click support or moment snapped onto a
         * body becomes that body's child, exactly as a
         * snapped Point Force does.
         */
        parentId:
            attachableStaticsType(
                definition.type
            )
                ? parentId
                : undefined
    };

    const position = {
        x: point.x,
        y: point.y
    };

    let object;

    /*
     * Dispatch on the feature type the child tool creates,
     * not on the old parent ids, so every submenu item
     * builds the right shape with the right arguments.
     */
    const type =
        definition.type;

    if (type === "force") {
        object =
            enggDrawingState.geometryFactories.force(
                position,
                100,
                0,
                style
            );
    } else if (type === "rigid-body") {
        /*
         * A rigid body starts as a rectangle of a defined
         * default size, centred on the clicked point. The
         * student then resizes and rotates it from the
         * Features panel or by dragging its handles.
         */
        object =
            enggDrawingState.geometryFactories[
                "rigid-body"
            ](
                {
                    x:
                        position.x -
                        RIGID_BODY_WIDTH / 2,

                    y:
                        position.y +
                        RIGID_BODY_HEIGHT / 2
                },

                RIGID_BODY_WIDTH,

                RIGID_BODY_HEIGHT,

                style
            );
    } else if (type === "moment") {
        /*
         * A moment starts at 50 N-m, turning anticlockwise.
         */
        object =
            enggDrawingState.geometryFactories.moment(
                position,
                50,
                false,
                style
            );
    } else if (type === "couple") {
        /*
         * A couple starts at 50 N-m over a 20 mm
         * separation, turning anticlockwise.
         */
        object =
            enggDrawingState.geometryFactories.couple(
                position,
                50,
                20,
                false,
                style
            );
    } else if (type === "connection") {
        /*
         * A connection is drawn as a short link so it is
         * visible before its second end is chosen.
         */
        object =
            enggDrawingState.geometryFactories.connection(
                position,
                {
                    x: point.x + 20,
                    y: point.y
                },
                style
            );
    } else if (
        typeof enggDrawingState.geometryFactories[
            type
        ] === "function"
    ) {
        object =
            enggDrawingState.geometryFactories[
                type
            ](
                position,
                style
            );
    } else {
        return;
    }

    enggDrawingState.addObject(
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
        `Specify ${definition.label.toLowerCase()} position`
    );

    renderProperties();
    renderCurrentDrawing();
}

function resolvePointerPoint(
    rawPoint
) {
    if (
        !isConstructionTool(
            drawingState.activeTool
        )
    ) {
        return {
            rawPointerPoint: {
                ...rawPoint
            },

            effectiveConstructionPoint: {
                ...rawPoint
            },

            snappedPoint: null,
            inferredPoint: null,
            snapCandidate: null,
            hoveredEntity: null,
            inference: null
        };
    }

    const bounds =
        drawingCanvas.getBoundingClientRect();

    const interaction =
        drawingState.interaction;

    /*
     * While the arc centre is being placed, the first arc
     * point is the inference anchor, so the centre can
     * align with it horizontally and vertically.
     */
    const arcCentrePhase =
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-centre";

    /*
     * During the arc sweep phase, use the centre as
     * the inference anchor so horizontal and vertical
     * inference work while placing the endpoint.
     */
    const arcEndpointPhase =
        drawingState.activeTool ===
            "arc" &&
        (
            interaction.phase ===
                "arc-sweep" ||
            interaction.phase ===
                "arc-second"
        );

    const isPolyline =
        drawingState.activeTool ===
            "polyline";

    /*
     * The line tool needs its first point as the inference
     * anchor so horizontal and vertical inference works
     * while placing the second point.
     */
    const isLine =
        drawingState.activeTool ===
            "line";

    let lineStart = null;

    if (isLine) {
        lineStart =
            interaction.startPoint;
    } else if (isPolyline) {
        lineStart =
            interaction.points.length
                ? interaction.points[
                    interaction.points.length - 1
                ]
                : null;
    } else if (
        drawingState.activeTool ===
            "triangle"
    ) {
        /*
         * While placing the second and third
         * corners, the previously placed corner is
         * the inference anchor, so the new point can
         * align with it horizontally and vertically.
         */
        lineStart =
            interaction.points.length
                ? interaction.points[
                    interaction.points.length - 1
                ]
                : null;
    } else if (
        arcCentrePhase
    ) {
        /*
         * The already placed first arc point anchors the
         * centre point, using the same inference pipeline
         * as every other tool.
         */
        lineStart =
            interaction.points.length
                ? interaction.points[0]
                : interaction.startPoint;
    } else if (
        arcEndpointPhase
    ) {
        lineStart =
            interaction.points.length
                ? interaction.points[0]
                : interaction.startPoint;
    }

    /*
     * The 3-point arc anchors on the second point,
     * because the third point is what closes the arc.
     */
    if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-second" &&
        interaction.points.length > 1
    ) {
        lineStart =
            interaction.points[1];
    }

    /*
     * While placing the triangle's third corner, or the
     * 3-point arc's third point, both earlier points act
     * as H/V inference references, so the new point can
     * align with either of them.
     */
    const multiPointAnchor =
        (drawingState.activeTool === "triangle" ||
            (drawingState.activeTool === "arc" &&
                interaction.phase === "arc-second")) &&
        interaction.points.length >= 2;

    const inferenceReferences =
        multiPointAnchor
            ? [
                interaction.points[0],
                interaction.points[1]
            ]
            : [];

    return drawingSnap.resolveConstructionPoint(
        {
            ...rawPoint
        },
        drawingState,
        bounds,
        {
            lineStart,

            inferenceReferences,

            /*
             * Treat arc endpoint placement
             * like a line so horizontal and
             * vertical inference works.
             */
            tool:
                arcEndpointPhase
                    ? "line"
                    : drawingState.activeTool
        }
    );
}

/*
 * Resolve directly from the current pointer event.
 *
 * This is deliberately used for actual clicks as
 * well as mouse movement so the click can never
 * accidentally use a stale snap position from
 * a previous mousemove event.
 */
function resolvePointerEvent(
    event
) {
    return resolvePointerPoint(
        canvasPointFromEvent(
            event,
            false
        )
    );
}

/*
 * Human-readable names for the snap and inference
 * types produced by the existing detection.
 */
const SNAP_TYPE_LABELS = {
    endpoint: "Endpoint",
    midpoint: "Midpoint",
    center: "Center",
    intersection: "Intersection",
    quadrant: "Quadrant",
    pointOnEntity: "Point on object",
    horizontal: "Horizontal",
    vertical: "Vertical",
    "horizontal-vertical": "Horizontal + Vertical"
};

function snapTypeLabel(
    type
) {
    if (!type) {
        return null;
    }

    if (SNAP_TYPE_LABELS[type]) {
        return SNAP_TYPE_LABELS[type];
    }

    const text = String(type);

    return text[0].toUpperCase() + text.slice(1);
}

function inferenceLabel(
    inference
) {
    return snapTypeLabel(
        inference?.type || inference
    );
}

function updateInteractionFeedback(
    resolution
) {
    const point =
        resolution.effectiveConstructionPoint;

    if (point) {
        drawingCoordinates.textContent =
            `X: ${Number(point.x).toFixed(1)} Y: ${Number(point.y).toFixed(1)} mm`;
    }

    /*
     * Arc placement phases each have their own
     * instruction, with snap and inference taking
     * priority when they are active.
     */
    if (
        drawingState.activeTool ===
        "arc"
    ) {
        const instruction = {
            "arc-centre":
                "Specify arc start point",

            "arc-sweep":
                "Specify arc endpoint",

            "arc-first":
                "Specify point on arc",

            "arc-second":
                "Specify third point"
        }[
            drawingState.interaction.phase
        ];

        if (instruction) {
            const feedback =
                [
                    inferenceLabel(
                        resolution.inference
                    ),

                    snapTypeLabel(
                        resolution
                            .snapCandidate
                            ?.type
                    )
                ].filter(Boolean);

            setToolMessage(
                feedback.length
                    ? feedback.join(
                        " · "
                    )
                    : instruction
            );

            return;
        }
    }

    const feedback = [
        inferenceLabel(
            resolution.inference
        ),

        snapTypeLabel(
            resolution.snapCandidate?.type
        )
    ].filter(Boolean);

    if (
        feedback.length
    ) {
        setToolMessage(
            feedback.join(
                " · "
            )
        );

        return;
    }

    if (
        drawingState.interaction.phase !==
        "idle"
    ) {
        return;
    }

    if (
        drawingState.activeTool ===
        "coordinate-system-2d"
    ) {
        setToolMessage(
            "Specify origin"
        );

        return;
    }

    if (
        drawingState.activeTool ===
        "line"
    ) {
        setToolMessage(
            "Specify line start point"
        );

        return;
    }

    if (
        drawingState.activeTool ===
        "triangle"
    ) {
        setToolMessage(
            "Specify first point"
        );
    }
}

function updateDrawingCoordinates(
    event
) {
    /*
     * Always calculate from the current
     * pointer event.
     */
    const resolution =
        resolvePointerEvent(
            event
        );

    enggDrawingState.setInteraction(
        drawingState,
        resolution
    );

    syncSelectionInteraction();

    updateInteractionFeedback(
        resolution
    );

    /*
     * A running Modify session shows its own ghost
     * preview; otherwise the tool's construction preview
     * is used.
     */
    if (modifySession) {
        updateModifyPreview(
            resolution
        );

        setToolMessage(
            modifyInstruction(
                modifySession
            )
        );
    } else {
        updatePreview(
            resolution
        );
    }

    renderCurrentDrawing();
}

/*
 * Instruction text for the current Modify stage.
 */
function modifyInstruction(
    session
) {
    if (
        session.kind === "mirror" &&
        session.stage === "base"
    ) {
        return session.ids.length
            ? `${session.ids.length} selected · click empty space to set the mirror axis`
            : "Select objects to mirror";
    }

    return {
        move:
            session.stage === "base"
                ? "Specify base point"
                : "Specify destination",

        rotate:
            session.stage === "base"
                ? "Specify rotation pivot"
                : "Specify rotation angle",

        mirror:
            session.stage === "axis-end"
                ? "Specify second point"
                : "Select mirror line or point",

        trim:
            session.stage === "base"
                ? "Select the boundary to trim against"
                : "Select the segment to trim",

        extend:
            session.stage === "base"
                ? "Select the boundary to extend to"
                : "Select the geometry to extend"
    }[session.kind] || "Ready";
}

function distance(
    first,
    second
) {
    return Math.hypot(
        second.x - first.x,
        second.y - first.y
    );
}

function rectangleGeometry(
    first,
    second
) {
    const left =
        Math.min(
            first.x,
            second.x
        );

    const top =
        Math.max(
            first.y,
            second.y
        );

    return {
        position: {
            x: left,
            y: top
        },

        width:
            Math.abs(
                second.x -
                first.x
            ),

        height:
            Math.abs(
                second.y -
                first.y
            ),

        rotation: 0
    };
}

function circumcenter(
    first,
    second,
    third
) {
    const denominator =
        2 *
        (
            first.x *
                (
                    second.y -
                    third.y
                ) +

            second.x *
                (
                    third.y -
                    first.y
                ) +

            third.x *
                (
                    first.y -
                    second.y
                )
        );

    if (
        Math.abs(
            denominator
        ) < 1e-9
    ) {
        return null;
    }

    const firstSquare =
        first.x * first.x +
        first.y * first.y;

    const secondSquare =
        second.x * second.x +
        second.y * second.y;

    const thirdSquare =
        third.x * third.x +
        third.y * third.y;

    return {
        x:
            (
                firstSquare *
                    (
                        second.y -
                        third.y
                    ) +

                secondSquare *
                    (
                        third.y -
                        first.y
                    ) +

                thirdSquare *
                    (
                        first.y -
                        second.y
                    )
            ) /
            denominator,

        y:
            (
                firstSquare *
                    (
                        third.x -
                        second.x
                    ) +

                secondSquare *
                    (
                        first.x -
                        third.x
                    ) +

                thirdSquare *
                    (
                        second.x -
                        first.x
                    )
            ) /
            denominator
    };
}

/*
 * Normalise an angle into (-PI, PI].
 *
 * Every angle in the centrepoint arc goes through
 * this one function, so the whole calculation stays
 * in a single system and never mixes 0..2PI values
 * with -PI..PI values.
 */
function normalizeAngle(
    angle
) {
    if (!Number.isFinite(angle)) {
        return 0;
    }

    const twoPi =
        2 * Math.PI;

    let result =
        (
            angle +
            Math.PI
        ) %
        twoPi;

    if (result < 0) {
        result +=
            twoPi;
    }

    return (
        result -
        Math.PI
    );
}

/*
 * Signed sweep from one angle to another, taking
 * the short way round. The result is always in
 * (-PI, PI], so crossing the 0/360 boundary is a
 * small step instead of a full turn.
 */
function angleDifference(
    from,
    to
) {
    return normalizeAngle(
        to -
        from
    );
}

/*
 * Unwrap a cursor angle so it stays continuous as
 * the user moves around the centre.
 *
 * atan2 jumps from +PI to -PI when the cursor
 * crosses the 180 degree line. Comparing the new
 * sample with the previous one and adding the
 * smallest signed step keeps the running angle
 * increasing (or decreasing) smoothly:
 *
 *   179 -> 180 -> 181
 *
 * instead of folding 181 back to -179. The
 * returned angle is intentionally outside
 * (-PI, PI] once the user has travelled past a
 * half turn, which is exactly what preserves the
 * direction of travel.
 */
function unwrapAngle(
    angle,
    previousAngle
) {
    if (!Number.isFinite(previousAngle)) {
        return angle;
    }

    return (
        previousAngle +
        angleDifference(
            previousAngle,
            angle
        )
    );
}

/*
 * Build an arc from a centre, a radius start point
 * and an endpoint.
 *
 * The sweep is derived from the unwrapped cursor
 * angle, so it grows continuously through 180
 * degrees and never reverses. Small arcs stay
 * small, and large arcs are produced naturally
 * once the cursor has travelled more than half a
 * turn.
 */
function arcFromCentrePoints(
    center,
    start,
    end,
    cursorAngle
) {
    const radius =
        distance(
            center,
            start
        );

    if (
        radius <=
        1e-9
    ) {
        return null;
    }

    const startAngle =
        Math.atan2(
            start.y - center.y,
            start.x - center.x
        );

    /*
     * The caller supplies a continuous cursor angle.
     * When it is not available, fall back to the
     * endpoint so the arc is still well defined.
     */
    const continuousAngle =
        Number.isFinite(
            cursorAngle
        )
            ? cursorAngle
            : Math.atan2(
                end.y - center.y,
                end.x - center.x
            );

    /*
     * Sweep is the raw difference, so it is allowed
     * to exceed PI and keep its sign. That is what
     * makes the arc continue in one direction past
     * the half-way point instead of flipping.
     */
    const sweep =
        continuousAngle -
        startAngle;

    if (
        Math.abs(
            sweep
        ) <=
        1e-9
    ) {
        return null;
    }

    return {
        center: {
            ...center
        },

        radius,

        startAngle,

        endAngle:
            startAngle + sweep,

        sweep
    };
}

/*
 * Build the circumcircle arc through three points.
 * This is the geometry the 3-point arc mode uses,
 * so the arc passes through the clicked points
 * instead of creating unrelated geometry.
 */
function arcThroughThreePoints(
    first,
    second,
    third
) {
    const center =
        circumcenter(
            first,
            second,
            third
        );

    if (!center) {
        return null;
    }

    const radius =
        distance(
            center,
            first
        );

    if (
        radius <=
        1e-9
    ) {
        return null;
    }

    const firstAngle =
        Math.atan2(
            first.y - center.y,
            first.x - center.x
        );

    const secondDelta =
        normalizeAngle(
            Math.atan2(
                second.y - center.y,
                second.x - center.x
            ) -
            firstAngle
        );

    const thirdDelta =
        normalizeAngle(
            Math.atan2(
                third.y - center.y,
                third.x - center.x
            ) -
            firstAngle
        );

    /*
     * The arc must pass through the middle point, so
     * the sweep runs in the direction that reaches it.
     */
    const clockwise =
        secondDelta <
        0;

    const endDelta =
        clockwise
            ? (
                thirdDelta >
                0
                    ? thirdDelta - 2 * Math.PI
                    : thirdDelta
            )
            : (
                thirdDelta <
                0
                    ? thirdDelta + 2 * Math.PI
                    : thirdDelta
            );

    if (
        Math.abs(
            endDelta
        ) <=
        1e-9
    ) {
        return null;
    }

    return {
        center: {
            ...center
        },

        radius,

        startAngle:
            firstAngle,

        endAngle:
            firstAngle +
            endDelta,

        sweep:
            endDelta
    };
}

/*
 * Single source of truth for the centrepoint arc.
 *
 * Both the live preview and the final creation call
 * this function with the same point, so the stored
 * geometry is always identical to what was on
 * screen at the moment of the click.
 *
 * The cursor angle is unwrapped against the last
 * sample so it keeps increasing past 180 degrees
 * instead of folding back and reversing the arc.
 * The unwrapped value is written back to the
 * interaction so the next sample continues from it.
 */
function resolveCentrepointArc(
    interaction,
    point
) {
    if (
        !point ||
        interaction.points.length < 2
    ) {
        return null;
    }

    const center =
        interaction.points[0];

    const start =
        interaction.points[1];

    const cursorAngle =
        unwrapAngle(
            Math.atan2(
                point.y -
                    center.y,
                point.x -
                    center.x
            ),
            interaction.arcCursorAngle
        );

    interaction.arcCursorAngle =
        cursorAngle;

    return arcFromCentrePoints(
        center,
        start,
        point,
        cursorAngle
    );
}

function createPreview(
    type,
    geometry
) {
    return {
        id:
            `preview-${type}`,

        type,

        geometry,

        style: {
            stroke: "#1f5c38",
            fill: "none",
            lineWidth: 0.5,
            lineType: "dashed",
            opacity: 1
        }
    };
}

function updatePreview(
    resolution
) {
    const interaction =
        drawingState.interaction;

    if (
        interaction.phase ===
            "idle" ||
        !interaction.startPoint
    ) {
        return;
    }

    const point =
        resolution.effectiveConstructionPoint;

    interaction.currentPoint =
        point;

    if (
        drawingState.activeTool ===
            "line"
    ) {
        interaction.preview =
            createPreview(
                "line",
                {
                    start:
                        interaction.startPoint,

                    end:
                        point
                }
            );

        if (
            !resolution.inference &&
            !resolution.snapCandidate
        ) {
            setToolMessage(
                "Specify line endpoint"
            );
        } else {
            /*
             * An active inference or snap owns the
             * status line, so show its name instead of
             * letting a stale message linger.
             */
            const feedback =
                [
                    inferenceLabel(
                        resolution.inference
                    ),

                    snapTypeLabel(
                        resolution
                            .snapCandidate
                            ?.type
                    )
                ].filter(Boolean);

            if (feedback.length) {
                setToolMessage(
                    feedback.join(
                        " · "
                    )
                );
            }
        }
    } else if (
        drawingState.activeTool ===
        "circle"
    ) {
        interaction.preview =
            createPreview(
                "circle",
                {
                    center:
                        interaction.startPoint,

                    radius:
                        distance(
                            interaction.startPoint,
                            point
                        )
                }
            );

        setToolMessage(
            "Specify radius"
        );
    } else if (
        drawingState.activeTool ===
        "rectangle"
    ) {
        interaction.preview =
            createPreview(
                "rectangle",
                rectangleGeometry(
                    interaction.startPoint,
                    point
                )
            );

        setToolMessage(
            "Specify opposite corner"
        );
    } else if (
        drawingState.activeTool ===
        "polyline"
    ) {
        interaction.preview =
            createPreview(
                "polyline",
                {
                    points: [
                        ...interaction.points,
                        point
                    ]
                }
            );

        setToolMessage(
            "Click next point or double-click to finish"
        );
    } else if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-centre"
    ) {
        /*
         * Radius phase: show the circle the cursor
         * is describing around the fixed centre.
         */
        const radius =
            distance(
                interaction.points[0],
                point
            );

        if (
            radius >
            1e-9
        ) {
            interaction.preview =
                createPreview(
                    "circle",
                    {
                        center: {
                            ...interaction.points[0]
                        },

                        radius
                    }
                );
        } else {
            interaction.preview =
                null;
        }

        setToolMessage(
            "Specify arc start point"
        );
    } else if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-sweep"
    ) {
        /*
         * Sweep phase: live arc from the start point
         * through the cursor.
         */
        const geometry =
            resolveCentrepointArc(
                interaction,
                point
            );

        interaction.preview =
            geometry
                ? createPreview(
                    "arc",
                    geometry
                )
                : null;

        setToolMessage(
            "Specify arc endpoint"
        );
    } else if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-first"
    ) {
        interaction.preview =
            createPreview(
                "line",
                {
                    start:
                        interaction.points[0],

                    end:
                        point
                }
            );

        setToolMessage(
            "Specify point on arc"
        );
    } else if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-second"
    ) {
        /*
         * Third point preview: the circumcircle arc
         * through the two placed points and the cursor.
         */
        const geometry =
            arcThroughThreePoints(
                interaction.points[0],
                interaction.points[1],
                point
            );

        interaction.preview =
            geometry
                ? createPreview(
                    "arc",
                    geometry
                )
                : null;

        /*
         * An active inference or snap owns the status line,
         * otherwise show the next instruction. Without this
         * the plain instruction would overwrite the
         * Horizontal / Vertical / snap label set by the
         * feedback pass, because the preview runs after it.
         */
        const feedback =
            [
                inferenceLabel(
                    resolution.inference
                ),

                snapTypeLabel(
                    resolution.snapCandidate?.type
                )
            ].filter(Boolean);

        setToolMessage(
            feedback.length
                ? feedback.join(" · ")
                : "Specify third point"
        );
    } else if (
        drawingState.activeTool ===
        "triangle"
    ) {
        /*
         * Live preview of all three sides, closed
         * back to the first point.
         */
        interaction.preview =
            createPreview(
                "triangle",
                {
                    points: [
                        ...interaction.points,
                        point
                    ],

                    closed: true
                }
            );

        /*
         * An active inference or snap owns the status
         * line, otherwise show the next instruction.
         */
        const feedback =
            [
                inferenceLabel(
                    resolution.inference
                ),

                snapTypeLabel(
                    resolution.snapCandidate?.type
                )
            ].filter(Boolean);

        setToolMessage(
            feedback.length
                ? feedback.join(" · ")
                : interaction.points.length < 2
                    ? "Specify second point"
                    : "Specify third point"
        );
    } else if (
        drawingState.activeTool ===
            "polygon" &&
        (
            interaction.phase ===
                "polygon-centre" ||
            interaction.phase ===
                "polygon-first"
        )
    ) {
        /*
         * Live polygon. By Centre sizes it from the
         * centre, By Sides builds it from the first
         * edge, but both feed the same preview.
         */
        const geometry =
            polygonFromCursor(
                interaction,
                point
            );

        interaction.preview =
            geometry
                ? createPreview(
                    "polygon",
                    geometry
                )
                : null;

        const feedback =
            [
                inferenceLabel(
                    resolution.inference
                ),

                snapTypeLabel(
                    resolution.snapCandidate?.type
                )
            ].filter(Boolean);

                const instruction =
                    interaction.phase ===
                    "polygon-first"
                    ? "Specify second point"
                    : "Specify polygon radius";

                setToolMessage(
                    feedback.length
                        ? feedback.join(" · ")
                        : instruction
                );
            } else if (
                drawingState.interaction.phase ===
                    "truss-construct"
            ) {
                /*
                 * Live preview of the member in progress. It is drawn
                 * from the same start point the committed member will
                 * use, so the preview and the result agree.
                 */
                interaction.preview =
                    createPreview(
                        "line",
                        {
                            start:
                                interaction.trussInProgress,
                            end: point
                        }
                    );

                setToolMessage(
                    trussStageMessage(
                        interaction
                    )
                );
            } else if (
                isBodyAttachedTool(
                    drawingState.activeTool
                ) &&
                interaction.phase ===
                    "statics-attach"
            ) {
                /*
                 * Live preview for a body-attached feature.
                 *
                 * The valid locations along the target body are shown
                 * as markers and the body is outlined, so it is clear
                 * what the feature is being attached to and where it
                 * may go. Nothing here enters the feature collection.
                 */
                interaction.preview =
                    bodyAttachedPreview(
                        interaction,
                        resolution,
                        point
                    );

                const attachFeedback =
                    [
                        inferenceLabel(
                            resolution.inference
                        ),

                        snapTypeLabel(
                            resolution.snapCandidate?.type
                        )
                    ].filter(Boolean);

                setToolMessage(
                    attachFeedback.length
                        ? attachFeedback.join(" · ")
                        : staticsBodyMessage(
                              drawingState.activeTool,
                              (interaction.attachmentPoints
                                  ?.length ??
                                  0) + 1
                          )
                );
            } else if (
                STATICS_SPAN_TOOLS[
                    drawingState.activeTool
                ] &&
                interaction.phase ===
                    "statics-span"
            ) {
                /*
                 * Live span preview for the two-click Statics
                 * tools, drawn from the same defining parameters
                 * the committed feature will store, so a Point
                 * Force previews as an arrow and a load as its
                 * span rather than as a plain line.
                 */
                const start = {
                    ...interaction.points[0]
                };

                const end = {
                    x: point.x,
                    y: point.y
                };

                const type =
                    STATICS_CHILD_TOOLS[
                        drawingState.activeTool
                    ]?.type;

                interaction.preview =
                    staticsSpanPreview(
                        type,
                        start,
                        end
                    );

                /*
                 * An active inference or snap owns the status
                 * line, otherwise show the next instruction.
                 */
                const feedback =
                    [
                        inferenceLabel(
                            resolution.inference
                        ),

                        snapTypeLabel(
                            resolution.snapCandidate?.type
                        )
                    ].filter(Boolean);

                                setToolMessage(
                                    feedback.length
                                        ? feedback.join(" · ")
                                        : staticsSpanInstruction(
                                            drawingState.activeTool
                                        )
                                );
                    }
                }

                /*
                 * The preview object for a two-click Statics tool.
         *
         * It reuses the ordinary preview shape for the spans that
         * draw as a line, and a preview type of the feature's own
         * for those that draw as a symbol, so the preview and the
         * committed feature always look the same.
         */
        function staticsSpanPreview(
            type,
            start,
            end
        ) {
            const span = {
                start,
                end
            };

            if (type === "load") {
                return createPreview("load", {
                    ...span,
                    intensity: 10
                });
            }

            if (type === "varying-load") {
                return createPreview("varying-load", {
                    ...span,
                    startIntensity: 0,
                    endIntensity: 10
                });
            }

            if (
                type === "force" ||
                type === "pin-connection" ||
                type === "fixed-connection" ||
                type === "slider-connection"
            ) {
                return createPreview(type, span);
            }

                return createPreview(
                    "line",
                    span
                );
            }

            /*
             * Live preview for a body-attached feature.
             *
             * The valid locations along the target body are shown as small
             * markers, the body is outlined, and the feature to be is drawn
             * from the points placed so far plus the cursor. Nothing here
             * enters the feature collection: the preview is rebuilt on
             * every move and discarded on commit or on Esc.
             */
            function bodyAttachedPreview(
                interaction,
                resolution,
                point
            ) {
                const body =
                    interaction.staticsTarget;

                const placed =
                    interaction.attachmentPoints || [];

                const type =
                    STATICS_CHILD_TOOLS[
                        drawingState.activeTool
                    ]?.type;

                const required =
                    staticsToolPointCount(
                        drawingState.activeTool
                    );

                /*
                 * Once the first end is placed the preview spans from it to
                 * the cursor, which is what makes the whole loaded region
                 * visible while the second end is chosen.
                 */
                const spanPoints =
                    required > 1
                        ? [
                              placed[0] ?? point,
                              placed[1] ?? point
                          ]
                        : [placed[0] ?? point];

                return {
                    id: "preview-statics-attach",
                    type: staticsPreviewType(type),

                    geometry: staticsAttachmentGeometry(
                        type,
                        spanPoints
                    ),

                    /*
                     * The target body and the valid locations ride with the
                     * preview rather than being features of their own, so
                     * they can never be selected or listed.
                     */
                    targetBody: body,
                    locations: placed.length
                        ? []
                        : bodyPlacementLocations(
                              body,
                              6
                          ),

                    style: {
                        stroke: "#1f5c38",
                        fill: "none",
                        lineWidth: 0.5,
                        lineType: "dashed",
                        opacity: 1
                    }
                };
            }

/*
 * The preview type for a Statics feature, so a load previews as
 * a load and a support previews as a support rather than as a
 * plain line.
 */
function staticsPreviewType(
    type
) {
    return (
        [
            "load",
            "varying-load",
            "moment",
            "couple",
            "pin-support",
            "roller-support",
            "fixed-support",
            "smooth-support",
            "pin-connection",
            "fixed-connection",
            "slider-connection"
        ].includes(type)
            ? type
            : "point"
    );
}

/*
 * The preview geometry for a body-attached feature.
 *
 * A span-shaped feature is previewed between its two ends. A
 * point-shaped feature previews at its application point.
 */
function staticsAttachmentGeometry(
    type,
    spanPoints
) {
    if (spanPoints.length > 1) {
        return {
            start: spanPoints[0],
            end: spanPoints[1],
            intensity: 10,
            startIntensity: 0,
            endIntensity: 10
        };
    }

    return {
        position: spanPoints[0]
    };
}

/*
 * Build the polygon definition for the active
 * creation mode.
 *
 * Both modes resolve to the same stored model:
 * centre, radius, sides and rotation. Only the way
 * those are derived from the interaction differs,
 * so there is a single authoritative geometry.
 */
function polygonFromCursor(
    interaction,
    point
) {
    if (
        interaction.polygonMode ===
        "sides"
    ) {
        return polygonFromTwoPoints(
            interaction,
            point
        );
    }

    return polygonFromCentre(
        interaction,
        point
    );
}

/*
 * By Centre: the first click is the centre, and the
 * cursor sets both the radius and the rotation.
 */
function polygonFromCentre(
    interaction,
    point
) {
    const center =
        interaction.points[0];

    if (!center) {
        return null;
    }

    const radius =
        distance(
            center,
            point
        );

    if (
        radius <=
        1e-9
    ) {
        return null;
    }

    return {
        center: {
            ...center
        },

        radius,

        sides:
            polygonSideCount(
                interaction
            ),

        rotation:
            Math.atan2(
                point.y - center.y,
                point.x - center.x
            )
    };
}

/*
 * By Sides: the two clicked points define the first
 * side of the polygon. The centre is the circumcentre
 * of the regular polygon whose first edge runs from
 * the first point to the second, and the rotation is
 * taken from that edge.
 */
function polygonFromTwoPoints(
    interaction,
    point
) {
    const first =
        interaction.points[0];

    if (!first) {
        return null;
    }

    const sideLength =
        distance(
            first,
            point
        );

    if (
        sideLength <=
        1e-9
    ) {
        return null;
    }

    const sides =
        polygonSideCount(
            interaction
        );

    const rotation =
        Math.atan2(
            point.y - first.y,
            point.x - first.x
        );

    /*
     * Circumradius of a regular polygon for a given
     * edge length: R = s / (2 sin(pi / n)).
     *
     * The centre sits at the apothem from the midpoint
     * of the edge, on the inward side.
     */
    const apothem =
        sideLength /
        (
            2 *
            Math.tan(
                Math.PI /
                    sides
            )
        );

    const radius =
        sideLength /
        (
            2 *
            Math.sin(
                Math.PI /
                    sides
            )
        );

    const midpoint = {
        x: (first.x + point.x) / 2,
        y: (first.y + point.y) / 2
    };

    const inward =
        rotation +
        Math.PI / 2;

    return {
        center: {
            x:
                midpoint.x +
                Math.cos(inward) *
                    apothem,

            y:
                midpoint.y +
                Math.sin(inward) *
                    apothem
        },

        radius,

        sides,

        /*
         * The stored rotation places vertex 0 at the
         * first clicked point, so the committed shape
         * starts exactly where the user clicked.
         */
        rotation:
            rotation -
            Math.PI / 2 -
            Math.PI /
                sides
    };
}

/*
 * The side count belongs to the tool, not to the
 * geometry, so the creation modes share one value.
 */
function polygonSideCount(
    interaction
) {
    const sides =
        Math.round(
            Number(
                interaction.polygonSides
            )
        );

    return (
        Number.isFinite(sides) &&
        sides >= 3
            ? sides
            : 6
    );
}

function currentEngineeringMetadata() {
    return {
        plane: "XY"
    };
}

function beginOrCompleteGeometry(
    resolution
) {
    const interaction =
        drawingState.interaction;

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    if (
        interaction.phase ===
        "idle"
    ) {
        /*
         * A Point is defined by a single click, so it is
         * created and committed immediately.
         */
        if (
            drawingState.activeTool ===
            "point"
        ) {
            createPointFeature(
                point
            );

            return;
        }

        /*
         * A Truss is built progressively rather than in two
         * clicks. The first click both starts the construction
         * and anchors the base, so the student does not lose a
         * click to a step that places nothing.
         */
        if (
            drawingState.activeTool ===
                "truss"
        ) {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    phase: "truss-construct",
                    startPoint: point,
                    currentPoint: point,
                    trussStage: 0,
                    trussMembers: [],
                    trussOutline: [],
                    trussInProgress: point
                }
            );

            setToolMessage(
                TRUSS_STAGES[0].followUp
            );

            renderCurrentDrawing();
            return;
        }

        /*
         * A body-attached Statics tool works on a body, not
         * on free space. It first takes its target body, then
         * places itself along that body, so the feature it
         * creates always belongs to something.
         *
         * This runs before the single-click placement path,
         * because a support or a moment placed this way must
         * not be committed before its body is known.
         */
        if (
            isBodyAttachedTool(
                drawingState.activeTool
            ) &&
            !drawingState.interaction
                .staticsTarget
        ) {
            beginStaticsAttachment(
                resolution
            );

            return;
        }

        /*
         * Statics features are also placed with a single
         * click, so they commit immediately and open their
         * Features panel.
         */
        if (
            STATICS_PLACEMENT_TOOLS[
                drawingState.activeTool
            ]
        ) {
            createStaticsFeature(
                drawingState.activeTool,
                point,
                staticsAttachmentId(
                    resolution.snapCandidate
                )
            );

            return;
        }

        /*
         * A span tool anchors on the first click and sets
         * its extent on the second, so each one names its own
         * endpoint instead of borrowing the load wording.
         *
         * The anchor's snap decides the eventual parent, so
         * it is captured here while the snap candidate is
         * still in hand.
         */
        if (
            STATICS_SPAN_TOOLS[
                drawingState.activeTool
            ]
        ) {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        "statics-span",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    parentId:
                        staticsAttachmentId(
                            resolution.snapCandidate
                        ),

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                staticsSpanInstruction(
                    drawingState.activeTool
                )
            );

            renderCurrentDrawing();
            return;
        }

        if (
            drawingState.activeTool ===
            "polygon"
        ) {
            /*
             * By Centre starts with the centre; By Sides
             * starts with the first end of the first
             * edge. Both then take one more canvas point
             * before the side count is chosen.
             */
            const bySides =
                interaction.polygonMode ===
                "sides";

            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        bySides
                            ? "polygon-first"
                            : "polygon-centre",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                bySides
                    ? "Specify second point"
                    : "Specify polygon radius"
            );

            renderCurrentDrawing();
            return;
        }

        if (
            drawingState.activeTool ===
            "arc"
        ) {
            const threePoint =
                interaction.arcMode ===
                "three-point";

            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        threePoint
                            ? "arc-first"
                            : "arc-centre",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                threePoint
                    ? "Specify point on arc"
                    : "Specify arc start point"
            );
        } else {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        "first-point",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                drawingState.activeTool ===
                    "polyline"
                    ? "Specify next point"

                    : drawingState.activeTool ===
                        "circle"
                        ? "Specify radius"

                    : drawingState.activeTool ===
                        "rectangle"
                        ? "Specify opposite corner"

                    : drawingState.activeTool ===
                        "line"
                        ? "Specify line endpoint"

                    : drawingState.activeTool ===
                        "triangle"
                        ? "Specify second point"

                    : "Specify second point"
            );
        }

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
        "polyline"
    ) {
        interaction.points.push(
            point
        );

        interaction.startPoint =
            point;

        interaction.currentPoint =
            point;

        setToolMessage(
            "Click next point or double-click to finish"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
            "triangle" &&
        interaction.points.length < 2
    ) {
        /*
         * Triangle collects its three corner points
         * before creating a single feature. Once the
         * second point is down, the third click falls
         * through to the creation code below so the
         * whole triangle is built in one step.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.startPoint =
            interaction.points[0];

        setToolMessage(
            interaction.points.length < 2
                ? "Specify second point"
                : "Specify third point"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
        "triangle"
    ) {
        /*
         * Third point: complete the triangle from the
         * two stored points plus this one.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;
    }

    if (
        drawingState.activeTool ===
            "polygon" &&
        (
            interaction.phase ===
                "polygon-centre" ||
            interaction.phase ===
                "polygon-first"
        )
    ) {
        /*
         * Second canvas point is placed, then the side
         * count is chosen before anything is created.
         * The polygon stays in preview until the count
         * is confirmed.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "polygon-sides";

        openPolygonSidesPrompt(
            interaction
        );

        renderCurrentDrawing();
        return;
    }

    /*
     * A body-attached feature takes one or more points on
     * its body and is created only once it has all of them,
     * so nothing is committed on this click.
     *
     * Guarded by the tool as well as the phase: a truss under
     * construction is a different operation that lives in the
     * same interaction and must not be swallowed here.
     */
    if (
        isBodyAttachedTool(
            drawingState.activeTool
        ) &&
        drawingState.interaction.phase ===
            "statics-attach"
    ) {
        continueStaticsAttachment(
            resolution
        );

        return;
    } else if (
        drawingState.interaction.phase ===
            "truss-construct"
    ) {
        /*
         * A truss is built one member at a time using the
         * ordinary line interaction, so a click places the next
         * point of a member rather than creating a feature.
         */
        continueTrussConstruction(
            resolution
        );

        return;
    } else if (
        STATICS_SPAN_TOOLS[
            drawingState.activeTool
        ] &&
        interaction.phase ===
            "statics-span"
    ) {
        const previous =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        /*
         * A Reference Line reuses the ordinary line
         * geometry, distinguished only by its statics
         * metadata, so it never becomes a second line
         * primitive.
         */
        const isReferenceLine =
            drawingState.activeTool ===
            "reference-line";

        /*
         * The feature type the active tool creates. It is
         * resolved before it is used, because the attachment
         * below depends on it.
         */
        const type =
            STATICS_CHILD_TOOLS[
                drawingState.activeTool
            ]?.type;

        const style = {
            style: {
                ...drawingState.styleDefaults,

                lineType:
                    isReferenceLine
                        ? "dashed"
                        : drawingState.styleDefaults.lineType
            },

            engineering: {
                plane: "XY",
                discipline: "statics",

                staticsType:
                    drawingState.activeTool
            },

            /*
             * A Reference Line is named for its statics role
             * rather than its underlying geometry, so it
             * reads as such in the Feature Tree.
             */
            name:
                isReferenceLine
                    ? "Reference Line"
                    : undefined,

            /*
             * The first click's snap is what establishes
             * attachment. If the application point snapped
             * onto an existing engineering body, the new
             * feature is recorded as that body's child, so
             * the Feature Tree shows Beam 1 > Point Force 1
             * instead of two unrelated rows. It reuses the
             * existing snap result; no separate attachment
             * system is involved.
             */
            parentId:
                attachableStaticsType(type) &&
                interaction.parentId
                    ? interaction.parentId
                    : undefined
        };

        const start = {
            ...interaction.points[0]
        };

        const end = {
            x: point.x,
            y: point.y
        };

        /*
         * Dispatch on the feature type, so each span tool
         * builds its own coherent feature with the right
         * arguments. Most take two points, but a distributed
         * load takes an intensity between them and a varying
         * load takes an intensity at each end.
         */
        let object = null;

        if (type === "load") {
            object =
                enggDrawingState.geometryFactories.load(
                    start,
                    end,
                    10,
                    style
                );
        } else if (type === "varying-load") {
            object =
                enggDrawingState.geometryFactories[
                    "varying-load"
                ](
                    start,
                    end,
                    0,
                    10,
                    style
                );
        } else if (
            typeof enggDrawingState.geometryFactories[
                type
            ] === "function"
        ) {
            object =
                enggDrawingState.geometryFactories[
                    type
                ](
                    start,
                    end,
                    style
                );
        }

        if (!object) {
            setToolMessage(
                "That tool could not be created"
            );

            return;
        }

        enggDrawingState.addObject(
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
    }

    if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-centre"
    ) {
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "arc-sweep";

        interaction.preview =
            null;

        setToolMessage(
            "Specify arc endpoint"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-first"
    ) {
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "arc-second";

        interaction.preview =
            null;

        setToolMessage(
            "Specify third point"
        );

        renderCurrentDrawing();
        return;
    }

    const first =
        interaction.startPoint;

    let object = null;

    if (
        drawingState.activeTool ===
        "line"
    ) {
        object =
            enggDrawingState.geometryFactories.line(
                first,
                point,
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "circle"
    ) {
        object =
            enggDrawingState.geometryFactories.circle(
                first,

                distance(
                    first,
                    point
                ),

                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "rectangle"
    ) {
        const rectangle =
            rectangleGeometry(
                first,
                point
            );

        object =
            enggDrawingState.geometryFactories.rectangle(
                rectangle.position,
                rectangle.width,
                rectangle.height,
                rectangle.rotation,
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "polyline"
    ) {
        object =
            enggDrawingState.geometryFactories.polyline(
                [
                    ...interaction.points
                ],
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
            "triangle" &&
        interaction.points.length >= 3
    ) {
        /*
         * One Triangle feature built from the three
         * placed points, closed back to the first.
         */
        object =
            enggDrawingState.geometryFactories.triangle(
                [
                    ...interaction.points
                ],
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-sweep" &&
        interaction.points.length >= 2
    ) {
        /*
         * Centrepoint arc: centre, start point and
         * endpoint are all placed, so the arc is
         * fully determined.
         *
         * This uses the same calculation as the
         * preview, with the same unwrapped cursor
         * angle, so the stored geometry matches what
         * the user just saw.
         */
        const arcGeometry =
            resolveCentrepointArc(
                interaction,
                point
            );

        if (arcGeometry) {
            object =
                enggDrawingState.geometryFactories.arc(
                    arcGeometry.center,

                    arcGeometry.radius,

                    arcGeometry.startAngle,

                    arcGeometry.endAngle,

                    {
                        style: {
                            ...drawingState.styleDefaults
                        },

                        engineering:
                            currentEngineeringMetadata()
                    }
                );

            if (
                object &&
                object.geometry
            ) {
                object.geometry.sweep =
                    arcGeometry.sweep;
            }
        } else {
            setToolMessage(
                "Start and endpoint must differ from the centre"
            );

            return;
        }
    } else if (
        drawingState.activeTool ===
            "arc" &&
        interaction.phase ===
            "arc-second" &&
        interaction.points.length >= 2
    ) {
        /*
         * 3-point arc: the arc is the circumcircle
         * through the three placed points.
         */
        const arcGeometry =
            arcThroughThreePoints(
                interaction.points[0],
                interaction.points[1],
                point
            );

        if (arcGeometry) {
            object =
                enggDrawingState.geometryFactories.arc(
                    arcGeometry.center,

                    arcGeometry.radius,

                    arcGeometry.startAngle,

                    arcGeometry.endAngle,

                    {
                        style: {
                            ...drawingState.styleDefaults
                        },

                        engineering:
                            currentEngineeringMetadata()
                    }
                );

            if (
                object &&
                object.geometry
            ) {
                object.geometry.sweep =
                    arcGeometry.sweep;
            }
        } else {
            setToolMessage(
                "Points are collinear"
            );

            return;
        }
    }

    if (object) {
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
 */
function createPointFeature(
    point
) {
    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const object =
        enggDrawingState.geometryFactories.point(
            {
                x: point.x,
                y: point.y
            },
            {
                style: {
                    ...drawingState.styleDefaults
                },

                engineering:
                    currentEngineeringMetadata()
            }
        );

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Specify point"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The coordinate system is ONE feature.
 *
 * It has a single shared origin and four independently
 * adjustable axis extensions: +X, -X, +Y and -Y. All
 * four lengths live on this one object, so it stays a
 * single entry in the Feature Tree while each side can
 * still be extended on its own.
 */
function add2DCoordinateSystem(
    origin
) {
    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const coordinateSystem =
        enggDrawingState.createGeometryObject(
            COORDINATE_SYSTEM_TYPE,
            {
                origin: {
                    x: origin.x,
                    y: origin.y
                },

                xPositiveLength:
                    COORDINATE_SYSTEM_LENGTH,

                xNegativeLength:
                    COORDINATE_SYSTEM_LENGTH,

                yPositiveLength:
                    COORDINATE_SYSTEM_LENGTH,

                yNegativeLength:
                    COORDINATE_SYSTEM_LENGTH
            },
            {
                name:
                    "Coordinate System",

                style: {
                    stroke: "#000000",
                    fill: "none",
                    lineWidth: 0.75,
                    lineType: "solid",
                    opacity: 1
                },

                metadata: {
                    reference: true,
                    coordinateSystem: "2d"
                },

                engineering: {
                    plane: "XY"
                }
            }
        );

    enggDrawingState.addObject(
        drawingState,
        coordinateSystem
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearSelection(
        drawingState
    );

    setToolMessage(
        "Specify origin"
    );

    renderProperties();
    renderCurrentDrawing();
}

function createSvgElement(
    name,
    attributes = {}
) {
    const element =
        document.createElementNS(
            SVG_NAMESPACE,
            name
        );

    Object.entries(
        attributes
    ).forEach(
        ([key, value]) => {
            element.setAttribute(
                key,
                String(value)
            );
        }
    );

    return element;
}

function appendArrowhead(
    group,
    x,
    y,
    direction
) {
    let points;

    if (
        direction ===
        "x"
    ) {
        points =
            `${x},${y} ${x - 7},${y - 4} ${x - 7},${y + 4}`;
    } else if (
        direction ===
        "x-negative"
    ) {
        points =
            `${x},${y} ${x + 7},${y - 4} ${x + 7},${y + 4}`;
    } else if (
        direction ===
        "y"
    ) {
        points =
            `${x},${y} ${x - 4},${y + 7} ${x + 4},${y + 7}`;
    } else {
        points =
            `${x},${y} ${x - 4},${y - 7} ${x + 4},${y - 7}`;
    }

    group.appendChild(
        createSvgElement(
            "polygon",
            {
                points,

                fill:
                    "#000000",

                stroke:
                    "none"
            }
        )
    );
}

function appendCoordinateSystemVisual(
    svg,
    object,
    isSelected = false
) {
    const bounds = {
        width:
            drawingCanvas.clientWidth,

        height:
            drawingCanvas.clientHeight
    };

    const origin =
        enggDrawingState.engineeringToScreen(
            object.geometry.origin,
            bounds,
            drawingState
        );

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    const length =
        Math.max(
            15,
            object.geometry.axisLength *
                scale
        );

    const stroke =
        isSelected
            ? "#17643b"
            : (
                object.style?.stroke ||
                "#000000"
            );

    const strokeWidth =
        isSelected
            ? 2
            : Math.max(
                1,
                Number(
                    object.style?.lineWidth
                ) || 1.25
            );

    const group =
        createSvgElement(
            "g",
            {
                class:
                    "drawing-coordinate-system"
            }
        );

    group.appendChild(
        createSvgElement(
            "line",
            {
                x1:
                    origin.x -
                    length,

                y1:
                    origin.y,

                x2:
                    origin.x +
                    length,

                y2:
                    origin.y,

                stroke,

                "stroke-width":
                    strokeWidth
            }
        )
    );

    group.appendChild(
        createSvgElement(
            "line",
            {
                x1:
                    origin.x,

                y1:
                    origin.y +
                    length,

                x2:
                    origin.x,

                y2:
                    origin.y -
                    length,

                stroke,

                "stroke-width":
                    strokeWidth
            }
        )
    );

    appendArrowhead(
        group,
        origin.x + length,
        origin.y,
        "x"
    );

    appendArrowhead(
        group,
        origin.x - length,
        origin.y,
        "x-negative"
    );

    appendArrowhead(
        group,
        origin.x,
        origin.y - length,
        "y"
    );

    appendArrowhead(
        group,
        origin.x,
        origin.y + length,
        "y-negative"
    );

    group.appendChild(
        createSvgElement(
            "circle",
            {
                cx:
                    origin.x,

                cy:
                    origin.y,

                r:
                    isSelected
                        ? 4
                        : 3,

                fill:
                    "#ffffff",

                stroke,

                "stroke-width":
                    strokeWidth
            }
        )
    );

    const xPositiveLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x +
                    length +
                    5,

                y:
                    origin.y -
                    6,

                fill:
                    stroke,

                "font-size":
                    13,

                "font-family":
                    "Arial, sans-serif",

                "font-weight":
                    "600"
            }
        );

    xPositiveLabel.textContent =
        "+X";

    group.appendChild(
        xPositiveLabel
    );

    const xNegativeLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x -
                    length -
                    20,

                y:
                    origin.y -
                    6,

                fill:
                    stroke,

                "font-size":
                    13,

                "font-family":
                    "Arial, sans-serif",

                "font-weight":
                    "600"
            }
        );

    xNegativeLabel.textContent =
        "-X";

    group.appendChild(
        xNegativeLabel
    );

    const yPositiveLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x +
                    6,

                y:
                    origin.y -
                    length -
                    5,

                fill:
                    stroke,

                "font-size":
                    13,

                "font-family":
                    "Arial, sans-serif",

                "font-weight":
                    "600"
            }
        );

    yPositiveLabel.textContent =
        "+Y";

    group.appendChild(
        yPositiveLabel
    );

    const yNegativeLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x +
                    6,

                y:
                    origin.y +
                    length +
                    17,

                fill:
                    stroke,

                "font-size":
                    13,

                "font-family":
                    "Arial, sans-serif",

                "font-weight":
                    "600"
            }
        );

    yNegativeLabel.textContent =
        "-Y";

    group.appendChild(
        yNegativeLabel
    );

    const originLabel =
        createSvgElement(
            "text",
            {
                x:
                    origin.x +
                    7,

                y:
                    origin.y +
                    16,

                fill:
                    stroke,

                "font-size":
                    10,

                "font-family":
                    "Arial, sans-serif"
            }
        );

    originLabel.textContent =
        "0";

    group.appendChild(
        originLabel
    );

    svg.appendChild(
        group
    );
}

function renderCoordinateSystems() {
    const svg =
        drawingCanvas.querySelector(
            ".drawing-renderer"
        );

    if (!svg) {
        return;
    }

    drawingState.objects
        .filter(
            object =>
                object.type ===
                COORDINATE_SYSTEM_TYPE
        )
        .forEach(
            object => {
                appendCoordinateSystemVisual(
                    svg,
                    object,
                    drawingState.selection
                        .selectedObjectIds
                        .includes(
                            object.id
                        )
                );
            }
        );
}

function renderCurrentDrawing() {
    drawingCanvas.classList.toggle(
        "drawing-tool-active",
        Boolean(
            drawingState.activeTool
        )
    );

    enggDrawingRenderer.renderDrawing(
        drawingState,
        drawingCanvas
    );

    // Keep the inspector in sync with geometry changed by any drawing path.
    // Do not replace a field while the user is editing it.
    if (!drawingProperties.contains(document.activeElement)) {
        const selectedId = drawingState.selection.selectedObjectIds[0];
        const displayedId = drawingProperties.dataset.selectedObjectId || null;
        const current = selectedId && drawingState.objects.find(item => item.id === selectedId);
        const signature = current ? JSON.stringify({
            geometry: current.geometry,
            constraints: current.constraints,
            style: current.style
        }) : '';
        if (displayedId !== (current?.id || null) ||
            drawingProperties.dataset.geometrySignature !== signature) {
            renderProperties();
        }
    }

    updateHistoryControls();
}

/*
 * The distance from a point to a closed outline.
 *
 * A body made of corners is picked as one shape, so the
 * test is against its whole outline rather than against a
 * single stored anchor point.
 */
function distanceToPolygon(
    point,
    corners
) {
    if (
        !Array.isArray(corners) ||
        corners.length < 2
    ) {
        return Infinity;
    }

    return corners.reduce(
        (nearest, corner, index) => {
            const next =
                corners[
                    (index + 1) %
                        corners.length
                ];

            return Math.min(
                nearest,
                distanceToSegment(
                    point,
                    corner,
                    next
                )
            );
        },
        Infinity
    );
}

function distanceToSegment(
    point,
    start,
    end
) {
    const dx =
        end.x -
        start.x;

    const dy =
        end.y -
        start.y;

    const lengthSquared =
        dx * dx +
        dy * dy;

    const ratio =
        lengthSquared
            ? Math.max(
                0,
                Math.min(
                    1,
                    (
                        (
                            point.x -
                            start.x
                        ) * dx +

                        (
                            point.y -
                            start.y
                        ) * dy
                    ) /
                    lengthSquared
                )
            )
            : 0;

    return distance(
        point,
        {
            x:
                start.x +
                ratio * dx,

            y:
                start.y +
                ratio * dy
        }
    );
}

/*
 * Ray-casting point-in-polygon test, used so clicking
 * inside a closed feature selects it.
 */
function pointInsidePolygon(
    point,
    corners
) {
    if (
        !Array.isArray(corners) ||
        corners.length < 3
    ) {
        return false;
    }

    let inside =
        false;

    for (
        let index = 0, previous = corners.length - 1;
        index < corners.length;
        previous = index, index += 1
    ) {
        const a =
            corners[index];

        const b =
            corners[previous];

        if (!a || !b) {
            continue;
        }

        const straddles =
            a.y > point.y !== b.y > point.y;

        if (!straddles) {
            continue;
        }

        const intersectX =
            ((b.x - a.x) * (point.y - a.y)) /
                (b.y - a.y) +
            a.x;

        if (point.x < intersectX) {
            inside = !inside;
        }
    }

    return inside;
}

/*
 * The four arms of the coordinate system as segments.
 *
 * Shared by hit-testing, handles and snapping so they
 * all agree on the same geometry, and so the four
 * extensions stay independent in one feature.
 */
function coordinateSystemArms(
    geometry
) {
    const origin =
        geometry?.origin;

    if (!origin) {
        return [];
    }

    const fallback =
        Number.isFinite(Number(geometry.axisLength)) &&
        Number(geometry.axisLength) > 0
            ? Number(geometry.axisLength)
            : 25;

    const read = value =>
        Number.isFinite(Number(value)) && Number(value) > 0
            ? Number(value)
            : fallback;

    return [
        {
            kind: "xPositive",
            start: origin,
            end: {
                x: origin.x + read(geometry.xPositiveLength),
                y: origin.y
            }
        },
        {
            kind: "xNegative",
            start: origin,
            end: {
                x: origin.x - read(geometry.xNegativeLength),
                y: origin.y
            }
        },
        {
            kind: "yPositive",
            start: origin,
            end: {
                x: origin.x,
                y: origin.y + read(geometry.yPositiveLength)
            }
        },
        {
            kind: "yNegative",
            start: origin,
            end: {
                x: origin.x,
                y: origin.y - read(geometry.yNegativeLength)
            }
        }
    ];
}

/*
 * A rigid body stores the same shape as a rectangle, so
 * every shared rectangle path can treat the two alike.
 * This keeps one geometry implementation rather than a
 * parallel set of rigid-body branches.
 */
function isRectangleLike(
    object
) {
    return Boolean(
        object &&
        (object.type === "rectangle" ||
            object.type === "rigid-body")
    );
}

function objectAtPoint(
    point
) {
    const tolerance =
        4 /
        Math.max(
            drawingState.camera.zoom,
            0.25
        );

    return [
        ...drawingState.objects
    ]
        .reverse()
        .find(
            object => {
                const geometry =
                    object.geometry;

                if (
                    object.type ===
                    "coordinate-system-2d"
                ) {
                    /*
                     * The coordinate system is one feature, so
                     * clicking any of its four arms or its
                     * origin selects that single feature.
                     */
                    if (!geometry.origin) {
                        return false;
                    }

                    return (
                        distance(
                            point,
                            geometry.origin
                        ) <=
                            tolerance * 2 ||
                        coordinateSystemArms(
                            geometry
                        ).some(
                            arm =>
                                distanceToSegment(
                                    point,
                                    arm.start,
                                    arm.end
                                ) <= tolerance
                        )
                    );
                }

                /*
                 * A Point Force is a vector, so it is picked
                 * along the arrow rather than only at its
                 * application point. Clicking anywhere on
                 * the arrow selects the one force, never a
                 * piece of it.
                 */
                if (object.type === "force") {
                    return (
                        (geometry.start &&
                            geometry.end &&
                            distanceToSegment(
                                point,
                                geometry.start,
                                geometry.end
                            ) <= tolerance) ||
                        (geometry.start &&
                            distance(
                                point,
                                geometry.start
                            ) <=
                                tolerance * 2)
                    );
                }

                /*
                 * A rigid body is a shape, so it is picked
                 * anywhere inside or on its outline rather
                 * than only at its position anchor. The test
                 * follows whichever shape the body currently
                 * has, so a circular or triangular body is as
                 * easy to click as a rectangular one.
                 */
                if (isRectangleLike(object)) {
                    return (
                        distanceToPolygon(
                            point,
                            enggFeatureGeometry.definingPoints(
                                geometry,
                                object.type ===
                                    "rigid-body"
                                    ? enggFeatureGeometry
                                          .rigidBodyShape(geometry)
                                    : "rectangle"
                            )
                        ) <= tolerance
                    );
                }

                /*
                 * A Couple is drawn as two opposing arrows.
                 * Clicking either one selects the couple,
                 * because the two arrows are renderer
                 * output of that one feature.
                 */
                if (object.type === "couple") {
                    if (!geometry.position) {
                        return false;
                    }

                    return distance(
                        point,
                        geometry.position
                    ) <= tolerance * 3;
                }

                if (
                    object.type ===
                        "support" ||
                    object.type ===
                        "body" ||
                    object.type ===
                        "particle" ||
                    object.type ===
                        "moment" ||
                    isSupportType(object.type)
                ) {
                    /*
                     * These act at a point, so they are
                     * picked at their position with the same
                     * generous radius as a point.
                     */
                    return (
                        geometry.position &&
                        distance(
                            point,
                            geometry.position
                        ) <=
                            tolerance * 2
                    );
                }

                if (isConnectionType(object.type)) {
                    return (
                        geometry.start &&
                        geometry.end &&
                        distanceToSegment(
                            point,
                            geometry.start,
                            geometry.end
                        ) <= tolerance
                    );
                }

                if (
                    object.type === "load" ||
                    object.type === "varying-load" ||
                    object.type === "beam" ||
                    object.type === "cable" ||
                    object.type === "shaft"
                ) {
                    /*
                     * Spans are picked along their length,
                     * like a line. For a load this means any
                     * of its rendered arrows selects the one
                     * distributed load.
                     */
                    return (
                        geometry.start &&
                        geometry.end &&
                        distanceToSegment(
                            point,
                            geometry.start,
                            geometry.end
                        ) <= tolerance
                    );
                }

                /*
                 * A truss the student built is picked on any of
                 * its own members, so clicking a joint or a web
                 * member selects the one Truss. Its members are
                 * rendering of that feature and are never
                 * selectable on their own.
                 */
                if (
                    object.type === "truss" &&
                    Array.isArray(geometry.members) &&
                    geometry.members.length
                ) {
                    return geometry.members.some(
                        member =>
                            distanceToSegment(
                                point,
                                member.start,
                                member.end
                            ) <= tolerance
                    );
                }

                if (object.type === "truss") {
                    return (
                        geometry.start &&
                        geometry.end &&
                        distanceToSegment(
                            point,
                            geometry.start,
                            geometry.end
                        ) <= tolerance
                    );
                }

                if (
                    object.type ===
                    "point"
                ) {
                    /*
                     * A point has no extent, so allow a
                     * slightly wider pick radius than a
                     * line so it stays easy to click.
                     */
                    return (
                        distance(
                            point,
                            geometry.position ||
                                geometry.point ||
                                geometry
                        ) <=
                        tolerance * 2
                    );
                }

                if (
                    object.type ===
                    "line"
                ) {
                    return (
                        distanceToSegment(
                            point,
                            geometry.start,
                            geometry.end
                        ) <=
                        tolerance
                    );
                }

                if (
                    object.type ===
                    "circle"
                ) {
                    return (
                        Math.abs(
                            distance(
                                point,
                                geometry.center
                            ) -
                            geometry.radius
                        ) <=
                        tolerance
                    );
                }

                if (
                    isRectangleLike(
                        object
                    )
                ) {
                    const left =
                        geometry.position.x;

                    const right =
                        left +
                        geometry.width;

                    const top =
                        geometry.position.y;

                    const bottom =
                        geometry.position.y -
                        geometry.height;

                    const nearHorizontal =
                        point.x >=
                            left -
                            tolerance &&

                        point.x <=
                            right +
                            tolerance &&

                        (
                            Math.abs(
                                point.y -
                                top
                            ) <=
                            tolerance ||

                            Math.abs(
                                point.y -
                                bottom
                            ) <=
                            tolerance
                        );

                    const nearVertical =
                        point.y >=
                            bottom -
                            tolerance &&

                        point.y <=
                            top +
                            tolerance &&

                        (
                            Math.abs(
                                point.x -
                                left
                            ) <=
                            tolerance ||

                            Math.abs(
                                point.x -
                                right
                            ) <=
                            tolerance
                        );

                    return (
                        nearHorizontal ||
                        nearVertical ||
                        /*
                         * Clicking inside a closed shape
                         * selects it, which is what a CAD
                         * user expects, not only clicking
                         * its outline.
                         */
                        pointInsidePolygon(
                            point,
                            rectangleCorners(
                                geometry
                            )
                        )
                    );
                }

                if (
                    object.type ===
                        "reference-axis-x-positive" ||
                    object.type ===
                        "reference-axis-x-negative" ||
                    object.type ===
                        "reference-axis-y-positive" ||
                    object.type ===
                        "reference-axis-y-negative"
                ) {
                    /*
                     * Each axis is hit-tested on its own line
                     * segment, so clicking one axis selects
                     * only that axis.
                     */
                    const origin =
                        geometry.origin;

                    if (!origin) {
                        return false;
                    }

                    const length =
                        Number(geometry.axisLength) || 25;

                    const direction =
                        geometry.direction || {
                            x: 1,
                            y: 0
                        };

                    return (
                        distanceToSegment(
                            point,
                            origin,
                            {
                                x:
                                    origin.x +
                                    direction.x * length,

                                y:
                                    origin.y +
                                    direction.y * length
                            }
                        ) <= tolerance
                    );
                }

                if (
                    object.type ===
                    "polygon"
                ) {
                    /*
                     * Hit-test the real edges derived from
                     * the polygon definition, so clicking
                     * any side selects the whole feature.
                     */
                    const vertices =
                        enggDrawingState.polygonVertices(
                            geometry
                        );

                    if (vertices.length < 3) {
                        return false;
                    }

                    return vertices.some(
                        (
                            vertex,
                            index
                        ) =>
                            distanceToSegment(
                                point,
                                vertex,
                                vertices[
                                    (
                                        index + 1
                                    ) %
                                    vertices.length
                                ]
                            ) <=
                            tolerance
                    );
                }

                if (
                    object.type ===
                    "triangle"
                ) {
                    /*
                     * Hit-test the three real sides, so
                     * clicking any visible edge selects
                     * the whole triangle as one feature.
                     */
                    const corners =
                        (geometry.points || []).filter(
                            Boolean
                        );

                    if (corners.length < 3) {
                        return false;
                    }

                    return (
                        corners.some(
                            (
                                corner,
                                index
                            ) => {
                                const next =
                                    corners[
                                        (
                                            index + 1
                                        ) %
                                        corners.length
                                    ];

                                return (
                                    distanceToSegment(
                                        point,
                                        corner,
                                        next
                                    ) <=
                                    tolerance
                                );
                            }
                        ) ||
                        pointInsidePolygon(
                            point,
                            corners
                        )
                    );
                }

                if (
                    object.type ===
                    "polyline"
                ) {
                    return geometry.points.some(
                        (
                            current,
                            index
                        ) =>
                            index > 0 &&
                            distanceToSegment(
                                point,
                                geometry.points[
                                    index - 1
                                ],
                                current
                            ) <=
                            tolerance
                    );
                }

                if (
                    object.type ===
                    "arc"
                ) {
                    const angle =
                        Math.atan2(
                            point.y -
                                geometry.center.y,
                            point.x -
                                geometry.center.x
                        );

                    const radiusDistance =
                        Math.abs(
                            distance(
                                point,
                                geometry.center
                            ) -
                            geometry.radius
                        );

                    if (
                        radiusDistance >
                        tolerance
                    ) {
                        return false;
                    }

                    return angleOnArc(
                        angle,
                        geometry.startAngle,
                        geometry.endAngle,
                        geometry.sweep
                    );
                }

                return false;
            }
        );
}

function angleOnArc(
    angle,
    startAngle,
    endAngle,
    sweepDirection = null
) {
    const twoPi =
        Math.PI * 2;

    const normalize =
        value =>
            (
                (
                    value %
                    twoPi
                ) +
                twoPi
            ) %
            twoPi;

    const start =
        normalize(
            startAngle
        );

    const end =
        normalize(
            endAngle
        );

    const current =
        normalize(
            angle
        );

    const direction =
        sweepDirection === -1
            ? -1
            : sweepDirection === 1
                ? 1
                : (
                    endAngle >=
                        startAngle
                        ? 1
                        : -1
                );

    const travelled =
        direction > 0
            ? normalize(
                current -
                start
            )
            : normalize(
                start -
                current
            );

    const arcLength =
        direction > 0
            ? normalize(
                end -
                start
            )
            : normalize(
                start -
                end
            );

    if (
        arcLength <
        1e-9
    ) {
        return true;
    }

    return (
        travelled <=
        arcLength +
        1e-9
    );
}

function objectPoints(
    object
) {
    const geometry =
        object.geometry;

    if (
        object.type ===
        "coordinate-system-2d"
    ) {
        return [
            geometry.origin
        ];
    }

    if (
        object.type ===
        "line"
    ) {
        return [
            geometry.start,
            geometry.end
        ];
    }

    if (
        object.type ===
        "polyline"
    ) {
        return geometry.points;
    }

    if (
        object.type ===
        "circle"
    ) {
        return [
            geometry.center
        ];
    }

    if (
        object.type ===
        "rectangle"
    ) {
        return [
            geometry.position,

            {
                x:
                    geometry.position.x +
                    geometry.width,

                y:
                    geometry.position.y
            },

            {
                x:
                    geometry.position.x +
                    geometry.width,

                y:
                    geometry.position.y -
                    geometry.height
            },

            {
                x:
                    geometry.position.x,

                y:
                    geometry.position.y -
                    geometry.height
            }
        ];
    }

    if (
        object.type ===
        "arc"
    ) {
        return [
            {
                x:
                    geometry.center.x +
                    Math.cos(
                        geometry.startAngle
                    ) *
                    geometry.radius,

                y:
                    geometry.center.y +
                    Math.sin(
                        geometry.startAngle
                    ) *
                    geometry.radius
            },

            {
                x:
                    geometry.center.x +
                    Math.cos(
                        geometry.endAngle
                    ) *
                    geometry.radius,

                y:
                    geometry.center.y +
                    Math.sin(
                        geometry.endAngle
                    ) *
                    geometry.radius
            }
        ];
    }

    return [];
}

function pointInsideSelection(
    point,
    selectionBox
) {
    return (
        point.x >=
            selectionBox.minX &&

        point.x <=
            selectionBox.maxX &&

        point.y >=
            selectionBox.minY &&

        point.y <=
            selectionBox.maxY
    );
}

function segmentsIntersect(
    firstStart,
    firstEnd,
    secondStart,
    secondEnd
) {
    const cross = (
        a,
        b,
        c
    ) =>
        (
            b.x -
            a.x
        ) *
        (
            c.y -
            a.y
        ) -
        (
            b.y -
            a.y
        ) *
        (
            c.x -
            a.x
        );

    const onSegment = (
        a,
        point,
        b
    ) =>
        point.x >=
            Math.min(
                a.x,
                b.x
            ) -
            1e-9 &&

        point.x <=
            Math.max(
                a.x,
                b.x
            ) +
            1e-9 &&

        point.y >=
            Math.min(
                a.y,
                b.y
            ) -
            1e-9 &&

        point.y <=
            Math.max(
                a.y,
                b.y
            ) +
            1e-9;

    const c1 =
        cross(
            firstStart,
            firstEnd,
            secondStart
        );

    const c2 =
        cross(
            firstStart,
            firstEnd,
            secondEnd
        );

    const c3 =
        cross(
            secondStart,
            secondEnd,
            firstStart
        );

    const c4 =
        cross(
            secondStart,
            secondEnd,
            firstEnd
        );

    const s1 =
        Math.abs(c1) < 1e-9
            ? 0
            : c1 > 0
                ? 1
                : -1;

    const s2 =
        Math.abs(c2) < 1e-9
            ? 0
            : c2 > 0
                ? 1
                : -1;

    const s3 =
        Math.abs(c3) < 1e-9
            ? 0
            : c3 > 0
                ? 1
                : -1;

    const s4 =
        Math.abs(c4) < 1e-9
            ? 0
            : c4 > 0
                ? 1
                : -1;

    if (
        s1 !== 0 &&
        s2 !== 0 &&
        s1 !== s2 &&
        s3 !== 0 &&
        s4 !== 0 &&
        s3 !== s4
    ) {
        return true;
    }

    if (
        s1 === 0 &&
        onSegment(
            firstStart,
            secondStart,
            firstEnd
        )
    ) {
        return true;
    }

    if (
        s2 === 0 &&
        onSegment(
            firstStart,
            secondEnd,
            firstEnd
        )
    ) {
        return true;
    }

    if (
        s3 === 0 &&
        onSegment(
            secondStart,
            firstStart,
            secondEnd
        )
    ) {
        return true;
    }

    if (
        s4 === 0 &&
        onSegment(
            secondStart,
            firstEnd,
            secondEnd
        )
    ) {
        return true;
    }

    return false;
}

function selectionRectangleEdges(
    selectionBox
) {
    const topLeft = {
        x:
            selectionBox.minX,

        y:
            selectionBox.maxY
    };

    const topRight = {
        x:
            selectionBox.maxX,

        y:
            selectionBox.maxY
    };

    const bottomRight = {
        x:
            selectionBox.maxX,

        y:
            selectionBox.minY
    };

    const bottomLeft = {
        x:
            selectionBox.minX,

        y:
            selectionBox.minY
    };

    return [
        [
            topLeft,
            topRight
        ],

        [
            topRight,
            bottomRight
        ],

        [
            bottomRight,
            bottomLeft
        ],

        [
            bottomLeft,
            topLeft
        ]
    ];
}

function segmentIntersectsSelection(
    start,
    end,
    selectionBox
) {
    if (
        pointInsideSelection(
            start,
            selectionBox
        ) ||
        pointInsideSelection(
            end,
            selectionBox
        )
    ) {
        return true;
    }

    return selectionRectangleEdges(
        selectionBox
    ).some(
        ([edgeStart, edgeEnd]) =>
            segmentsIntersect(
                start,
                end,
                edgeStart,
                edgeEnd
            )
    );
}

function polylineIntersectsSelection(
    points,
    selectionBox
) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return false;
    }

    if (
        points.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        )
    ) {
        return true;
    }

    for (
        let index = 1;
        index < points.length;
        index += 1
    ) {
        if (
            segmentIntersectsSelection(
                points[index - 1],
                points[index],
                selectionBox
            )
        ) {
            return true;
        }
    }

    return false;
}

function distanceToSelectionRectangle(
    point,
    selectionBox
) {
    const dx =
        Math.max(
            selectionBox.minX -
                point.x,

            0,

            point.x -
                selectionBox.maxX
        );

    const dy =
        Math.max(
            selectionBox.minY -
                point.y,

            0,

            point.y -
                selectionBox.maxY
        );

    return Math.hypot(
        dx,
        dy
    );
}

function circleIntersectsSelection(
    circle,
    selectionBox
) {
    const center =
        circle.center;

    const radius =
        Math.abs(
            circle.radius
        );

    if (
        pointInsideSelection(
            center,
            selectionBox
        )
    ) {
        return true;
    }

    return (
        distanceToSelectionRectangle(
            center,
            selectionBox
        ) <=
        radius
    );
}

function arcSelectionPoints(
    geometry
) {
    const twoPi =
        Math.PI * 2;

    const normalize =
        value =>
            (
                (
                    value %
                    twoPi
                ) +
                twoPi
            ) %
            twoPi;

    const start =
        geometry.startAngle;

    const end =
        geometry.endAngle;

    const direction =
        geometry.sweep === -1
            ? -1
            : geometry.sweep === 1
                ? 1
                : (
                    end >= start
                        ? 1
                        : -1
                );

    let sweep =
        direction > 0
            ? normalize(
                end -
                start
            )
            : -normalize(
                end -
                start
            );

    if (
        Math.abs(sweep) <
        1e-9
    ) {
        sweep =
            twoPi;
    }

    const segmentCount =
        Math.max(
            32,
            Math.ceil(
                Math.abs(sweep) /
                (
                    Math.PI /
                    72
                )
            )
        );

    const points = [];

    for (
        let index = 0;
        index <=
            segmentCount;
        index += 1
    ) {
        const angle =
            start +
            sweep *
                (
                    index /
                    segmentCount
                );

        points.push({
            x:
                geometry.center.x +
                Math.cos(angle) *
                    geometry.radius,

            y:
                geometry.center.y +
                Math.sin(angle) *
                    geometry.radius
        });
    }

    return points;
}

function arcIntersectsSelection(
    geometry,
    selectionBox
) {
    return polylineIntersectsSelection(
        arcSelectionPoints(
            geometry
        ),
        selectionBox
    );
}

function coordinateSystemIntersectsSelection(
    geometry,
    selectionBox
) {
    const origin =
        geometry.origin;

    const axisLength =
        geometry.axisLength ??
        geometry.xAxisLength ??
        COORDINATE_SYSTEM_LENGTH;

    const xPositiveEnd = {
        x:
            origin.x +
            axisLength,

        y:
            origin.y
    };

    const xNegativeEnd = {
        x:
            origin.x -
            axisLength,

        y:
            origin.y
    };

    const yPositiveEnd = {
        x:
            origin.x,

        y:
            origin.y +
            axisLength
    };

    const yNegativeEnd = {
        x:
            origin.x,

        y:
            origin.y -
            axisLength
    };

    return (
        pointInsideSelection(
            origin,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            xPositiveEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            xNegativeEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            yPositiveEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            yNegativeEnd,
            selectionBox
        )
    );
}

function objectInsideSelection(
    object,
    selectionBox
) {
    if (
        !object ||
        !object.geometry ||
        !selectionBox
    ) {
        return false;
    }

    if (
        object.type ===
        COORDINATE_SYSTEM_TYPE
    ) {
        return coordinateSystemIntersectsSelection(
            object.geometry,
            selectionBox
        );
    }

    if (
        object.type ===
        "line"
    ) {
        return segmentIntersectsSelection(
            object.geometry.start,
            object.geometry.end,
            selectionBox
        );
    }

    if (
        object.type ===
        "point"
    ) {
        const position =
            object.geometry.position ||
            object.geometry.point ||
            object.geometry;

        return pointInsideSelection(
            position,
            selectionBox
        );
    }

    if (
        object.type ===
        "polygon"
    ) {
        const points =
            enggDrawingState.polygonVertices(
                object.geometry
            );

        if (points.length < 3) {
            return false;
        }

        return polylineIntersectsSelection(
            [
                ...points,
                points[0]
            ],
            selectionBox
        );
    }

    if (
        object.type ===
        "polyline"
    ) {
        return polylineIntersectsSelection(
            object.geometry.points,
            selectionBox
        );
    }

    if (
        object.type ===
        "triangle"
    ) {
        /*
         * Close the loop back to the first corner so
         * the third side is tested too.
         */
        const points =
            (object.geometry.points || []).filter(
                Boolean
            );

        if (points.length < 3) {
            return false;
        }

        return polylineIntersectsSelection(
            [
                ...points,
                points[0]
            ],
            selectionBox
        );
    }

    if (
        object.type ===
        "rectangle"
    ) {
        const points =
            objectPoints(
                object
            );

        return polylineIntersectsSelection(
            [
                ...points,
                points[0]
            ],
            selectionBox
        );
    }

    if (
        object.type ===
        "circle"
    ) {
        return circleIntersectsSelection(
            object.geometry,
            selectionBox
        );
    }

    if (
        object.type ===
        "arc"
    ) {
        return arcIntersectsSelection(
            object.geometry,
            selectionBox
        );
    }

    return objectPoints(
        object
    ).some(
        point =>
            pointInsideSelection(
                point,
                selectionBox
            )
    );
}

function objectIcon(
    object
) {
    /*
     * featureIcons is the authoritative map from feature type
     * to icon, so the Feature Tree and the Features panel show
     * exactly the same artwork the toolbar uses for the tool
     * that created the feature.
     */
    const featureIcon =
        featureIcons[object.type];

    if (featureIcon) {
        return featureIcon;
    }

    return (
        toolIcons[
            object.type[0].toUpperCase() +
            object.type.slice(1)
        ] ||
        toolIcons.Line ||
        ""
    );
}

function componentGroups() {
    const groups =
        new Map();

    drawingState.objects.forEach(
        object => {
            /*
             * A child is drawn under its parent, so it must
             * not also be listed as a root row. A parent that
             * no longer exists leaves the feature as a root,
             * which is what keeps an old saved file readable.
             */
            const parent =
                drawingState.objects.find(
                    candidate =>
                        candidate.id ===
                            object.parentId
                );

            if (parent) {
                return;
            }

            /*
             * Features are grouped by the discipline that
             * created them. A statics feature keeps its
             * STATICS identity even when it reuses shared
             * geometry, so a Force never appears as a Line.
             */
            let group =
                object.engineering?.discipline ===
                    "statics"
                    ? "Statics"
                    : "Geometry";

            if (
                group === "Geometry" &&
                object.type ===
                    "construction"
            ) {
                group =
                    "Construction";
            } else if (
                group === "Geometry" &&
                object.type ===
                    COORDINATE_SYSTEM_TYPE
            ) {
                group =
                    "Reference";
            }

            if (
                !groups.has(
                    group
                )
            ) {
                groups.set(
                    group,
                    []
                );
            }

            groups
                .get(group)
                .push(object);
        }
    );

    return groups;
}

/*
 * The features that belong to some other feature.
 *
 * A child is drawn beneath its parent rather than as a row
 * of its own, so a Point Force snapped onto a Beam reads as
 * Beam 1 > Point Force 1 and never appears twice.
 */
/*
 * Which Feature Tree branches the student has folded away.
 *
 * This is presentation only. It records nothing about the
 * features themselves, so a collapsed body still carries its
 * children and they still move and rotate with it.
 */
const collapsedComponents = new Set();

function componentChildren(
    parent
) {
    return drawingState.objects.filter(
        object =>
            object.parentId ===
                parent.id
    );
}

/*
 * One Feature Tree row, with its children indented
 * beneath it.
 *
 * The icon is resolved from the feature's own type, so the
 * tree always shows the real engineering identity of the
 * feature rather than whichever tool happens to be active.
 */
function componentRowMarkup(
    object,
    depth
) {
    const selected =
        drawingState.selection
            .selectedObjectIds
            .includes(
                object.id
            ) ||

        drawingState.selection
            .boxSelectionIds
            ?.includes(
                object.id
            );

    const children =
        componentChildren(object);

    /*
     * A feature that has children can be folded away. The
     * disclosure is a separate control from the row so
     * clicking the name still selects the feature rather than
     * toggling it.
     *
     * Collapsing is presentation only: the children stay
     * attached to this body whatever the row is showing, so a
     * folded Beam still carries its loads and its rotation
     * still transforms them.
     */
    const expanded =
        !collapsedComponents.has(object.id);

    const hasChildren =
        children.length > 0;

    return `
        <div
            class="drawing-component-branch"
            data-branch-id="${object.id}"
        >
            <div class="drawing-component-node">
                ${hasChildren
                    ? `<button
                        class="drawing-component-twisty${expanded ? " expanded" : ""}"
                        type="button"
                        data-twisty="${object.id}"
                        aria-expanded="${expanded}"
                        aria-label="${expanded ? "Collapse" : "Expand"} ${object.name}"
                    >${expanded ? "▾" : "▸"}</button>`
                    : '<span class="drawing-component-twisty-spacer" aria-hidden="true"></span>'}

                <button
                    class="drawing-component-row${selected ? " selected" : ""}${depth > 0 ? " drawing-component-row-child" : ""}"
                    type="button"
                    data-object-id="${object.id}"
                    aria-pressed="${selected}"
                    aria-expanded="${hasChildren ? expanded : undefined}"
                >
                    ${objectIcon(object)}
                    <span>${object.name}</span>
                </button>
            </div>

            ${hasChildren && expanded
                ? children
                      .map(
                          child =>
                              componentRowMarkup(
                                  child,
                                  depth + 1
                              )
                      )
                      .join("")
                : ""}
        </div>
    `;
}

function renderComponentTree() {
    const groups =
        componentGroups();

    drawingProperties.dataset.selectedObjectId = '';
    drawingProperties.dataset.geometrySignature = '';

    if (
        !drawingState.objects.length
    ) {
        drawingProperties.innerHTML =
            '<div class="drawing-inspector-message">No components</div>';

        return;
    }

    const selectedCount =
        drawingState.selection
            .selectedObjectIds.length;

    const summary =
        selectedCount > 1
            ? `<div class="drawing-selection-summary">${selectedCount} components selected</div>`
            : "";

    const tree =
        [...groups.entries()]
            .map(
                ([groupName, objects]) => `
                    <div class="drawing-component-group">
                        ${groupName}
                    </div>

                    ${objects
                        .map(
                            object =>
                                componentRowMarkup(
                                    object,
                                    0
                                )
                        )
                        .join("")}
                `
            )
            .join("");

    drawingProperties.innerHTML =
        `${summary}<div class="drawing-component-tree">${tree}</div>`;

    drawingProperties
        .querySelectorAll(
            ".drawing-component-row"
        )
        .forEach(
            row => {
                row.addEventListener(
                    "click",
                    () => {
                        enggDrawingState.selectObject(
                            drawingState,
                            row.dataset
                                .objectId
                        );

                        renderProperties();
                        renderCurrentDrawing();
                    }
                );
            }
        );

    /*
     * The disclosure control folds a branch's children away.
     *
     * Selecting a parent does not collapse it, so a click
     * that means "select this body" is never mistaken for a
     * click that means "hide what is attached to it".
     */
    drawingProperties
        .querySelectorAll(
            ".drawing-component-twisty"
        )
        .forEach(
            control => {
                control.addEventListener(
                    "click",
                    event => {
                        event.stopPropagation();

                        const id =
                            control.dataset
                                .twisty;

                        if (
                            collapsedComponents.has(id)
                        ) {
                            collapsedComponents.delete(id);
                        } else {
                            collapsedComponents.add(id);
                        }

                        renderProperties();
                    }
                );
            }
        );
}

function renderProperties() {
    syncStyleControls();

    const selectedIds =
        drawingState.selection
            .selectedObjectIds;

    const selectedId =
        selectedIds[0];

    const object =
        drawingState.objects.find(
            candidate =>
                candidate.id ===
                selectedId
        );

    if (
        selectedIds.length !== 1 ||
        !object
    ) {
        drawingComponentsBack.style.display =
            "none";

        renderComponentTree();

        return;
    }

    drawingComponentsBack.style.display =
        "block";

    drawingProperties.innerHTML = featurePropertyMarkup(object);
    drawingProperties.dataset.selectedObjectId = object.id;
    drawingProperties.dataset.geometrySignature = JSON.stringify({
        geometry: object.geometry,
        constraints: object.constraints,
        style: object.style
    });
    enhanceNumericInputs(drawingProperties);
    bindFeaturePropertyControls(object);
}

/*
 * Triangle measurements derived from the actual
 * geometry. The stored points are always the source
 * of truth; these are calculated from them.
 */
function triangleMeasurements(
    points
) {
    if (
        !Array.isArray(points) ||
        points.length < 3 ||
        points.some(
            point =>
                !point ||
                !Number.isFinite(point.x) ||
                !Number.isFinite(point.y)
        )
    ) {
        return null;
    }

    const sides = [
        distance(points[0], points[1]),
        distance(points[1], points[2]),
        distance(points[2], points[0])
    ];

    /*
     * Each angle is taken at its own vertex, so
     * angle 1 sits between side 3 and side 1, and
     * so on around the triangle.
     */
    const angleAt = (
        vertex,
        first,
        second
    ) => {
        const a = {
            x: first.x - vertex.x,
            y: first.y - vertex.y
        };

        const b = {
            x: second.x - vertex.x,
            y: second.y - vertex.y
        };

        const denominator =
            Math.hypot(a.x, a.y) *
            Math.hypot(b.x, b.y);

        if (
            denominator <=
            1e-12
        ) {
            return 0;
        }

        const cosine =
            Math.max(
                -1,
                Math.min(
                    1,
                    (
                        a.x * b.x +
                        a.y * b.y
                    ) /
                    denominator
                )
            );

        return (
            Math.acos(cosine) *
            180 /
            Math.PI
        );
    };

    const angles = [
        angleAt(points[0], points[1], points[2]),
        angleAt(points[1], points[2], points[0]),
        angleAt(points[2], points[0], points[1])
    ];

    return {
        sides,
        angles
    };
}

function trianglePropertyMarkup(
    object,
    mode
) {
    const geometry =
        object.geometry;

    const constraints =
        object.constraints || {};

    const points =
        (geometry.points || []).filter(
            Boolean
        );

    const measurements =
        triangleMeasurements(points);

    const number = value =>
        Number(value).toFixed(2);

    const fixed = key =>
        Boolean(constraints[key]);

    const rows = [];

    /*
     * Standard header, then the existing segmented
     * control. The rest of the Triangle layout is
     * unchanged.
     */
    rows.push(
        featureHeaderMarkup(
            object,
            "Triangle"
        )
    );

    rows.push(`
        <div class="drawing-segmented" role="group" aria-label="Definition">
            <button type="button"
                class="drawing-segmented-option${mode === "points" ? " active" : ""}"
                data-triangle-mode="points"
                aria-pressed="${mode === "points"}">
                Points
            </button>
            <button type="button"
                class="drawing-segmented-option${mode === "sides" ? " active" : ""}"
                data-triangle-mode="sides"
                aria-pressed="${mode === "sides"}">
                Sides &amp; Angles
            </button>
        </div>
    `);

    const lockBox = (
        key,
        label
    ) => `
        <label class="drawing-property-fix" title="Constrain ${label}">
            <input type="checkbox" data-fix="${key}"
                aria-label="Constrain ${label}"
                ${fixed(key) ? "checked" : ""}>
        </label>
    `;

    if (mode === "points") {
        rows.push(
            `<div class="drawing-properties-section">GEOMETRY</div>`
        );

        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-head">
                <span></span><span>X</span><span>Y</span><span></span>
            </div>
        `);

        points.forEach(
            (
                point,
                index
            ) => {
                const locked =
                    fixed(`points.${index}`);

                rows.push(`
                    <div class="drawing-property-grid">
                        <span class="drawing-property-grid-label">Point ${index + 1}</span>
                        <input type="number" step="any"
                            data-property="points.${index}.x"
                            aria-label="Point ${index + 1} X"
                            value="${number(point.x)}"
                            ${locked ? "disabled" : ""}>
                        <input type="number" step="any"
                            data-property="points.${index}.y"
                            aria-label="Point ${index + 1} Y"
                            value="${number(point.y)}"
                            ${locked ? "disabled" : ""}>
                        ${lockBox(`points.${index}`, `Point ${index + 1}`)}
                    </div>
                `);
            }
        );
    }

    if (mode === "sides" && measurements) {
        rows.push(
            `<div class="drawing-properties-section">SIDES</div>`
        );

        measurements.sides.forEach(
            (side, index) => {
                const key =
                    `side${index + 1}`;

                rows.push(`
                    <div class="drawing-property-grid drawing-property-grid-value">
                        <span class="drawing-property-grid-label">Side ${index + 1}</span>
                        <input type="number" step="any"
                            data-property="${key}"
                            aria-label="Side ${index + 1}"
                            value="${number(side)}"
                            ${fixed(key) ? "disabled" : ""}>
                        <span class="drawing-property-unit">mm</span>
                        ${lockBox(key, `Side ${index + 1}`)}
                    </div>
                `);
            }
        );

        rows.push(
            `<div class="drawing-properties-section">ANGLES</div>`
        );

        measurements.angles.forEach(
            (angle, index) => {
                const key =
                    `angle${index + 1}`;

                rows.push(`
                    <div class="drawing-property-grid drawing-property-grid-value">
                        <span class="drawing-property-grid-label">Angle ${index + 1}</span>
                        <input type="number" step="5" min="0.01" max="179.98"
                            data-property="${key}"
                            aria-label="Angle ${index + 1}"
                            value="${number(angle)}"
                            ${fixed(key) ? "disabled" : ""}>
                        <span class="drawing-property-unit">°</span>
                        ${lockBox(key, `Angle ${index + 1}`)}
                    </div>
                `);
            }
        );
    }

    rows.push(appearanceMarkup(object));

    return `<div class="drawing-properties-block">
        <div class="drawing-properties-title">${object.name}</div>
        ${rows.join("")}
    </div>`;
}

/*
 * Appearance controls shared by the property editors.
 * Real <select> and numeric inputs, so both keyboard
 * entry and the spinner arrows work.
 */
function appearanceMarkup(
    object
) {
    /*
     * A Particle is a point body: it is drawn as a filled
     * marker, so a line type or a line width would describe
     * something that does not exist for it. It is therefore
     * the one feature that carries no APPEARANCE section,
     * rather than showing controls that cannot do anything.
     */
    if (object.type === "particle") {
        return "";
    }

    const style =
        object.style || {};

    const option = (
        value,
        label
    ) =>
        `<option value="${value}"${style.lineType === value ? " selected" : ""}>${label}</option>`;

    return `
        <div class="drawing-properties-section">APPEARANCE</div>
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Line Type</span>
            <select data-style="lineType" aria-label="Line Type">
                ${option("solid", "Solid")}
                ${option("dashed", "Dashed")}
                ${option("center", "Centre")}
            </select>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Line Width</span>
            <input type="number" step="0.05" min="0.05"
                data-style="lineWidth"
                aria-label="Line Width"
                value="${Number(style.lineWidth).toFixed(2)}">
            <span class="drawing-property-unit">mm</span>
            <span></span>
        </div>
    `;
}


/*
 * Shared header for every Features panel: an
 * editable Feature Name bound to the object, and a
 * read-only Feature Type.
 */
function featureHeaderMarkup(
    object,
    typeLabel
) {
    return `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Feature Name</span>
            <input type="text" data-feature-name
                aria-label="Feature Name"
                value="${object.name}">
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Feature Type</span>
            <span class="drawing-property-readonly">${typeLabel}</span>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `;
}

/*
 * The Features panel for a Rigid Body, in whichever shape it
 * currently has.
 *
 * A body stores a centre, a size and an angle regardless of its
 * outline, so the size and rotation controls mean the same thing
 * for every shape. What changes is the shape selector and, for a
 * triangle, the three points that define it.
 */
function rigidBodyShapeMarkup(
    object,
    helpers
) {
    const {
        coordinate,
        scalar,
        section
    } = helpers;

    const geometry = object.geometry || {};

    const shape =
        enggFeatureGeometry.rigidBodyShape(
            geometry
        );

    const centre =
        enggFeatureGeometry.rigidBodyCenter(
            geometry
        ) || { x: 0, y: 0 };

    const rows = [];

    rows.push(section("SHAPE"));

    rows.push(`
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Shape</span>
            <select data-rigid-shape aria-label="Shape">
                ${["rectangle", "circle", "triangle", "polygon"]
                    .map(
                        value => `
                            <option
                                value="${value}"
                                ${shape === value ? "selected" : ""}
                            >${value[0].toUpperCase() + value.slice(1)}</option>
                        `
                    )
                    .join("")}
            </select>
            <span class="drawing-property-unit"></span>
            <span></span>
        </div>
    `);

    rows.push(section("POSITION"));
    rows.push(coordinate("Centre X", "rigidCentre.x", centre.x));
    rows.push(coordinate("Centre Y", "rigidCentre.y", centre.y));

    if (shape === "circle") {
        rows.push(section("SIZE"));
        rows.push(
            scalar(
                "Radius",
                "rigidRadius",
                Number(geometry.radius) ||
                    Math.max(
                        Number(geometry.width) || 0,
                        Number(geometry.height) || 0
                    ) / 2,
                "mm"
            )
        );
    } else if (shape === "triangle") {
        rows.push(section("VERTICES"));

        (geometry.points || [])
            .filter(Boolean)
            .forEach(
                (point, index) => {
                    rows.push(
                        coordinate(
                            `Point ${index + 1} X`,
                            `points.${index}.x`,
                            point.x
                        )
                    );
                    rows.push(
                        coordinate(
                            `Point ${index + 1} Y`,
                            `points.${index}.y`,
                            point.y
                        )
                    );
                }
            );
    } else if (shape === "polygon") {
        rows.push(section("SIZE"));
        rows.push(
            scalar(
                "Number of Sides",
                "rigidSides",
                Number(geometry.sides) || 4,
                ""
            )
        );
        rows.push(
            scalar(
                "Radius",
                "rigidRadius",
                Number(geometry.radius) || 0,
                "mm"
            )
        );
    } else {
        rows.push(section("SIZE"));
        rows.push(
            scalar(
                "Width",
                "rigidWidth",
                Number(geometry.width) || 0,
                "mm"
            )
        );
        rows.push(
            scalar(
                "Height",
                "rigidHeight",
                Number(geometry.height) || 0,
                "mm"
            )
        );
    }

    rows.push(section("ROTATION"));
    rows.push(
        scalar(
            "Rotation",
            "rigidRotation",
            Number(geometry.rotation) || 0,
            "°"
        )
    );

    return rows.join("");
}

function featurePropertyMarkup(object) {
    const geometry = object.geometry;
    const constraints = object.constraints || {};
    const rows = [];
    const number = value => Number(value).toFixed(2);
    const fixed = key => Boolean(constraints[key]);

    /*
     * Shared constraint control. Every editable numeric
     * property gets one, placed after the unit so the
     * order is always Label -> Input -> Unit -> Fix.
     */
    const fixBox = (key, label) => `
        <label class="drawing-property-fix" title="Constrain ${label}">
            <input type="checkbox" data-fix="${key}"
                aria-label="Constrain ${label}"
                ${fixed(key) ? "checked" : ""}>
        </label>
    `;

    /*
     * Unknown control for statics values.
     *
     * A quantity marked Unknown is one the student has yet
     * to determine, so it is not the Fix control: Fix pins
     * a value against editing, while `?` says there is no
     * authoritative value at all. It is a property of the
     * value, not a separate tool, so any statics feature
     * can carry it through the same state as its Fix flag.
     */
    const known = key =>
        object.unknownValues?.[key] !== true;

    /*
     * A compact `?` toggle, placed after the unit. It reads
     * as a state rather than a word so the property row
     * stays compact and the whole feature is not disabled
     * when a single quantity is Unknown.
     */
    const knownBox = (key, label) => `
        <button type="button"
            class="drawing-property-known${known(key) ? "" : " unknown"}"
            data-known="${key}"
            aria-pressed="${!known(key)}"
            aria-label="Mark ${label} as unknown"
            title="Unknown: ${label} is not specified">
            ?
        </button>
    `;

    /*
     * Known / Unknown applies to statics quantities, which
     * are the values a student may still have to solve
     * for. Geometry dimensions stay plain numbers.
     */
    const showKnown =
        object.engineering?.discipline ===
        "statics";

    /*
     * Compact horizontal row: label, one numeric
     * input, optional unit, optional constraint box.
     */
    /*
     * An Unknown quantity has no authoritative number, so
     * its field is emptied and disabled rather than left
     * showing a stale value the user could mistake for the
     * real one. Only that one field is affected.
     */
    const scalar = (
        label,
        key,
        value,
        unit = "",
        editable = true
    ) => {
        const isUnknown =
            showKnown &&
            !known(key);

        return `
        <div class="drawing-property-grid drawing-property-grid-value${isUnknown ? " drawing-property-unknown" : ""}">
            <span class="drawing-property-grid-label">${label}</span>
            ${editable
                ? `<input type="number" step="any"
                        data-property="${key}"
                        class="${isUnknown ? "drawing-property-input-unknown" : ""}"
                        aria-label="${label}"
                        ${isUnknown ? 'value=""' : `value="${number(value)}"`}
                        ${isUnknown || fixed(key) ? "disabled" : ""}>`
                : `<span class="drawing-property-readonly">${number(value)}</span>`}
            <span class="drawing-property-unit">
                ${unit}
                ${editable && showKnown ? knownBox(key, label) : ""}
            </span>
            ${editable ? fixBox(key, label) : "<span></span>"}
        </div>
    `;
    };

    const coordinate = (
        label,
        key,
        value,
        unit = "mm"
    ) => `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">${label}</span>
            <input type="number" step="any"
                data-property="${key}"
                aria-label="${label}"
                value="${number(value)}"
                ${fixed(key) ? "disabled" : ""}>
            <span class="drawing-property-unit">${unit}</span>
            ${fixBox(key, label)}
        </div>
    `;

    const section = label =>
        `<div class="drawing-properties-section">${label}</div>`;

    /*
     * The Features panel names the feature from its own
     * authoritative type, using the same label the toolbar
     * and the Feature Tree use, so a Distributed Load never
     * shows its raw internal type here.
     */
    const typeLabel =
        STATICS_FEATURE_LABELS[object.type] ||
        {
            line: "Line",
            point: "Point",
            polyline: "Polyline",
            triangle: "Triangle",
            polygon: "Polygon",
            circle: "Circle",
            arc: "Arc",
            rectangle: "Rectangle",
            "reference-axis-x-positive": "Reference Axis +X",
            "reference-axis-x-negative": "Reference Axis -X",
            "reference-axis-y-positive": "Reference Axis +Y",
            "reference-axis-y-negative": "Reference Axis -Y",
            [COORDINATE_SYSTEM_TYPE]: "2D Coordinate System"
        }[object.type] || object.type;

    rows.push(featureHeaderMarkup(object, typeLabel));

    if (object.type === "line") {
        const dx = geometry.end.x - geometry.start.x;
        const dy = geometry.end.y - geometry.start.y;
        rows.push(section("START POINT"));
        rows.push(coordinate("X", "start.x", geometry.start.x));
        rows.push(coordinate("Y", "start.y", geometry.start.y));
        rows.push(section("END POINT"));
        rows.push(coordinate("X", "end.x", geometry.end.x));
        rows.push(coordinate("Y", "end.y", geometry.end.y));
        rows.push(section("MEASUREMENTS"));
        rows.push(scalar("Length", "length", Math.hypot(dx, dy), "mm"));
        rows.push(scalar("Angle", "angle", Math.atan2(dy, dx) * 180 / Math.PI, " · "));
    } else if (object.type === "point") {
        const position =
            geometry.position || geometry.point || geometry;

        rows.push(section("POSITION"));
        rows.push(coordinate("X", "position.x", position.x));
        rows.push(coordinate("Y", "position.y", position.y));
        rows.push(section("APPEARANCE"));
        rows.push(pointSizeMarkup(object));

        return `<div class="drawing-properties-block">
            <div class="drawing-properties-title">${object.name}</div>
            ${rows.join("")}
        </div>`;
    } else if (object.type === "circle") {
        rows.push(section("CENTER"));
        rows.push(coordinate("X", "center.x", geometry.center.x));
        rows.push(coordinate("Y", "center.y", geometry.center.y));
    } else if (object.type === "arc") {
        rows.push(section("CENTER"));
        rows.push(coordinate("X", "center.x", geometry.center.x));
        rows.push(coordinate("Y", "center.y", geometry.center.y));
        rows.push(section("GEOMETRY"));
        rows.push(scalar("Radius", "radius", geometry.radius, "mm"));
        rows.push(scalar("Start Angle", "startAngle", geometry.startAngle * 180 / Math.PI, " · "));
        rows.push(scalar("End Angle", "endAngle", geometry.endAngle * 180 / Math.PI, " · "));
        rows.push(scalar("Included", "includedAngle",
            ((geometry.sweep ?? (geometry.endAngle - geometry.startAngle)) * 180 / Math.PI),
            " · ", false));
    } else if (object.type === "particle") {
        /*
         * A particle is defined by its position alone: its
         * size and rotation are irrelevant by definition.
         */
        rows.push(section("POSITION"));
        rows.push(coordinate("X", "position.x", geometry.position.x));
        rows.push(coordinate("Y", "position.y", geometry.position.y));
    } else if (object.type === "rigid-body") {
        /*
         * A rigid body is one body whose outline can be any of
         * the supported shapes. Only the properties that
         * actually control the current shape are shown, so the
         * panel always offers everything needed to manipulate
         * the body and nothing that does not apply to it.
         *
         * The Shape control rewrites this same body. It never
         * replaces the feature, so the name, the id and any
         * attached loads all survive the change.
         */
        rows.push(
            rigidBodyShapeMarkup(
                object,
                { coordinate, scalar, section }
            )
        );
    } else if (
        object.type === "beam" ||
        object.type === "truss" ||
        object.type === "cable" ||
        object.type === "shaft"
    ) {
        /*
         * Slender members are defined by their two ends.
         * Each exposes the properties that matter for its
         * own engineering role, on top of the shared
         * endpoints and length.
         */
        rows.push(section("GEOMETRY"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));

        if (object.type === "beam") {
            rows.push(section("SECTION"));
            rows.push(scalar("Depth", "depth",
                Number(geometry.depth) || 0, "mm"));
        } else if (object.type === "truss") {
            rows.push(section("TRUSS"));
            rows.push(`
                <div class="drawing-property-grid drawing-property-grid-value">
                    <span class="drawing-property-grid-label">Panels</span>
                    <input type="number" step="1" min="2"
                        data-property="panels"
                        aria-label="Panels"
                        value="${Math.round(Number(geometry.panels) || 4)}"
                        ${fixed("panels") ? "disabled" : ""}>
                    <span class="drawing-property-unit"></span>
                    <span></span>
                </div>
            `);
        } else if (object.type === "cable") {
            rows.push(section("CABLE"));
            rows.push(scalar("Tension", "tension",
                Number(geometry.tension) || 0, "N"));
        } else {
            rows.push(section("SHAFT"));
            rows.push(scalar("Diameter", "diameter",
                Number(geometry.diameter) || 0, "mm"));
            rows.push(scalar("Torque", "torque",
                Number(geometry.torque) || 0, "N·m"));
        }
    } else if (object.type === "force") {
        /*
         * A Point Force is authoritative as a two-point vector.
         * Magnitude and angle are derived from start/end, while
         * the panel exposes the application point and the two
         * equivalent force representations.
         */
        const start =
            geometry.start ||
            geometry.position ||
            { x: 0, y: 0 };

        const end =
            geometry.end || {
                x: start.x +
                    (Number(geometry.magnitude) || 0) *
                    Math.cos((Number(geometry.angle) || 0) * Math.PI / 180),
                y: start.y +
                    (Number(geometry.magnitude) || 0) *
                    Math.sin((Number(geometry.angle) || 0) * Math.PI / 180)
            };

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const magnitude = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        rows.push(section("APPLICATION POINT"));
        rows.push(coordinate("X", "start.x", start.x));
        rows.push(coordinate("Y", "start.y", start.y));
        rows.push(section("FORCE"));
        rows.push(scalar("Magnitude", "magnitude", magnitude, "N"));
        rows.push(scalar("Angle", "angle", angle, "°"));
        rows.push(coordinate("End X", "end.x", end.x));
        rows.push(coordinate("End Y", "end.y", end.y));
        rows.push(scalar("Fx", "forceX", dx, "N"));
        rows.push(scalar("Fy", "forceY", dy, "N"));
    } else if (object.type === "moment") {
        rows.push(section("MOMENT"));
        rows.push(coordinate("Position X", "position.x", geometry.position.x));
        rows.push(coordinate("Position Y", "position.y", geometry.position.y));
        rows.push(scalar("Magnitude", "magnitude",
            Number(geometry.magnitude) || 0, "N·m"));
        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Direction</span>
                <select data-property="clockwise" aria-label="Direction">
                    <option value="false"${geometry.clockwise ? "" : " selected"}>Anticlockwise</option>
                    <option value="true"${geometry.clockwise ? " selected" : ""}>Clockwise</option>
                </select>
                <span class="drawing-property-unit"></span>
                <span></span>
            </div>
        `);
    } else if (object.type === "varying-load") {
        /*
         * A varying distributed load carries an intensity at
         * each end, so one feature describes a triangular or
         * trapezoidal distribution.
         */
        rows.push(section("VARYING LOAD"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));
        rows.push(scalar("Start Magnitude", "startIntensity",
            Number(geometry.startIntensity) || 0, "N/mm"));
        rows.push(scalar("End Magnitude", "endIntensity",
            Number(geometry.endIntensity) || 0, "N/mm"));
    } else if (object.type === "couple") {
        /*
         * A couple is one feature with a magnitude and the
         * separation between the two lines of action. The pair
         * of arrows it draws is not two separate forces.
         */
        rows.push(section("COUPLE"));
        rows.push(coordinate("Position X", "position.x", geometry.position.x));
        rows.push(coordinate("Position Y", "position.y", geometry.position.y));
        rows.push(scalar("Magnitude", "magnitude",
            Number(geometry.magnitude) || 0, "N·m"));
        rows.push(scalar("Separation", "separation",
            Number(geometry.separation) || 0, "mm"));
        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Direction</span>
                <select data-property="clockwise" aria-label="Direction">
                    <option value="false"${geometry.clockwise ? "" : " selected"}>Anticlockwise</option>
                    <option value="true"${geometry.clockwise ? " selected" : ""}>Clockwise</option>
                </select>
                <span class="drawing-property-unit"></span>
                <span></span>
            </div>
        `);
    } else if (object.type === "load") {
        rows.push(section("DISTRIBUTED LOAD"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));
        rows.push(scalar("Intensity", "intensity",
            Number(geometry.intensity) || 0, "N/m"));
    } else if (
        object.type === "pin-support" ||
        object.type === "roller-support" ||
        object.type === "fixed-support" ||
        object.type === "smooth-support"
    ) {
        /*
         * Each support variant is its own feature with its own
         * position and orientation, so the panel names the
         * variant the student actually placed.
         */
        rows.push(section(staticsSupportSection(object.type)));
        rows.push(coordinate("Position X", "position.x", geometry.position.x));
        rows.push(coordinate("Position Y", "position.y", geometry.position.y));
        rows.push(scalar("Orientation", "orientation",
            Number(geometry.orientation) || 0, "°"));
    } else if (
        object.type === "pin-connection" ||
        object.type === "fixed-connection" ||
        object.type === "slider-connection"
    ) {
        /*
         * Each connection variant is a real feature, so it is
         * named for itself rather than as a generic connection.
         */
        rows.push(section(staticsConnectionSection(object.type)));
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));
    } else if (object.type === "connection") {
        rows.push(section("CONNECTION"));
        rows.push(coordinate("Start X", "start.x", geometry.start.x));
        rows.push(coordinate("Start Y", "start.y", geometry.start.y));
        rows.push(coordinate("End X", "end.x", geometry.end.x));
        rows.push(coordinate("End Y", "end.y", geometry.end.y));
        rows.push(scalar("Reaction", "reaction",
            Number(geometry.reaction) || 0, "N"));
    } else if (
        object.type === "support" ||
        object.type === "body"
    ) {
        rows.push(section(
            object.type === "support"
                ? "SUPPORT"
                : "BODY"
        ));
        rows.push(coordinate("Position X", "position.x", geometry.position.x));
        rows.push(coordinate("Position Y", "position.y", geometry.position.y));
    } else if (object.type === "polygon") {
        /*
         * The definition is remembered from creation so
         * the panel can lead with the matching view,
         * but the underlying parameters are the same.
         */
        const definition =
            object.metadata?.definition ||
            "By Centre";

        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Definition</span>
                <span class="drawing-property-readonly">${definition}</span>
                <span class="drawing-property-unit"></span>
                <span></span>
            </div>
        `);

        rows.push(section("GEOMETRY"));
        rows.push(`
            <div class="drawing-property-grid drawing-property-grid-value">
                <span class="drawing-property-grid-label">Number of Sides</span>
                <input type="number" step="1" min="3"
                    data-property="sides"
                    aria-label="Number of Sides"
                    value="${Math.round(Number(geometry.sides) || 3)}"
                    ${fixed("sides") ? "disabled" : ""}>
                <span class="drawing-property-unit"></span>
                <span></span>
            </div>
        `);
        rows.push(coordinate("Centre X", "center.x", geometry.center.x));
        rows.push(coordinate("Centre Y", "center.y", geometry.center.y));
        rows.push(scalar("Radius", "radius", geometry.radius, "mm"));
        rows.push(scalar("Rotation", "rotation",
            (Number(geometry.rotation) || 0) * 180 / Math.PI, "°"));
    } else if (
        object.type ===
            "reference-axis-x-positive" ||
        object.type ===
            "reference-axis-x-negative" ||
        object.type ===
            "reference-axis-y-positive" ||
        object.type ===
            "reference-axis-y-negative"
    ) {
        /*
         * Legacy reference-axis features from older files
         * are still editable so saved drawings keep
         * working.
         */
        rows.push(section("ORIGIN"));
        rows.push(coordinate("X", "origin.x", geometry.origin.x));
        rows.push(coordinate("Y", "origin.y", geometry.origin.y));
        rows.push(section("GEOMETRY"));
        rows.push(scalar("Axis Length", "axisLength",
            Number(geometry.axisLength) || 25, "mm"));
    } else if (object.type === "rectangle") {
        const center = {
            x: geometry.position.x + geometry.width / 2,
            y: geometry.position.y - geometry.height / 2
        };
        rows.push(section("GEOMETRY"));
        rows.push(coordinate("Centre X", "centre.x", center.x));
        rows.push(coordinate("Centre Y", "centre.y", center.y));
        rows.push(scalar("Width", "width", geometry.width, "mm"));
        rows.push(scalar("Height", "height", geometry.height, "mm"));
        rows.push(scalar("Rotation", "rotation", geometry.rotation || 0, "°"));
    } else if (object.type === "polyline") {
        rows.push(section("GEOMETRY"));
        (geometry.points || []).forEach((p, index) => {
            rows.push(coordinate(`Point ${index + 1} X`, `points.${index}.x`, p.x));
            rows.push(coordinate(`Point ${index + 1} Y`, `points.${index}.y`, p.y));
        });
    } else if (object.type === "triangle") {
        /*
         * The triangle has its own editor so the
         * Points and Sides & Angles views can share
         * one set of stored points.
         */
        return trianglePropertyMarkup(object, trianglePanelMode(object));
    } else if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * One feature with four independent extensions.
         * Editing any one value changes only that side.
         */
        rows.push(section("ORIGIN"));
        rows.push(coordinate("Origin X", "origin.x", geometry.origin.x));
        rows.push(coordinate("Origin Y", "origin.y", geometry.origin.y));
        rows.push(section("AXIS EXTENSIONS"));
        rows.push(scalar("X Positive Length", "xPositiveLength",
            geometry.xPositiveLength ?? geometry.axisLength ?? 25, "mm"));
        rows.push(scalar("X Negative Length", "xNegativeLength",
            geometry.xNegativeLength ?? geometry.axisLength ?? 25, "mm"));
        rows.push(scalar("Y Positive Length", "yPositiveLength",
            geometry.yPositiveLength ?? geometry.axisLength ?? 25, "mm"));
        rows.push(scalar("Y Negative Length", "yNegativeLength",
            geometry.yNegativeLength ?? geometry.axisLength ?? 25, "mm"));
    }

    rows.push(appearanceMarkup(object));

    return `<div class="drawing-properties-block">
        <div class="drawing-properties-title">${object.name}</div>
        ${rows.join("")}
    </div>`;
}

/*
 * Point markers are drawn at a fixed screen size, so
 * the only meaningful appearance control is the
 * marker size itself.
 */
function pointSizeMarkup(
    object
) {
    const size =
        Number(
            object.style.pointSize
        ) || 6;

    return `
        <div class="drawing-property-grid drawing-property-grid-value">
            <span class="drawing-property-grid-label">Point Size</span>
            <input type="number" step="1" min="1"
                data-style="pointSize"
                aria-label="Point Size"
                value="${Number(size).toFixed(2)}">
            <span class="drawing-property-unit">px</span>
            <span></span>
        </div>
    `;
}

/*
 * The triangle panel has two views over the same
 * stored points. The chosen view is remembered per
 * object so switching back and forth preserves the
 * triangle instead of rebuilding it.
 */
const trianglePanelModes =
    new Map();

function trianglePanelMode(
    object
) {
    return (
        trianglePanelModes.get(
            object.id
        ) || "points"
    );
}

/*
 * Wrap every numeric input in the panel with the
 * shared stepper.
 *
 * Doing this in one place means each Features panel
 * gets identical arrows pinned to the far right,
 * without every feature having to build its own
 * control.
 */
function enhanceNumericInputs(
    root
) {
    root.querySelectorAll('input[type="number"]').forEach(input => {
        if (
            input.parentElement &&
            input.parentElement.classList.contains(
                "drawing-number-field"
            )
        ) {
            return;
        }

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "drawing-number-field";

        input.parentNode.insertBefore(
            wrapper,
            input
        );

        wrapper.appendChild(
            input
        );

        const stepper =
            document.createElement("div");

        stepper.className =
            "drawing-number-stepper";

        stepper.innerHTML = `
            <button type="button" tabindex="-1"
                aria-label="Increase" data-step="1"></button>
            <button type="button" tabindex="-1"
                aria-label="Decrease" data-step="-1"></button>
        `;

        wrapper.appendChild(
            stepper
        );

        stepper.querySelectorAll("[data-step]").forEach(button => {
            button.addEventListener("click", () => {
                if (input.disabled) {
                    return;
                }

                /*
                 * The spinner moves in whole units of the
                 * property's own unit, so one press is
                 * always exactly +1 or -1. The input's own
                 * step attribute is deliberately not used
                 * here, because values like "any" and "5"
                 * would otherwise produce unpredictable
                 * jumps between unrelated magnitudes.
                 */
                const amount = 1;

                const current =
                    Number(input.value);

                const base =
                    Number.isFinite(current)
                        ? current
                        : 0;

                const next =
                    base +
                    amount *
                        Number(button.dataset.step);

                const min =
                    input.getAttribute("min");

                input.value =
                    min !== null &&
                    Number.isFinite(Number(min)) &&
                    next < Number(min)
                        ? String(Number(min))
                        : String(
                            Number(
                                next.toFixed(6)
                            )
                        );

                /*
                 * Dispatch only `change`. The numeric handler
                 * runs `apply()` on both `input` and
                 * `change`, so firing both would apply the
                 * step twice and the geometry would jump far
                 * more than one increment.
                 */
                input.dispatchEvent(
                    new Event(
                        "change",
                        {
                            bubbles: true
                        }
                    )
                );
            });
        });
    });
}

/*
 * The current measured value of a constrained property,
 * used to pin a Fix control to the value it locks in.
 */
function currentPropertyValue(
    object,
    key
) {
    const g =
        object.geometry || {};

    const measurements =
        object.type === "triangle"
            ? triangleMeasurements(
                (g.points || []).filter(
                    Boolean
                )
            )
            : null;

    const sideMatch =
        /^side(\d)$/.exec(key);

    if (sideMatch && measurements) {
        return measurements.sides[
            Number(sideMatch[1]) - 1
        ];
    }

    const angleMatch =
        /^angle(\d)$/.exec(key);

    if (angleMatch && measurements) {
        return measurements.angles[
            Number(angleMatch[1]) - 1
        ];
    }

    if (key === "length") {
        return Math.hypot(
            g.end.x - g.start.x,
            g.end.y - g.start.y
        );
    }

    if (key === "angle") {
        return (
            Math.atan2(
                g.end.y - g.start.y,
                g.end.x - g.start.x
            ) *
            180 /
            Math.PI
        );
    }

    if (key === "radius") {
        return Number(g.radius);
    }

    /*
     * Coordinate keys resolve through the geometry path.
     */
    const parts =
        String(key).split(".");

    let cursor =
        g;

    for (const part of parts) {
        if (
            cursor ===
            null ||
            typeof cursor !== "object"
        ) {
            return NaN;
        }

        cursor = cursor[part];
    }

    return Number(cursor);
}

/*
 * Change the outline of a rigid body in place.
 *
 * The body keeps its identity, its name and its attachments:
 * only the geometry that describes its outline is rewritten, so
 * a body that changes from a rectangle to a circle is still the
 * same Rigid Body rather than a newly created feature.
 */
function setRigidBodyShape(
    object,
    shape
) {
    if (
        !enggFeatureGeometry
            .RIGID_BODY_SHAPES
            .includes(shape)
    ) {
        return false;
    }

    const g = object.geometry;

    if (
        enggFeatureGeometry
            .rigidBodyShape(g) === shape
    ) {
        return false;
    }

    /*
     * The size the body already has is what the new shape is
     * built from, so changing the outline does not also resize
     * the body out from under the student.
     */
    const centre =
        enggFeatureGeometry.rigidBodyCenter(
            g
        ) || { x: 0, y: 0 };

    const width =
        Number(g.width) || 60;

    const height =
        Number(g.height) || 40;

    const rotation =
        Number(g.rotation) || 0;

    if (shape === "circle") {
        delete g.position;
        delete g.width;
        delete g.height;
        delete g.points;

        g.center = {
            x: centre.x,
            y: centre.y
        };
        g.radius =
            Math.max(width, height) / 2;
    } else if (shape === "triangle") {
        delete g.position;
        delete g.width;
        delete g.height;
        delete g.center;
        delete g.radius;

        g.points =
            enggFeatureGeometry
                .trianglePointsFor(
                    centre,
                    width,
                    height
                );
    } else if (shape === "polygon") {
        delete g.position;
        delete g.width;
        delete g.height;
        delete g.points;

        g.center = {
            x: centre.x,
            y: centre.y
        };
        g.sides = 5;
        g.radius = Math.max(width, height) / 2;
    } else {
        delete g.center;
        delete g.radius;
        delete g.points;
        delete g.sides;

        g.position = {
            x: centre.x - width / 2,
            y: centre.y + height / 2
        };
        g.width = width;
        g.height = height;
    }

    g.shape = shape;
    g.rotation = rotation;

    return true;
}

/*
 * Move a rigid body so its centre lands on a given axis value.
 *
 * The body is moved as one piece through the shared transform, so
 * a circle or a triangle translates the same way a rectangle does
 * and no part of it is left behind.
 */
function moveRigidBodyTo(
    object,
    axis,
    value
) {
    const g = object.geometry;

    const current =
        enggFeatureGeometry.rigidBodyCenter(
            g
        );

    if (!current) {
        return;
    }

    enggFeatureGeometry.translateObject(
        object,
        axis === "x"
            ? value - current.x
            : 0,
        axis === "y"
            ? value - current.y
            : 0
    );
}

/*
 * Resize a rigid body along one axis.
 *
 * A rectangle and a polygon resize through their own defining
 * size. A circle has only one dimension, so changing its width
 * sets its radius, which is the closest honest equivalent.
 */
function resizeRigidBody(
    object,
    axis,
    value
) {
    const g = object.geometry;

    const shape =
        enggFeatureGeometry.rigidBodyShape(g);

    if (shape === "circle") {
        setRigidBodyRadius(object, value / 2);
        return;
    }

    if (shape === "polygon") {
        setRigidBodyRadius(object, value / 2);
        return;
    }

    if (shape === "triangle") {
        /*
         * A triangle has no width or height of its own, so a
         * size change scales its vertices about the body's
         * centre. Scaling rather than translating keeps the
         * triangle centred where it was.
         */
        const centre =
            enggFeatureGeometry
                .rigidBodyCenter(g);

        const current = triangleExtent(g, centre, axis);

        if (!centre || !current) {
            return;
        }

        const factor = value / current;

        const component = axis === "width" ? "x" : "y";

        (g.points || [])
            .filter(Boolean)
            .forEach(point => {
                point[component] =
                    centre[component] +
                    (point[component] - centre[component]) *
                        factor;
            });

        return;
    }

    g[axis] = value;
}

/*
 * The current extent of a triangle along one axis.
 *
 * Measured across the three vertices rather than taken from any
 * stored value, because a triangle has no width or height field
 * to read it from.
 */
function triangleExtent(
    g,
    centre,
    axis
) {
    const points = (g.points || []).filter(Boolean);

    if (!points.length) {
        return 0;
    }

    const values = points.map(point => point[axis]);

    return Math.max(...values) - Math.min(...values);
}

/*
 * Set the size of a rigid body that is defined by a single radius.
 *
 * A circle and a polygon both measure from their centre outwards,
 * so one radius covers both.
 */
function setRigidBodyRadius(
    object,
    radius
) {
    const g = object.geometry;

    g.radius = radius;
}

function bindFeaturePropertyControls(object) {
    drawingProperties.querySelectorAll('[data-triangle-mode]').forEach(input => {
        input.addEventListener('click', () => {
            trianglePanelModes.set(
                object.id,
                input.dataset.triangleMode
            );

            renderProperties();
        });
    });

    /*
     * Feature Name writes to the object itself, so the
     * Feature Tree, the selection and this panel all
     * show the same name.
     */
    drawingProperties.querySelectorAll('[data-feature-name]').forEach(input => {
        input.addEventListener('change', () => {
            const name =
                input.value.trim();

            if (!name) {
                renderProperties();
                return;
            }

            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            object.name =
                name;

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderCurrentDrawing();
            renderProperties();
        });
    });

    /*
     * Appearance controls write straight to the
     * object's style and repaint immediately.
     */
    drawingProperties.querySelectorAll('[data-style]').forEach(input => {
        input.addEventListener('change', () => {
            const key =
                input.dataset.style;

            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            if (key === 'lineWidth') {
                const width =
                    Number(input.value);

                if (
                    !Number.isFinite(width) ||
                    width <= 0
                ) {
                    renderProperties();
                    return;
                }

                object.style.lineWidth =
                    width;
            } else if (key === 'pointSize') {
                const size =
                    Number(input.value);

                if (
                    !Number.isFinite(size) ||
                    size <= 0
                ) {
                    renderProperties();
                    return;
                }

                object.style.pointSize =
                    size;
            } else {
                object.style.lineType =
                    input.value;
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderCurrentDrawing();
            renderProperties();
        });
    });

    /*
     * Select-based statics properties, such as a moment's
     * direction. These are not style values, so they are
     * written straight onto the geometry.
     */
    drawingProperties.querySelectorAll('select[data-property]').forEach(select => {
        select.addEventListener('change', () => {
            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            object.geometry[
                select.dataset.property
            ] =
                select.value === 'true';

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderCurrentDrawing();
            renderProperties();
        });
    });

    /*
     * Unknown toggles for statics values. Stored on the
     * feature alongside its other state, so it persists
     * through selection, undo/redo and save/load.
     *
     * Marking a quantity Unknown retires the number it had:
     * there is no longer an authoritative value, so the
     * field is cleared and the old one is not kept as a
     * hidden fallback. Only this one quantity is affected,
     * so the rest of the feature stays fully editable.
     */
    drawingProperties.querySelectorAll('[data-known]').forEach(button => {
        button.addEventListener('click', () => {
            const previous =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            object.unknownValues ||= {};

            const key =
                button.dataset.known;

            const wasKnown =
                object.unknownValues[key] !== true;

            if (wasKnown) {
                object.unknownValues[key] = true;
            } else {
                delete object.unknownValues[key];
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderProperties();
            renderCurrentDrawing();
        });
    });

    /*
     * A rigid body's Shape control rewrites the same body rather
     * than replacing it, so the feature keeps its identity and
     * everything attached to it.
     */
    drawingProperties.querySelectorAll('[data-rigid-shape]').forEach(select => {
        select.addEventListener('change', () => {
            const previous = enggDrawingState.snapshotDrawing(drawingState);

            if (!setRigidBodyShape(object, select.value)) {
                return;
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previous
            );

            renderProperties();
            renderCurrentDrawing();
        });
    });

    drawingProperties.querySelectorAll('[data-fix]').forEach(input => {
        input.addEventListener('change', () => {
            const previous = enggDrawingState.snapshotDrawing(drawingState);

            object.constraints ||= {};

            const key =
                input.dataset.fix;

            object.constraints[key] =
                input.checked;

            /*
             * A fixed property records the value it is
             * pinned to, so later edits can restore it
             * exactly instead of recomputing it from
             * geometry that may have moved.
             */
            if (input.checked) {
                const measured =
                    currentPropertyValue(
                        object,
                        key
                    );

                if (Number.isFinite(measured)) {
                    object.constraints[
                        `${key}Value`
                    ] = measured;
                }
            } else {
                delete object.constraints[
                    `${key}Value`
                ];
            }

            enggDrawingState.commitDrawingChange(drawingState, previous);
            renderProperties();
            renderCurrentDrawing();
        });
    });

    drawingProperties.querySelectorAll('[data-property]').forEach(input => {
        /*
         * Numeric fields update on both `input` (which
         * fires for typing and for the spinner arrows)
         * and `change` (which fires on blur/commit), so
         * either method moves the real geometry.
         */
        /*
         * The pre-edit snapshot is taken when the field is
         * first focused, before any mutation happens. The
         * `input` event fires while typing, so snapshotting
         * inside `apply()` would record the already-changed
         * geometry and make Undo a no-op.
         */
        let previous = null;

        const capture = () => {
            if (!previous) {
                previous =
                    enggDrawingState.snapshotDrawing(
                        drawingState
                    );
            }
        };

        const apply = () => {
            const raw =
                input.value.trim();

            const value =
                Number(raw);

            if (
                raw === "" ||
                !Number.isFinite(value)
            ) {
                return false;
            }

            return updateFeatureProperty(
                object,
                input.dataset.property,
                value
            );
        };

        input.addEventListener('focus', capture);

        input.addEventListener('pointerdown', capture);

        input.addEventListener('keydown', capture);

        input.addEventListener('input', () => {
            capture();

            if (apply()) {
                renderCurrentDrawing();
            }
        });

        input.addEventListener('change', () => {
            apply();

            if (previous) {
                enggDrawingState.commitDrawingChange(
                    drawingState,
                    previous
                );
            }

            previous = null;

            renderProperties();
            renderCurrentDrawing();
        });
    });
}


/*
 * Rebuild a triangle's points from sides and
 * angles.
 *
 * Sides are the primary constraint because a side
 * triple determines the triangle shape uniquely
 * (SSS). Angles only act as a fallback for the
 * cases sides cannot cover, and are never applied
 * all at once, because three angles that do not sum
 * to 180 degrees are contradictory and would
 * produce invalid geometry.
 */
function applyTriangleSidesAndAngles(
    object,
    key,
    value
) {
    const g =
        object.geometry;

    const points =
        (g.points || []).filter(
            Boolean
        );

    if (points.length < 3) {
        return false;
    }

    const measurements =
        triangleMeasurements(points);

    if (!measurements) {
        return false;
    }

    const fixed = name =>
        Boolean(object.constraints?.[name]);

    const positive = value > 0;

    const sideIndex =
        /^side(\d)$/.exec(key);

    const angleIndex =
        /^angle(\d)$/.exec(key);

    if (sideIndex) {
        if (!positive || fixed(key)) {
            return false;
        }

        const index =
            Number(sideIndex[1]) - 1;

        /*
         * Other sides that the user has fixed must keep
         * their exact values, so they are restored from the
         * constraint rather than recomputed from geometry.
         */
        const sideKeys = [
            "side1",
            "side2",
            "side3"
        ];

        /*
         * A new side length must still close the
         * triangle: the two remaining sides have to
         * be able to span it.
         */
        const others =
            measurements.sides.filter(
                (_, position) =>
                    position !== index
            );

        if (
            value >=
                others[0] +
                others[1] - 1e-9 ||
            value <=
                Math.abs(
                    others[0] -
                    others[1]
                ) + 1e-9
        ) {
            return false;
        }

        /*
         * Rebuild from point 1 and point 2 using the
         * new side 1 length, then place point 3 from
         * the two fixed remaining sides.
         */
        const sides =
            measurements.sides.slice();

        sides[index] = value;

        /*
         * Re-assert every fixed side, so a change to one
         * side can never silently move a constrained one.
         */
        sideKeys.forEach(
            (
                sideKey,
                position
            ) => {
                if (
                    position !== index &&
                    fixed(sideKey)
                ) {
                    sides[position] =
                        Number(
                            object.constraints[
                                `${sideKey}Value`
                            ]
                        );

                    if (
                        !Number.isFinite(
                            sides[position]
                        ) ||
                        sides[position] <= 0
                    ) {
                        sides[position] =
                            measurements.sides[
                                position
                            ];
                    }
                }
            }
        );

        const [sideA, sideB, sideC] =
            sides;

        /*
         * The fixed sides must still be able to form a
         * triangle with the new value.
         */
        if (
            sideA + sideB <= sideC + 1e-9 ||
            sideA + sideC <= sideB + 1e-9 ||
            sideB + sideC <= sideA + 1e-9
        ) {
            return false;
        }

        /*
         * A fixed angle constrains the shape, so the side
         * lengths must still produce it. The angle opposite
         * a side follows from the cosine rule, so each fixed
         * angle is checked against the candidate sides and
         * the edit is refused if it would break one.
         */
        const angleFromSides = (
            opposite,
            first,
            second
        ) => {
            const cosine =
                (
                    first * first +
                    second * second -
                    opposite * opposite
                ) /
                (2 * first * second);

            return (
                Math.acos(
                    Math.max(
                        -1,
                        Math.min(1, cosine)
                    )
                ) *
                180 /
                Math.PI
            );
        };

        /*
         * Angle 1 is opposite side 2, angle 2 opposite side 3
         * and angle 3 opposite side 1, matching the labelling
         * used by triangleMeasurements.
         */
        const candidateAngles = [
            angleFromSides(sideB, sideC, sideA),
            angleFromSides(sideC, sideA, sideB),
            angleFromSides(sideA, sideB, sideC)
        ];

        const brokenAngle =
            [0, 1, 2].some(
                position => {
                    const angleKey =
                        `angle${position + 1}`;

                    if (!fixed(angleKey)) {
                        return false;
                    }

                    const pinned =
                        Number(
                            object.constraints[
                                `${angleKey}Value`
                            ]
                        );

                    if (!Number.isFinite(pinned)) {
                        return false;
                    }

                    return (
                        Math.abs(
                            candidateAngles[position] -
                            pinned
                        ) > 0.5
                    );
                }
            );

        if (brokenAngle) {
            return false;
        }

        /*
         * Keep side 1 between point 1 and point 2,
         * so a change there moves point 2 along the
         * existing direction and then re-solves
         * point 3.
         */
        const first = {
            ...points[0]
        };

        const direction =
            Math.atan2(
                points[1].y -
                    points[0].y,
                points[1].x -
                    points[0].x
            );

        const second = {
            x:
                first.x +
                sideA *
                    Math.cos(direction),

            y:
                first.y +
                sideA *
                    Math.sin(direction)
        };

        const third =
            triangleThirdPoint(
                first,
                second,
                sideB,
                sideC,
                points[2]
            );

        if (!third) {
            return false;
        }

        g.points = [
            first,
            second,
            third
        ];

        return true;
    }

    if (angleIndex) {
        if (!positive || fixed(key)) {
            return false;
        }

        const index =
            Number(angleIndex[1]) - 1;

        const angles =
            measurements.angles.slice();

        /*
         * Do not apply a third angle when the other
         * two already fix the remaining angle, and
         * reject any set that cannot sum to 180
         * degrees.
         */
        const otherAngles =
            angles.filter(
                (_, position) =>
                    position !== index
            );

        if (
            value >= 180 ||
            value +
                otherAngles[0] +
                otherAngles[1] <=
                1e-9
        ) {
            return false;
        }

        angles[index] = value;

        /*
         * Changing one angle breaks the 180 degree rule on
         * its own, so the difference is absorbed by a
         * single other angle wherever that is possible.
         * Only when one angle cannot take the whole change
         * is the remainder shared with the third, so as few
         * values as possible are disturbed.
         */
        const remainder =
            180 - value;

        const otherTotal =
            otherAngles[0] +
            otherAngles[1];

        if (
            remainder <= 0 ||
            otherTotal <= 0
        ) {
            return false;
        }

        const otherIndices =
            [0, 1, 2].filter(
                position =>
                    position !== index
            );

        /*
         * A fixed angle must never be changed indirectly,
         * so the whole remainder has to be absorbed by the
         * angles that are still free.
         */
        const freeIndices =
            otherIndices.filter(
                position =>
                    !fixed(
                        `angle${position + 1}`
                    )
            );

        if (!freeIndices.length) {
            return false;
        }

        /*
         * Restore any fixed angles to the value they were
         * pinned to, then give the remainder to the free
         * angles.
         */
        otherIndices.forEach(
            position => {
                const angleKey =
                    `angle${position + 1}`;

                if (!fixed(angleKey)) {
                    return;
                }

                const pinned =
                    Number(
                        object.constraints[
                            `${angleKey}Value`
                        ]
                    );

                angles[position] =
                    Number.isFinite(pinned) &&
                    pinned > 0
                        ? pinned
                        : otherAngles[
                            otherIndices.indexOf(
                                position
                            )
                        ];
            }
        );

        const freeRemainder =
            remainder -
            otherIndices.reduce(
                (
                    total,
                    position
                ) =>
                    freeIndices.includes(
                        position
                    )
                        ? total
                        : total +
                            angles[position],
                0
            );

        if (freeRemainder <= 0) {
            return false;
        }

        const freeTotal =
            freeIndices.reduce(
                (
                    total,
                    position
                ) =>
                    total +
                    otherAngles[
                        otherIndices.indexOf(
                            position
                        )
                    ],
                0
            );

        if (freeIndices.length === 1) {
            angles[freeIndices[0]] =
                freeRemainder;
        } else if (freeTotal > 0) {
            /*
             * Spread across the free angles in proportion
             * to their current sizes, disturbing as little
             * as possible.
             */
            freeIndices.forEach(
                position => {
                    angles[position] =
                        otherAngles[
                            otherIndices.indexOf(
                                position
                            )
                        ] *
                        (freeRemainder / freeTotal);
                }
            );
        } else {
            return false;
        }

        const total =
            angles[0] +
            angles[1] +
            angles[2];

        /*
         * Guard against any non-finite value reaching the
         * geometry.
         */
        if (
            !Number.isFinite(total) ||
            angles.some(
                angle =>
                    !Number.isFinite(angle) ||
                    angle <= 0
            )
        ) {
            return false;
        }

        if (
            Math.abs(total - 180) > 1e-6
        ) {
            /*
             * The angles no longer form a triangle, so
             * keep the geometry unchanged rather than
             * writing an invalid shape.
             */
            return false;
        }

            /*
             * Choose the base side.
             *
             * When a side is fixed, that side becomes the base
             * and is rebuilt to its pinned length, so an angle
             * change can never disturb a constrained side.
             * Otherwise side 1 stays the base as before.
             */
            const fixedSideIndex =
                [0, 1, 2].find(
                    position => {
                        const pinned =
                            Number(
                                object.constraints[
                                    `side${position + 1}Value`
                                ]
                            );

                        return (
                            fixed(
                                `side${position + 1}`
                            ) &&
                            Number.isFinite(pinned) &&
                            pinned > 0
                        );
                    }
                );

            const baseIndex =
                fixedSideIndex === undefined
                    ? 0
                    : fixedSideIndex;

            const base =
                fixedSideIndex === undefined
                    ? measurements.sides[0]
                    : Number(
                        object.constraints[
                            `side${baseIndex + 1}Value`
                        ]
                    );

            if (
                !Number.isFinite(base) ||
                base <= 0
            ) {
                return false;
            }

            const radians =
                angles.map(
                    angle =>
                        angle *
                        Math.PI /
                        180
                );

            /*
             * Rebuild from side 1 as the base, matching how
             * triangleMeasurements labels the angles:
             *
             *   angle 1 at vertex 0, angle 2 at vertex 1,
             *   angle 3 at vertex 2, so angle 3 is opposite
             *   the base and side 1 = base.
             *
             * The sine rule then gives the other two sides,
             * and the vertices keep their existing order so
             * each angle stays attached to its own vertex.
             */
            const baseAngle =
                Math.sin(radians[2]);

            if (baseAngle <= 1e-9) {
                return false;
            }

            const first = {
                ...points[0]
            };

            const direction =
                Math.atan2(
                    points[1].y - points[0].y,
                    points[1].x - points[0].x
                );

            const second = {
                x:
                    first.x +
                    base *
                        Math.cos(direction),

                y:
                    first.y +
                    base *
                        Math.sin(direction)
            };

            const solved =
                triangleThirdPoint(
                    first,
                    second,
                    base *
                        Math.sin(radians[1]) /
                        baseAngle,
                    base *
                        Math.sin(radians[0]) /
                        baseAngle,
                    points[2]
                );

            if (!solved) {
                return false;
            }

            /*
             * Any other fixed side is honoured by scaling the
             * solved triangle about vertex 0 until that side
             * reaches its pinned length. Scaling keeps every
             * angle intact, so the fixed side and the edited
             * angle are both satisfied.
             */
            const candidate = [
                first,
                second,
                solved
            ];

            const otherFixed =
                [0, 1, 2].find(
                    position =>
                        position !== 0 &&
                        fixed(
                            `side${position + 1}`
                        ) &&
                        Number.isFinite(
                            Number(
                                object.constraints[
                                    `side${position + 1}Value`
                                ]
                            )
                        )
                );

            if (otherFixed !== undefined) {
                const pinned =
                    Number(
                        object.constraints[
                            `side${otherFixed + 1}Value`
                        ]
                    );

                const a =
                    candidate[
                        otherFixed
                    ];

                const b =
                    candidate[
                        (otherFixed + 1) % 3
                    ];

                const current =
                    Math.hypot(
                        b.x - a.x,
                        b.y - a.y
                    );

                if (current > 1e-9 && pinned > 0) {
                    const factor =
                        pinned / current;

                    for (
                        let i = 0;
                        i < candidate.length;
                        i += 1
                    ) {
                        candidate[i] = {
                            x:
                                first.x +
                                (candidate[i].x - first.x) *
                                    factor,

                            y:
                                first.y +
                                (candidate[i].y - first.y) *
                                    factor
                        };
                    }
                }
            }

            g.points = [
                candidate[0],
                candidate[1],
                candidate[2]
            ];

            return true;
        }

    return false;
}

/*
 * Place the third vertex from two known vertices
 * and the two side lengths that reach it, keeping
 * the same side of the base as the current point so
 * the triangle does not flip while being edited.
 */
function triangleThirdPoint(
    first,
    second,
    firstSide,
    secondSide,
    current
) {
    const base =
        distance(first, second);

    if (
        base <= 1e-9 ||
        firstSide <= 1e-9 ||
        secondSide <= 1e-9
    ) {
        return null;
    }

    if (
        firstSide + secondSide <=
            base + 1e-9 ||
        Math.abs(firstSide - secondSide) >=
            base - 1e-9
    ) {
        return null;
    }

    const along =
        (
            base * base +
            firstSide * firstSide -
            secondSide * secondSide
        ) /
        (2 * base);

    const height =
        Math.sqrt(
            Math.max(
                0,
                firstSide * firstSide -
                    along * along
            )
        );

    const direction = {
        x: (second.x - first.x) / base,
        y: (second.y - first.y) / base
    };

    const basePoint = {
        x: first.x + direction.x * along,
        y: first.y + direction.y * along
    };

    /*
     * Two solutions exist; keep the one on the same
     * side of the base as the current vertex.
     */
    const cross =
        direction.x *
            (current.y - first.y) -
        direction.y *
            (current.x - first.x);

    const sign =
        cross >= 0
            ? 1
            : -1;

    return {
        x:
            basePoint.x -
            direction.y *
                height *
                sign,

        y:
            basePoint.y +
            direction.x *
                height *
                sign
    };
}

function updateFeatureProperty(object, key, value) {
    const g = object.geometry;
    const fixed = name => Boolean(object.constraints?.[name]);
    const positive = value > 0;

    if (object.type === 'triangle') {
        /*
         * Point coordinates are the source of truth in
         * Points mode; sides and angles rebuild the
         * points in Sides & Angles mode.
         */
        const pointMatch =
            /^points\.(\d)\.([xy])$/.exec(key);

        if (pointMatch) {
            const index =
                Number(pointMatch[1]);

            const axis =
                pointMatch[2];

            if (
                fixed(`points.${index}`) ||
                !g.points?.[index]
            ) {
                return false;
            }

            g.points[index][axis] =
                value;

            return true;
        }

        if (
            key.startsWith('side') ||
            key.startsWith('angle')
        ) {
            return applyTriangleSidesAndAngles(
                object,
                key,
                value
            );
        }

        return false;
    }

    if (key.startsWith('points.')) {
        const [, index, axis] = key.split('.');
        if (fixed(`points.${index}`) || !g.points?.[index]) return false;
        g.points[index][axis] = value;
        return true;
    }

    if (object.type === 'line') {
        const start = g.start;
        const end = g.end;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        if (key.startsWith('start.') || key.startsWith('end.')) {
            const [pointKey, axis] = key.split('.');
            if (fixed(pointKey) || (fixed('start') && fixed('end'))) return false;
            const point = g[pointKey];
            const otherKey = pointKey === 'start' ? 'end' : 'start';
            const other = g[otherKey];
            const next = { ...point, [axis]: value };
            if (fixed('length') || fixed('angle')) {
                if (fixed(otherKey)) {
                    // A single coordinate cannot be changed independently when
                    // the opposite endpoint and a dimension are both fixed.
                    return false;
                }
                const sign = pointKey === 'start' ? 1 : -1;
                const proposedAngle = Math.atan2(
                    (next.y - other.y) * -sign,
                    (next.x - other.x) * -sign
                );
                const direction = fixed('angle') ? angle : proposedAngle;
                const extent = fixed('length') ? length :
                    Math.hypot(next.x - other.x, next.y - other.y);
                point[axis] = value;
                other.x = next.x + sign * extent * Math.cos(direction);
                other.y = next.y + sign * extent * Math.sin(direction);
            } else {
                point[axis] = value;
            }
            return true;
        }
        if (key === 'length' && positive && !fixed('length')) {
            if (fixed('end') && fixed('start')) return false;
            const target = fixed('end') ? start : end;
            const anchor = fixed('end') ? end : start;
            const direction = fixed('end') ? angle + Math.PI : angle;
            target.x = anchor.x + value * Math.cos(direction);
            target.y = anchor.y + value * Math.sin(direction);
            return true;
        }
        if (key === 'angle' && !fixed('angle')) {
            if (fixed('start') && fixed('end')) return false;
            const radians = value * Math.PI / 180;
            if (fixed('end')) {
                start.x = end.x - length * Math.cos(radians);
                start.y = end.y - length * Math.sin(radians);
            } else {
                end.x = start.x + length * Math.cos(radians);
                end.y = start.y + length * Math.sin(radians);
            }
            return true;
        }
        return false;
    }

    if (
        object.type === "force" ||
        object.type === "support" ||
        object.type === "body" ||
        object.type === "particle" ||
        object.type === "moment" ||
        object.type === "couple" ||
        object.type === "load" ||
        object.type === "varying-load" ||
        object.type === "pin-support" ||
        object.type === "roller-support" ||
        object.type === "fixed-support" ||
        object.type === "smooth-support" ||
        object.type === "pin-connection" ||
        object.type === "fixed-connection" ||
        object.type === "slider-connection" ||
        object.type === "connection"
    ) {
        /*
         * Statics features edit through the same property
         * pipeline as geometry, so snapping, constraints
         * and undo all behave identically.
         */
        if (key.startsWith('position.')) {
            if (fixed('position')) return false;
            g.position[key.split('.')[1]] = value;
            return true;
        }

        if (
            key === 'start.x' || key === 'start.y' ||
            key === 'end.x' || key === 'end.y'
        ) {
            const [pointKey, axis] = key.split('.');
            if (fixed(pointKey)) return false;
            g[pointKey][axis] = value;
            return true;
        }

        if (
            key === 'magnitude' ||
            key === 'angle' ||
            key === 'separation' ||
            key === 'intensity' ||
            key === 'orientation' ||
            key === 'reaction'
        ) {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g[key] = value;
            return true;
        }

        return false;
    }

    if (object.type === 'rigid-body') {
        /*
         * A rigid body is one body whose outline can change, so
         * its properties are written through the shape-aware
         * keys the panel shows. Writing a centre moves the body
         * whole, and writing a size changes the current shape
         * rather than replacing the body.
         */
        if (key.startsWith('rigidCentre.')) {
            if (fixed('rigidCentre')) return false;
            moveRigidBodyTo(object, key.split('.')[1], value);
            return true;
        }

        if (key === 'rigidWidth' || key === 'rigidHeight') {
            if (fixed(key) || !positive) return false;
            resizeRigidBody(object, key === 'rigidWidth' ? 'width' : 'height', value);
            return true;
        }

        if (key === 'rigidRadius') {
            if (fixed(key) || !positive) return false;
            setRigidBodyRadius(object, value);
            return true;
        }

        if (key === 'rigidSides') {
            if (fixed(key)) return false;
            const sides = Math.round(value);
            if (!Number.isFinite(sides) || sides < 3) return false;
            g.sides = sides;
            return true;
        }

        if (key === 'rigidRotation') {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g.rotation = value;
            return true;
        }

        if (key.startsWith('points.')) {
            const [, index, axis] = key.split('.');
            if (fixed(`points.${index}`) || !g.points?.[index]) return false;
            g.points[index][axis] = value;
            return true;
        }

        return false;
    }

    if (
        object.type === 'beam' ||
        object.type === 'truss' ||
        object.type === 'cable' ||
        object.type === 'shaft'
    ) {
        /*
         * Slender members edit through their endpoints, plus
         * whichever property belongs to their own role.
         */
        if (
            key === 'start.x' || key === 'start.y' ||
            key === 'end.x' || key === 'end.y'
        ) {
            const [pointKey, axis] = key.split('.');
            if (fixed(pointKey)) return false;
            g[pointKey][axis] = value;
            return true;
        }

        if (
            key === 'depth' ||
            key === 'panels' ||
            key === 'tension' ||
            key === 'diameter' ||
            key === 'torque' ||
            key === 'startIntensity' ||
            key === 'endIntensity'
        ) {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g[key] = value;
            return true;
        }

        return false;
    }

    if (object.type === 'point') {
        if (fixed('position')) return false;
        const target = g.position || g.point || g;
        const [part, axis] = key.split('.');
        if (part !== 'position') return false;
        target[axis] = value;
        return true;
    }

    if (object.type === 'circle' || object.type === 'arc') {
        if (key.startsWith('center.')) {
            if (fixed('center')) return false;
            g.center[key.split('.')[1]] = value;
            return true;
        }
        if ((key === 'radius' || key === 'diameter') && positive && !fixed(key) && !fixed(key === 'radius' ? 'diameter' : 'radius')) {
            g.radius = key === 'radius' ? value : value / 2;
            return true;
        }
        if (object.type === 'arc') {
            if (fixed(key)) return false;
            if (key === 'startAngle' || key === 'endAngle') {
                if (fixed('includedAngle')) return false;
                g[key] = value * Math.PI / 180;
                g.sweep = g.endAngle - g.startAngle;
                return true;
            }
            if (key === 'includedAngle') {
                if (fixed('endAngle')) return false;
                g.sweep = value * Math.PI / 180;
                g.endAngle = g.startAngle + g.sweep;
                return true;
            }
        }
        return false;
    }

    if (object.type === 'rectangle') {
        if (key.startsWith('centre.')) {
            if (fixed('centre')) return false;
            const axis = key.split('.')[1];
            g.position[axis] = axis === 'x' ? value - g.width / 2 : value + g.height / 2;
            return true;
        }
        if ((key === 'width' || key === 'height') && positive && !fixed(key)) {
            g[key] = value;
            return true;
        }
        if (key === 'rotation' && !fixed(key)) {
            g.rotation = value;
            return true;
        }
        return false;
    }

    if (object.type === 'polygon') {
        /*
         * Every edit writes to the polygon's defining
         * parameters. The vertices are derived from
         * these, so there is no second copy to keep in
         * sync.
         */
        if (key.startsWith('center.')) {
            if (fixed('center')) return false;
            g.center[key.split('.')[1]] = value;
            return true;
        }
        if (key === 'sides') {
            if (fixed('sides')) return false;
            const sides = Math.round(value);
            if (!Number.isFinite(sides) || sides < 3) return false;
            g.sides = sides;
            return true;
        }
        if (key === 'radius') {
            if (fixed('radius') || !positive) return false;
            g.radius = value;
            return true;
        }
        if (key === 'rotation') {
            if (fixed('rotation')) return false;
            g.rotation = value * Math.PI / 180;
            return true;
        }
        return false;
    }

    if (
        object.type ===
            "reference-axis-x-positive" ||
        object.type ===
            "reference-axis-x-negative" ||
        object.type ===
            "reference-axis-y-positive" ||
        object.type ===
            "reference-axis-y-negative"
    ) {
        /*
         * Each axis edits only its own geometry, so a
         * change to one never moves the other three.
         */
        if (key.startsWith('origin.')) {
            if (fixed('origin')) return false;
            g.origin[key.split('.')[1]] = value;
            return true;
        }
        if (key === 'axisLength') {
            if (fixed('axisLength') || !positive) return false;
            g.axisLength = value;
            return true;
        }
        return false;
    }

    if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * One feature, four independent extensions.
         * Writing one length never touches the others.
         */
        if (key.startsWith('origin.')) {
            if (fixed('origin')) return false;
            g.origin[key.split('.')[1]] = value;
            return true;
        }

        if (
            [
                'xPositiveLength',
                'xNegativeLength',
                'yPositiveLength',
                'yNegativeLength',
                'xAxisLength',
                'yAxisLength',
                'axisLength'
            ].includes(key)
        ) {
            if (fixed(key) || !positive) return false;
            g[key] = value;
            return true;
        }
    }
    return false;
}


function syncStyleControls() {
    if (
        !drawingThickness ||
        !drawingColor ||
        !drawingLineType
    ) {
        return;
    }

    const object =
        drawingState.objects.find(
            candidate =>
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        candidate.id
                    )
        );

    const style =
        object?.style ||
        drawingState.styleDefaults;

    /*
     * The thickness control is a select with a fixed set
     * of options. A feature can hold any width (for
     * example 1.5 from the Line Width field), and
     * assigning a value that matches no option leaves the
     * control blank. Add the missing option so the
     * current value is always visible.
     */
    ensureThicknessOption(
        style.lineWidth
    );

    drawingThickness.value =
        String(
            style.lineWidth
        );

    drawingColor.value =
        style.stroke;

    drawingLineType.value =
        style.lineType;
}

/*
 * Make sure the thickness select can display a width,
 * adding an option for values outside the standard set.
 */
function ensureThicknessOption(
    width
) {
    if (!drawingThickness) {
        return;
    }

    const numeric =
        Number(width);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return;
    }

    const value =
        String(numeric);

    const exists =
        [...drawingThickness.options].some(
            option =>
                Number(option.value) ===
                numeric
        );

    if (exists) {
        return;
    }

    const option =
        document.createElement("option");

    option.value = value;
    option.textContent =
        `${numeric.toFixed(2)} mm`;

    drawingThickness.appendChild(
        option
    );
}

function handleCanvasClick(
    event
) {
    /*
     * The colour eyedropper is a one-shot mode: the next
     * click reads a feature's stored colour instead of
     * doing anything else with the click.
     */
    if (eyedropperActive) {
        event.preventDefault();

        pickColourFromFeature(
            event
        );

        return;
    }

    /*
     * A running Modify session owns the click. It is
     * checked before the selection-suppression flag so a
     * staged workflow is never swallowed by a leftover
     * selection drag.
     */
    if (
        modifySession &&
        handleModifyClick(
            resolvePointerEvent(
                event
            ),
            canvasPointFromEvent(
                event,
                false
            ),
            event.shiftKey
        )
    ) {
        selectionClickSuppressed =
            false;

        return;
    }

    if (
        selectionClickSuppressed
    ) {
        selectionClickSuppressed =
            false;

        return;
    }

    /*
     * Resolve the exact click position again.
     *
     * This is important because relying on the
     * previous mousemove resolution can cause a
     * click to use a stale unsnapped point.
     */
    const resolution =
        resolvePointerEvent(
            event
        );

    if (
        drawingState.activeTool ===
        "coordinate-system-2d"
    ) {
        add2DCoordinateSystem(
            resolution.effectiveConstructionPoint
        );

        return;
    }

    if (
        !drawingState.activeTool
    ) {
        return;
    }

    /*
     * A running Modify session owns the click, so its
     * staged workflow is not interrupted by ordinary
     * tool handling.
     */
    if (
        modifySession &&
        handleModifyClick(
            resolution,
            canvasPointFromEvent(
                event,
                false
            )
        )
    ) {
        return;
    }

    if (
        isConstructionTool(
            drawingState.activeTool
        )
    ) {
        beginOrCompleteGeometry(
            resolution
        );

        return;
    }

    if (
        drawingState.activeTool ===
        "select"
    ) {
        /*
         * Selection should use the actual pointer
         * position, not a snapped construction point.
         */
        const rawPoint =
            canvasPointFromEvent(
                event,
                false
            );

        const object =
            objectAtPoint(
                rawPoint
            );

        /*
         * Shift extends the selection: clicking an
         * unselected feature adds it, clicking an already
         * selected feature removes it. Without Shift the
         * click replaces the selection as before.
         */
        if (event.shiftKey) {
            if (object) {
                const selected =
                    drawingState.selection
                        .selectedObjectIds;

                enggDrawingState.selectObjects(
                    drawingState,
                    selected.includes(
                        object.id
                    )
                        ? selected.filter(
                            id =>
                                id !==
                                object.id
                        )
                        : [
                            ...selected,
                            object.id
                        ]
                );
            }
        } else if (object) {
            enggDrawingState.selectObject(
                drawingState,
                object.id
            );
        } else {
            enggDrawingState.clearSelection(
                drawingState
            );
        }

        renderProperties();
        renderCurrentDrawing();
    }
}

function syncSelectionInteraction() {
    if (
        !drawingState.interaction
    ) {
        return;
    }

    if (selectionDrag) {
        drawingState.interaction.selectionStart =
            selectionDrag.start;

        drawingState.interaction.selectionCurrent =
            selectionDrag.current;

        drawingState.interaction.selectionBox =
            selectionDrag.box;

        drawingState.interaction.selectionDragging =
            selectionDrag.moved;
    } else {
        drawingState.interaction.selectionStart =
            null;

        drawingState.interaction.selectionCurrent =
            null;

        drawingState.interaction.selectionBox =
            null;

        drawingState.interaction.selectionDragging =
            false;
    }
}

/*
 * Active direct-manipulation drag.
 *
 * Holds which handle (or body) of which object is being
 * dragged, plus the original geometry so the edit can be
 * applied as a delta from a stable starting point.
 */
let manipulationDrag = null;

/*
 * Abandon an in-flight direct-manipulation drag.
 *
 * The geometry mutates live while dragging, so
 * cancelling has to put the captured originals back,
 * otherwise Esc would leave the shape half-rotated.
 */
function cancelManipulationDrag() {
    if (!manipulationDrag) {
        return;
    }

    const drag =
        manipulationDrag;

    manipulationDrag =
        null;

    if (
        drawingCanvas.hasPointerCapture(
            drag.pointerId
        )
    ) {
        drawingCanvas.releasePointerCapture(
            drag.pointerId
        );
    }

    if (!drag.moved) {
        return;
    }

    /*
     * Restore every object the drag touched from the
     * snapshot taken when the drag began.
     */
    drawingState.objects =
        drawingState.objects.map(
            object =>
                drag.originals[object.id]
                    ? {
                        ...object,

                        geometry:
                            JSON.parse(
                                JSON.stringify(
                                    drag.originals[
                                        object.id
                                    ]
                                )
                            )
                    }
                    : object
        );
}

const MANIPULATION_PICK_PX = 9;

/*
 * Handles for an object, in world coordinates, using the
 * same layout the renderer draws.
 */
/*
 * The features attached to a given body.
 *
 * Attachment is recorded as an authoritative parent id, so
 * the relationship is read from the feature collection and
 * never inferred from where a feature happens to sit.
 */
function attachedChildren(
    parentId
) {
    if (!parentId) {
        return [];
    }

    return drawingState.objects.filter(
        object =>
            object.parentId ===
                parentId
    );
}

/*
 * Move a body and everything attached to it by the same
 * delta.
 *
 * The children are restored to their pre-drag geometry first
 * so the drag applies exactly one translation rather than
 * accumulating, exactly as the rotation path does.
 */
function moveObjectAndChildren(
    object,
    deltaX,
    deltaY,
    originals
) {
    translateObject(
        object,
        deltaX,
        deltaY
    );

    attachedChildren(
        object.id
    ).forEach(child => {
        const original =
            originals?.[child.id];

        if (original) {
            child.geometry =
                JSON.parse(
                    JSON.stringify(
                        original
                    )
                );
        }

        translateObject(
            child,
            deltaX,
            deltaY
        );
    });
}

/*
 * The Statics support variants. They differ in the symbol
 * they draw, not in how they are selected or edited, so
 * they are identified by one shared predicate.
 */
function isSupportType(
    type
) {
    return [
        "pin-support",
        "roller-support",
        "fixed-support",
        "smooth-support"
    ].includes(type);
}

/*
 * The Statics connection variants. Like the supports, they
 * share one behaviour and differ only in symbol.
 */
function isConnectionType(
    type
) {
    return [
        "pin-connection",
        "fixed-connection",
        "slider-connection"
    ].includes(type);
}

/*
 * The bodies a Statics feature may attach to.
 *
 * Only real bodies are eligible, so a force snapped onto a
 * Beam becomes part of that Beam, while one snapped onto a
 * stray Line stays unattached rather than adopting geometry
 * that has no engineering meaning.
 */
function isStaticsBody(
    object
) {
    return Boolean(
        object &&
            STATICS_ATTACHABLE_FEATURES.includes(
                object.type
            )
    );
}

/*
 * Handles for a distributed or varying distributed load.
 *
 * The two ends move the loaded region and the magnitude
 * handle changes the load itself. The arrows are drawn from
 * these values, so dragging a handle is the same action as
 * typing a new intensity in the panel.
 */
function loadHandles(
    object
) {
    const g = object.geometry;

    const handles = [
        { kind: "start", point: g.start },
        { kind: "end", point: g.end }
    ];

    if (object.type === "load") {
        handles.push(
            loadMagnitudeHandle(
                object,
                g.start,
                g.end,
                "intensity"
            )
        );

        return handles;
    }

    handles.push(
        loadMagnitudeHandle(
            object,
            g.start,
            g.end,
            "startIntensity"
        ),

        loadMagnitudeHandle(
            object,
            g.end,
            g.start,
            "startIntensity"
        )
    );

    return handles;
}

/*
 * A point off the loaded region whose distance from one end
 * is proportional to that end's intensity.
 *
 * Placing it this way means the handle is always somewhere
 * useful to grab, and it is derived from the real geometry
 * rather than from a fixed offset.
 */
function loadMagnitudeHandle(
    object,
    from,
    to,
    key
) {
    const g = object.geometry;

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const length =
        Math.hypot(dx, dy) || 1;

    /*
     * The world length of one unit of intensity, so the
     * handle follows the zoom the way every other handle
     * does.
     */
    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    const pixels =
        Math.abs(
            Number(g[key]) || 0
        ) * 6;

    const world =
        pixels / Math.max(scale, 1e-6);

    return {
        kind: `load-${key}`,
        point: {
            x: from.x - (dx / length) * world,
            y: from.y - (dy / length) * world
        }
    };
}

/*
 * Handles for a support: the point where it attaches to its
 * body, and a point one step away that sets which way it
 * faces.
 */
function supportHandles(
    object
) {
    const g = object.geometry;

    const position = g.position;

    if (!position) {
        return [];
    }

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    const reach =
        14 / Math.max(scale, 1e-6);

    const angle =
        (Number(g.orientation) || 0) *
        Math.PI /
        180;

    return [
        {
            kind: "position",
            point: position
        },
        {
            kind: "orientation",
            point: {
                x: position.x - Math.sin(angle) * reach,
                y: position.y + Math.cos(angle) * reach
            }
        }
    ];
}

/*
 * The manipulation handles for a rigid body, in its current shape.
 *
 * Each shape is dragged through the handle that means something
 * for it, and every case writes the same defining values the
 * Features panel writes, so the two can never disagree.
 */
function rigidBodyHandles(
    object
) {
    const g = object.geometry;

    const shape =
        enggFeatureGeometry.rigidBodyShape(g);

    if (shape === "circle") {
        const center = g.center || { x: 0, y: 0 };

        return [
            { kind: "rigid-centre", point: center },
            {
                kind: "rigid-radius",
                point: {
                    x: center.x + (Number(g.radius) || 0),
                    y: center.y
                }
            }
        ];
    }

    if (
        shape === "triangle" ||
        shape === "polygon"
    ) {
        return enggFeatureGeometry
            .definingPoints(g, shape)
            .map((point, index) => ({
                kind: `rigid-vertex${index}`,
                point
            }));
    }

    return enggFeatureGeometry
        .rectangleCorners(g)
        .map((point, index) => ({
            kind: `rigid-corner${index}`,
            point
        }));
}

/*
 * One handle per truss joint.
 *
 * A joint is the distinct set of points the members share, so
 * moving a handle moves a single joint and the members meeting
 * it, rather than one arbitrary end of one member.
 */
function trussJointHandles(
    members
) {
    const joints = [];

    members.forEach(member => {
        [member.start, member.end].forEach(point => {
            const known = joints.find(
                existing =>
                    Math.hypot(
                        existing.x - point.x,
                        existing.y - point.y
                    ) < 1e-6
            );

            if (!known) {
                joints.push({
                    x: point.x,
                    y: point.y
                });
            }
        });
    });

    return joints.map((point, index) => ({
        kind: `truss-joint${index}`,
        point
    }));
}

function manipulationHandles(
    object
) {
    const g =
        object.geometry || {};

    if (object.type === "point") {
        return withRotationHandle(
            object,
            [
                {
                    kind: "position",
                    point: g.position || g.point || g
                }
            ]
        );
    }

    if (object.type === "line") {
        return withRotationHandle(
            object,
            [
                { kind: "start", point: g.start },
                { kind: "end", point: g.end }
            ]
        );
    }

    /*
     * Slender members and spans share the same two-end
     * handle layout as a line, so they reuse the start and
     * end drag kinds rather than a parallel set.
     *
     * A Truss is one feature with two real joints, so the
     * handles move those joints; the members its renderer
     * draws follow from them and the topology is preserved.
     */
    if (
        object.type === "beam" ||
        object.type === "truss" ||
        object.type === "cable" ||
        object.type === "shaft" ||
        object.type === "connection"
    ) {
        return withRotationHandle(
            object,
            [
                { kind: "start", point: g.start },
                { kind: "end", point: g.end }
            ]
        );
    }

    /*
     * A Point Force is a vector, so its two handles are the
     * application point and the end of the arrow. Dragging
     * the start moves where the force acts; dragging the end
     * changes its direction and magnitude. The feature stays
     * one coherent force either way.
     */
    if (object.type === "force") {
        return withRotationHandle(
            object,
            [
                { kind: "start", point: g.start },
                { kind: "end", point: g.end }
            ]
        );
    }

    /*
     * A Truss the student built is dragged by its joints.
     *
     * The members are rebuilt from the joint list when a joint
     * moves, so every member that met it follows and the
     * topology survives. A truss that has no stored joints
     * falls back to the two ends of its span.
     */
    if (
        object.type === "truss" &&
        Array.isArray(g.members) &&
        g.members.length
    ) {
        return withRotationHandle(
            object,
            trussJointHandles(g.members)
        );
    }

    /*
     * A rigid body is one body whose outline can be any of the
     * supported shapes, so its handles follow whichever shape it
     * currently has: corners for a rectangle, a centre and a
     * radius for a circle, and vertices for a triangle or a
     * polygon. The points come from the shared geometry module,
     * which is the same source the renderer and the transforms
     * use, so a handle can never be left on the old shape.
     */
    if (object.type === "rigid-body") {
        return withRotationHandle(
            object,
            rigidBodyHandles(object)
        );
    }

    if (object.type === "particle") {
        return [
            {
                kind: "position",
                point: g.position
            }
        ];
    }

    /*
     * A distributed load is defined by the span it acts on
     * and the intensity of that load, so it is manipulated
     * through its two ends plus a magnitude handle. The
     * rendered arrows are derived from these and are never
     * edited directly.
     */
    if (
        object.type === "load" ||
        object.type === "varying-load"
    ) {
        return withRotationHandle(
            object,
            loadHandles(object)
        );
    }

    /*
     * A support acts at one point on a body and faces a
     * direction, so it has an attachment handle and an
     * orientation handle. Dragging the attachment moves the
     * support along its body while it stays attached.
     */
    if (isSupportType(object.type)) {
        return withRotationHandle(
            object,
            supportHandles(object)
        );
    }

    /*
     * A connection is a joint between two bodies, so it is
     * manipulated through its two actual attachment points.
     */
    if (isConnectionType(object.type)) {
        return withRotationHandle(
            object,
            [
                { kind: "start", point: g.start },
                { kind: "end", point: g.end }
            ]
        );
    }

    /*
     * An applied moment turns about its application point, so
     * that point is its handle. A couple has the same centre
     * plus a separation that sets how far its two arrows sit
     * from it.
     */
    if (object.type === "moment") {
        return withRotationHandle(
            object,
            [
                {
                    kind: "position",
                    point: g.position
                }
            ]
        );
    }

    if (object.type === "couple") {
        return withRotationHandle(
            object,
            [
                {
                    kind: "position",
                    point: g.position
                },
                {
                    kind: "separation",
                    point:
                        enggFeatureGeometry.coupleArrowPoint(
                            g,
                            0
                        )
                }
            ]
        );
    }

    if (object.type === "circle") {
        return withRotationHandle(
            object,
            [
                { kind: "center", point: g.center },
                {
                    kind: "radius",
                    point: {
                        x: g.center.x + g.radius,
                        y: g.center.y
                    }
                }
            ]
        );
    }

    if (object.type === "arc") {
        return withRotationHandle(
            object,
            [
                { kind: "center", point: g.center },
                {
                    kind: "startAngle",
                    point: {
                        x: g.center.x + g.radius * Math.cos(g.startAngle),
                        y: g.center.y + g.radius * Math.sin(g.startAngle)
                    }
                },
                {
                    kind: "endAngle",
                    point: {
                        x: g.center.x + g.radius * Math.cos(g.endAngle),
                        y: g.center.y + g.radius * Math.sin(g.endAngle)
                    }
                }
            ]
        );
    }

    if (isRectangleLike(object)) {
        return withRotationHandle(
            object,
            rectangleCorners(g).map(
                (point, index) => ({
                    kind: `corner${index}`,
                    point
                })
            )
        );
    }

    if (object.type === "triangle") {
        return withRotationHandle(
            object,
            (g.points || []).filter(Boolean).map(
                (point, index) => ({
                    kind: `vertex${index}`,
                    point
                })
            )
        );
    }

    if (object.type === "polygon") {
        return withRotationHandle(
            object,
            enggDrawingState.polygonVertices(g).map(
                (point, index) => ({
                    kind: `vertex${index}`,
                    point
                })
            )
        );
    }

    if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * One handle per axis end plus the origin, so each
         * of the four extensions can be dragged on its own
         * while the feature stays a single object.
         */
        const arms =
            coordinateSystemArms(g).map(
                arm => ({
                    kind: arm.kind,
                    point: arm.end
                })
            );

        arms.push({
            kind: "origin",
            point: g.origin
        });

        return arms;
    }

    if (Array.isArray(g.points)) {
        return withRotationHandle(
            object,
            g.points.map(
                (point, index) => ({
                    kind: `vertex${index}`,
                    point
                })
            )
        );
    }

    return [];
}

/*
 * Append the rotation handle to a feature's manipulation
 * handles so it can be hit-tested and dragged like any
 * other handle.
 *
 * Its position is derived from the current geometry, so
 * it always tracks the shape and can never drift.
 */
function withRotationHandle(
    object,
    handles
) {
    const anchor =
        rotationAnchor(object);

    if (!anchor) {
        return handles;
    }

    return [
        ...handles,
        {
            kind: "rotation",
            point: anchor.handle,
            pivot: anchor.center
        }
    ];
}

/*
 * Centre and rotation-handle point for a feature, in
 * world coordinates. Shared by the renderer and the
 * manipulation layer so the drawn handle and the
 * hit-testable handle can never disagree.
 */
function rotationAnchor(
    object
) {
    const g =
        object.geometry || {};

    /*
     * A point has no extent, so there is nothing to
     * rotate: rotating it about its own centre would
     * leave it exactly where it was. It therefore gets no
     * rotation handle, only its position handle.
     */
    if (object.type === "point") {
        return null;
    }

    /*
     * The centre and the points are both taken from the
     * shared feature-geometry registry, so the handle is
     * always placed from the feature's actual current
     * shape. Recomputing it here from anything else is how
     * a handle ends up stranded at a stale position after
     * a rotation or a drag.
     */
    const points =
        enggFeatureGeometry.definingPoints(
            g,
            object.type
        );

    const valid =
        points.filter(
            point =>
                point &&
                Number.isFinite(point.x) &&
                Number.isFinite(point.y)
        );

    if (!valid.length) {
        return null;
    }

    const center = {
        x:
            valid.reduce(
                (total, point) =>
                    total + point.x,
                0
            ) / valid.length,

        y:
            valid.reduce(
                (total, point) =>
                    total + point.y,
                0
            ) / valid.length
    };

    const top =
        Math.max(
            ...valid.map(
                point =>
                    point.y
            )
        );

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    return {
        center,

        handle: {
            x: center.x,

            y:
                top +
                26 /
                    Math.max(
                        scale,
                        1e-6
                    )
        }
    };
}

/*
 * The four corners of a rectangle, honouring rotation.
 * position is the top-left corner and height extends
 * downward in world space.
 *
 * Shared with the feature-geometry registry so the handles,
 * the hit test and the transform all see the same corners.
 */
function rectangleCorners(
    g
) {
    return enggFeatureGeometry.rectangleCorners(
        g
    );
}

/*
 * Find a handle of a selected object near the cursor.
 * Handles take priority over object bodies.
 */
function handleAtPoint(
    point
) {
    const bounds =
        drawingCanvas.getBoundingClientRect();

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    const tolerance =
        MANIPULATION_PICK_PX /
        Math.max(scale, 1e-6);

    let best = null;

    drawingState.objects.forEach(
        object => {
            if (
                !drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    )
            ) {
                return;
            }

            manipulationHandles(
                object
            ).forEach(
                handle => {
                    const distance =
                        Math.hypot(
                            handle.point.x - point.x,
                            handle.point.y - point.y
                        );

                    if (
                        distance <=
                        tolerance &&
                        (!best ||
                            distance <
                                best.distance)
                    ) {
                        best = {
                            object,
                            handle,
                            distance
                        };
                    }
                }
            );
        }
    );

    return best;
}

/*
 * Begin dragging a handle or an object body. Runs before
 * box-selection so a drag on a handle or a selected
 * object moves geometry instead of starting a box.
 *
 * Handles are draggable whenever they are visible, not
 * only while Select is active, so a shape can be nudged
 * straight after it is created.
 */
function beginManipulationDrag(
    event
) {
    if (
        event.button !== 0 ||
        event.shiftKey
    ) {
        return false;
    }

    /*
     * A running Modify session owns the pointer, so
     * direct manipulation stays out of its way.
     */
    if (modifySession) {
        return false;
    }

    /*
     * An in-progress construction owns the pointer too.
     */
    if (
        drawingState.interaction.phase !==
        "idle"
    ) {
        return false;
    }

    const point =
        canvasPointFromEvent(
            event,
            false
        );

    const hit =
        handleAtPoint(
            point
        );

    if (hit) {
        /*
         * originals is keyed by object id so the commit
         * path can restore any drag shape uniformly.
         */
        manipulationDrag = {
            pointerId: event.pointerId,
            object: hit.object,
            kind: hit.handle.kind,

            /*
             * The rotation handle carries its pivot so the
             * drag rotates about the feature centre even if
             * the handle itself moves during the drag.
             */
            pivot: hit.handle.pivot,

            moved: false,
            start: { ...point },
            originals: {
                [hit.object.id]:
                    JSON.parse(
                        JSON.stringify(
                            hit.object.geometry
                        )
                    )
            }
        };

        drawingCanvas.setPointerCapture(
            event.pointerId
        );

        return true;
    }

    /*
     * Dragging the body of a selected object translates
     * the whole selection.
     */
    const object =
        objectAtPoint(
            point
        );

    if (
        object &&
        drawingState.selection
            .selectedObjectIds
            .includes(
                object.id
            )
    ) {
        manipulationDrag = {
            pointerId: event.pointerId,
            object,
            kind: "body",
            moved: false,
            start: { ...point },
            originals: Object.fromEntries(
                objectsByIds(
                    drawingState.selection
                        .selectedObjectIds
                ).map(
                    item => [
                        item.id,
                        JSON.parse(
                            JSON.stringify(
                                item.geometry
                            )
                        )
                    ]
                )
            )
        };

        drawingCanvas.setPointerCapture(
            event.pointerId
        );

        return true;
    }

    return false;
}

/*
 * Live-update geometry while a manipulation drag is in
 * progress, resolving the cursor through the existing
 * snap/inference pipeline.
 */
function updateManipulationDrag(
    event
) {
    if (
        !manipulationDrag ||
        manipulationDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const resolution =
        resolvePointerEvent(
            event
        );

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    manipulationDrag.moved =
        true;

    applyManipulation(
        manipulationDrag,
        point
    );

    updateInteractionFeedback(
        resolution
    );

    renderCurrentDrawing();
}

function finishManipulationDrag(
    event
) {
    if (
        !manipulationDrag ||
        manipulationDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const drag =
        manipulationDrag;

    manipulationDrag =
        null;

    if (
        drawingCanvas.hasPointerCapture(
            event.pointerId
        )
    ) {
        drawingCanvas.releasePointerCapture(
            event.pointerId
        );
    }

    if (!drag.moved) {
        return;
    }

    /*
     * The geometry changed live during the drag, so the
     * history entry has to record the geometry as it was
     * BEFORE the drag. drag.originals holds exactly that,
     * so the current objects are restored to their
     * originals, that pre-drag state is pushed onto the
     * undo stack, and the dragged result is then put back.
     */
    const dragged =
        JSON.parse(
            JSON.stringify(
                drawingState.objects
            )
        );

    const originalObjects =
        drawingState.objects.map(
            object =>
                drag.originals[object.id]
                    ? {
                        ...object,
                        geometry:
                            JSON.parse(
                                JSON.stringify(
                                    drag.originals[
                                        object.id
                                    ]
                                )
                            )
                    }
                    : object
        );

    enggDrawingState.commitDrawingChange(
        drawingState,
        originalObjects
    );

    drawingState.objects =
        dragged;

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Apply the drag to the real feature data.
 */
function applyManipulation(
    drag,
    point
) {
    const object =
        drag.object;

    const g =
        object.geometry;

    /*
     * Rotation handle.
     *
     * The feature is rebuilt from its stored originals on
     * every move, then rotated by the angle between the
     * grab direction and the current cursor direction
     * about the feature centre. Rebuilding from the
     * originals avoids accumulating rounding, and because
     * the pivot is the centre the shape is preserved.
     */
    if (drag.kind === "rotation") {
        const pivot =
            drag.pivot ||
            rotationAnchor(object)?.center;

        if (!pivot) {
            return;
        }

        const startAngle =
            Math.atan2(
                drag.start.y - pivot.y,
                drag.start.x - pivot.x
            );

        const currentAngle =
            Math.atan2(
                point.y - pivot.y,
                point.x - pivot.x
            );

        const radians =
            currentAngle - startAngle;

        /*
         * Restore the pre-drag geometry before applying
         * the rotation, so the result is always a single
         * clean rotation from the original shape.
         */
        const original =
            drag.originals[object.id];

        if (original) {
            object.geometry =
                JSON.parse(
                    JSON.stringify(
                        original
                    )
                );
        }

        rotateObjectAbout(
            object,
            pivot,
            radians
        );

        /*
         * The features attached to a body turn with it.
         * They are reset to their own pre-drag geometry and
         * then given the same pivot and the same rotation, so
         * a force arrow or a support symbol cannot be left
         * pointing the way it did before the body turned.
         */
        attachedChildren(
            object.id
        ).forEach(child => {
            const childOriginal =
                drag.originals[
                    child.id
                ];

            if (childOriginal) {
                child.geometry =
                    JSON.parse(
                        JSON.stringify(
                            childOriginal
                        )
                    );
            }

            rotateObjectAbout(
                child,
                pivot,
                radians
            );

            /*
             * A support faces a direction as well as sitting
             * at a point, so its orientation turns with the
             * body too.
             */
            if (isSupportType(child.type)) {
                child.geometry.orientation =
                    (Number(child.geometry.orientation) || 0) +
                    radians * 180 / Math.PI;
            }
        });

        return;
    }

    if (drag.kind === "body") {
        const deltaX =
            point.x -
            drag.start.x;

        const deltaY =
            point.y -
            drag.start.y;

        /*
         * A body carries its attached Statics features with
         * it. They are restored to their pre-drag geometry
         * and then translated by the same delta as the body,
         * so a load or a support cannot be left behind at
         * stale world coordinates while the body it acts on
         * moves away.
         */
        const originals =
            drag.originals;

        moveObjectAndChildren(
            object,
            deltaX,
            deltaY,
            originals
        );

        return;
    }

    const original =
        drag.originals;

    if (object.type === "point") {
        const target =
            g.position || g.point || g;

        target.x = point.x;
        target.y = point.y;
        return;
    }

    if (object.type === "line") {
        if (drag.kind === "start") {
            g.start = { x: point.x, y: point.y };
        } else {
            g.end = { x: point.x, y: point.y };
        }

        return;
    }

    if (object.type === "circle") {
        if (drag.kind === "center") {
            g.center = { x: point.x, y: point.y };
        } else {
            g.radius = Math.max(
                Math.hypot(
                    point.x - g.center.x,
                    point.y - g.center.y
                ),
                1e-6
            );
        }

        return;
    }

    if (object.type === "arc") {
        if (drag.kind === "center") {
            g.center = { x: point.x, y: point.y };
            return;
        }

        /*
         * Dragging an endpoint keeps the centre and the
         * other endpoint, and re-derives radius and the
         * swept angle so the arc stays coherent.
         */
        const fixedAngle =
            drag.kind === "startAngle"
                ? g.endAngle
                : g.startAngle;

        const angle =
            Math.atan2(
                point.y - g.center.y,
                point.x - g.center.x
            );

        g.radius = Math.max(
            Math.hypot(
                point.x - g.center.x,
                point.y - g.center.y
            ),
            1e-6
        );

        if (drag.kind === "startAngle") {
            g.startAngle = angle;
        } else {
            g.endAngle = angle;
        }

        const sweep =
            g.endAngle -
            g.startAngle;

        if (g.sweep !== undefined) {
            g.sweep =
                sweep === 0
                    ? g.sweep
                    : Math.sign(sweep) *
                        Math.abs(g.sweep);
        }

        void fixedAngle;
        return;
    }

    /*
     * A truss joint.
     *
     * Moving a joint moves every member that meets it, so the
     * structure stays connected instead of one member pulling
     * away from the rest.
     */
    const jointMatch =
        /^truss-joint(\d)$/.exec(drag.kind);

    if (jointMatch) {
        moveTrussJoint(
            object,
            Number(jointMatch[1]),
            point
        );

        return;
    }

    /*
     * RIGID BODY HANDLES
     *
     * Each handle writes the same defining value the Features
     * panel writes for the body's current shape, so dragging
     * and typing are the same action and cannot disagree.
     */
    if (drag.kind.startsWith("rigid-")) {
        applyRigidBodyHandle(
            object,
            drag,
            point
        );

        return;
    }

    if (isRectangleLike(object)) {
        /*
         * Resize by moving one corner while the opposite
         * corner stays put. A fixed width or height is
         * respected by keeping that dimension unchanged.
         */
        const index =
            Number(
                drag.kind.replace("corner", "")
            );

        const corners =
            rectangleCorners(
                original
            );

        const opposite =
            corners[(index + 2) % 4];

        const minX =
            Math.min(opposite.x, point.x);

        const maxX =
            Math.max(opposite.x, point.x);

        const minY =
            Math.min(opposite.y, point.y);

        const maxY =
            Math.max(opposite.y, point.y);

        g.width = maxX - minX;
        g.height = maxY - minY;
        g.position = {
            x: minX,
            y: maxY
        };
        g.rotation = 0;
        return;
    }

    /*
     * Statics features are edited through their own
     * engineering data, so a handle moves the quantity the
     * handle stands for rather than a generic vertex. Each
     * case writes to the authoritative field, which is the
     * same value the Features panel edits, so the two can
     * never disagree.
     */
    if (isStaticsFeature(object)) {
        applyStaticsManipulation(
            object,
            drag,
            point
        );

        return;
    }

    if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * Dragging an arm end changes only that side's
         * length. The origin and the other three arms are
         * left exactly as they were.
         */
        if (drag.kind === "origin") {
            g.origin = { x: point.x, y: point.y };
            return;
        }

        const lengths = {
            xPositive: "xPositiveLength",
            xNegative: "xNegativeLength",
            yPositive: "yPositiveLength",
            yNegative: "yNegativeLength"
        };

        const key =
            lengths[drag.kind];

        if (!key) {
            return;
        }

        const measured =
            drag.kind.startsWith("x")
                ? Math.abs(point.x - g.origin.x)
                : Math.abs(point.y - g.origin.y);

        g[key] = Math.max(measured, 1e-6);

        return;
    }

    if (
        object.type === "triangle" ||
        object.type === "polygon" ||
        Array.isArray(g.points)
    ) {
        const index =
            Number(
                drag.kind.replace("vertex", "")
            );

        if (object.type === "polygon") {
            /*
             * A polygon is defined by centre, radius and
             * rotation, so dragging a vertex re-derives
             * those rather than storing loose points.
             */
            g.radius = Math.max(
                Math.hypot(
                    point.x - g.center.x,
                    point.y - g.center.y
                ),
                1e-6
            );

            const sides =
                Math.max(
                    3,
                    Math.round(
                        Number(g.sides) || 3
                    )
                );

            g.rotation =
                Math.atan2(
                    point.y - g.center.y,
                    point.x - g.center.x
                ) -
                (index * 2 * Math.PI) / sides;

            return;
        }

        if (Array.isArray(g.points) && g.points[index]) {
            g.points[index].x = point.x;
            g.points[index].y = point.y;
        }
    }
}

/*
 * Whether a feature is one of the Statics engineering
 * features, as opposed to shared or construction geometry.
 *
 * The Statics features are edited through their own
 * engineering data, so this one predicate routes all of them
 * through the same handling instead of each one growing a
 * special case.
 */
function isStaticsFeature(
    object
) {
    return Boolean(
        object &&
            object.engineering
                ?.discipline ===
                "statics" &&
                STATICS_FEATURE_LABELS[
                    object.type
                ]
    );
}

/*
 * Apply one direct-manipulation step to a Statics feature.
 *
 * Each branch writes the real engineering field: a force's
 * application point, a load's intensity, a support's facing
 * direction. The rendered arrows and symbols are derived
 * from these, so dragging a handle updates the drawing
 * exactly as typing in the panel would.
 */
function applyStaticsManipulation(
    object,
    drag,
    point
) {
    const g = object.geometry;

    const kind = drag.kind;

    /*
     * The two ends of a span-shaped feature: a member, a
     * load's loaded region, a connection, or a force's
     * application point and vector end.
     */
    if (
        kind === "start" ||
        kind === "end"
    ) {
        g[kind] = {
            x: point.x,
            y: point.y
        };

        /*
         * Moving an attachment is how a feature is aimed at
         * a different body. The existing snap already knows
         * what is under the cursor, so the parent is
         * re-read and the feature is reparented rather than
         * duplicated.
         */
        if (kind === "start") {
            updateAttachment(
                object,
                point
            );
        }

        return;
    }

    /*
     * A load's magnitude handle. Its distance from the span
     * is the intensity, so dragging it out makes the load
     * heavier and dragging it in makes it lighter.
     */
    if (kind.startsWith("load-")) {
        const key =
            kind.replace("load-", "");

        if (!g.start || !g.end) {
            return;
        }

        const from =
            key === "startIntensity"
                ? g.start
                : g.end;

        const scale =
            enggDrawingState.BASE_PIXELS_PER_UNIT *
            drawingState.camera.zoom;

        const world =
            Math.hypot(
                point.x - from.x,
                point.y - from.y
            );

        g[key] = Math.max(
            (world * Math.max(scale, 1e-6)) / 6,
            0
        );

        return;
    }

    /*
     * A support's orientation handle. The support turns to
     * face the direction the handle is dragged in while its
     * attachment point stays put.
     */
    if (kind === "orientation") {
        if (!g.position) {
            return;
        }

        g.orientation =
            (Math.atan2(
                point.x - g.position.x,
                point.y - g.position.y
            ) * 180) /
            Math.PI;

        return;
    }

    /*
     * A couple's separation handle sets how far its two
     * arrows sit from its centre.
     */
    if (kind === "separation") {
        if (!g.position) {
            return;
        }

        g.separation = Math.max(
            Math.abs(point.y - g.position.y) * 2,
            1e-6
        );

        return;
    }

    if (kind === "position" && g.position) {
        g.position = {
            x: point.x,
            y: point.y
        };

        updateAttachment(
            object,
            point
        );
    }
}

/*
 * Re-read the parent of an attached feature from a point.
 *
 * The relationship is stored as the actual feature id of the
 * body the point resolved onto, so dropping a force onto a
 * different Beam moves that one feature under the new parent.
 * It is never re-created, and it is never inferred later from
 * proximity.
 */
function updateAttachment(
    object,
    point
) {
    const target =
        staticsBodyAtPoint(point);

    const parentId =
        target ? target.id : null;

    if (object.parentId === parentId) {
        return;
    }

    object.parentId =
        parentId ??
        undefined;
}

/*
 * The body under a point, or null.
 *
 * Used when dragging an attachment so the feature follows the
 * body the cursor is actually over.
 */
function staticsBodyAtPoint(
    point
) {
    const hit = objectAtPoint(point);

    return isStaticsBody(hit) ? hit : null;
}

/*
 * Take the body a Statics feature will act on.
 *
 * A feature like a load or a support only means something
 * relative to a body, so the first click names that body and
 * nothing is created yet. The valid placement locations then
 * appear along it, and the feature is built on a later click.
 */
function beginStaticsAttachment(
    resolution
) {
    const point =
        resolution.effectiveConstructionPoint;

    const body =
        staticsAttachmentId(
            resolution.snapCandidate
        )
            ? drawingState.objects.find(
                  object =>
                      object.id ===
                      staticsAttachmentId(
                          resolution.snapCandidate
                      )
              )
            : staticsBodyAtPoint(point);

    if (!body) {
        setToolMessage(
            "Select a body to attach to"
        );

        return;
    }

    enggDrawingState.setInteraction(
        drawingState,
        {
            ...resolution,

            phase:
                "statics-attach",

            staticsTarget: body,

            attachmentPoints: [],

            points: []
        }
    );

    setToolMessage(
        staticsBodyMessage(
            drawingState.activeTool,
            1
        )
    );

    renderCurrentDrawing();
}

/*
 * Advance a body-attached feature by one placed point.
 *
 * The points are collected rather than committed, so the
 * whole feature is created once its data is complete. The
 * body is resolved from the snap, so the relationship is
 * stored as the body's actual feature id.
 */
function continueStaticsAttachment(
    resolution
) {
    const interaction =
        drawingState.interaction;

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    const placed = [
        ...(interaction.attachmentPoints ||
            []),
        { ...point }
    ];

    const required =
        staticsToolPointCount(
            drawingState.activeTool
        );

    if (placed.length < required) {
        /*
         * The first end is in. The preview now shows the
         * whole region being loaded, so the second end can
         * be judged against it.
         */
        enggDrawingState.setInteraction(
            drawingState,
            {
                ...resolution,

                phase:
                    "statics-attach",

                staticsTarget:
                    interaction.staticsTarget,

                attachmentPoints:
                    placed,

                points: placed
            }
        );

        setToolMessage(
            staticsBodyMessage(
                drawingState.activeTool,
                2
            )
        );

        renderCurrentDrawing();
        return;
    }

    commitStaticsAttachment(
        placed,
        resolution
    );
}

/*
 * Create the feature once every required point is placed.
 *
 * One feature is created, holding the loaded region, its
 * intensities and the body's id. The repeated arrows are
 * drawn from that data by the renderer and are never separate
 * features.
 */
function commitStaticsAttachment(
    points,
    resolution
) {
    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const toolId =
        drawingState.activeTool;

    const type =
        STATICS_CHILD_TOOLS[toolId]?.type;

    const interaction =
        drawingState.interaction;

    const body =
        interaction.staticsTarget;

    const start = points[0];
    const end =
        points[1] ?? points[0];

    let object = null;

    if (type === "load") {
        /*
         * A uniform load carries one intensity across the whole
         * region it acts on.
         */
        object =
            enggDrawingState.geometryFactories.load(
                start,
                end,
                10,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (type === "varying-load") {
        /*
         * A varying load carries an intensity at each end, so
         * it is built through its own factory rather than by
         * reusing the uniform one.
         */
        object =
            enggDrawingState.geometryFactories[
                "varying-load"
            ](
                start,
                end,
                0,
                10,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (type === "moment") {
        object =
            enggDrawingState.geometryFactories.moment(
                start,
                50,
                false,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (
        type === "pin-support" ||
        type === "roller-support" ||
        type === "fixed-support" ||
        type === "smooth-support"
    ) {
        object =
            enggDrawingState.geometryFactories[type](
                start,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (isConnectionType(type)) {
        object =
            enggDrawingState.geometryFactories[type](
                start,
                end,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    } else if (type === "couple") {
        object =
            enggDrawingState.geometryFactories.couple(
                start,
                50,
                40,
                false,
                staticsAttachedStyle(
                    toolId,
                    body
                )
            );
    }

    if (!object) {
        setToolMessage(
            "That tool could not be created"
        );

        return;
    }

    /*
     * The relationship is the body's real feature id, so the
     * Feature Tree nests the result under the body it acts on
     * and a later move of that body carries it along.
     */
    object.parentId =
        body?.id ??
        undefined;

    enggDrawingState.addObject(
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

    /*
     * The feature is finished, so the operation is dropped
     * and the tool asks for its body again. Staying armed
     * makes placing a second load on the same or another
     * body one click shorter, without the next one silently
     * attaching to the body that was just used.
     */
    setToolMessage(
        isBodyAttachedTool(toolId)
            ? staticsBodyMessage(
                  toolId,
                  0
              )
            : staticsInstruction(toolId)
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The style and engineering record for an attached feature.
 *
 * It is the same record every other Statics feature gets, so
 * an attached feature is identified exactly like a free one.
 */
function staticsAttachedStyle(
    toolId,
    body
) {
    return {
        style: {
            ...drawingState.styleDefaults
        },

        engineering: {
            plane: "XY",
            discipline: "statics",
            staticsType: toolId
        },

        parentId: body?.id ?? undefined
    };
}

/*
 * Abandon an unfinished Statics operation.
 *
 * The preview and the temporary target are dropped and no
 * feature is created, so a cancelled load or support leaves the
 * body exactly as it was. This is what Esc and choosing
 * another tool both go through.
 */
function cancelStaticsInteraction() {
    const interaction =
        drawingState.interaction;

    const wasAttaching =
        interaction.phase ===
            "statics-attach" ||
        Boolean(interaction.staticsTarget);

    enggDrawingState.clearInteraction(
        drawingState
    );

    if (wasAttaching) {
        enggDrawingState.setActiveTool(
            drawingState,
            "select"
        );

        setToolMessage(
            "Select geometry"
        );

        renderEngineeringTools(
            activeCategory()
        );
    }

    return wasAttaching;
}

/*
 * Move one truss joint and every member that meets it.
 *
 * The members are stored as endpoints, so a joint is found by
 * the coordinates that members share. Every occurrence moves
 * together, which is what keeps the structure connected.
 */
function moveTrussJoint(
    object,
    index,
    point
) {
    const g = object.geometry;

    if (!Array.isArray(g.members)) {
        return;
    }

    const joints = trussJointHandles(
        g.members
    );

    const joint = joints[index];

    if (!joint) {
        return;
    }

    const dx = point.x - joint.point.x;
    const dy = point.y - joint.point.y;

    g.members.forEach(member => {
        [
            member.start,
            member.end
        ].forEach(endpoint => {
            if (
                Math.hypot(
                    endpoint.x - joint.point.x,
                    endpoint.y - joint.point.y
                ) < 1e-6
            ) {
                endpoint.x += dx;
                endpoint.y += dy;
            }
        });
    });

    /*
     * The span end points track the outer joints, so a
     * selection box still covers the whole structure.
     */
    const first = g.members[0]?.start;
    const last =
        g.members[g.members.length - 1]
            ?.end;

    if (first && last) {
        g.start = { ...first };
        g.end = { ...last };
    }
}

/*
 * Apply one drag to a rigid body handle.
 *
 * The handle stands for a value in the body's current shape,
 * so it writes that value directly. A corner resizes against
 * the opposite corner, a vertex moves that vertex, and a radius
 * handle measures from the centre, which is how each of those
 * shapes is actually defined.
 */
function applyRigidBodyHandle(
    object,
    drag,
    point
) {
    const g = object.geometry;

    const kind = drag.kind;

    if (kind === "rigid-centre") {
        moveRigidBodyTo(object, "x", point.x);
        moveRigidBodyTo(object, "y", point.y);
        return;
    }

    if (kind === "rigid-radius") {
        const center =
            g.center || { x: 0, y: 0 };

        setRigidBodyRadius(
            object,
            Math.hypot(
                point.x - center.x,
                point.y - center.y
            )
        );

        return;
    }

    const vertexMatch =
        /^rigid-vertex(\d)$/.exec(kind);

    if (vertexMatch) {
        const index = Number(vertexMatch[1]);

        if (!g.points?.[index]) {
            return;
        }

        g.points[index].x = point.x;
        g.points[index].y = point.y;
        return;
    }

    const cornerMatch =
        /^rigid-corner(\d)$/.exec(kind);

    if (cornerMatch) {
        const index = Number(cornerMatch[1]);

        const corners = enggFeatureGeometry
            .rectangleCorners(g);

        const opposite =
            corners[(index + 2) % 4];

        if (!opposite) {
            return;
        }

        /*
         * The corner follows the cursor while the opposite
         * corner stays put, so a rectangle is resized rather
         * than moved.
         */
        const minX = Math.min(opposite.x, point.x);
        const maxX = Math.max(opposite.x, point.x);
        const minY = Math.min(opposite.y, point.y);
        const maxY = Math.max(opposite.y, point.y);

        g.width = Math.max(maxX - minX, 1e-6);
        g.height = Math.max(maxY - minY, 1e-6);
        g.position = { x: minX, y: maxY };
    }
}

function beginSelectionDrag(
    event
) {
    if (
        drawingState.activeTool !==
            "select" ||
        event.button !== 0
    ) {
        return;
    }

    const point =
        canvasPointFromEvent(
            event
        );

    if (
        objectAtPoint(
            point
        )
    ) {
        return;
    }

    selectionClickSuppressed =
        false;

    selectionDrag = {
        pointerId:
            event.pointerId,

        start:
            point,

        current:
            point,

        moved:
            false,

        box: {
            start:
                point,

            end:
                point,

            minX:
                point.x,

            maxX:
                point.x,

            minY:
                point.y,

            maxY:
                point.y
        }
    };

    drawingCanvas.setPointerCapture(
        event.pointerId
    );

    syncSelectionInteraction();
}

function updateSelectionDrag(
    event
) {
    if (
        !selectionDrag ||
        selectionDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const point =
        canvasPointFromEvent(
            event
        );

    const start =
        selectionDrag.start;

    const moved =
        distance(
            start,
            point
        ) > 1;

    selectionDrag.current =
        point;

    selectionDrag.moved =
        moved;

    selectionDrag.box = {
        start,

        end:
            point,

        minX:
            Math.min(
                start.x,
                point.x
            ),

        maxX:
            Math.max(
                start.x,
                point.x
            ),

        minY:
            Math.min(
                start.y,
                point.y
            ),

        maxY:
            Math.max(
                start.y,
                point.y
            )
    };

    selectionClickSuppressed =
        selectionClickSuppressed ||
        moved;

    syncSelectionInteraction();

    if (moved) {
        setToolMessage(
            "Select components"
        );

        drawingState.selection
            .boxSelectionIds =
            drawingState.objects
                .filter(
                    object =>
                        objectInsideSelection(
                            object,
                            selectionDrag.box
                        )
                )
                .map(
                    object =>
                        object.id
                );

        renderProperties();
        renderCurrentDrawing();
    }
}

function finishSelectionDrag(
    event
) {
    if (
        !selectionDrag ||
        selectionDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const currentSelection =
        selectionDrag;

    if (
        currentSelection.moved
    ) {
        const ids =
            drawingState.objects
                .filter(
                    object =>
                        objectInsideSelection(
                            object,
                            currentSelection.box
                        )
                )
                .map(
                    object =>
                        object.id
                );

        enggDrawingState.selectObjects(
            drawingState,
            ids
        );
    }

    drawingState.selection
        .boxSelectionIds = [];

    if (
        drawingCanvas.hasPointerCapture(
            event.pointerId
        )
    ) {
        drawingCanvas.releasePointerCapture(
            event.pointerId
        );
    }

    selectionDrag =
        null;

    syncSelectionInteraction();

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}

function cancelInteraction() {
    if (
        selectionDrag
    ) {
        if (
            drawingCanvas.hasPointerCapture(
                selectionDrag.pointerId
            )
        ) {
            drawingCanvas.releasePointerCapture(
                selectionDrag.pointerId
            );
        }

        selectionDrag =
            null;
    }

    /*
     * Any transient creation popup goes with the
     * cancelled operation.
     */
    closePolygonSidesPrompt();
    closeCoordinateSystemMenu();

    /*
     * A running Modify session is part of the
     * unfinished operation, so it is abandoned too.
     */
    cancelModifySession();

    /*
     * An in-flight manipulation drag has already moved
     * real geometry, so it must be rolled back rather
     * than merely abandoned.
     */
    cancelManipulationDrag();

    /*
     * The active tool highlight always goes with the
     * cancelled operation.
     */
    clearGlobalToolHighlight();

    enggDrawingState.clearInteraction(
        drawingState
    );

    drawingState.selection
        .boxSelectionIds = [];

    drawingState.selection
        .hoveredObjectId = null;

    drawingState.selection
        .selectedObjectIds = [];

    /*
     * Cancelling always returns to Select, so the user
     * is never left inside a half-finished tool.
     */
    enggDrawingState.setActiveTool(
        drawingState,
        "select"
    );

    setToolMessage(
        "Select geometry"
    );

    renderEngineeringTools(
        activeCategory()
    );

    renderProperties();
    renderCurrentDrawing();
}

function finishPolyline() {
    const points =
        drawingState.interaction.points;

    if (
        drawingState.activeTool !==
            "polyline" ||
        points.length < 2
    ) {
        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    enggDrawingState.addObject(
        drawingState,

        enggDrawingState.geometryFactories.polyline(
            [
                ...points
            ],

            {
                style: {
                    ...drawingState.styleDefaults
                },

                engineering:
                    currentEngineeringMetadata()
            }
        )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

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
 * Global toolbar tools.
 *
 * Modify tools act on the selected geometry using the
 * existing selection and history systems. View tools
 * only move the camera, so they never touch geometry.
 */
/*
 * Active Modify session.
 *
 * A session holds the workflow the user is part way
 * through, so a Modify tool can span several clicks
 * (base point, pivot, mirror axis) and can be
 * cancelled cleanly at any stage.
 */
let modifySession = null;

function beginModifySession(
    kind
) {
    cancelModifySession();

    modifySession = {
        kind,

        /*
         * Selected ids are captured up front so the
         * geometry being changed cannot shift under the
         * operation if the selection changes.
         */
        ids: [
            ...drawingState.selection
                .selectedObjectIds
        ],

        /*
         * Mirror skips its object-selection stage when the
         * user already selected the features before
         * activating the tool, so it goes straight to
         * "Select mirror line or point" as specified.
         */
        stage:
            kind === "mirror" &&
            drawingState.selection
                .selectedObjectIds.length
                ? "axis"
                : "base",

        basePoint:
            null,

        pivot:
            null,

        axisStart:
            null,

        axisEnd:
            null,

        boundaryId:
            null,

        preview:
            null
    };
}

function cancelModifySession() {
    /*
     * The toolbar highlight is cleared even when no
     * session is running, so a cancelled tool never
     * looks active.
     */
    clearGlobalToolHighlight();

    if (!modifySession) {
        return;
    }

    modifySession =
        null;

    drawingState.interaction.preview =
        null;

    drawingState.interaction.previewObjects =
        [];

    renderCurrentDrawing();
}

/*
 * Modify tools start an interactive session rather than
 * applying a fixed offset. Geometry only changes when
 * the user commits.
 */
function activateGlobalTool(
    toolId,
    button
) {
    if (toolId === "pan") {
        activateTool("pan");
        setToolMessage(
            "Drag to pan the view"
        );
        return;
    }

    if (toolId === "zoom") {
        /*
         * Zoom in one step around the canvas centre,
         * matching the toolbar zoom buttons.
         */
        const bounds =
            drawingCanvas.getBoundingClientRect();

        zoomAtCanvasPoint(
            drawingState.camera.zoom * 1.2,
            {
                clientX:
                    bounds.left +
                    bounds.width / 2,

                clientY:
                    bounds.top +
                    bounds.height / 2
            }
        );

        setToolMessage(
            "Zoom"
        );
        return;
    }

    if (toolId === "fit") {
        fitDrawingToView();
        return;
    }

    /*
     * Mirror begins by selecting what to mirror, so it is
     * the one Modify tool that does not require an
     * existing selection.
     */
    if (toolId === "mirror") {
        enggDrawingState.setActiveTool(
            drawingState,
            "select"
        );

        beginModifySession("mirror");

        setToolMessage(
            modifySession.ids.length
                ? "Select mirror line or point"
                : "Select objects to mirror"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        !drawingState.selection
            .selectedObjectIds.length
    ) {
        setToolMessage(
            "Select geometry first"
        );

        return;
    }

    if (toolId === "move") {
        beginModifySession("move");

        setToolMessage(
            "Specify base point"
        );

        return;
    }

    if (toolId === "rotate") {
        beginModifySession("rotate");

        setToolMessage(
            "Specify rotation pivot"
        );

        return;
    }

    if (toolId === "trim") {
        beginModifySession("trim");

        setToolMessage(
            "Select the boundary to trim against"
        );

        return;
    }

    if (toolId === "extend") {
        beginModifySession("extend");

        setToolMessage(
            "Select the boundary to extend to"
        );
    }
}

/*
 * Build ghost copies of the objects being modified, so
 * the user sees the result before committing. The
 * originals are left untouched; these are throwaway
 * previews rendered with preview styling.
 */
function buildModifyPreview(
    transform
) {
    if (!modifySession) {
        return;
    }

    const ghosts =
        objectsByIds(
            modifySession.ids
        ).map(
            object => {
                const ghost =
                    JSON.parse(
                        JSON.stringify(
                            object
                        )
                    );

                ghost.id =
                    `preview-${object.id}`;

                transform(ghost);

                return ghost;
            }
        );

    drawingState.interaction.previewObjects =
        ghosts;
}

function clearModifyPreview() {
    drawingState.interaction.previewObjects =
        [];
}

/*
 * Live preview while a Modify session is in its final
 * stage, driven from the resolved cursor position.
 */
function updateModifyPreview(
    resolution
) {
    if (!modifySession) {
        return;
    }

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        clearModifyPreview();
        return;
    }

    if (
        modifySession.kind === "move" &&
        modifySession.stage === "target" &&
        modifySession.basePoint
    ) {
        const deltaX =
            point.x - modifySession.basePoint.x;

        const deltaY =
            point.y - modifySession.basePoint.y;

        buildModifyPreview(
            ghost =>
                translateObject(
                    ghost,
                    deltaX,
                    deltaY
                )
        );

        return;
    }

    if (
        modifySession.kind === "rotate" &&
        modifySession.stage === "target" &&
        modifySession.pivot
    ) {
        const radians =
            Math.atan2(
                point.y - modifySession.pivot.y,
                point.x - modifySession.pivot.x
            ) -
            (modifySession.rotateStart || 0);

        buildModifyPreview(
            ghost =>
                rotateObjectAbout(
                    ghost,
                    modifySession.pivot,
                    radians
                )
        );

        return;
    }

    if (
        modifySession.kind === "mirror" &&
        modifySession.stage === "axis-end" &&
        modifySession.axisStart
    ) {
        /*
         * Preview against the provisional axis while the
         * user is still choosing its second point.
         */
        buildModifyPreview(
            ghost =>
                mirrorObjectAcrossLine(
                    ghost,
                    modifySession.axisStart,
                    point
                )
        );
    }
}

/*
 * Handle a canvas click while a Modify session is
 * running. Each tool advances through its own stages
 * and commits only on the final click.
 */
function handleModifyClick(
    resolution,
    rawPoint,
    shiftHeld = false
) {
    if (!modifySession) {
        return false;
    }

    const point =
        resolution.effectiveConstructionPoint ||
        rawPoint;

    if (!point) {
        return true;
    }

    const session =
        modifySession;

    /*
     * Mirror first needs the objects to mirror.
     */
    if (
        session.kind === "mirror" &&
        session.stage === "base"
    ) {
        const object =
            objectAtPoint(
                rawPoint
            );

        if (object) {
            /*
             * Accumulate the selection so a multi-selection
             * can be built before the axis is chosen.
             * Shift-click toggles an object in or out, and
             * clicking empty space confirms the set and
             * moves on to the axis stage.
             */
            const alreadySelected =
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    );

            /*
             * Shift extends the set; a plain click starts
             * a fresh selection, matching the Select tool.
             */
            if (shiftHeld) {
                enggDrawingState.selectObjects(
                    drawingState,
                    alreadySelected
                        ? drawingState.selection
                            .selectedObjectIds
                            .filter(
                                id =>
                                    id !==
                                    object.id
                            )
                        : [
                            ...drawingState.selection
                                .selectedObjectIds,
                            object.id
                        ]
                );
            } else {
                enggDrawingState.selectObjects(
                    drawingState,
                    [
                        object.id
                    ]
                );
            }

            session.ids = [
                ...drawingState.selection
                    .selectedObjectIds
            ];

            setToolMessage(
                `${session.ids.length} selected · click empty space to set the mirror axis`
            );

            renderProperties();
            renderCurrentDrawing();
        } else {
            /*
             * Empty space ends the object-selection stage
             * and begins defining the axis.
             */
            if (!session.ids.length) {
                setToolMessage(
                    "Select objects to mirror"
                );

                return true;
            }

            session.stage =
                "axis";

            setToolMessage(
                "Select mirror line or point"
            );

            renderCurrentDrawing();
        }

        return true;
    }

    if (
        session.kind === "trim" ||
        session.kind === "extend"
    ) {
        return handleTrimExtendClick(
            session,
            rawPoint,
            point
        );
    }

    if (session.kind === "move") {
        if (session.stage === "base") {
            session.basePoint = { ...point };
            session.stage = "target";

            setToolMessage(
                "Specify destination"
            );

            return true;
        }

        if (session.basePoint) {
            commitMove(
                point.x - session.basePoint.x,
                point.y - session.basePoint.y
            );
        }

        return true;
    }

    if (session.kind === "rotate") {
        if (session.stage === "base") {
            session.pivot = { ...point };
            session.stage = "target";

            /*
             * The rotation angle is measured from the
             * pivot's own +X direction, so the second
             * click's bearing from the pivot is the
             * angle to rotate by.
             */
            session.rotateStart = 0;

            setToolMessage(
                "Specify rotation angle"
            );

            return true;
        }

        if (session.pivot) {
            commitRotate(
                session.pivot,
                point
            );
        }

        return true;
    }

    if (session.kind === "mirror") {
        return handleMirrorClick(
            session,
            rawPoint,
            point
        );
    }

    return true;
}

/*
 * Move: translate the captured selection by the world
 * delta between the base point and the commit point.
 */
function commitMove(
    deltaX,
    deltaY
) {
    if (
        !modifySession ||
        (!deltaX && !deltaY)
    ) {
        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    objectsByIds(
        modifySession.ids
    ).forEach(
        object =>
            translateObject(
                object,
                deltaX,
                deltaY
            )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelModifySession();

    setToolMessage(
        "Moved selection"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Rotate: rotate the captured selection about the chosen
 * pivot by the angle from the pivot to the commit
 * point, measured from the pivot to the base point.
 */
function commitRotate(
    pivot,
    target
) {
    const startAngle =
        modifySession &&
        modifySession.rotateStart !== undefined
            ? modifySession.rotateStart
            : Math.atan2(
                target.y - pivot.y,
                target.x - pivot.x
            );

    const endAngle =
        Math.atan2(
            target.y - pivot.y,
            target.x - pivot.x
        );

    const radians =
        endAngle -
        startAngle;

    if (
        !Number.isFinite(radians) ||
        Math.abs(radians) < 1e-9
    ) {
        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    objectsByIds(
        modifySession.ids
    ).forEach(
        object =>
            rotateObjectAbout(
                object,
                pivot,
                radians
            )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelModifySession();

    setToolMessage(
        "Rotated selection"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Mirror axis resolution: an existing line becomes the
 * axis directly; an existing point becomes the first of
 * a two-point axis.
 */
function handleMirrorClick(
    session,
    rawPoint,
    point
) {
    if (session.stage === "axis") {
        const object =
            objectAtPoint(
                rawPoint
            );

        /*
         * A line provides the axis outright. It does not
         * have to be outside the selection, so a line the
         * user happens to have picked is still usable as
         * the mirror axis.
         */
        if (
            object &&
            object.type === "line"
        ) {
            /*
             * The axis is a reference, so it is removed
             * from the set being mirrored.
             */
            session.ids =
                session.ids.filter(
                    id =>
                        id !==
                        object.id
                );

            if (!session.ids.length) {
                setToolMessage(
                    "Select objects to mirror"
                );

                return true;
            }

            session.axisStart = {
                ...object.geometry.start
            };

            session.axisEnd = {
                ...object.geometry.end
            };

            commitMirror();
            return true;
        }

        /*
         * Anything else acts as the first axis point,
         * so the axis is the infinite line through it
         * and the next click.
         */
        session.axisStart = { ...point };
        session.stage = "axis-end";

        setToolMessage(
            "Specify second point"
        );

        return true;
    }

    if (session.stage === "axis-end") {
        session.axisEnd = { ...point };
        commitMirror();
        return true;
    }

    return true;
}

/*
 * Reflect the captured selection across the resolved
 * world-space axis.
 */
function commitMirror() {
    if (
        !modifySession ||
        !modifySession.axisStart ||
        !modifySession.axisEnd
    ) {
        cancelModifySession();
        return;
    }

    const start =
        modifySession.axisStart;

    const end =
        modifySession.axisEnd;

    if (
        Math.hypot(
            end.x - start.x,
            end.y - start.y
        ) < 1e-9
    ) {
        setToolMessage(
            "Mirror axis needs two distinct points"
        );

        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * Mirror is a duplicate operation: the originals stay
     * exactly where they are and the reflected geometry is
     * created as new, independent features.
     */
    const originals =
        objectsByIds(
            modifySession.ids
        );

    const mirrored = [];

    originals.forEach(
        object => {
            /*
             * Work on a deep copy so the source feature is
             * never touched.
             */
            const copy =
                JSON.parse(
                    JSON.stringify(
                        object
                    )
                );

            copy.id =
                `${object.type}-mirror-${object.id}`;

            mirrorObjectAcrossLine(
                copy,
                start,
                end
            );

            mirrored.push(
                copy
            );
        }
    );

    mirrored.forEach(
        copy => {
            /*
             * addObject assigns the final unique id and a
             * sequential name, so the mirror gets its own
             * feature identity in the tree.
             */
            const newId =
                enggDrawingState.addObject(
                    drawingState,
                    copy
                );

            copy.id = newId;
        }
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    /*
     * The new mirrored features become the selection, so
     * the user can see what was just created.
     */
    enggDrawingState.selectObjects(
        drawingState,
        mirrored.map(
            copy =>
                copy.id
        )
    );

    cancelModifySession();

    setToolMessage(
        mirrored.length === 1
            ? "Mirrored: created 1 new feature"
            : `Mirrored: created ${mirrored.length} new features`
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Trim and Extend: the first click picks the boundary,
 * the second picks the target segment.
 */
function handleTrimExtendClick(
    session,
    rawPoint,
    point
) {
    if (session.stage === "base") {
        const boundary =
            objectAtPoint(
                rawPoint
            );

        if (!boundary) {
            return true;
        }

        session.boundaryId =
            boundary.id;

        session.stage =
            "target";

        setToolMessage(
            session.kind === "trim"
                ? "Select the segment to trim"
                : "Select the geometry to extend"
        );

        return true;
    }

    const target =
        objectAtPoint(
            rawPoint
        );

    if (!target) {
        return true;
    }

    const boundary =
        drawingState.objects.find(
            object =>
                object.id ===
                session.boundaryId
        );

    if (!boundary || boundary.id === target.id) {
        return true;
    }

    if (session.kind === "trim") {
        trimObjectToBoundary(
            target,
            boundary,
            point
        );
    } else {
        extendObjectToBoundary(
            target,
            boundary,
            point
        );
    }

    return true;
}

/*
 * Selected objects, resolved from the captured ids.
 */
function objectsByIds(
    ids
) {
    return drawingState.objects.filter(
        object =>
            ids.includes(
                object.id
            )
    );
}

/*
 * Reflect a point across the infinite line through two
 * points.
 */
function reflectPointAcrossLine(
    point,
    start,
    end
) {
    const dx =
        end.x - start.x;

    const dy =
        end.y - start.y;

    const lengthSquared =
        dx * dx + dy * dy;

    if (lengthSquared < 1e-18) {
        return { ...point };
    }

    const t =
        (
            (point.x - start.x) * dx +
            (point.y - start.y) * dy
        ) /
        lengthSquared;

    const foot = {
        x: start.x + t * dx,
        y: start.y + t * dy
    };

    return {
        x: 2 * foot.x - point.x,
        y: 2 * foot.y - point.y
    };
}

/*
 * World-space reflection of a whole feature, preserving
 * its coherent structure.
 */
function mirrorObjectAcrossLine(
    object,
    start,
    end
) {
    const g =
        object.geometry;

    const reflect =
        point => {
            const r =
                reflectPointAcrossLine(
                    point,
                    start,
                    end
                );

            point.x = r.x;
            point.y = r.y;
        };

    if (object.type === "line") {
        reflect(g.start);
        reflect(g.end);
        return;
    }

    if (object.type === "circle") {
        reflect(g.center);
        return;
    }

    if (object.type === "arc") {
        /*
         * Reflect the centre, then reflect both angle
         * directions. The mirror reverses orientation,
         * so the start/end angles swap their reflected
         * values and the sweep changes sign.
         */
        reflect(g.center);

        const axisAngle =
            Math.atan2(
                end.y - start.y,
                end.x - start.x
            );

        const startAngle = g.startAngle;
        const endAngle = g.endAngle;

        g.startAngle =
            2 * axisAngle - endAngle;

        g.endAngle =
            2 * axisAngle - startAngle;

        if (g.sweep !== undefined) {
            g.sweep = -g.sweep;
        }

        return;
    }

    if (object.type === "polygon") {
        reflect(g.center);

        const axisAngle =
            Math.atan2(
                end.y - start.y,
                end.x - start.x
            );

        g.rotation =
            2 * axisAngle -
            (Number(g.rotation) || 0);

        return;
    }

    if (object.type === "point") {
        reflect(g.position || g.point || g);
        return;
    }

    if (object.type === "rectangle") {
        /*
         * A rectangle is axis-aligned, so reflect the two
         * opposite corners and rebuild it from the new
         * bounds.
         */
        const a = {
            x: g.position.x,
            y: g.position.y
        };

        const b = {
            x: g.position.x + g.width,
            y: g.position.y - g.height
        };

        reflect(a);
        reflect(b);

        g.position = {
            x: Math.min(a.x, b.x),
            y: Math.max(a.y, b.y)
        };

        g.width = Math.abs(b.x - a.x);
        g.height = Math.abs(b.y - a.y);
        return;
    }

    if (Array.isArray(g.points)) {
        g.points.forEach(reflect);
    }
}

/*
 * Rotate a feature about a pivot in world space.
 *
 * The work is done by the shared feature-geometry registry
 * so that move, rotate and handle placement all agree on
 * which points a feature is made of.
 */
function rotateObjectAbout(
    object,
    pivot,
    radians
) {
    enggFeatureGeometry.rotateObjectAbout(
        object,
        pivot,
        radians
    );
}

/*
 * Trim a line back to its nearest intersection with the
 * boundary. Only line geometry is trimmed, because a
 * coherent curved feature cannot be shortened without
 * changing what it represents.
 */
function trimObjectToBoundary(
    target,
    boundary,
    clickPoint
) {
    if (target.type !== "line") {
        setToolMessage(
            "Only lines can be trimmed"
        );

        cancelModifySession();
        return;
    }

    const hit =
        nearestIntersectionOnLine(
            target,
            boundary
        );

    if (!hit) {
        setToolMessage(
            "No intersection with the boundary"
        );

        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * The clicked end is the part removed.
     */
    const g =
        target.geometry;

    const distanceToStart =
        Math.hypot(
            clickPoint.x - g.start.x,
            clickPoint.y - g.start.y
        );

    const distanceToEnd =
        Math.hypot(
            clickPoint.x - g.end.x,
            clickPoint.y - g.end.y
        );

    if (distanceToStart <= distanceToEnd) {
        g.start = { ...hit };
    } else {
        g.end = { ...hit };
    }

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelModifySession();

    setToolMessage(
        "Trimmed line"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Extend a line to its nearest intersection with the
 * boundary along the line's own direction.
 */
function extendObjectToBoundary(
    target,
    boundary,
    clickPoint
) {
    if (target.type !== "line") {
        setToolMessage(
            "Only lines can be extended"
        );

        cancelModifySession();
        return;
    }

    const g =
        target.geometry;

    const hit =
        nearestIntersectionOnLine(
            target,
            boundary,
            true
        );

    if (!hit) {
        setToolMessage(
            "No boundary intersection found"
        );

        cancelModifySession();
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const distanceToStart =
        Math.hypot(
            clickPoint.x - g.start.x,
            clickPoint.y - g.start.y
        );

    const distanceToEnd =
        Math.hypot(
            clickPoint.x - g.end.x,
            clickPoint.y - g.end.y
        );

    if (distanceToStart <= distanceToEnd) {
        g.start = { ...hit };
    } else {
        g.end = { ...hit };
    }

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelModifySession();

    setToolMessage(
        "Extended line"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Intersection between a line and any other supported
 * boundary object, in world coordinates.
 */
function nearestIntersectionOnLine(
    lineObject,
    boundary,
    allowExtension = false
) {
    const segments =
        boundarySegments(
            boundary
        );

    const g =
        lineObject.geometry;

    let best = null;

    segments.forEach(
        ([a, b]) => {
            const hit =
                segmentIntersectionPoint(
                    g.start,
                    g.end,
                    a,
                    b
                );

            if (!hit) {
                return;
            }

            /*
             * When trimming, the hit has to lie on the
             * line already; when extending it may lie
             * beyond either end.
             */
            const t =
                segmentParameter(
                    g.start,
                    g.end,
                    hit
                );

            if (
                !allowExtension &&
                (t < -1e-9 || t > 1 + 1e-9)
            ) {
                return;
            }

            const distance =
                Math.hypot(
                    hit.x - g.start.x,
                    hit.y - g.start.y
                );

            if (
                !best ||
                distance < best.distance
            ) {
                best = {
                    point: hit,
                    distance
                };
            }
        }
    );

    return best ? best.point : null;
}

/*
 * Straight segments of any supported boundary object.
 */
function boundarySegments(
    object
) {
    const g =
        object.geometry || {};

    if (object.type === "line") {
        return [[g.start, g.end]];
    }

    if (object.type === "rectangle") {
        const a = { x: g.position.x, y: g.position.y };
        const b = { x: g.position.x + g.width, y: g.position.y };
        const c = { x: g.position.x + g.width, y: g.position.y - g.height };
        const d = { x: g.position.x, y: g.position.y - g.height };

        return [[a, b], [b, c], [c, d], [d, a]];
    }

    if (object.type === "triangle") {
        const points = (g.points || []).filter(Boolean);

        return points.map((p, i) => [p, points[(i + 1) % points.length]]);
    }

    if (object.type === "polygon") {
        const points = enggDrawingState.polygonVertices(g);

        return points.map((p, i) => [p, points[(i + 1) % points.length]]);
    }

    if (object.type === "polyline" && Array.isArray(g.points)) {
        const segments = [];

        for (let i = 1; i < g.points.length; i += 1) {
            segments.push([g.points[i - 1], g.points[i]]);
        }

        return segments;
    }

    return [];
}

/*
 * Parameter of a point along a segment, where 0 is the
 * start and 1 is the end.
 */
function segmentParameter(
    start,
    end,
    point
) {
    const dx =
        end.x - start.x;

    const dy =
        end.y - start.y;

    const lengthSquared =
        dx * dx + dy * dy;

    if (lengthSquared < 1e-18) {
        return 0;
    }

    return (
        (
            (point.x - start.x) * dx +
            (point.y - start.y) * dy
        ) /
        lengthSquared
    );
}

/*
 * Intersection of two straight segments, or null when
 * they are parallel or do not cross.
 */
function segmentIntersectionPoint(
    firstStart,
    firstEnd,
    secondStart,
    secondEnd
) {
    const denominator =
        (firstStart.x - firstEnd.x) *
            (secondStart.y - secondEnd.y) -
        (firstStart.y - firstEnd.y) *
            (secondStart.x - secondEnd.x);

    if (Math.abs(denominator) < 1e-12) {
        return null;
    }

    const a = firstStart.x * firstEnd.y - firstStart.y * firstEnd.x;
    const b = secondStart.x * secondEnd.y - secondStart.y * secondEnd.x;

    const x =
        (
            a * (secondStart.x - secondEnd.x) -
            (firstStart.x - firstEnd.x) * b
        ) / denominator;

    const y =
        (
            a * (secondStart.y - secondEnd.y) -
            (firstStart.y - firstEnd.y) * b
        ) / denominator;

    return { x, y };
}

/*
 * Translate every selected object by a delta.
 */
function moveSelectionBy(
    deltaX,
    deltaY
) {
    const selected =
        drawingState.objects.filter(
            object =>
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    )
        );

    if (!selected.length) {
        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    selected.forEach(
        object =>
            translateObject(
                object,
                deltaX,
                deltaY
            )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Move an object's defining geometry. Each feature
 * type stores its position differently, so this maps
 * the translation onto the stored parameters rather
 * than duplicating the geometry.
 */
/*
 * Move every defining point of a feature by a delta.
 *
 * Delegated to the shared feature-geometry registry so a
 * feature never moves by one rule and rotates by another.
 */
function translateObject(
    object,
    deltaX,
    deltaY
) {
    enggFeatureGeometry.translateObject(
        object,
        deltaX,
        deltaY
    );
}

/*
 * Rotate the selection about its own centre, so a
 * rotate never drifts the geometry away from where it
 * was.
 */
function rotateSelectionBy(
    degrees
) {
    const selected =
        drawingState.objects.filter(
            object =>
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    )
        );

    if (!selected.length) {
        return;
    }

    const pivot =
        selectionCenter(
            selected
        );

    const radians =
        degrees *
        Math.PI /
        180;

    const cos =
        Math.cos(radians);

    const sin =
        Math.sin(radians);

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const rotatePoint =
        point => {
            const dx =
                point.x - pivot.x;

            const dy =
                point.y - pivot.y;

            point.x =
                pivot.x +
                dx * cos -
                dy * sin;

            point.y =
                pivot.y +
                dx * sin +
                dy * cos;
        };

    selected.forEach(
        object => {
            const g =
                object.geometry;

            if (
                object.type === "line"
            ) {
                rotatePoint(g.start);
                rotatePoint(g.end);
                return;
            }

            if (
                object.type === "circle"
            ) {
                rotatePoint(g.center);
                return;
            }

            if (
                object.type === "arc"
            ) {
                rotatePoint(g.center);
                g.startAngle += radians;
                g.endAngle += radians;

                if (g.sweep !== undefined) {
                    /* sweep magnitude is unchanged */
                }

                return;
            }

            if (
                object.type === "polygon"
            ) {
                rotatePoint(g.center);
                g.rotation =
                    (Number(g.rotation) || 0) +
                    radians;
                return;
            }

            if (
                object.type === "point"
            ) {
                rotatePoint(
                    g.position || g.point || g
                );
                return;
            }

            if (
                object.type === "rectangle"
            ) {
                rotatePoint(g.position);
                g.rotation =
                    (Number(g.rotation) || 0) +
                    degrees;
                return;
            }

            if (
                Array.isArray(
                    g.points
                )
            ) {
                g.points.forEach(
                    rotatePoint
                );
            }
        }
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Mirror the selection across the vertical line through
 * its own centre.
 */
function mirrorSelectionVertically() {
    const selected =
        drawingState.objects.filter(
            object =>
                drawingState.selection
                    .selectedObjectIds
                    .includes(
                        object.id
                    )
        );

    if (!selected.length) {
        return;
    }

    const axis =
        selectionCenter(
            selected
        ).x;

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const flip =
        point => {
            point.x =
                2 * axis -
                point.x;
        };

    selected.forEach(
        object => {
            const g =
                object.geometry;

            if (
                object.type === "line"
            ) {
                flip(g.start);
                flip(g.end);
                return;
            }

            if (
                object.type === "circle"
            ) {
                flip(g.center);
                return;
            }

            if (
                object.type === "arc"
            ) {
                flip(g.center);

                /*
                 * Mirroring reverses the arc direction.
                 */
                g.startAngle =
                    Math.PI -
                    g.startAngle;

                g.endAngle =
                    Math.PI -
                    g.endAngle;

                return;
            }

            if (
                object.type === "polygon"
            ) {
                flip(g.center);
                g.rotation =
                    Math.PI -
                    (Number(g.rotation) || 0);
                return;
            }

            if (
                object.type === "point"
            ) {
                flip(
                    g.position || g.point || g
                );
                return;
            }

            if (
                object.type === "rectangle"
            ) {
                flip(g.position);
                return;
            }

            if (
                Array.isArray(
                    g.points
                )
            ) {
                g.points.forEach(
                    flip
                );
            }
        }
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Bounding centre of a set of objects, used as the
 * pivot for rotate and the axis for mirror.
 */
function selectionCenter(
    objects
) {
    const points = [];

    objects.forEach(
        object => {
            const g =
                object.geometry;

            if (!g) {
                return;
            }

            if (g.start) {
                points.push(g.start);
            }

            if (g.end) {
                points.push(g.end);
            }

            if (g.center) {
                points.push(g.center);
            }

            if (g.position) {
                points.push(g.position);
            }

            if (g.origin) {
                points.push(g.origin);
            }

            if (
                Array.isArray(
                    g.points
                )
            ) {
                g.points.forEach(
                    point =>
                        points.push(
                            point
                        )
                );
            }
        }
    );

    if (!points.length) {
        return {
            x: 0,
            y: 0
        };
    }

    const xs =
        points.map(
            point =>
                point.x
        );

    const ys =
        points.map(
            point =>
                point.y
        );

    return {
        x:
            (
                Math.min(...xs) +
                Math.max(...xs)
            ) / 2,

        y:
            (
                Math.min(...ys) +
                Math.max(...ys)
            ) / 2
    };
}

/*
 * Fit all geometry into the canvas by setting the zoom
 * and panning so the drawing bounds are centred. The
 * geometry itself is never modified.
 */
function fitDrawingToView() {
    const bounds =
        drawingCanvas.getBoundingClientRect();

    if (
        !drawingState.objects.length ||
        !bounds.width ||
        !bounds.height
    ) {
        enggDrawingState.setCameraZoom(
            drawingState,
            1
        );

        drawingState.camera.panX = 0;
        drawingState.camera.panY = 0;

        drawingZoom =
            100;

        drawingZoomValue.value = "100%";

        renderCurrentDrawing();
        return;
    }

    const points = [];

    drawingState.objects.forEach(
        object => {
            const g =
                object.geometry;

            if (!g) {
                return;
            }

            if (g.start) {
                points.push(g.start);
            }

            if (g.end) {
                points.push(g.end);
            }

            if (g.position) {
                points.push(g.position);
            }

            if (g.origin) {
                points.push(g.origin);
            }

            if (
                Array.isArray(
                    g.points
                )
            ) {
                g.points.forEach(
                    point =>
                        points.push(
                            point
                        )
                );
            }

            /*
             * Curved features are bounded by their
             * extents rather than a single point.
             */
            if (g.center) {
                const radius =
                    Number(g.radius) || 0;

                points.push({
                    x: g.center.x - radius,
                    y: g.center.y - radius
                });

                points.push({
                    x: g.center.x + radius,
                    y: g.center.y + radius
                });
            }

            if (
                object.type === "polygon"
            ) {
                enggDrawingState
                    .polygonVertices(g)
                    .forEach(
                        point =>
                            points.push(
                                point
                            )
                    );
            }
        }
    );

    if (!points.length) {
        return;
    }

    const minX =
        Math.min(
            ...points.map(
                point =>
                    point.x
            )
        );

    const maxX =
        Math.max(
            ...points.map(
                point =>
                    point.x
            )
        );

    const minY =
        Math.min(
            ...points.map(
                point =>
                    point.y
            )
        );

    const maxY =
        Math.max(
            ...points.map(
                point =>
                    point.y
            )
        );

    const margin = 0.85;

    const spanX =
        Math.max(
            maxX - minX,
            1e-6
        );

    const spanY =
        Math.max(
            maxY - minY,
            1e-6
        );

    const zoomX =
        (
            bounds.width *
            margin
        ) /
        (
            spanX *
            enggDrawingState.BASE_PIXELS_PER_UNIT
        );

    const zoomY =
        (
            bounds.height *
            margin
        ) /
        (
            spanY *
            enggDrawingState.BASE_PIXELS_PER_UNIT
        );

    enggDrawingState.setCameraZoom(
        drawingState,
        Math.min(
            zoomX,
            zoomY
        )
    );

    drawingState.camera.panX =
        (minX + maxX) / 2;

    drawingState.camera.panY =
        (minY + maxY) / 2;

    drawingZoom =
        drawingState.camera.zoom *
        100;

    drawingZoomValue.value = `${Math.round(drawingZoom)}%`;

    setToolMessage(
        "Fit drawing to view"
    );

    renderCurrentDrawing();
}

function zoomAtCanvasPoint(
    nextZoom,
    event
) {
    const bounds =
        drawingCanvas.getBoundingClientRect();

    const screenPoint = {
        x:
            event.clientX -
            bounds.left,

        y:
            event.clientY -
            bounds.top
    };

    const engineeringPoint =
        enggDrawingState.screenToEngineering(
            screenPoint,
            bounds,
            drawingState
        );

    enggDrawingState.setCameraZoom(
        drawingState,
        nextZoom
    );

    const scale =
        enggDrawingState.BASE_PIXELS_PER_UNIT *
        drawingState.camera.zoom;

    drawingState.camera.panX =
        engineeringPoint.x -
        (
            screenPoint.x -
            bounds.width / 2
        ) /
        scale;

    drawingState.camera.panY =
        engineeringPoint.y -
        (
            bounds.height / 2 -
            screenPoint.y
        ) /
        scale;

    drawingZoom =
        drawingState.camera.zoom *
        100;

    drawingZoomValue.value = `${Math.round(drawingZoom)}%`;

    renderCurrentDrawing();
}

function updateDrawingZoom(
    nextZoom
) {
    drawingZoom =
        Math.min(
            500,
            Math.max(
                25,
                nextZoom
            )
        );

    enggDrawingState.setCameraZoom(
        drawingState,
        drawingZoom / 100
    );

    drawingZoomValue.value = `${drawingZoom}%`;

    renderCurrentDrawing();
}

/*
 * Workspace setting toggle.
 *
 * Grid controls grid visibility.
 *
 * Snap controls BOTH:
 *   - grid snapping
 *   - object snapping
 *
 * This keeps the visible "Snap ON/OFF" state
 * consistent with the actual snapping system.
 */
function toggleWorkspaceSetting(
    button,
    label
) {
    const enabled =
        button.getAttribute(
            "aria-pressed"
        ) === "true";

    const nextEnabled =
        !enabled;

    button.setAttribute(
        "aria-pressed",
        String(
            nextEnabled
        )
    );

    button.textContent =
        `${label} ${nextEnabled ? "ON" : "OFF"}`;

    button.classList.toggle(
        "active",
        nextEnabled
    );

    if (
        button ===
        drawingGridToggle
    ) {
        drawingState.grid.visible =
            nextEnabled;

        drawingCanvas.classList.toggle(
            "grid-off",
            !nextEnabled
        );
    } else if (
        button ===
        drawingSnapToggle
    ) {
        /*
         * Snap OFF means no automatic grid
         * snapping AND no object snapping.
         */
        drawingState.snap.enabled =
            nextEnabled;

        drawingState.objectSnap.enabled =
            nextEnabled;

        /*
         * Remove stale visual/interaction
         * snap state immediately.
         */
        drawingState.interaction.snapCandidate =
            null;

        drawingState.interaction.snappedPoint =
            null;

        drawingState.interaction.inference =
            null;
    }

    renderCurrentDrawing();
}

/*
 * ========================================================
 * CAD COLOUR CONTROL
 * ========================================================
 *
 * A swatch button opens a popup with a hue-by-shade
 * grid, a custom colour picker, recent colours and an
 * eyedropper.
 *
 * The native colour input stays in the DOM as the single
 * value source, so the existing style pipeline that
 * reads drawingColor.value keeps working unchanged.
 */

const COLOUR_RECENT_LIMIT = 24;

const COLOUR_STORAGE_KEY =
    "enggDrawing.recentColours";

let recentColours = [];

let colourPopup = null;

let eyedropperActive = false;

function normalizeColour(
    value
) {
    const text =
        String(value || "")
            .trim()
            .toLowerCase();

    if (!/^#[0-9a-f]{6}$/.test(text)) {
        return null;
    }

    return text;
}

/*
 * Recent colours persist for the session, and in local
 * storage when the browser allows it.
 */
function loadRecentColours() {
    try {
        const stored =
            window.localStorage.getItem(
                COLOUR_STORAGE_KEY
            );

        if (stored) {
            const parsed =
                JSON.parse(stored);

            if (Array.isArray(parsed)) {
                recentColours =
                    parsed
                        .map(normalizeColour)
                        .filter(Boolean)
                        .slice(
                            0,
                            COLOUR_RECENT_LIMIT
                        );
            }
        }
    } catch (error) {
        recentColours = [];
    }
}

function saveRecentColours() {
    try {
        window.localStorage.setItem(
            COLOUR_STORAGE_KEY,
            JSON.stringify(
                recentColours
            )
        );
    } catch (error) {
        /*
         * Storage can be unavailable; the list still
         * works for the current session.
         */
    }
}

/*
 * Remember a colour, most recent first, without
 * duplicates, capped at the limit.
 */
function rememberColour(
    value
) {
    const colour =
        normalizeColour(value);

    if (!colour) {
        return;
    }

    recentColours = [
        colour,
        ...recentColours.filter(
            existing =>
                existing !== colour
        )
    ].slice(
        0,
        COLOUR_RECENT_LIMIT
    );

    saveRecentColours();
}

/*
 * Hue across the columns, lightness so
 * moving across changes colour family and moving down
 * changes the shade. The last two rows are neutrals.
 */
function buildColourGrid() {
    const cells = [];

    const hues = 12;
    const shadeRows = [
        92, 78, 64, 50, 38, 28
    ];

    shadeRows.forEach(
        (lightness, row) => {
            for (
                let column = 0;
                column < hues;
                column += 1
            ) {
                const hue =
                    (column * 360) / hues;

                cells.push(
                    hslToHex(
                        hue,
                        72,
                        lightness
                    )
                );
            }

            void row;
        }
    );

    /*
     * Neutrals: white through grey to black.
     */
    [
        100, 88, 76, 64, 52, 40, 28, 16, 0
    ].forEach(
        lightness =>
            cells.push(
                hslToHex(
                    0,
                    0,
                    lightness
                )
            )
    );

    return cells;
}

/*
 * HSL to hex, used only to generate the palette.
 */
function hslToHex(
    hue,
    saturation,
    lightness
) {
    const s =
        saturation / 100;

    const l =
        lightness / 100;

    const c =
        (1 - Math.abs(2 * l - 1)) * s;

    const x =
        c *
        (1 - Math.abs(((hue / 60) % 2) - 1));

    const m =
        l - c / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (hue < 60) {
        r = c; g = x; b = 0;
    } else if (hue < 120) {
        r = x; g = c; b = 0;
    } else if (hue < 180) {
        r = 0; g = c; b = x;
    } else if (hue < 240) {
        r = 0; g = x; b = c;
    } else if (hue < 300) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }

    const toHex = value =>
        Math.round(
            (value + m) * 255
        )
            .toString(16)
            .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/*
 * Apply a colour through the existing style pipeline.
 */
function applyColour(
    value
) {
    const colour =
        normalizeColour(value);

    if (!colour) {
        return;
    }

    drawingColor.value =
        colour;

    rememberColour(
        colour
    );

    applyStyleControls();

    updateColourSwatch();
}

function updateColourSwatch() {
    const swatch =
        document.getElementById(
            "drawingColourSwatch"
        );

    if (swatch) {
        swatch.style.background =
            drawingColor.value;
    }
}

/*
 * Close the popup.
 *
 * The eyedropper stays armed when the popup closes,
 * because arming it is meant to be followed by a click
 * on the drawing. Cancelling the eyedropper is done
 * explicitly instead.
 */
function closeColourPopup(
    keepEyedropper = true
) {
    if (colourPopup) {
        colourPopup.remove();
        colourPopup = null;
    }

    if (!keepEyedropper) {
        eyedropperActive =
            false;
    }
}

/*
 * Read a feature's own stored colour, not a sampled
 * screen pixel.
 */
function pickColourFromFeature(
    event
) {
    const point =
        canvasPointFromEvent(
            event,
            false
        );

    const object =
        objectAtPoint(
            point
        );

    if (
        !object ||
        !object.style ||
        !normalizeColour(
            object.style.stroke
        )
    ) {
        setToolMessage(
            "No feature colour there"
        );

        return;
    }

    applyColour(
        object.style.stroke
    );

    setToolMessage(
        `Picked ${object.style.stroke}`
    );

    eyedropperActive =
        false;

    closeColourPopup();
}

function openColourPopup(
    anchor
) {
    if (colourPopup) {
        closeColourPopup();
        return;
    }

    const popup =
        document.createElement("div");

    popup.className =
        "drawing-colour-popup";

    popup.setAttribute(
        "role",
        "dialog"
    );

    popup.innerHTML = `
        <div class="drawing-colour-section">COLOUR GRID</div>
        <div class="drawing-colour-grid" data-colour-grid></div>

        <div class="drawing-colour-section">CUSTOM COLOUR</div>
        <div class="drawing-colour-row">
            <input type="color" class="drawing-colour-custom"
                data-colour-custom aria-label="Custom colour">
            <button type="button" class="drawing-colour-action"
                data-colour-eyedropper>Pick from drawing</button>
        </div>

        <div class="drawing-colour-section">PREVIOUS COLOURS</div>
        <div class="drawing-colour-recent" data-colour-recent></div>
    `;

    document.body.appendChild(
        popup
    );

    const rect =
        anchor.getBoundingClientRect();

    const popupRect =
        popup.getBoundingClientRect();

    const gap = 6;
    const margin = 8;

    let left =
        rect.right - popupRect.width;

    let top =
        rect.bottom + gap;

    if (left < margin) {
        left = margin;
    }

    if (
        top + popupRect.height >
        window.innerHeight - margin
    ) {
        top = Math.max(
            margin,
            rect.top - popupRect.height - gap
        );
    }

    popup.style.left =
        `${left}px`;

    popup.style.top =
        `${top}px`;

    /*
     * Colour grid.
     */
    const grid =
        popup.querySelector(
            "[data-colour-grid]"
        );

    buildColourGrid().forEach(
        colour => {
            const cell =
                document.createElement("button");

            cell.type = "button";
            cell.className =
                "drawing-colour-cell";

            cell.style.background =
                colour;

            cell.title = colour;
            cell.setAttribute(
                "aria-label",
                colour
            );

            cell.addEventListener(
                "click",
                () => {
                    applyColour(
                        colour
                    );

                    closeColourPopup();
                }
            );

            grid.appendChild(
                cell
            );
        }
    );

    /*
     * Custom colour picker.
     */
    const custom =
        popup.querySelector(
            "[data-colour-custom]"
        );

    custom.value =
        drawingColor.value;

    custom.addEventListener(
        "input",
        () =>
            applyColour(
                custom.value
            )
    );

    /*
     * Eyedropper.
     */
    const eyedropper =
        popup.querySelector(
            "[data-colour-eyedropper]"
        );

    eyedropper.classList.toggle(
        "active",
        eyedropperActive
    );

    eyedropper.addEventListener(
        "click",
        () => {
            eyedropperActive =
                !eyedropperActive;

            eyedropper.classList.toggle(
                "active",
                eyedropperActive
            );

            setToolMessage(
                eyedropperActive
                    ? "Click a feature to pick its colour"
                    : "Select geometry"
            );
        }
    );

    renderRecentColours(
        popup
    );

    colourPopup =
        popup;
}

function renderRecentColours(
    popup
) {
    const host =
        popup.querySelector(
            "[data-colour-recent]"
        );

    if (!host) {
        return;
    }

    host.innerHTML = "";

    if (!recentColours.length) {
        const empty =
            document.createElement("div");

        empty.className =
            "drawing-colour-empty";

        empty.textContent =
            "No colours used yet";

        host.appendChild(
            empty
        );

        return;
    }

    recentColours.forEach(
        colour => {
            const cell =
                document.createElement("button");

            cell.type = "button";
            cell.className =
                "drawing-colour-cell";

            cell.style.background =
                colour;

            cell.title = colour;
            cell.setAttribute(
                "aria-label",
                colour
            );

            cell.addEventListener(
                "click",
                () => {
                    applyColour(
                        colour
                    );

                    closeColourPopup();
                }
            );

            host.appendChild(
                cell
            );
        }
    );
}

/*
 * Replace the plain native colour input with the swatch
 * button plus the popup, keeping the native input as the
 * value source.
 */
function setupColourControl() {
    if (!drawingColor) {
        return;
    }

    loadRecentColours();

    drawingColor.classList.add(
        "drawing-colour-native"
    );

    const control =
        document.createElement("span");

    control.className =
        "drawing-colour-control";

    const swatch =
        document.createElement("button");

    swatch.type = "button";
    swatch.id =
        "drawingColourSwatch";

    swatch.className =
        "drawing-colour-swatch";

    swatch.title =
        "Choose colour";

    swatch.setAttribute(
        "aria-label",
        "Choose colour"
    );

    swatch.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            openColourPopup(
                swatch
            );
        }
    );

    /*
     * The swatch sits next to the existing colour label, so
     * the strip keeps its normal row layout and the native
     * input stays available as the value source.
     */
    const label =
        drawingColor.closest("label");

    control.appendChild(
        drawingColor
    );

    control.appendChild(
        swatch
    );

    if (label && label.parentNode) {
        label.parentNode.insertBefore(
            control,
            label.nextSibling
        );
    } else if (drawingColor.parentNode) {
        drawingColor.parentNode.insertBefore(
            control,
            drawingColor
        );
    }

    drawingColor.addEventListener(
        "input",
        () => {
            rememberColour(
                drawingColor.value
            );

            updateColourSwatch();
        }
    );

    updateColourSwatch();

    /*
     * Clicking away closes the popup.
     */
    document.addEventListener(
        "pointerdown",
        event => {
            if (
                !colourPopup ||
                colourPopup.contains(
                    event.target
                ) ||
                event.target.closest?.(
                    ".drawing-colour-control"
                )
            ) {
                return;
            }

            closeColourPopup();
        }
    );
}

function applyStyleControls() {
    const nextStyle = {
        lineWidth:
            Number(
                drawingThickness.value
            ),

        stroke:
            drawingColor.value,

        lineType:
            drawingLineType.value
    };

    const selectedIds =
        drawingState.selection
            .selectedObjectIds;

    if (
        !selectedIds.length
    ) {
        drawingState.styleDefaults = {
            ...drawingState.styleDefaults,
            ...nextStyle
        };

        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    drawingState.objects
        .filter(
            object =>
                selectedIds.includes(
                    object.id
                )
        )
        .forEach(
            object => {
                object.style = {
                    ...object.style,
                    ...nextStyle
                };
            }
        );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    renderProperties();
    renderCurrentDrawing();
}

function deleteSelectedObjects() {
    const selectedIds = [
        ...drawingState.selection
            .selectedObjectIds
    ];

    if (
        !selectedIds.length ||
        drawingState.interaction.phase !==
            "idle"
    ) {
        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const selectedSet =
        new Set(
            selectedIds
        );

    drawingState.objects =
        drawingState.objects.filter(
            object =>
                !selectedSet.has(
                    object.id
                )
        );

    drawingState.selection
        .selectedObjectIds = [];

    drawingState.selection
        .boxSelectionIds = [];

    drawingState.selection
        .hoveredObjectId = null;

    drawingState.interaction
        .hoveredEntity = null;

    drawingState.interaction
        .snapCandidate = null;

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    renderProperties();
    renderCurrentDrawing();

    setToolMessage(
        `Deleted ${selectedIds.length} component${
            selectedIds.length === 1
                ? ""
                : "s"
        }`
    );
}

if (
    drawingComponentsBack
) {
    drawingComponentsBack.addEventListener(
        "click",
        () => {
            drawingComponentsBack.style.display =
                "none";

            renderComponentTree();
        }
    );
}

if (
    drawingGridToggle
) {
    drawingGridToggle.addEventListener(
        "click",
        () =>
            toggleWorkspaceSetting(
                drawingGridToggle,
                "Grid"
            )
    );
}

if (
    drawingSnapToggle
) {
    drawingSnapToggle.addEventListener(
        "click",
        () =>
            toggleWorkspaceSetting(
                drawingSnapToggle,
                "Snap"
            )
    );
}

if (
    drawingUndo
) {
    drawingUndo.addEventListener(
        "click",
        performUndo
    );
}

if (
    drawingRedo
) {
    drawingRedo.addEventListener(
        "click",
        performRedo
    );
}

/*
 * Global toolbar tools.
 *
 * Modify tools operate on the selected geometry;
 * View tools change only the camera. Both reuse the
 * existing selection, snapping and camera systems.
 */

/*
 * The id of the global toolbar tool currently running,
 * so its button can stay visibly highlighted and be
 * cleared the moment the tool ends.
 */
let activeGlobalTool = null;

/*
 * Paint the active highlight across the global toolbar.
 * Exactly one button can be active at a time.
 */
function refreshGlobalToolHighlight() {
    document
        .querySelectorAll("[data-global-tool]")
        .forEach(button => {
            const isActive =
                button.dataset.globalTool ===
                activeGlobalTool;

            button.classList.toggle(
                "active",
                isActive
            );

            button.setAttribute(
                "aria-pressed",
                isActive
                    ? "true"
                    : "false"
            );
        });
}

/*
 * Clear the highlight. Called whenever a tool is
 * cancelled, replaced, or completes.
 */
function clearGlobalToolHighlight() {
    activeGlobalTool =
        null;

    refreshGlobalToolHighlight();
}

document.querySelectorAll("[data-global-tool]").forEach(button => {
    button.addEventListener("click", () => {
        const toolId =
            button.dataset.globalTool;

        activateGlobalTool(
            toolId,
            button
        );

        /*
         * Pan and the Modify tools stay active until they
         * finish or are cancelled; Zoom and Fit act once
         * and release immediately.
         */
        activeGlobalTool =
            [
                "pan",
                "move",
                "rotate",
                "mirror",
                "trim",
                "extend"
            ].includes(
                toolId
            )
                ? toolId
                : null;

        refreshGlobalToolHighlight();
    });
});

/*
 * File commands operate on the whole drawing, reusing
 * the existing serialisation and history systems.
 */
const drawingFileNew =
    document.getElementById("drawingFileNew");

const drawingFileOpen =
    document.getElementById("drawingFileOpen");

const drawingFileSave =
    document.getElementById("drawingFileSave");

function newDrawing() {
    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    drawingState.objects = [];

    enggDrawingState.clearSelection(
        drawingState
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    setToolMessage(
        "New drawing"
    );

    renderProperties();
    renderCurrentDrawing();
}

function saveDrawing() {
    const payload = {
        format: "engg-drawing",
        version: drawingState.version,
        savedAt: new Date().toISOString(),
        data: JSON.parse(
            enggDrawingState.serializeDrawing(
                drawingState
            )
        )
    };

    const blob =
        new Blob(
            [JSON.stringify(payload, null, 2)],
            { type: "application/json" }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;
    link.download = "drawing.engg.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    setToolMessage(
        "Saved drawing"
    );
}

/*
 * Loading restores objects, styles and camera through
 * the same state model, so the Feature Tree and
 * Features panel follow automatically.
 */
function loadDrawing(
    payload
) {
    const data =
        payload && payload.data
            ? payload.data
            : payload;

    if (
        !data ||
        !Array.isArray(data.objects)
    ) {
        setToolMessage(
            "That file is not a drawing"
        );

        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    enggDrawingState.restoreObjects(
        drawingState,
        data.objects
    );

    if (data.camera) {
        drawingState.camera.zoom =
            Number(data.camera.zoom) || 1;

        drawingState.camera.panX =
            Number(data.camera.panX) || 0;

        drawingState.camera.panY =
            Number(data.camera.panY) || 0;

        drawingZoom =
            drawingState.camera.zoom * 100;

        drawingZoomValue.value =
            `${Math.round(drawingZoom)}%`;
    }

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    setToolMessage(
        "Opened drawing"
    );

    renderProperties();
    renderCurrentDrawing();
}

function openDrawing() {
    const input =
        document.createElement("input");

    input.type = "file";
    input.accept = ".json,application/json";

    input.addEventListener("change", () => {
        const file =
            input.files && input.files[0];

        if (!file) {
            return;
        }

        const reader =
            new FileReader();

        reader.addEventListener("load", () => {
            try {
                loadDrawing(
                    JSON.parse(
                        String(reader.result)
                    )
                );
            } catch (error) {
                setToolMessage(
                    "Could not read that file"
                );
            }
        });

        reader.readAsText(file);
    });

    input.click();
}

if (drawingFileNew) {
    drawingFileNew.addEventListener(
        "click",
        newDrawing
    );
}

if (drawingFileSave) {
    drawingFileSave.addEventListener(
        "click",
        saveDrawing
    );
}

if (drawingFileOpen) {
    drawingFileOpen.addEventListener(
        "click",
        openDrawing
    );
}

if (
    drawingThickness
) {
    drawingThickness.addEventListener(
        "change",
        applyStyleControls
    );
}

if (
    drawingColor
) {
    drawingColor.addEventListener(
        "change",
        applyStyleControls
    );

    /*
     * Build the CAD colour control around the existing
     * native colour input.
     */
    setupColourControl();
}

if (
    drawingLineType
) {
    drawingLineType.addEventListener(
        "change",
        applyStyleControls
    );
}

if (
    drawingZoomOut
) {
    drawingZoomOut.addEventListener(
        "click",
        () =>
            updateDrawingZoom(
                drawingZoom - 10
            )
    );
}

if (
    drawingZoomIn
) {
    drawingZoomIn.addEventListener(
        "click",
        () =>
            updateDrawingZoom(
                drawingZoom + 10
            )
    );
}

if (
    drawingCanvas
) {
    drawingCanvas.addEventListener(
        "mousemove",
        updateDrawingCoordinates
    );

    drawingCanvas.addEventListener(
        "click",
        handleCanvasClick
    );

    drawingCanvas.addEventListener(
        "dblclick",
        event => {
            if (
                drawingState.activeTool !==
                "polyline"
            ) {
                return;
            }

            event.preventDefault();

            finishPolyline();
        }
    );

    /*
     * Direct manipulation takes priority over box
     * selection: a press on a handle or on the body of a
     * selected object starts a geometry drag, otherwise
     * the press falls through to box selection.
     */
    drawingCanvas.addEventListener(
        "pointerdown",
        event => {
            /*
             * An armed eyedropper pre-empts every other
             * canvas interaction, so it works no matter
             * which tool happens to be active.
             */
            if (eyedropperActive) {
                event.preventDefault();
                event.stopPropagation();

                pickColourFromFeature(
                    event
                );

                return;
            }

            if (
                beginManipulationDrag(
                    event
                )
            ) {
                return;
            }

            beginSelectionDrag(
                event
            );
        }
    );

    drawingCanvas.addEventListener(
        "pointermove",
        event => {
            if (manipulationDrag) {
                updateManipulationDrag(
                    event
                );

                return;
            }

            updateSelectionDrag(
                event
            );
        }
    );

    drawingCanvas.addEventListener(
        "pointerup",
        event => {
            if (manipulationDrag) {
                finishManipulationDrag(
                    event
                );

                return;
            }

            finishSelectionDrag(
                event
            );
        }
    );

    drawingCanvas.addEventListener(
        "wheel",
        event => {
            event.preventDefault();

            zoomAtCanvasPoint(
                drawingState.camera.zoom *
                    (
                        event.deltaY < 0
                            ? 1.1
                            : 0.9
                    ),
                event
            );
        },
        {
            passive: false
        }
    );

    drawingCanvas.addEventListener(
        "pointerdown",
        event => {
            if (
                drawingState.activeTool !==
                "pan"
            ) {
                return;
            }

            drawingCanvas.setPointerCapture(
                event.pointerId
            );

            panSession = {
                x:
                    event.clientX,

                y:
                    event.clientY
            };

            setToolMessage(
                "Pan view"
            );
        }
    );

    drawingCanvas.addEventListener(
        "pointermove",
        event => {
            if (!panSession) {
                return;
            }

            const deltaX =
                event.clientX -
                panSession.x;

            const deltaY =
                event.clientY -
                panSession.y;

            const scale =
                enggDrawingState.BASE_PIXELS_PER_UNIT *
                drawingState.camera.zoom;

            enggDrawingState.panCamera(
                drawingState,

                drawingState.camera.panX -
                    deltaX /
                    scale,

                drawingState.camera.panY +
                    deltaY /
                    scale
            );

            panSession = {
                x:
                    event.clientX,

                y:
                    event.clientY
            };

            renderCurrentDrawing();
        }
    );

    drawingCanvas.addEventListener(
        "pointerup",
        event => {
            /*
             * This handler only manages panning. It must
             * not overwrite the status message when no pan
             * was in progress, otherwise a completed drag
             * or Modify step would be replaced by a stale
             * instruction.
             */
            if (!panSession) {
                return;
            }

            if (
                drawingCanvas.hasPointerCapture(
                    event.pointerId
                )
            ) {
                drawingCanvas.releasePointerCapture(
                    event.pointerId
                );
            }

            panSession = null;

            setToolMessage(
                drawingState.activeTool ===
                    "coordinate-system-2d"
                    ? "Specify origin"

                    : drawingState.activeTool ===
                        "line"
                        ? "Specify line start point"

                    : "Ready"
            );
        }
    );

    drawingCanvas.addEventListener(
        "mouseleave",
        () => {
            drawingCoordinates.textContent =
                "X: 0.0 Y: 0.0 mm";

            enggDrawingState.setInteraction(
                drawingState,
                {
                    snapCandidate:
                        null,

                    inference:
                        null
                }
            );

            syncSelectionInteraction();

            renderCurrentDrawing();
        }
    );
}

document.addEventListener(
    "pointerdown",
    event => {
        if (
            !coordinateSystemMenu
        ) {
            return;
        }

        const clickedMenu =
            coordinateSystemMenu.contains(
                event.target
            );

        const clickedAnchor =
            coordinateSystemMenuAnchor?.contains(
                event.target
            );

        if (
            !clickedMenu &&
            !clickedAnchor
        ) {
            closeCoordinateSystemMenu();
        }
    }
);

window.addEventListener(
    "resize",
    closeCoordinateSystemMenu
);

/*
 * Clicking anywhere outside the drawing canvas cancels
 * the active tool.
 *
 * The click still reaches its own target, so the user
 * can click another toolbar button and have that tool
 * activate normally; this only guarantees the previous
 * tool does not stay running behind it.
 */
document.addEventListener(
    "pointerdown",
    event => {
        /*
         * Nothing to do when no tool is running.
         */
        if (
            !modifySession &&
            !activeGlobalTool &&
            !isConstructionTool(
                drawingState.activeTool
            )
        ) {
            return;
        }

        const target =
            event.target;

        /*
         * Clicks on the canvas are the tool's own input,
         * so they are left alone.
         */
        if (
            drawingCanvas.contains(
                target
            )
        ) {
            return;
        }

        /*
         * Clicks on a toolbar or panel button are handled
         * by that button, which activates its own tool and
         * cancels this one.
         */
        if (
            target.closest &&
            target.closest("button")
        ) {
            return;
        }

        /*
         * Clicks inside the Features panel or a popup are
         * part of the operation, not a cancellation.
         */
        if (
            drawingProperties.contains(
                target
            ) ||
            target.closest?.(
                ".drawing-polygon-prompt"
            )
        ) {
            return;
        }

        cancelInteraction();
    }
);

window.addEventListener(
    "scroll",
    closeCoordinateSystemMenu,
    true
);

document.addEventListener(
    "keydown",
    event => {
        const activeElement =
            document.activeElement;

        const editable =
            [
                "INPUT",
                "TEXTAREA",
                "SELECT"
            ].includes(
                activeElement?.tagName
            ) ||
            activeElement?.isContentEditable;

        if (
            !editable &&
            event.ctrlKey &&
            event.key.toLowerCase() ===
                "z"
        ) {
            event.preventDefault();

            if (
                event.shiftKey
            ) {
                performRedo();
            } else {
                performUndo();
            }

            return;
        }

        if (
            !editable &&
            event.ctrlKey &&
            event.key.toLowerCase() ===
                "y"
        ) {
            event.preventDefault();

            performRedo();

            return;
        }

        if (
            !editable &&
            event.ctrlKey &&
            event.key.toLowerCase() ===
                "a"
        ) {
            event.preventDefault();

            enggDrawingState.clearInteraction(
                drawingState
            );

            drawingState.selection
                .boxSelectionIds = [];

            drawingState.selection
                .hoveredObjectId = null;

            enggDrawingState.setActiveTool(
                drawingState,
                "select"
            );

            enggDrawingState.selectObjects(
                drawingState,
                drawingState.objects.map(
                    object =>
                        object.id
                )
            );

            setToolMessage(
                "All components selected"
            );

            renderEngineeringTools(
                activeCategory()
            );

            renderProperties();
            renderCurrentDrawing();

            return;
        }

        if (
            event.key ===
            "Escape"
        ) {
            event.preventDefault();

            closeCoordinateSystemMenu();

            /*
             * A truss in progress is the one operation that is
             * explicitly reversible mid-way: Esc throws the
             * whole construction away, including the automatic
             * cleanup, so the drawing the student made before
             * pressing Enter is still what they get back.
             */
            if (
                drawingState.interaction
                    .phase ===
                    "truss-construct"
            ) {
                cancelTrussConstruction();
                return;
            }

            cancelInteraction();

            return;
        }

        /*
         * Enter finishes a truss once its structure is valid.
         * It is checked before the other shortcuts so finishing
         * a construction never activates a tool by accident.
         */
        if (
            event.key ===
            "Enter" &&
            drawingState.interaction
                .phase ===
                "truss-construct"
        ) {
            event.preventDefault();

            finishTrussConstruction();
            return;
        }

        if (
            editable
        ) {
            return;
        }

        if (
            event.code ===
                "Delete" ||
            event.key ===
                "Delete"
        ) {
            event.preventDefault();

            deleteSelectedObjects();

            return;
        }

        const shortcut =
            event.key.toUpperCase();

        const tool =
            drawToolDefinitions.find(
                candidate =>
                    candidate.shortcut ===
                    shortcut
            );

        if (tool) {
            activateTool(
                tool.id
            );
        }
    }
);

renderEngineeringTools(
    "GEOMETRY"
);

renderCurrentDrawing();

renderProperties();
