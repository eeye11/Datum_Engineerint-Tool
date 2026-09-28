/* Central source of truth for structured engineering drawings. */
(function () {
    const BASE_PIXELS_PER_UNIT = 2.4;

    /*
     * Vertices of a regular polygon, derived from its
     * stored parameters.
     *
     * This lives with the geometry model so the
     * renderer, the drawing controller, hit-testing and
     * the snapping candidates all derive the shape from
     * the same definition and can never disagree.
     */
    function polygonVertices(
        geometry
    ) {
        const sides =
            Math.max(
                3,
                Math.round(
                    Number(geometry.sides) || 3
                )
            );

        const radius =
            Number(geometry.radius) || 0;

        const center =
            geometry.center || {
                x: 0,
                y: 0
            };

        const rotation =
            Number(geometry.rotation) || 0;

        const points = [];

        for (
            let index = 0;
            index < sides;
            index += 1
        ) {
            const angle =
                rotation +
                (
                    index *
                    2 *
                    Math.PI
                ) /
                    sides;

            points.push({
                x:
                    center.x +
                    radius *
                        Math.cos(angle),

                y:
                    center.y +
                    radius *
                        Math.sin(angle)
            });
        }

        return points;
    }

    function createDrawingState() {
        return {
            version: 1,
            units: "mm",
            objects: [],
            camera: {
                zoom: 1,
                panX: 0,
                panY: 0
            },
            grid: {
                visible: true,
                spacing: 5
            },
            snap: {
                enabled: true,
                spacing: 1
            },
            objectSnap: {
                enabled: true,
                tolerancePx: 10,
                inferenceTolerancePx: 8
            },
            styleDefaults: {
                stroke: "#000000",
                fill: "none",
                lineWidth: 0.5,
                lineType: "solid",
                opacity: 1
            },
            activeTool: null,
            interaction: {
                preview: null,
                phase: "idle",
                startPoint: null,
                currentPoint: null,
                rawPointerPoint: null,
                snappedPoint: null,
                inferredPoint: null,
                effectiveConstructionPoint: null,
                snapCandidate: null,
                hoveredEntity: null,
                inference: null,
                selectionStart: null,
                selectionCurrent: null,
                selectionBox: null,
                selectionDragging: false,
                points: [],
                previewObjects: [],
                modifyAxisObjectIds: [],
                arcLastAngle: null,
                arcAccumulatedSweep: 0,
                arcMode: "centrepoint",
                arcCursorAngle: null,
                polygonMode: "sides",
                polygonSides: 6,
                polygonSides: null,
                polygonMode: null,
                polygonAdditionalSides: null,
                polygonFeatureType: null
            },
            selection: {
                selectedObjectIds: [],
                boxSelectionIds: [],
                hoveredObjectId: null
            },
            history: {
                past: [],
                future: []
            }
        };
    }

    function createStyle(overrides = {}) {
        return {
            stroke: "#000000",
            fill: "none",
            lineWidth: 0.5,
            lineType: "solid",
            opacity: 1,
            ...overrides
        };
    }

    function createGeometryObject(type, geometry, options = {}) {
        const generatedId = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const typeLabel = {
            line: "Line",
            point: "Point",
            polyline: "Polyline",
            triangle: "Triangle",
            polygon: "Polygon",
            circle: "Circle",
            arc: "Arc",
            rectangle: "Rectangle",

            /*
             * Statics features. Every one of these is a real,
             * separately selectable feature with its own
             * authoritative type, so it never collapses into a
             * generic Line, Point or generic Force.
             */
            particle: "Particle",
            "rigid-body": "Rigid Body",
            beam: "Beam",
            truss: "Truss",
            cable: "Cable",
            shaft: "Shaft",
            force: "Point Force",
            moment: "Applied Moment",
            couple: "Couple",
            load: "Distributed Load",
            "varying-load": "Varying Distributed Load",
            "pin-support": "Pin Support",
            "roller-support": "Roller Support",
            "fixed-support": "Fixed Support",
            "smooth-support": "Smooth Support",
            "pin-connection": "Pin Connection",
            "fixed-connection": "Fixed Connection",
            "slider-connection": "Slider Connection",
            "coordinate-system-2d": "2D Coordinate System"
        }[type] || type;

        return {
            id: options.id || `${type}-${generatedId}`,
            name: options.name || typeLabel,
            type,
            geometry,
            style: createStyle(options.style),
            metadata: options.metadata || {},

            /*
             * A child records the feature it belongs to, so
             * a force snapped onto a Beam nests under it in
             * the Feature Tree. Undefined means unattached,
             * which is the normal case for a standalone
             * feature or a piece of plain geometry.
             */
            parentId:
                options.parentId ||
                undefined,

            engineering: options.engineering || undefined
        };
    }

    const geometryFactories = {
        line: (start, end, options) =>
            createGeometryObject(
                "line",
                { start, end },
                options
            ),

        point: (position, options) =>
            createGeometryObject(
                "point",
                { position },
                options
            ),

        polyline: (points, options) =>
            createGeometryObject(
                "polyline",
                { points },
                options
            ),

        /*
         * A triangle is one feature. Its geometry keeps
         * the three corner points, closed back to the
         * first point, so it stays a single selectable
         * and editable object.
         */
        triangle: (points, options) =>
            createGeometryObject(
                "triangle",
                {
                    points,

                    closed: true
                },
                options
            ),

        circle: (center, radius, options) =>
            createGeometryObject(
                "circle",
                { center, radius },
                options
            ),

        arc: (center, radius, startAngle, endAngle, options) =>
            createGeometryObject(
                "arc",
                {
                    center,
                    radius,
                    startAngle,
                    endAngle
                },
                options
            ),

        rectangle: (position, width, height, rotation = 0, options) =>
            createGeometryObject(
                "rectangle",
                {
                    position,
                    width,
                    height,
                    rotation
                },
                options
            ),

        /*
         * A regular polygon is stored as its defining
         * parameters: centre, radius, rotation and side
         * count. The vertices are always derived from
         * these, so the canvas preview, the committed
         * geometry and the Features panel all read and
         * write one authoritative model.
         */
        polygon: (center, radius, sides, rotation = 0, options) =>
            createGeometryObject(
                "polygon",
                {
                    center,
                    radius,
                    sides,
                    rotation
                },
                options
            ),

        /*
         * Statics features.
         *
         * A point force is a force applied at one location on
         * a body: an arrow from its point of application, with
         * a magnitude in newtons and a direction in degrees. It
         * is one coherent feature with its own type.
         */
        force: (start, end, options) =>
            createGeometryObject(
                "force",
                {
                    start,
                    end,
                    position: start,
                    magnitude: Math.hypot(
                        end.x - start.x,
                        end.y - start.y
                    ),
                    angle:
                        Math.atan2(
                            end.y - start.y,
                            end.x - start.x
                        ) * 180 / Math.PI
                },
                options
            ),

        forceFromMagnitude: (position, magnitude, angleDegrees, options) => {
            const radians =
                angleDegrees * Math.PI / 180;
            const end = {
                x: position.x + magnitude * Math.cos(radians),
                y: position.y + magnitude * Math.sin(radians)
            };

            return geometryFactories.force(
                position,
                end,
                options
            );
        },

        /*
         * A particle is an idealised body: a point with no
         * size and no rotation. It reuses point geometry
         * internally but keeps its own feature type so the
         * Features panel identifies it correctly.
         */
        particle: (position, options) =>
            createGeometryObject(
                "particle",
                { position },
                options
            ),

        /*
         * A rigid body is a rectangle with size, position and
         * rotation. It reuses the rectangle geometry shape
         * but keeps its own feature type, so it stays one
         * coherent body rather than four separate lines.
         */
        "rigid-body": (position, width, height, options) =>
            createGeometryObject(
                "rigid-body",
                {
                    position,
                    width,
                    height,
                    rotation: 0
                },
                options
            ),

        /*
         * Slender structural members: beam, truss, cable and
         * shaft.
         *
         * Each is one coherent feature defined by its two end
         * points, so they share the same shape while keeping
         * their own feature type and their own engineering
         * properties. They are not generic lines with a label
         * attached.
         */
        beam: (start, end, options) =>
            createGeometryObject(
                "beam",
                {
                    start,
                    end,
                    depth: 12
                },
                options
            ),

        /*
         * A truss is one coherent feature: a pin-jointed
         * member span. The panels its renderer draws are
         * visual output, not separate selectable members.
         */
        truss: (start, end, options) =>
            createGeometryObject(
                "truss",
                {
                    start,
                    end,
                    panels: 4
                },
                options
            ),

        cable: (start, end, options) =>
            createGeometryObject(
                "cable",
                {
                    start,
                    end,
                    tension: 0
                },
                options
            ),

        shaft: (start, end, options) =>
            createGeometryObject(
                "shaft",
                {
                    start,
                    end,
                    diameter: 20,
                    torque: 0
                },
                options
            ),

        /*
         * Support symbols. Each variant keeps its own feature
         * type so the renderer can draw the right engineering
         * symbol and the panel can name it correctly.
         */
        "pin-support": (position, options) =>
            createGeometryObject(
                "pin-support",
                { position, orientation: 0 },
                options
            ),

        "roller-support": (position, options) =>
            createGeometryObject(
                "roller-support",
                { position, orientation: 0 },
                options
            ),

        "fixed-support": (position, options) =>
            createGeometryObject(
                "fixed-support",
                { position, orientation: 0 },
                options
            ),

        "smooth-support": (position, options) =>
            createGeometryObject(
                "smooth-support",
                { position, orientation: 0 },
                options
            ),

        /*
         * Connection symbols. Each keeps its own type so the
         * pin, fixed and slider joints render distinctly.
         */
        "pin-connection": (start, end, options) =>
            createGeometryObject(
                "pin-connection",
                { start, end },
                options
            ),

        "fixed-connection": (start, end, options) =>
            createGeometryObject(
                "fixed-connection",
                { start, end },
                options
            ),

        "slider-connection": (start, end, options) =>
            createGeometryObject(
                "slider-connection",
                { start, end },
                options
            ),

        /*
         * A couple is a pure moment from two equal and
         * opposite parallel forces. It is stored as one
         * coherent feature, not as two separate arrows.
         */
        couple: (position, magnitude, separation, clockwise, options) =>
            createGeometryObject(
                "couple",
                {
                    position,
                    magnitude,
                    separation,
                    clockwise
                },
                options
            ),

        /*
         * A varying distributed load carries an intensity at
         * each end, so it can describe a triangular or
         * trapezoidal distribution without extra geometry.
         * The arrows its renderer draws are visual output of
         * this one feature, not separate selectable features.
         */
        "varying-load": (start, end, startIntensity, endIntensity, options) =>
            createGeometryObject(
                "varying-load",
                {
                    start,
                    end,
                    startIntensity,
                    endIntensity
                },
                options
            ),

        /*
         * A distributed load is one coherent feature: a span
         * with a single intensity. Its row of arrows is
         * rendered output, not separate selectable features.
         */
        load: (start, end, intensity, options) =>
            createGeometryObject(
                "load",
                {
                    start,
                    end,
                    intensity
                },
                options
            ),

        /*
         * An applied moment is a rotational action at a
         * point, with a magnitude in newton-metres and a
         * sense of rotation.
         */
        moment: (position, magnitude, clockwise, options) =>
            createGeometryObject(
                "moment",
                {
                    position,
                    magnitude,
                    clockwise
                },
                options
            ),

        /*
         * A generic connection link, kept so older saved
         * drawings still load. New connections are created as
         * the specific pin, fixed or slider type.
         */
        connection: (start, end, options) =>
            createGeometryObject(
                "connection",
                {
                    start,
                    end,
                    reaction: 0
                },
                options
            ),

        coordinateSystem2D: (origin, options = {}) => {
            const xAxisLength = Number.isFinite(options.xAxisLength)
                ? options.xAxisLength
                : 25;

            const yAxisLength = Number.isFinite(options.yAxisLength)
                ? options.yAxisLength
                : xAxisLength;

            return createGeometryObject(
                "coordinate-system-2d",
                {
                    origin,
                    xAxisLength,
                    yAxisLength
                },
                options
            );
        }
    };

    function addObject(state, object) {
        const baseName = object.name;
        const nameIndex =
            state.objects.filter(
                candidate => candidate.type === object.type
            ).length + 1;

        object.name = baseName.match(/\d+$/)
            ? baseName
            : `${baseName} ${nameIndex}`;

        state.objects.push(object);

        return object.id;
    }

    function removeObject(state, objectId) {
        state.objects = state.objects.filter(
            object => object.id !== objectId
        );

        state.selection.selectedObjectIds =
            state.selection.selectedObjectIds.filter(
                id => id !== objectId
            );
    }

    function selectObjects(state, objectIds) {
        state.selection.selectedObjectIds = [
            ...new Set(objectIds)
        ];
    }

    function selectObject(state, objectId) {
        selectObjects(state, [objectId]);
    }

    function clearSelection(state) {
        state.selection.selectedObjectIds = [];
    }

    function cloneObjects(objects) {
        return JSON.parse(JSON.stringify(objects));
    }

    function snapshotDrawing(state) {
        return cloneObjects(state.objects);
    }

    function commitDrawingChange(state, previousObjects) {
        state.history.past.push(
            cloneObjects(previousObjects)
        );

        state.history.future = [];
    }

    function restoreObjects(state, objects) {
        state.objects = cloneObjects(objects);

        const existingIds = new Set(
            state.objects.map(object => object.id)
        );

        state.selection.selectedObjectIds =
            state.selection.selectedObjectIds.filter(
                id => existingIds.has(id)
            );

        clearInteraction(state);
    }

    function canUndo(state) {
        return state.history.past.length > 0;
    }

    function canRedo(state) {
        return state.history.future.length > 0;
    }

    function undo(state) {
        if (!canUndo(state)) {
            return false;
        }

        state.history.future.push(
            snapshotDrawing(state)
        );

        restoreObjects(
            state,
            state.history.past.pop()
        );

        return true;
    }

    function redo(state) {
        if (!canRedo(state)) {
            return false;
        }

        state.history.past.push(
            snapshotDrawing(state)
        );

        restoreObjects(
            state,
            state.history.future.pop()
        );

        return true;
    }

    function setActiveTool(state, toolId) {
        state.activeTool = toolId;
        clearInteraction(state);
    }

    function clearInteraction(state) {
        state.interaction.preview = null;
        state.interaction.phase = "idle";
        state.interaction.startPoint = null;
        state.interaction.currentPoint = null;
        state.interaction.rawPointerPoint = null;
        state.interaction.snappedPoint = null;
        state.interaction.inferredPoint = null;

        /*
         * The parent is decided by the first click of a
         * span tool, so it is cleared with the rest of the
         * interaction. Leaving it behind would let a later
         * force attach itself to a body the student has
         * stopped working on.
         */
        state.interaction.parentId = null;

        /*
         * A body-attached feature holds its target body and
         * the points placed on it only for the life of the
         * operation. Dropping them here is what makes a
         * cancelled load or support leave the body untouched
         * and create no partial feature.
         */
        state.interaction.staticsTarget = null;
        state.interaction.attachmentPoints = [];

        /*
         * A truss under construction is temporary state too, so
         * it is dropped with the rest of the interaction. Nothing
         * it has drawn can survive a cancel, which is what keeps
         * a half-built structure out of the feature collection.
         */
        state.interaction.trussStage = 0;
        state.interaction.trussMembers = [];
        state.interaction.trussOutline = [];
        state.interaction.trussInProgress = null;
        state.interaction.effectiveConstructionPoint = null;
        state.interaction.snapCandidate = null;
        state.interaction.hoveredEntity = null;
        state.interaction.inference = null;
        state.interaction.selectionStart = null;
        state.interaction.selectionCurrent = null;
        state.interaction.selectionBox = null;
        state.interaction.selectionDragging = false;
        state.interaction.points = [];
        state.interaction.previewObjects = [];
        state.interaction.modifyAxisObjectIds = [];
        state.interaction.arcLastAngle = null;
        state.interaction.arcAccumulatedSweep = 0;
        state.interaction.arcMode = "centrepoint";
        state.interaction.arcCursorAngle = null;
        state.interaction.polygonMode = "sides";
        state.interaction.polygonSides = 6;
        state.interaction.polygonSides = null;
        state.interaction.polygonMode = null;
        state.interaction.polygonAdditionalSides = null;
        state.interaction.polygonFeatureType = null;
    }

    function setInteraction(state, interaction) {
        state.interaction = {
            ...state.interaction,
            ...interaction
        };
    }

    function setCameraZoom(state, zoom) {
        state.camera.zoom = Math.min(
            20,
            Math.max(0.25, zoom)
        );
    }

    function panCamera(state, panX, panY) {
        state.camera.panX = panX;
        state.camera.panY = panY;
    }

    function snapCoordinate(value, state) {
        if (
            !state.snap.enabled ||
            state.snap.spacing <= 0
        ) {
            return value;
        }

        return (
            Math.round(
                value / state.snap.spacing
            ) * state.snap.spacing
        );
    }

    function engineeringToScreen(point, bounds, state) {
        const scale =
            BASE_PIXELS_PER_UNIT *
            state.camera.zoom;

        return {
            x:
                bounds.width / 2 +
                (point.x - state.camera.panX) *
                    scale,

            y:
                bounds.height / 2 -
                (point.y - state.camera.panY) *
                    scale
        };
    }

    function screenToEngineering(
        point,
        bounds,
        state,
        shouldSnap = false
    ) {
        const scale =
            BASE_PIXELS_PER_UNIT *
            state.camera.zoom;

        const engineeringPoint = {
            x:
                (point.x - bounds.width / 2) /
                    scale +
                state.camera.panX,

            y:
                (bounds.height / 2 - point.y) /
                    scale +
                state.camera.panY
        };

        if (!shouldSnap) {
            return engineeringPoint;
        }

        return {
            x: snapCoordinate(
                engineeringPoint.x,
                state
            ),
            y: snapCoordinate(
                engineeringPoint.y,
                state
            )
        };
    }

    function serializeDrawing(state) {
        return JSON.stringify(
            {
                version: state.version,
                units: state.units,
                camera: {
                    ...state.camera
                },
                grid: {
                    ...state.grid
                },
                snap: {
                    ...state.snap
                },
                objectSnap: {
                    ...state.objectSnap
                },
                styleDefaults: {
                    ...state.styleDefaults
                },
                objects: state.objects.map(
                    object => ({
                        ...object,
                        geometry:
                            JSON.parse(
                                JSON.stringify(
                                    object.geometry
                                )
                            ),
                        style: {
                            ...object.style
                        },
                        metadata: {
                            ...object.metadata
                        }
                    })
                )
            },
            null,
            2
        );
    }

    window.enggDrawingState = {
        BASE_PIXELS_PER_UNIT,
        createDrawingState,
        createStyle,
        createGeometryObject,
        geometryFactories,
        addObject,
        removeObject,
        selectObjects,
        selectObject,
        clearSelection,
        snapshotDrawing,
        commitDrawingChange,
        canUndo,
        canRedo,
        undo,
        redo,
        setActiveTool,
        clearInteraction,
        setInteraction,
        setCameraZoom,
        panCamera,
        snapCoordinate,
        engineeringToScreen,
        screenToEngineering,
        polygonVertices,
        serializeDrawing
    };
})();
