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

            /*
             * THE STATICS ENVIRONMENT'S DISPLAY SETTINGS.
             *
             * One block for the whole Statics workspace, held at
             * drawing level rather than on any individual feature. The
             * Vector Scale in here is the single shared value that every
             * force and load arrow is drawn through.
             *
             * It is a DISPLAY setting and nothing else. It changes how
             * big the arrows look and never how big the forces are: a
             * 100 N force drawn at 4x is still 100 N, and the analysis
             * that reads it never sees this value at all.
             */
            statics: {
                vectorScale: 1
            },
            objectSnap: {
                enabled: true,
                tolerancePx: 10,

                /*
                 * The catch band for horizontal and vertical
                 * alignment is deliberately WIDER than the band
                 * for snapping onto a point.
                 *
                 * Landing on a point is an aiming task: the user
                 * is looking at a specific spot and can correct
                 * towards it. Lining up with an alignment is not:
                 * the user is judging a direction against a long
                 * chord, and the error is spread along that chord
                 * rather than visible as a single miss. Judging it
                 * in degrees from a long member is much harder
                 * than aiming at its end, so a band narrower than
                 * the point tolerance makes alignment feel broken
                 * precisely where it is most useful - joining a
                 * truss member or a loaded span to a joint it is
                 * meant to line up with.
                 *
                 * The snap engine already treats alignment as the
                 * wider of the two concerns; this only states it
                 * as a number so the two can never drift apart.
                 */
                inferenceTolerancePx: 24
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

                /*
                 * The construction's own contribution to the
                 * shared snap context.
                 *
                 * `snapGeometry` is the geometry that exists
                 * only in the interaction - a truss's members so
                 * far, a load's points so far - published to the
                 * snap system so a construction can snap to what
                 * it has already built.
                 *
                 * `snapQuarterSnap` says that geometry offers
                 * quarter regions, which is a Truss capability
                 * and is declared rather than inferred.
                 *
                 * `snapToolId` is the tool the construction is
                 * really being, kept separately from the armed
                 * tool so a construction does not lose its own
                 * snapping behaviour once the student changes
                 * tool mid-way.
                 */
                snapGeometry: [],
                snapQuarterSnap: false,
                snapToolId: null,
                guideline: null,
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
            resultant: "Resultant",
            "force-components": "Force Components",

            /*
             * The three diagram types are separate FEATURES, not
             * one "Diagram" with a setting, so the Features panel
             * reads "SFD 1" rather than "Diagram 1" and the type
             * is visible without opening anything.
             */
            "shear-force-diagram": "SFD",
            "bending-moment-diagram": "BMD",
            "axial-force-diagram": "AFD",
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
            "coordinate-system-2d": "2D Coordinate System",
            /*
             * Named as FEATURES, not as measurements.
             *
             * A dimension is "Dimension 1" in the Features list
             * however it happens to be measured, because that list is
             * how a student finds a dimension to select, edit or
             * delete. Named after the measurement instead, a list of
             * them read as a column of "Horizontal"s with no way to
             * tell them apart.
             *
             * The measurement's own label is not lost: it is on the
             * dimension as it is drawn. A feature's NAME identifies
             * the feature; the measurement describes it.
             */
            dimension: "Dimension",
            annotation: "Annotation"
        }[type] || type;

        return {
            id: options.id || `${type}-${generatedId}`,
            name: options.name || typeLabel,
            type,
            geometry,
            style: createStyle(options.style),
            metadata: options.metadata || {},

            /*
             * A feature's own non-geometric data, kept whole.
             *
             * A dimension's references and placement, and an
             * annotation's text and source, are not geometry and are
             * not style - but they are the feature. This object
             * returns a fixed set of fields on purpose, so that a
             * caller cannot smuggle an unexpected one in; a feature
             * that needs more than the set has to be added here
             * rather than worked around.
             *
             * Copied rather than referenced, so that the feature
             * cannot be changed by writing to the model it came from,
             * and so that it survives a round trip through
             * serialisation with its own contents rather than a live
             * reference to something that will not be there.
             *
             * SPREAD ONTO THE FEATURE, not nested under `content`.
             *
             * The dimension and annotation models both read their own
             * fields straight off the feature - `dimension.sourceRefs`,
             * `annotation.placement`, `annotation.textMode` - because
             * a model is handed a feature and is entitled to ask it
             * what it is. Nesting those fields under `content` meant
             * every such lookup landed on undefined: a dimension could
             * not be measured or formatted and drew nothing, and an
             * annotation could not find its source feature or its own
             * position. Both stayed well-formed enough to select,
             * save and undo, which is what made the failure quiet.
             *
             * They are spread AFTER the fixed fields so that a
             * dimension or annotation really is the model, and the
             * fixed fields below cannot be overwritten by them.
             */
            ...(options.content
                ? JSON.parse(
                    JSON.stringify(options.content)
                )
                : {}),

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

                /*
                 * NO LINE WEIGHT IS SET HERE.
                 *
                 * This factory used to force a force to 2, arguing
                 * that a symbol needs more presence than an outline.
                 * That put the default thickness of a Point Force at a
                 * different number from the default thickness of every
                 * other feature, so a force could never be compared
                 * with a line and neither was wrong - and because it
                 * was applied as a default it was ALSO applied over
                 * the top of a width the student or the tool had
                 * already chosen, silently discarding it.
                 *
                 * A force that needs more presence is expressed by
                 * setting a line weight, which every feature has and
                 * which the Features panel exposes for all of them.
                 * A default that quietly disagrees with the rest of
                 * the sheet is not a kindness, and one that overrides
                 * an explicit choice is a fault.
                 *
                 * So the options are passed through untouched and the
                 * force is drawn at whatever weight was asked for -
                 * the same weight a Line would get.
                 */
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
        /*
         * THE SUPPORTS.
         *
         * `position` is where the SYMBOL is drawn, which is outside
         * the body; where it is ATTACHED is carried separately on the
         * geometry, in the body's own frame, by whoever creates it.
         *
         * That separation is the whole of how a support works, and
         * putting it in the factory rather than in the renderer is
         * deliberate: the attachment is part of what the feature IS,
         * so it has to be saved, undone and redone with it. Deriving
         * it at draw time would make a reloaded support depend on the
         * renderer still being asked the same question, and a support
         * moved along its beam would be unable to remember where on
         * the beam it had been.
         *
         * `flipped` is which side of the body the symbol is on. It is
         * false for a new support because the default is the
         * conventional one - underneath a level beam - and it is the
         * only thing the Flip control changes.
         */
        "pin-support": (position, options) =>
            createGeometryObject(
                "pin-support",
                {
                    position,
                    orientation: 0,
                    flipped: false,
                    attachment: {
                        distance: 0
                    }
                },
                options
            ),

        "roller-support": (position, options) =>
            createGeometryObject(
                "roller-support",
                {
                    position,
                    orientation: 0,
                    flipped: false,
                    attachment: {
                        distance: 0
                    }
                },
                options
            ),

        "fixed-support": (position, options) =>
            createGeometryObject(
                "fixed-support",
                {
                    position,
                    orientation: 0,
                    flipped: false,
                    attachment: {
                        distance: 0
                    }
                },
                options
            ),

        "smooth-support": (position, options) =>
            createGeometryObject(
                "smooth-support",
                {
                    position,
                    orientation: 0,
                    flipped: false,
                    attachment: {
                        distance: 0
                    }
                },
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
         * A Couple Moment is a FREE moment: a rotational action that
         * needs no body, no support and no attachment point, and is
         * therefore stored exactly as a Moment is - a centre, a
         * magnitude and a sense of rotation.
         *
         * It used to be stored as a separation between two lines of
         * action, because it was DRAWN as two straight forces. That
         * was the wrong shape for the feature as well as for the
         * drawing: a free moment has no pair of forces on the sheet,
         * and a "separation" implied a spacing between things that
         * were never drawn. `separation` is still written here so a
         * drawing saved before this change keeps loading, but nothing
         * reads it any more.
         */
        couple: (position, magnitude, separation, direction, options) => {
            const geometry = {
                position,
                magnitude: Number(magnitude) || 0,

                /*
                 * The same sense-of-rotation word a Moment uses, and
                 * read by the same renderer. A Couple Moment is a
                 * Moment that happens to need no body, and the two are
                 * indistinguishable in the drawing - so the one fact
                 * that distinguishes them, which is the body, must not
                 * be smuggled in as a difference in how direction is
                 * stored.
                 */
                direction:
                    String(direction) === "CW"
                        ? "CW"
                        : "CCW",

                unit: "N·m",

                /*
                 * Legacy field, carried so a drawing saved before the
                 * couple became a curved arrow still opens. Nothing
                 * reads it: a free moment has no pair of lines of
                 * action, and a "separation" between them would imply a
                 * spacing between things that are no longer drawn.
                 */
                separation
            };

            return createGeometryObject(
                "couple",
                geometry,
                options
            );
        },

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
         * A distributed load is ONE continuous feature: a body, a
         * single force direction for the whole of it, and a small
         * set of magnitude-defining points along that body. The row
         * of arrows is the renderer sampling the profile between
         * those points, so editing one of them reshapes the field
         * instead of editing one force out of many.
         *
         * `direction` is stored in degrees and shared by every
         * arrow, which is what makes them parallel by construction
         * rather than by the renderer remembering to keep them so.
         */
        load: (start, end, intensity, options) =>
            createGeometryObject(
                "load",
                {
                    start,
                    end,
                    intensity,

                    direction:
                        options?.direction ??
                        -90,

                    interval: 20,

                    points: [
                        {
                            t: 0,
                            magnitude: intensity
                        },
                        {
                            t: 1,
                            magnitude: intensity
                        }
                    ]
                },
                options
            ),

        /*
         * AN APPLIED MOMENT IS A ROTATIONAL ACTION AT A POINT.
         *
         * Every part of it is a separate, named fact, and the names
         * matter as much as the values:
         *
         *   position       WHERE it acts. The clicked or snapped point,
         *                 and never anything else - not the body's
         *                 centre, not its nearest end, not a tidier
         *                 spot. Where the student pointed is the
         *                 answer.
         *   magnitude      HOW MUCH. Engineering data, in N-m, and
         *                 wholly independent of how big the symbol is
         *                 drawn.
         *   direction      WHICH WAY it turns, as "CCW" or "CW".
         *   unit           the engineering unit, kept on the feature
         *                 rather than assumed from the document.
         *   arrowType      the head's SHAPE, which is a presentation
         *                 choice like a line width.
         *   arrowSize      the head's size, scaled from the line width
         *                 unless the student overrides it.
         *   arcRadius      how large the curved arrow is DRAWN.
         *
         * DIRECTION IS A WORD, NOT A BOOLEAN.
         *
         * It used to be a `clockwise` flag, and a flag cannot be read:
         * `clockwise: false` leaves the reader working out that the
         * moment is anticlockwise. Worse, it is easy to invert - every
         * place that read it had to remember which way round it was,
         * and one that did not drew the arrow the wrong way round
         * while still being called "correct". A value that names its
         * own meaning removes both problems, and it is the value a
         * saved file and a Features panel can both show.
         *
         * The flag is still accepted below for files saved before
         * this, so an older drawing keeps the direction it was drawn
         * with.
         */
        moment: (
            position,
            magnitude,
            direction,
            options
        ) => {
            const geometry = {
                position,

                /*
                 * The direction, normalised. A Moment is
                 * anticlockwise unless something says otherwise, and
                 * anything that is not recognisably "CW" is treated as
                 * anticlockwise rather than being stored verbatim -
                 * a direction nobody can read is worse than one that is
                 * merely a default.
                 */
                direction:
                    String(direction) === "CW"
                        ? "CW"
                        : "CCW",

                magnitude: Number(magnitude) || 0,

                /*
                 * The engineering unit, stored rather than assumed.
                 * A drawing can mix N-m and kN-m, and a moment whose
                 * unit is only in the document settings cannot be
                 * re-labelled when the document's units change.
                 */
                unit: "N·m"
            };

            /*
             * THE RADIUS IS NEVER DERIVED FROM THE MAGNITUDE.
             *
             * It is left unset here, which is the point: a moment that
             * was never resized stores nothing, and the renderer falls
             * back to the shared default. A magnitude of 500 and one
             * of 5 are the same size on the drawing, because a drawing
             * shows which way something turns rather than how hard -
             * and a symbol that grew with its value would be claiming
             * an engineering meaning it does not have.
             */
            return createGeometryObject(
                "moment",
                geometry,
                options
            );
        },

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
        },

        /*
         * A dimension and an annotation, as ordinary features.
         *
         * Both go through the feature factories rather than being
         * built inline, so they are named, numbered, selected,
         * deleted and undone by exactly the same code as every other
         * feature. A dimension is a feature on a drawing, not a
         * decoration painted over one.
         *
         * The models are reached by name rather than captured,
         * because drawing-state loads before them. A direct reference
         * would make the load order something that could be got
         * wrong, and getting it wrong would throw at creation time
         * and take the drawing down with it.
         */
        /*
         * A RESULTANT and a FORCE COMPONENTS ANALYSIS.
         *
         * Both are real features rather than answers printed in the status
         * line, because each one carries engineering information that has to be
         * LABELLED: a resultant states its magnitude and direction, and the
         * component analysis states Fx and Fy. Before these existed the
         * annotation kinds for them were correct but had nothing to attach to,

         * so a student could not put "R = 250 N" on the drawing at all.

         *
         * The geometry is deliberately the same shape a Point Force uses -

         * a start, an end, and the magnitude and angle they imply - so the

         * annotation layer, the measurement layer and the renderer can all

         * read them without a special case per kind.

         *
         * What they are NOT is a calculation about the drawing. The resultant

         * tool decides where to place the arrow from the forces the student

         * selected; it does not work out reactions or equilibrium, because the

         * student does that. The values stored are what the student states.

         */
        resultant: (start, end, options) =>
            createGeometryObject(
                "resultant",
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

        "force-components": (start, end, options) =>
            createGeometryObject(
                "force-components",
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

                /*
                 * ========================================================
                 * ANALYSIS DIAGRAM TEMPLATES
                 * ========================================================
                 *
                 * A SHEAR FORCE DIAGRAM, a BENDING MOMENT DIAGRAM and an
                 * AXIAL FORCE DIAGRAM are each created here as ONE
                 * semantic feature, not as a pile of lines and points.
                 *
                 * They are TEMPLATES, and that is the whole point. EnggDraw
                 * draws the frame - a zero axis to measure against, a
                 * region to draw in, and the source beam's span where there
                 * is one - and the student draws the diagram itself with the
                 * ordinary Line and Arc tools. Nothing here computes a shear
                 * value, a bending moment, an axial force, a sign or a
                 * curve. These tools organise and document the student's own
                 * reasoning; solving it for them would remove the only thing
                 * the exercise is for.
                 *
                 * One object each, because that is what one is on the
                 * drawing: a student has an SFD, not four hundred lines.
                 * Being a single feature is what lets it be selected, moved,
                 * named, saved and undone as the single thing it appears to
                 * be, and it is why the Features panel reads "SFD 1"
                 * instead of a list of anonymous segments.
                 *
                 * Three named factories rather than one parameterised by a
                 * flag, because they are genuinely different documents: they
                 * are told apart by name, icon, heading and tint, and folding
                 * them together would push that difference into every branch
                 * that reads them.
                 */

                /*
                 * The shape all three share.
                 *
                 * `diagramType` is the identity. It drives the label, the
                 * icon, the tint and the Features-panel entry, so the three
                 * are distinguishable at a glance without a heading drawn
                 * on the sheet.
                 */
                "analysis-diagram": (
                    diagramType,
                    start,
                    end,
                    options
                ) =>
                    createGeometryObject(
                        "analysis-diagram",
                        {
                            start,
                            end,
                            diagramType,

                            /*
                             * The zero axis is the line the student
                             * measures against, and it is part of the
                             * TEMPLATE rather than a Line feature of its
                             * own.
                             *
                             * A zero axis is a reference, not a piece of
                             * the drawing. It must not be selectable, must
                             * not be dragged away, and must not appear in
                             * the Features list as geometry the student
                             * created. Anything that could accidentally
                             * disturb it would be a fault, so the renderer
                             * draws it from this span and it cannot be
                             * picked up at all.
                             */
                            zeroAxis: {
                                from: { ...start },
                                to: { ...end }
                            },

                            /*
                             * The region the solution is drawn in. A
                             * height, given to the renderer to suggest the
                             * frame without imposing a shape on it: the
                             * student may draw far above or below this and
                             * nothing constrains them to it.
                             */
                            drawingHeight:
                                options?.drawingHeight ??
                                90,

                            /*
                             * Reference positions carried from the source
                             * beam, where the diagram was made from one.
                             *
                             * These are the only things transferred, and
                             * they are positions the student can already
                             * see: the ends of the span, where a support
                             * sits, where a load is applied. Transferring
                             * them saves redrawing the stations.
                             *
                             * Shear jumps, magnitudes, slopes, curve shape
                             * and sign are deliberately excluded. Those are
                             * the solution, and nothing here may produce
                             * one.
                             */
                            referencePositions:
                                options
                                    ?.referencePositions ??
                                [],

                            /*
                             * The feature is NAMED as the diagram it is,
                             * so the Features panel and the Feature Tree
                             * read "SFD 1" rather than exposing the shared
                             * "analysis-diagram" type to the student.
                             *
                             * The type stays shared - one renderer, one
                             * hit test, one persistence path for all three -
                             * but the shared type is an implementation
                             * detail and should never be the thing the
                             * student sees. A separate name per feature
                             * keeps the three distinguishable in every list
                             * without branching each of them on a flag.
                             *
                             * The number is supplied by the CALLER, which
                             * counts features of this diagram's own kind.
                             * Counting here would be wrong: it would count
                             * every object on the sheet, so a second SFD
                             * made after a Beam and a truss would arrive as
                             * "SFD 4" and the student would be left
                             * wondering where three diagrams had gone.
                             */

                            /*
                             * Subordinate on purpose: a template that
                             * competes with the geometry drawn on it
                             * defeats its own purpose, so the background is
                             * a faint tint and is never selectable.
                             */
                            backgroundVisible: true
                        },
                        {
                            ...options,

                            /*
                             * The feature's NAME goes here, not in
                             * the geometry, because that is where
                             * createGeometryObject reads it from.
                             * A name placed in the geometry object is
                             * silently ignored and the feature falls
                             * back to its raw type - so the panel
                             * would read "analysis-diagram" and the
                             * student would see the implementation's
                             * type instead of the diagram they made.
                             *
                             * The number is supplied by the CALLER,
                             * which counts features of this kind.
                             * Counting every object instead would make
                             * the second SFD on a sheet that already
                             * has a Beam and a truss arrive as
                             * "SFD 4", and the student would be left
                             * wondering where three diagrams went.
                             */
                            name:
                                options?.name ??
                                diagramType
                        }
                    ),

                "shear-force-diagram": (start, end, options) =>
                    geometryFactories["analysis-diagram"](
                        "sfd",
                        start,
                        end,
                        options
                    ),

                "bending-moment-diagram": (start, end, options) =>
                    geometryFactories["analysis-diagram"](
                        "bmd",
                        start,
                        end,
                        options
                    ),

                "axial-force-diagram": (start, end, options) =>
                    geometryFactories["analysis-diagram"](
                        "afd",
                        start,
                        end,
                        options
                    ),

                   dimension: (options = {}) => {
            const created =
                window.enggDimensionModel
                    .createDimension(options);

            return createGeometryObject(
                "dimension",
                {},

                /*
                 * The measurement is carried through `content`, which
                 * createGeometryObject spreads onto the feature itself.
                 * It has to arrive that way: the dimension model reads
                 * `dimension.sourceRefs` and `dimension.placement`
                 * directly, so a feature that hid them one level down
                 * could not be measured, formatted or drawn.
                 *
                 * Only the identity is passed alongside it. The NAME is
                 * left to addObject, which derives it from the
                 * feature's type and numbers it - so dimensions read as
                 * "Dimension 1", "Dimension 2" in the Features list
                 * however they are measured.
                 *
                 * Passing the model's own name bypassed that, and the
                 * model's name is the measurement's label, which is
                 * right for a panel heading and wrong for a feature
                 * identity: a student looking for their dimension in
                 * the list would have found a column of
                 * "Horizontal"s and "Vertical"s.
                 */
                {
                    id: created.id,
                    content: {
                        dimensionType:
                            created.dimensionType,
                        sourceRefs:
                            created.sourceRefs,
                        placement:
                            created.placement,
                        label: created.label,
                        orientation:
                            created.orientation,
                        resolved:
                            created.resolved
                    }
                }
            );
        },

        annotation: (options = {}) => {
            const created =
                window.enggAnnotationModel
                    .createAnnotation(options);

            return createGeometryObject(
                "annotation",
                {},

                /*
                 * Carried through `content` and spread onto the
                 * feature, for the same reason as a dimension's
                 * measurement: the annotation model reads
                 * `annotation.textMode`, `annotation.sourceFeatureId`
                 * and `annotation.placement` off the feature itself.
                 *
                 * These four are deliberately not folded together.
                 * The link to the source feature, the text the label
                 * currently shows, where the student has put the box,
                 * and whether that position was their choice are four
                 * separate facts. Keeping them apart is what lets the
                 * student move the text box anywhere on the sheet
                 * while it goes on updating from its feature.
                 */
                {
                    id: created.id,
                    content: {
                        annotationKind:
                            created.annotationKind,
                        textMode: created.textMode,
                        text: created.text,
                        sourceFeatureId:
                            created.sourceFeatureId,
                        anchorRef:
                            created.anchorRef,
                        placement:
                            created.placement,
                        placementMode:
                            created.placementMode,
                        leader: created.leader,
                        visible: created.visible,
                        unresolved:
                            created.unresolved ??
                            false
                    }
                }
            );
        }
    };

    /*
     * A fresh identity for a pasted copy.
     *
     * addObject only renames a feature; the identity is minted
     * when a feature is first created. A copy is created by
     * cloning rather than by running the factory, so it needs an
     * identity of its own here, or it would arrive with none and
     * could not be selected, found in the tree or referenced.
     *
     * The original's id is deliberately not reused: two features
     * sharing one would make the copy impossible to tell from the
     * thing it was copied from.
     */
    function newFeatureId(
        type
    ) {
        const generated =
            globalThis.crypto &&
            typeof globalThis.crypto.randomUUID ===
                "function"
                ? globalThis.crypto.randomUUID()
                : `${Date.now()}-${Math.random()
                    .toString(16)
                    .slice(2)}`;

        return `${type}-${generated}`;
    }

    function addObject(state, object) {
        const baseName =
            object.name.match(/\d+$/)
                ? object.name.replace(
                      /\d+$/,
                      ""
                  ).trim()
                : object.name;

        const nameIndex =
            state.objects.filter(
                candidate =>
                    candidate.type === object.type
            ).length + 1;

        /*
         * A NAME THE CALLER ASKED FOR SPECIFICALLY IS USED AS GIVEN.
         *
         * Everything below numbers features by their TYPE, because
         * that is right for almost every feature: two rectangles
         * are "Rectangle 1" and "Rectangle 2" whichever way round
         * they were added, and a pasted copy never arrives as a
         * second "Rectangle 1".
         *
         * It is not right when one type covers several genuinely
         * different features. The three analysis diagrams share
         * the "analysis-diagram" type - deliberately, so they get
         * one renderer, one hit test and one persistence path - so
         * numbering by type made an SFD, a BMD and an AFD read
         * "SFD 1", "SFD 2", "SFD 3". The student sees three
         * different diagrams carrying three different names, and
         * the type-based numbering has quietly thrown that away.
         *
         * A caller that has already worked out the name it wants -
         * because it counts a real category, not a storage type -
         * therefore gets exactly that name.
         *
         * The name must still not CLASH. A repeated name is left to
         * the numbering below, so two features of the same kind are
         * never both called "SFD 1"; only a name that is free is
         * honoured. The check is on the name and not the type, so
         * a genuine collision anywhere on the sheet is caught.
         */
        const requestedName =
            typeof object.name === "string" &&
            object.name.trim() !== "" &&
            !state.objects.some(
                candidate =>
                    candidate.name === object.name
            );

        if (requestedName) {
            const named = {
                ...object,
                name: object.name
            };

            state.objects.push(named);

            return named;
        }

        /*
         * Every feature of a type is numbered in order, so a
         * pasted copy is "Rectangle 2" rather than a second
         * "Rectangle 1". The name of the feature being added is
         * never trusted to already carry the right number,
         * because a copy necessarily carries the number it was
         * copied from.
         */
        object.name = `${baseName} ${nameIndex}`;

        /*
         * A feature cloned by the clipboard arrives without an
         * identity, because it was copied rather than created.
         * One is minted here so the copy is a first-class feature:
         * selectable, listed in the tree, and independent of the
         * feature it was copied from.
         */
        if (!object.id) {
            object.id = newFeatureId(
                object.type
            );
        }

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

    /*
     * The dependency registry is set by its own module at load time,
     * and held here rather than reached for directly, so this module
     * keeps no knowledge of it and the analysis update can be absent -
     * as it is in the module-load check - without this one failing.
     */
    let analysisDependencyRegistry = null;

    function setAnalysisDependencyRegistry(registry) {
        analysisDependencyRegistry = registry;
    }

    function refreshAnalysisObjects(state) {
        if (!analysisDependencyRegistry) {
            return 0;
        }

        return analysisDependencyRegistry.refreshAll(state);
    }

    function resolveAnalysisAfterDeletion(
        state,
        deletedIds
    ) {
        if (!analysisDependencyRegistry) {
            return [];
        }

        return analysisDependencyRegistry.resolveDeletedSources(
            state,
            deletedIds
        );
    }

    /*
     * Notified whenever the document is committed to, so the
     * controller can mark it as having unsaved changes.
     *
     * Set by the controller at startup. It is a hook rather than a
     * direct call so that this module stays free of any knowledge of
     * files, and so the notification is impossible to invoke by
     * accident from elsewhere.
     */
    let onDocumentChanged = null;

    function commitDrawingChange(state, previousObjects) {
        /*
         * Keep every Analysis object true of its sources, HERE, before
         * the snapshot is taken.
         *
         * This is the one place every committed edit passes through -
         * a created feature, a dragged handle, a typed magnitude, a
         * reversed load - so putting the refresh here means no tool
         * needs to know that a Resultant exists, and a tool written
         * tomorrow is covered without being thought about. Putting it
         * anywhere else would mean every path that can change a force
         * had to remember to update the analysis that depends on it.
         *
         * IT IS HERE, NOT IN EACH TOOL, BECAUSE OF HISTORY.
         *
         * The refresh runs BEFORE the previous state is captured for
         * the Undo stack, so the snapshot it stores is the one in which
         * the analysis objects were ALREADY consistent with their
         * sources. Undoing therefore returns the force to where it was
         * with its components correct for that moment, rather than
         * restoring a components object that was still describing the
         * old position - which is the state a student would see if
         * Undo ran before the refresh, and the one they would report
         * as Undo being broken.
         *
         * And it records nothing itself: one edit by the student is
         * one entry in the History list, however many analysis objects
         * it happened to update.
         */
        refreshAnalysisObjects(state);

        state.history.past.push(
            cloneObjects(previousObjects)
        );

        state.history.future = [];

        /*
         * Every committed edit passes through here, so this is the
         * one place that knows the document no longer matches what
         * is on disk.
         *
         * Marking it here rather than in each of the many code paths
         * that edit the drawing - a created feature, a dragged
         * handle, a typed value, a reversed load, an edited
         * distribution point - is what means none of them can be
         * forgotten. A missed call would mean the unsaved indicator
         * lies and the user loses work on close.
         *
         * The controller owns the document's file and dirty state,
         * so it is told rather than asked; this module has no opinion
         * about files.
         */
        if (
            typeof onDocumentChanged === "function"
        ) {
            onDocumentChanged();
        }
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

    /*
     * Replace the document's objects with a set read from a file.
     *
     * The objects arrive with the ids they were saved under, and
     * those ids are the whole of the file's relationship model: a
     * load's parent, a support's body, a dimension's measured
     * geometry. They are therefore kept exactly as they are, rather
     * than being regenerated, so a child that was saved under a
     * particular parent comes back under that same parent. A fresh
     * id would silently break every relationship in the file.
     */
    function restoreDocument(state, document) {
        if (document && Array.isArray(document.objects)) {
            restoreObjects(state, document.objects);
        }

        if (document?.units) {
            state.units = document.units;
        }

        if (document?.scale) {
            state.scale = { ...document.scale };
        }

        return state;
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
         * The snap context is part of the interaction, so it is
         * cleared with it.
         *
         * Leaving it behind would be actively wrong rather than
         * merely untidy: a finished truss's members would keep
         * being published as live construction geometry, so a
         * later construction would snap to a structure that is
         * no longer being drawn, and a leftover quarter flag
         * would offer quarter regions to a tool that must not
         * have them.
         */
        state.interaction.snapGeometry = [];
        state.interaction.snapQuarterSnap = false;
        state.interaction.snapToolId = null;

        /*
         * A construction that is over has no guide to hold, and
         * a leftover one would be drawn over the next drawing
         * until the pointer happened to move.
         */
        state.interaction.guideline = null;

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
        /*
         * A dimension being created.
         *
         * Held on the interaction rather than on the feature because a
         * dimension does not exist until it is placed: Escape has to be
         * able to leave nothing behind, and clearInteraction is what
         * runs on Escape and on switching tools. Everything here is
         * therefore temporary, and clearing it removes no committed
         * dimension from the drawing.
         */
        state.interaction.dimensionTarget = null;
        state.interaction.dimensionTargets = null;
        state.interaction.dimensionRefs = null;
        state.interaction.dimensionPlacement = null;
        state.interaction.annotationKind = null;
        state.interaction.annotationKinds = null;
        state.interaction.annotationTarget = null;
        state.interaction.annotationTargetName = null;
        state.interaction.annotationPlacement = null;

        state.interaction.effectiveConstructionPoint = null;

        /*
         * The live geometry a construction publishes to the snap
         * system. It belongs to the unfinished operation, so it
         * goes with it: leaving it behind would let a later tool
         * snap to members that no longer exist.
         */
        state.interaction.snapGeometry = [];

        /*
         * The distributed load's construction state: the body it
         * loads, the direction its first force set, and the
         * magnitude points placed so far. All of it is temporary,
         * so cancelling leaves no partial load behind.
         */
        state.interaction.distributedLoadStart = null;
        state.interaction.distributedLoadEnd = null;
        state.interaction.distributedLoadDirection = null;
        state.interaction.distributedLoadPoints = [];
        state.interaction.distributedLoadHasProfile = false;

        /*
         * The constant load's own construction state, for the
         * same reason: the body it loads, the direction and the
         * single magnitude. It is kept apart from the varying
         * load's profile state because the two are different
         * constructions, and clearing one must never leave the
         * other half-built.
         */
        state.interaction.loadStart = null;
        state.interaction.loadEnd = null;
        state.interaction.loadDirection = null;
        state.interaction.loadMagnitude = 0;

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

        /*
         * Record WHEN a guideline was last established, so the
         * snap system can hold it briefly once the cursor drifts
         * out of its region.
         *
         * Stored as part of the interaction rather than kept in
         * the snap module, because a guideline belongs to the
         * construction being drawn: it is cleared with the
         * construction, it is not written into the document, and
         * undo does not need to know it ever existed.
         *
         * The clock is the snap system's own, not a second one
         * written here. Two clocks for one timestamp would differ
         * by however far the page has been open - and
         * performance.now() and Date.now() are not the same
         * origin - so a guideline would look either centuries
         * old or impossibly fresh depending on which one read
         * it. Asking the module that owns the hold keeps the
         * two ends of the comparison in the same time base.
         */
        if (
            interaction?.guideline
        ) {
            state.interaction.guideline = {
                inference:
                    interaction.guideline,

                at: window.enggDrawingSnap
                    ?.nowMs?.() ??
                    Date.now()
            };
        }
    }

    function normalizeZoom(zoom) {
        let value =
            Number(zoom);

        if (
            !Number.isFinite(
                value
            )
        ) {
            return 1;
        }

        /*
         * The zoom percentage is always an
         * integer so that repeated
         * multiplication, restoration and
         * fit operations can never
         * accumulate floating point
         * artefacts.
         */
        /*
         * Rounded as a PERCENTAGE, not as the factor.
         *
         * The zoom is held as a factor - 1 is 100% - but the thing
         * that must be a whole number is the percentage the user sees.
         * Rounding the factor instead would round every zoom level to
         * the nearest whole number of TIMES: 150% would become 2
         * (200%), and 50% would become 1 (100%), because there is no
         * whole number of times between them. Every intermediate zoom
         * - the ones people actually work at - would be unreachable,
         * and the two controls meant to step through them would jump
         * straight past.
         *
         * Rounding the percentage and converting back keeps the
         * original guarantee - the stored value is a whole number of
         * percent, so 100.0000001%, 149.999999% and 199.9999998% can
         * never be stored or displayed - while making every step
         * between 25% and 500% reachable and exact.
         */
        value = Math.round(value * 100) / 100;

        if (
            !Number.isFinite(
                value
            )
        ) {
            return 1;
        }

        return Math.min(
            5,
            Math.max(
                0.25,
                value
            )
        );
    }

    function setCameraZoom(state, zoom) {
        state.camera.zoom =
            normalizeZoom(zoom);
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
                statics: {
                    ...state.statics
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
        restoreDocument,
        restoreObjects,
        setDocumentChangedHandler(handler) {
            onDocumentChanged = handler;
        },
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
        setAnalysisDependencyRegistry,
        refreshAnalysisObjects,
        resolveAnalysisAfterDeletion,
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
        serializeDrawing,

        /*
         * The measurement, dimension and annotation models, reached
         * through the one namespace the application already uses.
         *
         * Getters rather than the modules themselves, so a consumer
         * that read one at load time does not end up holding
         * undefined because it had not been defined yet.
         */
        get measurement() {
            return window.enggMeasurement;
        },
        get dimensionModel() {
            return window.enggDimensionModel;
        },
        get annotationModel() {
            return window.enggAnnotationModel;
        }
    };
})();