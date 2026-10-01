/* SVG renderer for the engineering drawing workspace. */
(function () {
    const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

    function createSvgElement(type, attributes = {}) {
        const element =
            document.createElementNS(
                SVG_NAMESPACE,
                type
            );

        Object.entries(attributes).forEach(
            ([key, value]) => {
                element.setAttribute(
                    key,
                    value
                );
            }
        );

        return element;
    }

    function arcPathData(center, radius, startAngle, endAngle) {
        const sweep = endAngle - startAngle;

        if (
            !Number.isFinite(sweep) ||
            Math.abs(sweep) <= 1e-10 ||
            !Number.isFinite(radius) ||
            radius <= 0
        ) {
            return "";
        }

        const start = {
            x: center.x + radius * Math.cos(startAngle),
            y: center.y - radius * Math.sin(startAngle)
        };
        const segmentCount = Math.max(
            1,
            Math.ceil(Math.abs(sweep) / Math.PI)
        );
        const segmentSweep = sweep / segmentCount;
        let path = `M ${start.x} ${start.y}`;

        for (let index = 1; index <= segmentCount; index += 1) {
            const angle = startAngle + segmentSweep * index;
            const end = {
                x: center.x + radius * Math.cos(angle),
                y: center.y - radius * Math.sin(angle)
            };

            path += ` A ${radius} ${radius} 0 0 ${segmentSweep < 0 ? 1 : 0} ${end.x} ${end.y}`;
        }

        return path;
    }

    function ensureSvg(canvas) {
        let svg =
            canvas.querySelector(
                ".drawing-renderer"
            );

        if (!svg) {
            svg =
                document.createElementNS(
                    SVG_NAMESPACE,
                    "svg"
                );

            svg.classList.add(
                "drawing-renderer"
            );

            svg.setAttribute(
                "aria-hidden",
                "true"
            );

            canvas.appendChild(svg);
        }

        const bounds =
            canvas.getBoundingClientRect();

        svg.setAttribute(
            "viewBox",
            `0 0 ${bounds.width} ${bounds.height}`
        );

        svg.setAttribute(
            "width",
            bounds.width
        );

        svg.setAttribute(
            "height",
            bounds.height
        );

        return svg;
    }

    /*
     * The dash pattern a line type draws with, or null for a solid
     * one.
     *
     * Factored out of applyStyle so the force and load shafts, which
     * build their lines element by element rather than through
     * applyStyle, can honour the line type the Features panel
     * actually selected. Without this, a load drawn as a dashed or
     * centre line stored the choice and silently ignored it, while
     * every other feature in the drawing honoured it.
     */
    function dashPatternFor(
        lineType
    ) {
        if (lineType === "dashed") {
            return "8 5";
        }

        if (lineType === "center") {
            return "12 4 2 4";
        }

        if (lineType === "construction") {
            return "4 4";
        }

        return null;
    }

    /*
     * Build a line drawn in a feature's own stroke, width and line
     * type, so a force or a load shaft looks like the feature it
     * belongs to rather than like the default weight of the canvas.
     */
    /*
     * The three analysis templates, told apart by tint.
     *
     * Each diagram is a different document with a different
     * heading, a different icon and a different name, and the
     * background is the only thing you see when a page of
     * diagrams is zoomed out. So they are given distinct, very
     * faint tints rather than one neutral grey: a student
     * scanning a sheet full of them should be able to tell an
     * SFD from a BMD without reading either.
     */
    const ANALYSIS_DIAGRAM_TINTS = {
        sfd: "#1f5c38",
        bmd: "#8a4b1f",
        afd: "#1f4a7a"
    };

    /*
     * WHAT EACH DIAGRAM'S ORDINATE ACTUALLY MEASURES.
     *
     * The three look alike - a frame, an axis, some station marks -
     * and without this they are told apart only by their heading text.
     * A diagram whose vertical axis is unlabelled is not a drawing
     * anybody can read: the student is being asked to plot a value on
     * it, and the sheet does not say which value.
     *
     * So each carries its quantity and its unit, and the renderer
     * draws them against the axis as a reader expects to find them.
     * They are NAMES for the axes, not values: no magnitude, no sign
     * and no scale are implied, because those are the solution and the
     * student supplies them.
     */
    const ANALYSIS_DIAGRAM_AXES = {
        sfd: {
            y: "Shear force",
            unit: "kN",
            x: "Distance along beam",
            xUnit: "m"
        },
        bmd: {
            y: "Bending moment",
            unit: "kN·m",
            x: "Distance along beam",
            xUnit: "m"
        },
        afd: {
            y: "Axial force",
            unit: "kN",
            x: "Distance along member",
            xUnit: "m"
        }
    };

    function styledLine(
        from,
        to,
        style,
        widthOverride
    ) {
        /*
         * The same shared scale every other stroke uses.
         *
         * This took `style.lineWidth` as if the millimetre value were
         * already a pixel width, so a Line drawn through here came out
         * thinner than the same Line drawn through applyStyle. One
         * number, one meaning: a configured weight in millimetres in,
         * a consistent weight on screen out.
         *
         * An explicit `widthOverride` is still honoured, because that
         * is a caller asking for a specific width - snap markers and
         * the like, which are UI furniture rather than drawing.
         */
        const width = Number.isFinite(widthOverride)
            ? widthOverride
            : scaledStrokeWidth(style?.lineWidth);

        const attributes = {
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            stroke: style?.stroke || "#000000",
            "stroke-width": width,
            "stroke-linecap": "round"
        };

        const dash =
            dashPatternFor(style?.lineType);

        if (dash) {
            attributes["stroke-dasharray"] = dash;
        }

        return createSvgElement(
            "line",
            attributes
        );
    }

    /*
     * THE SHARED STROKE-WIDTH SCALE.
     *
     * A configured line width is a real-world weight in millimetres.
     * The drawing is rendered in pixels, so every stroke has to be
     * scaled from that weight into the same on-screen thickness an
     * ordinary line of the same weight gets. This is that scale, and
     * it is the ONLY place the conversion happens.
     *
     * It matters that there is one place. The force arrow used to
     * apply its own width, taken straight from the style, while every
     * other feature went through here. So a Point Force at the sheet's
     * default 0.5 drew at 0.5 pixels while a Line at the identical
     * 0.5 drew at 1.2 - the force looked THINNER than ordinary
     * geometry, which is precisely what a force must never do, and
     * the two could not be compared because neither was wrong.
     *
     * The floor keeps a hairline visible at extreme zoom-out, and is
     * the same for every feature so it cannot reintroduce a
     * difference between them.
     */
    const STROKE_SCALE = 2.4;
    const STROKE_MIN = 0.5;

    /*
     * The on-screen stroke width for a configured line weight.
     *
     * Read by the styled line, by applyStyle, and by the force arrow,
     * so a force shaft and a Line of the same weight are the same
     * number of pixels - which is what "the force is as thick as the
     * line" has to mean if it is to be true on screen and not only
     * in the settings.
     */
    function scaledStrokeWidth(lineWidth) {
        const width = Number.isFinite(lineWidth)
            ? lineWidth
            : 0.5;

        return Math.max(STROKE_MIN, width * STROKE_SCALE);
    }

    function applyStyle(
        element,
        style = {}
    ) {
        const lineWidth =
            Number.isFinite(
                style.lineWidth
            )
                ? style.lineWidth
                : 0.5;

        element.setAttribute(
            "stroke",
            style.stroke ||
                "#000000"
        );

        element.setAttribute(
            "fill",
            style.fill ||
                "none"
        );

        element.setAttribute(
            "stroke-width",
            scaledStrokeWidth(lineWidth)
        );

        if (
            style.opacity != null
        ) {
            element.setAttribute(
                "opacity",
                style.opacity
            );
        }

        if (
            style.lineType ===
            "dashed"
        ) {
            element.setAttribute(
                "stroke-dasharray",
                "8 5"
            );
        }

        if (
            style.lineType ===
            "center"
        ) {
            element.setAttribute(
                "stroke-dasharray",
                "12 4 2 4"
            );
        }

        if (
            style.lineType ===
            "construction"
        ) {
            element.setAttribute(
                "stroke-dasharray",
                "4 4"
            );

            element.setAttribute(
                "opacity",
                "0.65"
            );
        }
    }

    /*
     * ARROWHEADS THAT SCALE WITH THE LINE THEY SIT ON
     *
     * An arrowhead drawn at a fixed size looks wrong the moment the
     * student changes the line thickness: a heavy dimension line with
     * tiny arrows reads as a mistake. The head is therefore sized as a
     * multiple of the line width, with a floor so it stays visible on
     * the thinnest line the toolbar offers.
     *
     * It is drawn pointing INTO the line it terminates, from the tip
     * back along the line's own direction, which is why the caller
     * passes the direction the head points rather than the point it
     * touches.
     */
    function arrowHeadSize(lineWidth) {
        return Math.max(4, Math.min(11, (Number(lineWidth) || 0.5) * 10));
    }

    /*
     * A DIMENSION ARROWHEAD.
     *
     * Deliberately NOT called appendArrowHead: this file already has
     * a function of that name, declared later and for force arrows,
     * and because both are function declarations inside the same
     * scope the later one wins. Calling the name from here silently
     * invoked the force version, which takes an ANGLE IN RADIANS and a
     * size in a different argument position - so passing a direction
     * vector produced NaN and every dimension arrowhead collapsed.
     *
     * The dimension head is built here rather than reused because a
     * dimension's arrow points along its own dimension line, which is
     * a different question from which end of a force carries its
     * head.
     */
    function appendDimensionArrowHead(svg, tip, pointing, size, fill) {
        /*
         * A direction that is not a direction cannot be pointed
         * along. Skipping leaves the dimension line, which still
         * reads correctly, instead of an invalid polygon that takes
         * the whole drawing's SVG with it.
         */
        if (
            !pointing ||
            !Number.isFinite(pointing.x) ||
            !Number.isFinite(pointing.y)
        ) {
            return;
        }

        const angle = Math.atan2(pointing.y, pointing.x);

        svg.appendChild(
            createSvgElement("polygon", {
                points: [
                    `${tip.x},${tip.y}`,
                    `${tip.x - size * Math.cos(angle - 0.42)},${tip.y - size * Math.sin(angle - 0.42)}`,
                    `${tip.x - size * Math.cos(angle + 0.42)},${tip.y - size * Math.sin(angle + 0.42)}`
                ].join(" "),
                fill,
                stroke: "none"
            })
        );
    }

    /*
     * DIMENSION TEXT
     *
     * Placed with the frame the model computed, so a vertical
     * dimension reads bottom-to-top and an angled one follows the
     * line without ever turning upside down. A small white plate sits
     * behind the text so it stays readable where it crosses the
     * dimension line - the standard drafting treatment for a dimension
     * that interrupts its own line.
     */
    function appendDimensionText(svg, text, frame, stroke, toScreen) {
        if (!text || !frame || !toScreen) {
            return;
        }

        /*
         * The frame arrives in WORLD coordinates, because the model
         * works in world units and knows nothing about zoom. It is
         * converted here at the last moment, which is what keeps a
         * dimension saying the same thing at 50% and 200%.
         */
        const origin = toScreen(frame);

        const lines = String(text).split("\n");
        const fontSize = 11;
        const lineHeight = fontSize * 1.15;

        const group = createSvgElement("g", {
            transform: `translate(${origin.x} ${origin.y}) rotate(${frame.angle || 0})`
        });

        const plateWidth =
            Math.max(...lines.map(line => line.length)) * fontSize * 0.58 +
            6;

        group.appendChild(
            createSvgElement("rect", {
                x: -plateWidth / 2,
                y: (-lines.length * lineHeight) / 2,
                width: plateWidth,
                height: lines.length * lineHeight,
                fill: "#ffffff",
                stroke: "none",
                "fill-opacity": 0.9
            })
        );

        lines.forEach((line, index) => {
            const span = createSvgElement("text", {
                x: 0,
                y: (index - (lines.length - 1) / 2) * lineHeight + fontSize * 0.35,
                fill: stroke,
                "font-size": fontSize,
                "font-family": "Arial, sans-serif",
                "text-anchor": "middle",
                "dominant-baseline": "middle"
            });

            span.textContent = line;
            group.appendChild(span);
        });

        svg.appendChild(group);
    }

    /*
     * A DIMENSION, drawn as a dimension.
     *
     * The geometry comes from the model's graphicsFor, which is where
     * the measurement, the offset chosen by the student and the
     * arrowhead convention all live. This function only converts those
     * world points to screen and draws them.
     *
     * Nothing here is an ordinary Line feature: the witness lines
     * belong to this dimension for as long as the dimension exists,
     * are regenerated whenever it is drawn, and cannot be picked on
     * their own.
     */
    function appendDimensionEntity(svg, entity, state, toScreen, style) {
        const model = window.enggDimensionModel;

        if (!model) {
            return;
        }

        const graphics = model.graphicsFor(entity, state);

        if (!graphics) {
            return;
        }

        const stroke = style.stroke || "#000000";
        const lineWidth = Number(style.lineWidth) || 0.5;
        const head = arrowHeadSize(lineWidth);

        const drawLine = (from, to, dashed) => {
            const a = toScreen(from);
            const b = toScreen(to);

            svg.appendChild(
                createSvgElement("line", {
                    x1: a.x,
                    y1: a.y,
                    x2: b.x,
                    y2: b.y,
                    stroke,
                    "stroke-width": Math.max(0.6, lineWidth * 1.4),
                    ...(dashed ? { "stroke-dasharray": "4 3" } : {})
                })
            );
        };

        /*
         * AN ANGULAR DIMENSION
         *
         * Drawn as an ARC through the two legs it measures between.
         *
         * The model has already worked out where the arc runs and
         * supplies it as a list of points, and it supplies the two
         * witness lines running out along the legs. Both are drawn
         * directly from that. An earlier version of this branch
         * invented a `radius`, a `sweep` and a `witnesses` list that
         * the model does not produce, so every arc came out as an SVG
         * path full of NaN and the browser rejected the whole drawing.
         *
         * Taking the points the model computed also keeps the angle
         * and the arc in agreement: both come from the same vertex and
         * the same two directions, so the arc cannot disagree with the
         * number printed beside it.
         */
        if (graphics.kind === "angular") {
            const arc = (graphics.arc || []).filter(
                (point) =>
                    point &&
                    Number.isFinite(point.x) &&
                    Number.isFinite(point.y)
            );

            if (arc.length >= 2) {
                svg.appendChild(
                    createSvgElement("polyline", {
                        points: arc
                            .map((point) => {
                                const p = toScreen(point);
                                return `${p.x},${p.y}`;
                            })
                            .join(" "),
                        fill: "none",
                        stroke,
                        "stroke-width":
                            Math.max(0.6, lineWidth * 1.4)
                    })
                );
            }

            /*
             * The legs the angle is measured from, drawn thin and
             * dashed so they read as a reference rather than as
             * another dimension.
             */
            (graphics.extensions || []).forEach(
                ([from, to]) => {
                    drawLine(from, to, true);
                }
            );

            appendDimensionText(
                svg,
                graphics.text,
                graphics.textFrame,
                stroke,
                toScreen
            );

            return;
        }

        /*
         * WITNESS (EXTENSION) LINES
         *
         * Drawn thin and dashed, and stopping a short of the
         * dimension line so they read as reaching towards it rather
         * than crossing it - which is what makes a dimension legible
         * without reading the number.
         */
        (graphics.extensions || []).forEach(([from, to]) => {
            const a = toScreen(from);
            const b = toScreen(to);

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const length = Math.hypot(dx, dy);

            if (length < 0.001) {
                return;
            }

            /*
             * Stop short by the arrowhead's reach, so the arrows
             * never sit on top of a witness line.
             */
            const gap = Math.min(head * 0.6, length * 0.3);

            svg.appendChild(
                createSvgElement("line", {
                    x1: a.x + (dx / length) * gap,
                    y1: a.y + (dy / length) * gap,
                    x2: b.x,
                    y2: b.y,
                    stroke,
                    "stroke-width": Math.max(0.4, lineWidth * 0.8),
                    "stroke-dasharray": "4 3"
                })
            );
        });

        if (graphics.line) {
            const [from, to] = graphics.line;

            drawLine(from, to, false);

            const a = toScreen(from);
            const b = toScreen(to);

            const along = {
                x: b.x - a.x,
                y: b.y - a.y
            };

            const length = Math.hypot(along.x, along.y);

            /*
             * Guarded rather than assumed: a dimension whose two
             * points coincide has no direction to point an arrowhead
             * in, and dividing by that length would put NaN straight
             * into the SVG and drop the whole polygon. Skipping the
             * arrows leaves a dimension line, which is still a
             * readable dimension, instead of an invalid one.
             */
            if (length > 0.5) {
                const unit = {
                    x: along.x / length,
                    y: along.y / length
                };

                /*
                 * Arrows INSIDE point inwards along the line; arrows
                 * OUTSIDE point back away from it. The model chooses,
                 * because a narrow dimension has no room inside.
                 */
                const inside = graphics.arrowStyle !== "outside";

                appendDimensionArrowHead(
                    svg,
                    inside ? b : a,
                    inside ? unit : { x: -unit.x, y: -unit.y },
                    head,
                    stroke
                );

                appendDimensionArrowHead(
                    svg,
                    inside ? a : b,
                    inside ? { x: -unit.x, y: -unit.y } : unit,
                    head,
                    stroke
                );
            }
        }

        /*
         * A radius or diameter is drawn from the centre out through
         * the edge, with the figure written along that line.
         */
        if (graphics.leader) {
            drawLine(graphics.leader.from, graphics.leader.to, true);
        }

        appendDimensionText(svg, graphics.text, graphics.textFrame, stroke, toScreen);
    }

    /*
     * AN ANNOTATION
     *
     * Drawn at the position the student put it - NOT at the feature's
     * position - which is the whole point of the object. The link to
     * the source feature affects the TEXT (which is read from the
     * feature every time) and the optional LEADER (which follows
     * wherever either end moves), and nothing about where the box
     * sits.
     *
     * An unresolved annotation is drawn hollow and dashed, so a label
     * left behind by a deleted feature is visible as a problem rather
     * than quietly asserting a value.
     */
    function appendAnnotationEntity(svg, entity, state, toScreen, style) {
        const model = window.enggAnnotationModel;

        if (!model) {
            return;
        }

        if (entity.visible === false) {
            return;
        }

        /*
         * Read from the feature itself, which is where the annotation
         * model keeps these - see the factory in drawing-state for why
         * they are not nested.
         */
        const text =
            model.textFor(entity, state) ||
            entity.text ||
            "";

        if (!text) {
            return;
        }

        const placement = entity.placement;

        if (
            !placement ||
            !Number.isFinite(placement.x) ||
            !Number.isFinite(placement.y)
        ) {
            return;
        }

        const origin = toScreen(placement);
        const stroke = style.stroke || "#000000";
        const fontSize = Number(style.fontSize) || 12;
        const lineHeight = fontSize * 1.2;
        const lines = String(text).split("\n");
        const unresolved = entity.unresolved === true;

        /*
         * THE LEADER
         *
         * Part of the annotation, not a Line feature: it is computed
         * from the annotation's position and its source feature on
         * every draw, so moving either end moves the leader and
         * neither can leave a stray line behind.
         */
        const leader = model.leaderFor(entity, state);

        if (leader) {
            const from = toScreen(leader.from);
            const to = toScreen(leader.to);

            svg.appendChild(
                createSvgElement("line", {
                    x1: from.x,
                    y1: from.y,
                    x2: to.x,
                    y2: to.y,
                    stroke: unresolved ? "#999999" : stroke,
                    "stroke-width": 1,
                    ...(unresolved ? { "stroke-dasharray": "4 3" } : {})
                })
            );
        }

        const textNode = createSvgElement("text", {
            x: origin.x,
            y: origin.y - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35,
            fill: unresolved ? "#999999" : stroke,
            "font-size": fontSize,
            "font-family": "Arial, sans-serif",
            "text-anchor": "middle",
            ...(unresolved ? { "text-decoration": "underline dotted" } : {})
        });

        lines.forEach((line, index) => {
            if (index === 0) {
                textNode.textContent = line;
                return;
            }

            const tspan = createSvgElement("tspan", {
                x: origin.x,
                dy: lineHeight
            });

            tspan.textContent = line;
            textNode.appendChild(tspan);
        });

        svg.appendChild(textNode);
    }

    function appendEntity(
        svg,
        entity,
        state,
        bounds
    ) {
        const parentSvg = svg;
        svg = createSvgElement("g");
        svg.classList.add("drawing-feature");
        if (state.selection?.selectedObjectIds?.includes(entity.id)) {
            svg.classList.add("drawing-entity-selected");
        }
        if (state.selection?.hoveredObjectId === entity.id) {
            svg.classList.add("drawing-entity-hovered");
        }
        svg.dataset.featureId = entity.id;

        const scale =
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
            state.camera.zoom;

        const geometry =
            entity.geometry || {};

        const style =
            entity.style || {};

        const toScreen =
            point =>
                enggDrawingState
                    .engineeringToScreen(
                        point,
                        bounds,
                        state
                    );

        /*
         * STATICS SYMBOL FEATURES
         *
         * A point force and the support and connection symbols
         * all draw from one anchor point, so they are handled
         * in this single pass. An applied moment, a couple, a
         * distributed load and a varying distributed load are
         * drawn by their own blocks further down.
         */
        if (
            entity.type === "force" ||
            /*
             * A resultant and a component analysis are vectors too, so they
             * share this pass rather than getting a symbol of their own. What
             * says which is which is the annotation beside them.
             */
            entity.type === "resultant" ||
            entity.type === "force-components" ||
            entity.type === "pin-support" ||
            entity.type === "roller-support" ||
            entity.type === "fixed-support" ||
            entity.type === "smooth-support" ||
            entity.type === "pin-connection" ||
            entity.type === "fixed-connection" ||
            entity.type === "slider-connection"
        ) {
            const position = geometry.start || geometry.position;

            if (
                !position ||
                !Number.isFinite(position.x) ||
                !Number.isFinite(position.y)
            ) {
                return;
            }

            const anchor = toScreen(position);
            const stroke = style.stroke || "#000000";

            if (
                entity.type === "force-components"
            ) {
                /*
                 * A DECOMPOSITION, NOT AN ARROW.
                 *
                 * The three vectors share one origin - the force's own
                 * application point - because that shared origin is what
                 * makes the picture a decomposition rather than three
                 * arrows that happen to be near each other. The dashed
                 * lines close the triangle: they are the geometric
                 * fact that the components add back up to the original,
                 * shown rather than asserted.
                 *
                 * All three come from the analysis registry, which
                 * derives them from the source force, so this block
                 * draws what the model currently says and has no
                 * arithmetic of its own.
                 */
                if (geometry.horizontal || geometry.vertical) {
                    if (
                        geometry.original &&
                        geometry.showOriginal !== false
                    ) {
                        appendAnalysisVector(
                            svg,
                            toScreen(geometry.original.start),
                            toScreen(geometry.original.end),
                            stroke,
                            style,
                            "solid"
                        );
                    }

                    if (
                        geometry.horizontal &&
                        geometry.showX !== false
                    ) {
                        appendAnalysisVector(
                            svg,
                            toScreen(geometry.horizontal.start),
                            toScreen(geometry.horizontal.end),
                            stroke,
                            style,
                            "solid"
                        );
                    }

                    if (
                        geometry.vertical &&
                        geometry.showY !== false
                    ) {
                        appendAnalysisVector(
                            svg,
                            toScreen(geometry.vertical.start),
                            toScreen(geometry.vertical.end),
                            stroke,
                            style,
                            "solid"
                        );
                    }

                    parentSvg.appendChild(svg);
                    return;
                }
            }

            if (
                entity.type === "force" ||
                entity.type === "resultant"
            ) {
                if (geometry.end) {
                    const end = toScreen(geometry.end);
                    const dx = end.x - anchor.x;
                    const dy = end.y - anchor.y;
                    const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
                    appendForceArrow(
                        svg,
                        anchor,
                        angle,
                        Math.hypot(dx, dy),
                        stroke,
                        style
                    );
                } else {
                    appendForceArrow(
                        svg,
                        anchor,
                        Number(geometry.angle) || 0,
                        Math.abs(Number(geometry.magnitude) || 0),
                        stroke,
                        style
                    );
                }
            } else if (
                entity.type === "pin-support" ||
                entity.type === "roller-support" ||
                entity.type === "fixed-support" ||
                entity.type === "smooth-support"
            ) {
                /*
                 * A SUPPORT IS DRAWN FROM ITS ATTACHMENT, NOT FROM
                 * ITS STORED POINT.
                 *
                 * The stored position is where the symbol was drawn
                 * when it was made. The authoritative fact is the
                 * ATTACHMENT - a distance along the parent body's
                 * centreline - and the drawn position is recomputed
                 * from it here, every frame.
                 *
                 * That is what makes the support behave as an
                 * attachment rather than as a mark: move the beam and
                 * the support is still the same distance along it;
                 * rotate the beam and the symbol turns with it; deepen
                 * the beam and the symbol steps further out to clear
                 * the new face. None of that needs the support itself
                 * to be touched, and none of it can be got wrong by a
                 * stored coordinate going stale.
                 *
                 * A support with no parent, or whose parent has no
                 * usable span, falls back to the stored position and
                 * angle - which is what keeps a support drawn before
                 * this existed, or placed on nothing at all, still
                 * visible and still editable.
                 */
                const parent =
                    entity.parentId
                        ? state.objects.find(
                            candidate =>
                                candidate.id ===
                                entity.parentId
                        )
                        : null;

                /*
                 * A PREVIEW CARRIES ITS TARGET DIRECTLY.
                 *
                 * A preview is not a committed feature, so it is not
                 * in the object collection and there is nothing to
                 * find it by id. It rides on the body it is being
                 * attached to, which is the same body a real
                 * attachment would be resolved from.
                 *
                 * Without this the preview falls through to its
                 * fallback - the stored position - and draws the
                 * support ON the centreline, then jumps clear of the
                 * body when the click commits it. Showing the student
                 * one thing and giving them another is the fault a
                 * preview exists to prevent, and it would be visible on
                 * every single support placed.
                 */
                const body =
                    parent ||
                    entity.targetBody ||
                    null;

                const frame =
                    body
                        ? enggBodyFrames.frameOf(
                            body
                        )
                        : null;

                const flipped =
                    geometry.flipped === true;

                const attachmentPoint =
                    frame
                        ? enggBodyFrames.pointAt(
                            frame,
                            Number(
                                geometry.attachment
                                    ?.distance
                            ) || 0
                        )
                        : null;

                const placement =
                    frame && attachmentPoint
                        ? enggBodyFrames.supportPlacement(
                            body,
                            attachmentPoint,
                            flipped
                        )
                        : null;

                const drawn =
                    placement
                        ? toScreen(placement.render)
                        : anchor;

                appendSupportSymbol(
                    svg,
                    drawn,
                    entity.type,

                    /*
                     * The symbol is turned to point AWAY from the
                     * body, along the body's own normal - so a support
                     * on a diagonal beam is rotated with it instead of
                     * hanging straight down beside it. Derived, never
                     * typed: there is no orientation for a student to
                     * set wrongly.
                     */
                    frame
                        ? enggBodyFrames.supportAngle(
                            frame,
                            flipped
                        )
                        : Number(geometry.orientation) || 0,

                    stroke
                );

                /*
                 * A short stem from the attachment out to the symbol.
                 *
                 * It is what makes the two separate positions
                 * LEGIBLE: without it a support drawn clear of the beam
                 * looks like it is simply floating near it, and the
                 * student cannot see that it is attached to the
                 * centreline rather than hovering beside the member.
                 */
                if (
                    placement &&
                    attachmentPoint
                ) {
                    const from =
                        toScreen(attachmentPoint);

                    const stem =
                        createSvgElement("line", {
                            x1: from.x,
                            y1: from.y,
                            x2: drawn.x,
                            y2: drawn.y,
                            stroke,
                            "stroke-width": 1,
                            "stroke-opacity": 0.75
                        });

                    stem.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    svg.appendChild(stem);
                }
            } else if (
                entity.type === "pin-connection" ||
                entity.type === "fixed-connection" ||
                entity.type === "slider-connection"
            ) {
                appendConnectionSymbol(
                    svg,
                    anchor,
                    entity.type,
                    stroke
                );
            } else {
                return;
            }

            parentSvg.appendChild(svg);
            return;
        }
        /*
         * A MOMENT.
         *
         * A curved rotational arrow, drawn by the shared renderer that
         * also draws a Couple Moment - one symbol, one place that knows
         * how a moment looks, so the two cannot disagree.
         *
         * The direction arrives as the word "CCW" or "CW" and is
         * converted in exactly one function, so the renderer, the hit
         * test and the Features panel cannot each arrive at a
         * different sense for the same feature.
         */
        if (entity.type === "moment") {
            const position = geometry.position;

            if (
                !position ||
                !Number.isFinite(position.x) ||
                !Number.isFinite(position.y)
            ) {
                return;
            }

            appendRotationalArrow(
                svg,
                toScreen(position),
                momentIsClockwise(geometry),
                style,
                geometry.arcRadius
            );

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * DIMENSIONS AND ANNOTATIONS
         *
         * Both are real document objects, so they are drawn here in
         * the same pass as every other feature rather than being
         * overlaid afterwards. Their graphics are asked of the models,
         * which means the drawing shows the DIMENSION as a dimension
         * line with witness lines and arrowheads, and not as a number
         * floating over the geometry.
         *
         * The models also own the measurement, so a dimension drawn
         * here re-reads its source geometry every time it is drawn.
         * That is what keeps a dimension honest after the geometry
         * moves, without this file knowing anything about beams.
         */
        if (entity.type === "dimension") {
            appendDimensionEntity(svg, entity, state, toScreen, style);
            parentSvg.appendChild(svg);
            return;
        }

        if (entity.type === "annotation") {
            appendAnnotationEntity(svg, entity, state, toScreen, style);
            parentSvg.appendChild(svg);
            return;
        }

        /*
         * COUPLE
         *
         * A couple is one feature drawn as the two equal and
         * opposite forces that make it up. The arrows belong
         * to that one object and are never selectable on their
         * own.
         */
        if (entity.type === "couple") {
            const position = geometry.position;

            if (
                !position ||
                !Number.isFinite(position.x) ||
                !Number.isFinite(position.y)
            ) {
                return;
            }

            /*
             * A Couple Moment is a FREE moment: the same rotational
             * symbol as a Moment, in the same renderer, with no
             * supporting body and therefore no connection marker of
             * any kind. Drawing it as a pair of straight forces was
             * a physical construction that happened to be two
             * features' worth of ink, and it read as a force pair
             * rather than as a moment - which is the opposite of
             * what a free moment is.
             */
            appendRotationalArrow(
                svg,
                toScreen(position),
                momentIsClockwise(geometry),
                style,
                geometry.arcRadius
            );

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * SLENDER STRUCTURAL MEMBERS
         *
         * Beam, truss, cable and shaft are all defined by
         * their two ends, but each is drawn to read as the
         * member it represents rather than as a plain line.
         */
        if (
            entity.type === "beam" ||
            entity.type === "truss" ||
            entity.type === "cable" ||
            entity.type === "shaft"
        ) {
            const start = geometry.start;
            const end = geometry.end;

            if (
                !start || !end ||
                !Number.isFinite(start.x) ||
                !Number.isFinite(end.x)
            ) {
                return;
            }

            const from = toScreen(start);
            const to = toScreen(end);
            const stroke = style.stroke || "#000000";

            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const length = Math.hypot(dx, dy) || 1;

            /*
             * Unit normal, used to give a member its depth.
             */
            const nx = -dy / length;
            const ny = dx / length;

            if (entity.type === "beam") {
                /*
                 * A beam is a slim outlined bar, so it reads
                 * as a solid member rather than a line.
                 */
                const depth = 6;

                svg.appendChild(
                    createSvgElement("polygon", {
                        points: [
                            `${from.x + nx * depth},${from.y + ny * depth}`,
                            `${to.x + nx * depth},${to.y + ny * depth}`,
                            `${to.x - nx * depth},${to.y - ny * depth}`,
                            `${from.x - nx * depth},${from.y - ny * depth}`
                        ].join(" "),
                        fill: "none",
                        stroke,
                        "stroke-width": 1.4
                    })
                );
            } else if (
                entity.type === "analysis-diagram"
            ) {
                /*
                 * AN ANALYSIS TEMPLATE.
                 *
                 * This draws a FRAME and nothing else: a tinted
                 * background, a zero axis to measure against, a
                 * label, and ticks at whatever reference
                 * positions the source feature already had.
                 *
                 * What it deliberately does not draw is the
                 * diagram. No shear jump, no moment curve, no
                 * axial plateau, no value, no sign and no slope -
                 * those are the student's work, and a tool that
                 * drew any of them would be solving the exercise
                 * rather than supporting it. Everything here is
                 * reference, so the student can draw the solution
                 * on top with the ordinary Line and Arc tools.
                 *
                 * Drawn behind everything else and faintly, so it
                 * never competes with the geometry that belongs
                 * on it.
                 */
                const start = geometry.start;
                const end = geometry.end;

                if (
                    !start || !end ||
                    !Number.isFinite(start.x) ||
                    !Number.isFinite(start.y) ||
                    !Number.isFinite(end.x) ||
                    !Number.isFinite(end.y)
                ) {
                    return;
                }

                const tint =
                    ANALYSIS_DIAGRAM_TINTS[
                        geometry.diagramType
                    ] ||
                    ANALYSIS_DIAGRAM_TINTS.sfd;

                const from = toScreen(start);
                const to = toScreen(end);

                /*
                 * The background is a fixed SCREEN tint rather
                 * than a world-space region, because it is
                 * furniture. If it grew with the drawing's own
                 * height it would cover more of the drawing the
                 * further the student zoomed out, which is the
                 * opposite of subordinate.
                 */
                const background =
                    createSvgElement("rect", {
                        x: Math.min(from.x, to.x) - 6,
                        y: Math.min(
                            from.y,
                            to.y
                        ) - 54,
                        width:
                            Math.abs(
                                to.x - from.x
                            ) + 12,
                        height: 108,
                        rx: 3,
                        fill: tint,
                        "fill-opacity": 0.1,
                        stroke: "none"
                    });

                if (geometry.backgroundVisible === false) {
                    /*
                     * Not created at all, rather than created and
                     * removed: the background is the largest thing a
                     * diagram draws, and building a node to throw it
                     * away on every frame would be work for nothing.
                     */
                } else {
                    /*
                     * `pointer-events: none`: the template is a
                     * reference, so the cursor passes straight through
                     * it to whatever is drawn on top. A background
                     * that swallowed clicks would make the lines above
                     * it very hard to pick.
                     */
                    background.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    svg.appendChild(background);
                }

                /*
                 * The zero axis, at the FEATURE'S OWN line weight.
                 *
                 * It was a literal 1 before, which meant a diagram on a
                 * 0.5 mm sheet was drawn heavier than the beam whose
                 * span it was reporting - the reference framework
                 * shouting over the drawing it exists to support.
                 */
                if (
                    geometry.showZeroAxis !== false
                ) {
                    const zeroAxis =
                        createSvgElement("line", {
                            x1: from.x,
                            y1: from.y,
                            x2: to.x,
                            y2: to.y,
                            stroke,
                            "stroke-width":
                                scaledStrokeWidth(
                                    Number(style.lineWidth) || 0.5
                                ),
                            "stroke-opacity": 0.55
                        });

                    zeroAxis.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    svg.appendChild(zeroAxis);
                }

                /*
                 * Reference stations: short ticks at the
                 * positions carried from the source. Deliberately
                 * just marks, with no values beside them - a
                 * number here would be a result, and a result
                 * does not belong in a template.
                 *
                 * Read from the marker's OWN position, which the
                 * analysis registry places on this axis from the
                 * fraction along the source it represents. It used
                 * to read a bare x and the axis's own y, which only
                 * worked for a diagram that happened to be level
                 * and directly under its source.
                 */
                (
                    geometry.showReferencePositions !==
                        false &&
                    Array.isArray(
                        geometry.referencePositions
                    )
                        ? geometry.referencePositions
                        : []
                ).forEach(reference => {
                    if (
                        !reference ||
                        !reference.position ||
                        !Number.isFinite(
                            reference.position.x
                        )
                    ) {
                        return;
                    }

                    const at = toScreen(
                        reference.position
                    );

                    /*
                     * A tick length that reads at a glance and does
                     * not grow when the student zooms out, so the
                     * framework keeps its subordinate appearance at
                     * any zoom.
                     */
                    const tick =
                        createSvgElement("line", {
                            x1: at.x,
                            y1: at.y - 5,
                            x2: at.x,
                            y2: at.y + 5,
                            stroke,
                            "stroke-width": 0.9,
                            "stroke-opacity": 0.4
                        });

                    tick.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    svg.appendChild(tick);
                });

                if (
                    geometry.heading
                ) {
                    const label =
                        createSvgElement("text", {
                            x: from.x,
                            y:
                                Math.min(
                                    from.y,
                                    to.y
                                ) - 40,
                            "font-size": 10,
                            fill: stroke,
                            "fill-opacity": 0.7
                        });

                    label.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    label.textContent =
                        geometry.heading;

                    svg.appendChild(label);
                }

                /*
                 * WHAT THE TWO AXES MEASURE.
                 *
                 * A diagram whose axes are unlabelled asks the student
                 * to plot a value on it without saying which value, and
                 * the only thing on the sheet distinguishing an SFD from
                 * a BMD is its heading text. So each axis is named,
                 * with its unit, in the place a reader looks for it:
                 * the vertical one turned up the left-hand end of the
                 * axis, the horizontal one along the bottom.
                 *
                 * THEY ARE NAMES, NOT VALUES. No magnitude, no sign
                 * and no scale are printed, because those are the
                 * solution and the student is the one who works them
                 * out. A tick or a number here would be the tool
                 * answering the exercise.
                 */
                const axes =
                    ANALYSIS_DIAGRAM_AXES[
                        geometry.diagramType
                    ];

                if (axes) {
                    const axisTop =
                        Math.min(from.y, to.y);

                    const axisLeft =
                        Math.min(from.x, to.x);

                    /*
                     * The vertical axis arrow, drawn from the zero
                     * line up to the top of the region the student is
                     * expected to use. It gives the ordinate a
                     * direction, which a bare label on a bare line does
                     * not: without it, a diagram could be read as
                     * decreasing upward as easily as increasing.
                     */
                    const arrowTop =
                        axisTop - 58;

                    const axisArrow =
                        createSvgElement("path", {
                            d:
                                `M ${axisLeft} ${axisTop - 4}` +
                                ` L ${axisLeft} ${arrowTop}`,
                            fill: "none",
                            stroke,
                            "stroke-width": 0.9,
                            "stroke-opacity": 0.55
                        });

                    axisArrow.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    svg.appendChild(axisArrow);

                    const axisHead =
                        createSvgElement("path", {
                            d:
                                `M ${axisLeft - 2.5} ${arrowTop + 4}` +
                                ` L ${axisLeft} ${arrowTop}` +
                                ` L ${axisLeft + 2.5} ${arrowTop + 4}`,
                            fill: stroke,
                            "fill-opacity": 0.55,
                            stroke: "none"
                        });

                    axisHead.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    svg.appendChild(axisHead);

                    /*
                     * The ordinate's name, set vertically so it reads
                     * along its own axis rather than across the
                     * diagram it labels.
                     */
                    const yName =
                        createSvgElement("text", {
                            x: axisLeft - 5,
                            y: axisTop - 20,
                            "font-size": 8,
                            fill: stroke,
                            "fill-opacity": 0.75,

                            /*
                             * Rotated onto the axis rather than
                             * laid out horizontally, because a
                             * horizontal caption in the left margin
                             * would have to be short enough to fit
                             * there, and "Bending moment" is not.
                             */
                            transform:
                                `rotate(-90 ${axisLeft - 5} ${axisTop - 20})`,
                            "text-anchor": "middle"
                        });

                    yName.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    yName.textContent =
                        axes.y + " (" + axes.unit + ")";

                    svg.appendChild(yName);

                    const xName =
                        createSvgElement("text", {
                            x: (from.x + to.x) / 2,
                            y: axisTop + 13,
                            "font-size": 8,
                            fill: stroke,
                            "fill-opacity": 0.75,
                            "text-anchor": "middle"
                        });

                    xName.setAttribute(
                        "pointer-events",
                        "none"
                    );

                    xName.textContent =
                        axes.x + " (" + axes.xUnit + ")";

                    svg.appendChild(xName);
                }
            } else if (entity.type === "truss") {
                /*
                 * A truss is drawn as the structure the student
                 * constructed: their own members, between their
                 * own joints. When a truss has no stored
                 * members it falls back to the two-chord form,
                 * so a truss from an older file still reads as
                 * one.
                 *
                 * The members are rendering of this one feature:
                 * they are never selectable on their own and
                 * never appear in the tree.
                 */
                const members = geometry.members;

                if (
                    Array.isArray(members) &&
                    members.length
                ) {
                        members.forEach(member => {
                            const a = toScreen(member.start);
                            const b = toScreen(member.end);

                            svg.appendChild(
                                createSvgElement("line", {
                                    x1: a.x,
                                    y1: a.y,
                                    x2: b.x,
                                    y2: b.y,
                                    stroke,
                                    "stroke-width": 1.4
                                })
                            );
                        });

                        memberJoints(members).forEach(joint => {
                            const point = toScreen(joint);

                            svg.appendChild(
                                createSvgElement("circle", {
                                    cx: point.x,
                                    cy: point.y,
                                    r: 3,
                                    fill: "#ffffff",
                                    stroke,
                                    "stroke-width": 1.4
                                })
                            );
                        });
                    } else {
                    /*
                     * A truss from an older file, or one drawn
                     * before the progressive construction, falls
                     * back to the two-chord form so it still reads
                     * as a single structure.
                     */
                    const depth = 12;
                    const panels = Math.max(2, Math.round(Number(geometry.panels) || 4));

                    const topFrom = { x: from.x + nx * depth, y: from.y + ny * depth };
                    const topTo = { x: to.x + nx * depth, y: to.y + ny * depth };
                    const botFrom = { x: from.x - nx * depth, y: from.y - ny * depth };
                    const botTo = { x: to.x - nx * depth, y: to.y - ny * depth };

                    [
                        [topFrom, topTo],
                        [botFrom, botTo]
                    ].forEach(([a, b]) => {
                        svg.appendChild(
                            createSvgElement("line", {
                                x1: a.x, y1: a.y, x2: b.x, y2: b.y,
                                stroke,
                                "stroke-width": 1.4
                            })
                        );
                    });

                    for (let i = 0; i <= panels; i += 1) {
                    const t = i / panels;
                    const chordA = {
                        x: topFrom.x + (topTo.x - topFrom.x) * t,
                        y: topFrom.y + (topTo.y - topFrom.y) * t
                    };
                    const chordB = {
                        x: botFrom.x + (botTo.x - botFrom.x) * t,
                        y: botFrom.y + (botTo.y - botFrom.y) * t
                    };
                    const nextB = {
                        x: botFrom.x + (botTo.x - botFrom.x) * ((i + 1) / panels),
                        y: botFrom.y + (botTo.y - botFrom.y) * ((i + 1) / panels)
                    };

                    svg.appendChild(
                        createSvgElement("line", {
                            x1: chordA.x, y1: chordA.y,
                            x2: chordB.x, y2: chordB.y,
                            stroke,
                            "stroke-width": 1
                        })
                    );

                    if (i < panels) {
                        svg.appendChild(
                            createSvgElement("line", {
                                x1: chordA.x, y1: chordA.y,
                                x2: nextB.x, y2: nextB.y,
                                stroke,
                                "stroke-width": 1
                            })
                        );
                    }
                }
                }
            } else if (entity.type === "cable") {
                /*
                 * A cable is drawn as a solid bar rather than a
                 * bare line, so it has visible body. It is
                 * thinner than a Beam because a cable is a
                 * lighter member, which keeps the two
                 * distinguishable at a glance.
                 */
                const depth = 3;

                svg.appendChild(
                    createSvgElement("polygon", {
                        points: [
                            `${from.x + nx * depth},${from.y + ny * depth}`,
                            `${to.x + nx * depth},${to.y + ny * depth}`,
                            `${to.x - nx * depth},${to.y - ny * depth}`,
                            `${from.x - nx * depth},${from.y - ny * depth}`
                        ].join(" "),
                        fill: stroke,
                        stroke: "none"
                    })
                );
            } else {
                /*
                 * A shaft is a member with a defined diameter,
                 * drawn as a bar with a centreline running
                 * along its axis. The centreline is part of how
                 * a shaft is drawn, not a feature of its own,
                 * and it is derived from the same two endpoints
                 * as the bar so it stays centred through a move,
                 * a resize or a rotation.
                 */
                const diameter = 8;

                svg.appendChild(
                    createSvgElement("polygon", {
                        points: [
                            `${from.x + nx * diameter},${from.y + ny * diameter}`,
                            `${to.x + nx * diameter},${to.y + ny * diameter}`,
                            `${to.x - nx * diameter},${to.y - ny * diameter}`,
                            `${from.x - nx * diameter},${from.y - ny * diameter}`
                        ].join(" "),
                        fill: "none",
                        stroke,
                        "stroke-width": 1.4
                    })
                );

                [from, to].forEach(point => {
                    svg.appendChild(
                        createSvgElement("line", {
                            x1: point.x + nx * diameter,
                            y1: point.y + ny * diameter,
                            x2: point.x - nx * diameter,
                            y2: point.y - ny * diameter,
                            stroke,
                            "stroke-width": 1.4
                        })
                    );
                });

                /*
                 * The axial centreline.
                 *
                 * This is a real engineering CENTRELINE, drawn
                 * with the application's own "center" line type,
                 * so it reads as a centre line by the same rule
                 * as every other centred line in the drawing
                 * rather than by a dash pattern invented here.
                 *
                 * It is still derived from the same two
                 * endpoints as the bar, so it stays on the axis
                 * through a move, a resize or a rotation, and
                 * it remains part of how a shaft is drawn rather
                 * than a construction line feature of its own.
                 */
                const centreline =
                    createSvgElement("line", {
                        x1: from.x,
                        y1: from.y,
                        x2: to.x,
                        y2: to.y,
                        stroke,
                        "stroke-width": 1
                    });

                applyStyle(centreline, {
                    ...style,
                    lineType: "center"
                });

                svg.appendChild(centreline);
            }

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * DISTRIBUTED LOAD
         *
         * One coherent feature: a body with a continuous field of
         * force vectors along it, which is how a distributed load
         * is read.
         *
         * The arrows are the renderer SAMPLING that one load, not a
         * row of separate Point Forces. They are sampled at the
         * load's interval and their lengths follow the profile the
         * student defined between their magnitude points, and every
         * one of them points the same way: along the load's own
         * direction, which was fixed by the first force. A body at
         * an angle does not rotate them, because the load
         * direction and the body direction are independent
         * quantities.
         */
        if (entity.type === "load") {
            const start = geometry.start;
            const end = geometry.end;

            if (
                !start || !end ||
                !Number.isFinite(start.x) ||
                !Number.isFinite(end.x)
            ) {
                return;
            }

            const from = toScreen(start);
            const to = toScreen(end);
            const stroke = style.stroke || "#000000";

            svg.appendChild(
                createSvgElement("line", {
                    x1: from.x,
                    y1: from.y,
                    x2: to.x,
                    y2: to.y,
                    stroke,
                    "stroke-width": 1.4
                })
            );

            if (
                typeof enggLoadProfile ===
                "undefined"
            ) {
                return;
            }

            const direction =
                enggLoadProfile.unitVector(
                    enggLoadProfile.loadDirection(
                        geometry
                    )
                );

            /*
             * Where the force LINES are drawn, and which end of
             * each carries the arrowhead. Neither is the other, and
             * neither is derived from the other's change.
             */
            const normal =
                enggLoadProfile.loadBodyNormal(
                    geometry
                );

            const reversed =
                enggLoadProfile.isLoadReversed(
                    geometry
                );

            const samples =
                enggLoadProfile.arrowSamples(
                    geometry
                );

            /*
             * Arrows are drawn at their true magnitude, so the
             * load's own scale is what decides the length. A
             * load drawn far from the origin must not produce
             * enormous arrows, and a large one must not be
             * flattened to the same size as a small one, so the
             * magnitude is measured in world units and only the
             * on-screen size follows the zoom.
             */
            const scale =
                enggDrawingState
                    .BASE_PIXELS_PER_UNIT *
                state.camera.zoom;

            const shaft =
                forceStrokeWidth(
                    style,
                    scale
                );

            samples.forEach(sample => {
                /*
                 * A zero magnitude draws nothing rather than a
                 * stub, so the ends of a triangular load genuinely
                 * taper to nothing.
                 */
                if (sample.magnitude <= 0) {
                    return;
                }

                const length =
                    distributedLoadArrowLength(
                        sample.magnitude,
                        scale
                    );

                /*
                 * The two ends of the drawn line, from the body's
                 * outward normal rather than from the force
                 * direction. Reversing the load cannot move either
                 * of them.
                 */
                const endpoints =
                    forceEndpoints(
                        toScreen(sample.base),
                        direction,
                        length,
                        normal
                    );

                const tip =
                    arrowheadTip(
                        endpoints,
                        direction,
                        reversed
                    );

                const headDirection =
                    arrowheadDirection(
                        endpoints,
                        reversed
                    );

                svg.appendChild(
                    styledLine(
                        endpoints.application,
                        endpoints.far,
                        style,
                        shaft
                    )
                );

                svg.appendChild(
                    createSvgElement("polygon", {
                        points: distributedLoadArrowHead(
                            tip,
                            headDirection,
                            length,
                            shaft
                        ),
                        fill: stroke,
                        stroke: "none"
                    })
                );
            });

            /*
             * The force-profile outline.
             *
             * The arrows alone show the magnitudes one at a time,
             * but a load's defining feature is how the magnitude
             * CHANGES along the body, and that is a shape. This
             * draws that shape: a single line from the tip of the
             * first arrow to the tip of the last, closed along the
             * body, so the envelope of the field is one readable
             * curve.
             *
             * It is drawn for both loads. A Varying Distributed Load
             * gives a real profile curve; a constant one gives a
             * rectangle joining the tip of the first arrow to the
             * tip of the last, which is exactly how a uniform load is
             * conventionally drawn.
             *
             * The outline is part of the load's visual definition
             * and is not a construction aid, so it stays once the
             * load is finished and is drawn in the load's own
             * stroke rather than as a preview.
             */
            const profilePointsList =
                Array.isArray(geometry.points)
                    ? geometry.points
                    : [];

            const isVaryingProfile =
                profilePointsList.length > 2 ||
                (
                    profilePointsList.length === 2 &&
                    profilePointsList[0].magnitude !==
                        profilePointsList[1].magnitude
                );

            if (samples.length > 1) {
                const outline = [
                    /*
                     * The envelope follows the very tips that were
                     * just drawn, using the same body-normal endpoints
                     * the arrows used. Deriving it from the force
                     * direction instead would swing the whole profile
                     * to the opposite side of the body on reversal, and
                     * the outline would no longer enclose its arrows.
                     */
                    ...samples.map(sample => {
                        const drawn = forceEndpoints(
                            toScreen(sample.base),
                            direction,
                            distributedLoadArrowLength(
                                sample.magnitude,
                                scale
                            ),
                            normal
                        );

                        const tip = reversed
                            ? drawn.application
                            : drawn.far;

                        return `${tip.x},${tip.y}`;
                    }),

                    /*
                     * Closed back along the body, so the outline
                     * is a region rather than a floating line.
                     */
                    ...samples
                        .slice()
                        .reverse()
                        .map(sample =>
                            toScreen(
                                sample.base
                            )
                        )
                        .map(point =>
                            `${point.x},${point.y}`
                        )
                ];

                svg.appendChild(
                    createSvgElement("polygon", {
                        points: outline.join(" "),
                        fill: stroke,

                        /*
                         * A varying profile is a real shape worth
                         * shading. A constant load's outline is a plain
                         * rectangle, so it is left unfilled and the
                         * rectangle alone carries the meaning.
                         */
                        "fill-opacity": isVaryingProfile ? 0.12 : 0.04,
                        stroke,
                        "stroke-width": 1,
                        "stroke-opacity": isVaryingProfile ? 0.55 : 0.4,

                        /*
                         * The load's profile is an ENVELOPE, not a
                         * filled region. Marking it as such lets the
                         * selection state recolour its stroke without
                         * ever filling the area under the load, which
                         * would hide the very arrows being selected.
                         */
                        class: "drawing-load-profile"
                    })
                );
            }

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * VARYING DISTRIBUTED LOAD
         *
         * The same body and the same parallel field of arrows as a
         * Distributed Load, differing only in how the magnitude
         * varies: this one is defined by an intensity at each end
         * rather than by a profile of points. It reads through the
         * shared profile module so both loads are one continuous
         * field pointing the same way.
         */
        if (entity.type === "varying-load") {
            const start = geometry.start;
            const end = geometry.end;

            if (
                !start || !end ||
                !Number.isFinite(start.x) ||
                !Number.isFinite(end.x)
            ) {
                return;
            }

            const from = toScreen(start);
            const to = toScreen(end);
            const stroke = style.stroke || "#000000";

            svg.appendChild(
                createSvgElement("line", {
                    x1: from.x,
                    y1: from.y,
                    x2: to.x,
                    y2: to.y,
                    stroke,
                    "stroke-width": 1.4
                })
            );

            if (
                typeof enggLoadProfile ===
                "undefined"
            ) {
                return;
            }

            /*
             * The two end intensities are expressed as the
             * profile the shared module samples, so the taper and
             * the arrow lengths are identical in kind to those of
             * a Distributed Load.
             */
            const profile = {
                start,
                end,

                points: [
                    {
                        t: 0,
                        magnitude: Math.max(
                            0,
                            Math.abs(
                                Number(
                                    geometry.startIntensity
                                ) || 0
                            )
                        )
                    },
                    {
                        t: 1,
                        magnitude: Math.max(
                            0,
                            Math.abs(
                                Number(
                                    geometry.endIntensity
                                ) || 0
                            )
                        )
                    }
                ]
            };

            const direction =
                enggLoadProfile.unitVector(
                    enggLoadProfile.loadDirection(
                        geometry
                    )
                );

            /*
             * Where the force LINES are drawn, and which end of
             * each carries the arrowhead. The profile below is
             * derived from the far ends, so it traces the same
             * envelope whichever way the arrows point.
             */
            const normal =
                enggLoadProfile.loadBodyNormal(
                    geometry
                );

            const reversed =
                enggLoadProfile.isLoadReversed(
                    geometry
                );

            /*
             * Drawn at the true magnitude in world units, as the
             * Distributed Load is, so both load tools scale the
             * same way and neither stops growing at a ceiling.
             */
            const scale =
                enggDrawingState
                    .BASE_PIXELS_PER_UNIT *
                state.camera.zoom;

            const samples =
                enggLoadProfile.arrowSamples(
                    profile
                );

            const outline = [];
            const back = [];

            const shaft =
                forceStrokeWidth(
                    style,
                    scale
                );

            samples.forEach(sample => {
                if (sample.magnitude <= 0) {
                    return;
                }

                const length =
                    distributedLoadArrowLength(
                        sample.magnitude,
                        scale
                    );

                /*
                 * The two ends of the drawn line, from the body's
                 * outward normal rather than from the force
                 * direction, so a reversal cannot move either.
                 */
                const endpoints =
                    forceEndpoints(
                        toScreen(sample.base),
                        direction,
                        length,
                        normal
                    );

                const tip =
                    arrowheadTip(
                        endpoints,
                        direction,
                        reversed
                    );

                svg.appendChild(
                    styledLine(
                        endpoints.application,
                        endpoints.far,
                        style,
                        shaft
                    )
                );

                svg.appendChild(
                    createSvgElement("polygon", {
                            points: distributedLoadArrowHead(
                                tip,
                                arrowheadDirection(
                                    endpoints,
                                    reversed
                                ),
                                length,
                                shaft
                            ),
                            fill: stroke,
                            stroke: "none"
                        })
                    );

                /*
                 * The envelope is traced through the FAR ends, not
                 * through the arrowheads, so reversing the load
                 * leaves the profile's shape exactly where it was.
                 */
                outline.push(
                    `${endpoints.far.x},${endpoints.far.y}`
                );
                back.unshift(
                    `${endpoints.application.x},${endpoints.application.y}`
                );
            });

            /*
             * The profile outline, joined across the arrow tips and
             * closed along the body, so the load reads as one
             * continuous field with a visible shape rather than as
             * a row of unrelated arrows. Constant end intensities
             * give a rectangle; different ones give the taper.
             */
            if (outline.length > 1) {
                svg.appendChild(
                    createSvgElement("polygon", {
                        points: outline
                            .concat(back)
                            .join(" "),
                        fill: stroke,
                        "fill-opacity": 0.12,
                        stroke,
                        "stroke-width": 1,
                        "stroke-opacity": 0.55,

                        /*
                         * The profile is an envelope, not a filled
                         * region. See the equivalent mark on the
                         * Distributed Load: the selection state
                         * recolours this stroke and must never fill
                         * the area it encloses.
                         */
                        class: "drawing-load-profile"
                    })
                );
            }

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * CONNECTION
         * Drawn as a link between two points with a marker
         * at each end.
         */
        if (entity.type === "connection") {
            const start = geometry.start;
            const end = geometry.end;

            if (
                !start || !end ||
                !Number.isFinite(start.x) ||
                !Number.isFinite(end.x)
            ) {
                return;
            }

            const from = toScreen(start);
            const to = toScreen(end);
            const stroke = style.stroke || "#000000";

            svg.appendChild(
                createSvgElement("line", {
                    x1: from.x,
                    y1: from.y,
                    x2: to.x,
                    y2: to.y,
                    stroke,
                    "stroke-width": 1.6
                })
            );

            [from, to].forEach(point => {
                svg.appendChild(
                    createSvgElement("circle", {
                        cx: point.x,
                        cy: point.y,
                        r: 3.5,
                        fill: "#ffffff",
                        stroke,
                        "stroke-width": 1.6
                    })
                );
            });

            parentSvg.appendChild(svg);
            return;
        }

        if (entity.type === "point") {
            const position = geometry.position || geometry.point || geometry;
            if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
                const screen = toScreen(position);
                /*
                 * Point Size is a screen-space marker size, so
                 * it stays legible at any zoom.
                 */
                const pointRadius =
                    Number.isFinite(style.pointSize) && style.pointSize > 0
                        ? style.pointSize
                        : 4;
                const marker = createSvgElement("circle", {
                    cx: screen.x,
                    cy: screen.y,
                    r: pointRadius,
                    fill: style.stroke || "#000000",
                    stroke: style.stroke || "#000000",
                    "stroke-width": 1
                });
                applyStyle(marker, style);
                svg.appendChild(marker);
            }
            parentSvg.appendChild(svg);
            return;
        }

        /*
         * LINE
         */
        if (
            entity.type === "line"
        ) {
            if (
                !geometry.start ||
                !geometry.end
            ) {
                return;
            }

            const start =
                toScreen(
                    geometry.start
                );

            const end =
                toScreen(
                    geometry.end
                );

            const line =
                createSvgElement(
                    "line",
                    {
                        x1: start.x,
                        y1: start.y,
                        x2: end.x,
                        y2: end.y
                    }
                );

            applyStyle(
                line,
                style
            );

            svg.appendChild(
                line
            );
        }

        /*
         * CIRCLE
         */
        if (
            entity.type ===
            "circle"
        ) {
            if (
                !geometry.center
            ) {
                return;
            }

            const center =
                toScreen(
                    geometry.center
                );

            const circle =
                createSvgElement(
                    "circle",
                    {
                        cx: center.x,
                        cy: center.y,
                        r:
                            geometry.radius *
                            scale
                    }
                );

            applyStyle(
                circle,
                style
            );

            svg.appendChild(
                circle
            );
        }

        /*
         * PARTICLE
         *
         * An engineering point node: a small filled circle
         * centred on the actual world position.
         */
        if (entity.type === "particle") {
            const position = geometry.position;

            if (
                !position ||
                !Number.isFinite(position.x) ||
                !Number.isFinite(position.y)
            ) {
                return;
            }

            const node = toScreen(position);
            const stroke = style.stroke || "#000000";

            svg.appendChild(
                createSvgElement("circle", {
                    cx: node.x,
                    cy: node.y,
                    r: 4,
                    fill: stroke,
                    stroke: "none"
                })
            );

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * RECTANGLE
         *
         * A rigid body stores the same shape, so it renders
         * through the same branch and stays one coherent
         * feature rather than four separate lines.
         */
        if (
            entity.type ===
                "rectangle" ||
            entity.type ===
                "rigid-body"
        ) {
            const x =
                geometry.position?.x ??
                0;

            const y =
                geometry.position?.y ??
                0;

            const width =
                geometry.width ??
                0;

            const height =
                geometry.height ??
                0;

            const rotation =
                geometry.rotation ??
                0;

            const topLeft =
                toScreen({
                    x,
                    y
                });

            /*
             * position is the top-left corner in engineering
             * space, where Y grows upward. toScreen already
             * flips Y, so topLeft.y is the screen row of the
             * top edge. Subtracting the height here would
             * draw the rectangle one height too high.
             */
            const rect =
                createSvgElement(
                    "rect",
                    {
                        x: topLeft.x,
                        y: topLeft.y,
                        width:
                            width *
                            scale,
                        height:
                            height *
                            scale
                    }
                );

            if (rotation) {
                /*
                 * position is the top-left corner in
                 * engineering space, where Y grows upward, so
                 * the shape's centre is half a height BELOW
                 * it. Rotating about the wrong point threw the
                 * corners away from the shape.
                 */
                const center =
                    toScreen({
                        x:
                            x +
                            width / 2,
                        y:
                            y -
                            height / 2
                    });

                rect.setAttribute(
                    "transform",
                    `rotate(${-rotation} ${center.x} ${center.y})`
                );
            }

            applyStyle(
                rect,
                style
            );

            svg.appendChild(
                rect
            );
        }

        /*
         * RIGID BODY
         *
         * A rigid body is one body whose outline can be any of
         * the supported shapes, so it is drawn as whichever
         * shape it currently has. Each is drawn as a real
         * outline of that shape rather than as a stand-in: a
         * circle is a circle, a triangle is closed, and a
         * polygon keeps all of its sides. The shape is read
         * from the shared geometry module so the drawing, the
         * handles and the transforms always agree.
         */
        if (
            entity.type ===
                "rigid-body"
        ) {
            appendRigidBody(
                svg,
                entity,
                geometry,
                style,
                toScreen,
                scale
            );

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * POLYLINE
         */
        if (
            entity.type ===
            "polyline"
        ) {
            const points =
                (
                    geometry.points ||
                    []
                )
                    .filter(Boolean)
                    .map(toScreen)
                    .map(
                        point =>
                            `${point.x},${point.y}`
                    )
                    .join(" ");

            if (points) {
                const polyline =
                    createSvgElement(
                        "polyline",
                        {
                            points
                        }
                    );

                applyStyle(
                    polyline,
                    style
                );

                svg.appendChild(
                    polyline
                );
            }
        }

        /*
         * POLYGON
         *
         * One closed shape whose vertices are derived
         * from the stored centre, radius, rotation and
         * side count.
         */
        if (
            entity.type ===
            "polygon"
        ) {
            const points =
                enggDrawingState
                    .polygonVertices(
                        geometry
                    )
                    .map(toScreen)
                    .map(
                        point =>
                            `${point.x},${point.y}`
                    )
                    .join(" ");

            if (points) {
                const polygon =
                    createSvgElement(
                        "polygon",
                        {
                            points
                        }
                    );

                applyStyle(
                    polygon,
                    style
                );

                svg.appendChild(
                    polygon
                );
            }
        }

        /*
         * TRIANGLE
         *
         * One closed shape built from its three
         * stored points, so it renders and selects
         * as a single feature.
         */
        if (
            entity.type ===
            "triangle"
        ) {
            const points =
                (
                    geometry.points ||
                    []
                )
                    .filter(Boolean)
                    .map(toScreen)
                    .map(
                        point =>
                            `${point.x},${point.y}`
                    )
                    .join(" ");

            if (points) {
                const triangle =
                    createSvgElement(
                        "polygon",
                        {
                            points
                        }
                    );

                applyStyle(
                    triangle,
                    style
                );

                svg.appendChild(
                    triangle
                );
            }
        }

        /*
         * ARC
         */
        if (
            entity.type ===
            "arc"
        ) {
            if (
                !geometry.center
            ) {
                return;
            }

            const center =
                toScreen(
                    geometry.center
                );

            const radius =
                geometry.radius *
                scale;

            const startAngle =
                geometry.startAngle ??
                0;

            const endAngle =
                geometry.endAngle ??
                0;

            const path =
                createSvgElement(
                    "path"
                );
            path.classList.add("drawing-open-arc");

            path.setAttribute(
                "d",
                arcPathData(
                    center,
                    radius,
                    startAngle,
                    endAngle
                )
            );

            applyStyle(
                path,
                style
            );

            svg.appendChild(
                path
            );
        }

        /*
         * 2D COORDINATE SYSTEM
         *
         * One feature: a shared origin, a positive and a
         * negative extension on each axis, with arrowheads
         * only on the positive directions.
         */
        if (
            entity.type ===
            "coordinate-system-2d"
        ) {
            appendCoordinateSystem(
                svg,
                geometry,
                style,
                state,
                bounds,
                entity.isPreview
            );
        }

        if (svg.childNodes.length) {
            parentSvg.appendChild(svg);
        }
    }

    /*
     * A force arrow: a straight vector from its application
     * point with a filled arrow head. Length follows the
     * magnitude at a fixed screen scale, so a larger force
     * reads as visibly longer without depending on zoom.
     */
    /*
     * The distinct joints of a set of truss members.
     *
     * A joint is where members meet, so the same point reached
     * by two members is one joint and is drawn once.
     */
    function memberJoints(members) {
        const seen = [];

        members.forEach(member => {
            [member.start, member.end].forEach(point => {
                const known = seen.find(
                    existing =>
                        Math.hypot(
                            existing.x - point.x,
                            existing.y - point.y
                        ) < 1e-6
                );

                if (!known) {
                    seen.push({ x: point.x, y: point.y });
                }
            });
        });

        return seen;
    }

    /*
     * How a force's arrow is drawn.
     *
     * LENGTH. The drawn length IS the magnitude. The arrow runs
     * from its application point to the point the geometry says
     * the force reaches, which is the point the user placed with
     * the cursor, so moving the cursor farther genuinely lengthens
     * the vector. There is no maximum and no minimum: a force is
     * not a symbol with a fixed size, it is a vector, and a
     * viewer has to be able to trust that a longer arrow means a
     * larger force.
     *
     * The one thing that is NOT clamped is the user visible length
     * in world units. Whether the result is on screen at all is a
     * matter of the viewport, which is what zooming and Fit are
     * for, and the camera must not be allowed to rewrite the
     * geometry to make that easier.
     *
     * WIDTH AND HEAD. The shaft's stroke width and the head's size
     * both come from the feature's own appearance, so the Line
     * Width and Line Type chosen in the Features panel are what is
     * actually drawn. The head scales with the shaft rather than
     * sitting at a fixed size, because a head sized for a hairline
     * on a thick shaft swallows the shaft, and a head sized for a
     * thick shaft on a hairline is invisible.
     */
    function forceArrowMetrics(
        magnitude,
        style
    ) {
        const width =
            /*
             * The SAME on-screen weight a Line of this
             * configured width would get.
             *
             * It used to be `Number(style?.lineWidth)`, the raw
             * millimetre value, taken straight from the style and
             * used as if it were already pixels. It is not: the
             * drawing renders in pixels, and every other feature
             * converts through scaledStrokeWidth. So a force at the
             * sheet's 0.5 drew its shaft at half a pixel while a
             * Line at the same 0.5 drew at 1.2 - the force came out
             * THINNER than ordinary geometry, which is the opposite
             * of what a symbol is for, and the two could not be
             * compared because neither was wrong.
             *
             * Going through the shared scale is what makes "the
             * force shaft is as thick as the line" true on screen
             * rather than only in the settings.
             */
            scaledStrokeWidth(
                Number(style?.lineWidth) || 0.5
            );

        return {
            /*
             * The head is a multiple of the shaft width, so the
             * two always look like parts of the same line: a
             * heavier force gets a heavier head without the
             * relationship being a fixed pixel constant.
             */
            head: Math.max(
                3.5,
                Math.min(
                    14,
                    width * 4.5
                )
            ),

            width
        };
    }

    /*
     * ONE VECTOR OF AN ANALYSIS PICTURE.
     *
     * Used for a Force Components' three vectors and for a Resultant,
     * so the same arrow, the same head and the same line weight are
     * used everywhere an analysis draws a vector. They are readings of
     * the same kind of thing - a force, or a sum of forces - and two
     * slightly different arrows would suggest a difference in
     * meaning that does not exist.
     *
     * A construction line between the component ends is drawn the same
     * way but without a head, which is how a drafting sheet shows a
     * line that is there for reference rather than for force.
     */
    function appendAnalysisVector(
        svg,
        from,
        to,
        stroke,
        style,
        kind = "solid"
    ) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;

        const length = Math.hypot(dx, dy);

        if (length < 0.01) {
            return;
        }

        const construction = kind === "construction";

        svg.appendChild(
            createSvgElement("line", {
                x1: from.x,
                y1: from.y,
                x2: to.x,
                y2: to.y,
                stroke,
                "stroke-width":
                    scaledStrokeWidth(
                        Number(style.lineWidth) || 0.5
                    ),
                "stroke-linecap": "round",
                ...(construction
                    ? {
                        "stroke-dasharray": "4 3"
                    }
                    : {})
            })
        );

        if (construction) {
            return;
        }

        /*
         * The head is sized from the line weight like every other
         * arrowhead on the sheet, so a thicker analysis line gets a
         * thicker head rather than the same small triangle that reads
         * as a mistake.
         */
        appendArrowHead(
            svg,
            to,
            Math.atan2(dy, dx),
            stroke,
            arrowHeadSize(
                Number(style.lineWidth) || 0.5
            )
        );
    }

    /*
     * The Analysis tool icons' geometry lives in the same file as the
     * drawing, so an icon and the thing it draws cannot drift apart.
     */
    function appendForceArrow(
        svg,
        anchor,
        angleDegrees,
        magnitude,
        stroke,
        style
    ) {
        const metrics =
            forceArrowMetrics(
                magnitude,
                style
            );

        /*
         * The vector, drawn at its true length. The magnitude
         * arrives in world units and is used as the length, so the
         * arrow is a faithful picture of the stored force rather
         * than a symbol of it.
         */
        const length =
            Math.abs(
                Number(magnitude) || 0
            );

        const radians =
            angleDegrees * Math.PI / 180;

        const tip = {
            x: anchor.x + Math.cos(radians) * length,
            y: anchor.y - Math.sin(radians) * length
        };

        svg.appendChild(
            createSvgElement("line", {
                x1: anchor.x,
                y1: anchor.y,
                x2: tip.x,
                y2: tip.y,
                stroke,
                "stroke-width": metrics.width,
                "stroke-linecap": "round"
            })
        );

        appendArrowHead(
            svg,
            tip,
            radians,
            stroke,
            metrics.head
        );
    }

    /*
     * A filled arrow head pointing along the given angle.
     */
    function appendArrowHead(
        svg,
        tip,
        radians,
        stroke,
        head
    ) {
        svg.appendChild(
            createSvgElement("polygon", {
                points: [
                    `${tip.x},${tip.y}`,
                    `${tip.x - head * Math.cos(radians - 0.4)},${tip.y + head * Math.sin(radians - 0.4)}`,
                    `${tip.x - head * Math.cos(radians + 0.4)},${tip.y + head * Math.sin(radians + 0.4)}`
                ].join(" "),
                fill: stroke,
                stroke: "none"
            })
        );
    }

    /*
     * The two ends of one drawn force, as distinct geometry.
     *
     * A force is a LINE with a fixed pair of endpoints, and which
     * end carries the arrowhead is a SEPARATE fact about it. Keeping
     * the two apart is what makes reversing a direction impossible to
     * do by accident:
     *
     *   application - the point on the body where the force acts.
     *                 It is the physical meaning of the load and
     *                 must never move.
     *   far        - the other end of the drawn line. It is a fixed
     *                 piece of geometry, and it must not move either.
     *
     * The far end is placed from the body's own outward NORMAL, not
     * from the force direction. That is the whole point: reversing
     * the force direction cannot move the far end, because the
     * normal is not derived from the direction at all. A load
     * pointing down and the same load pointing up draw over exactly
     * the same length of line, in exactly the same place, and differ
     * only in which end the head sits on.
     */
    function forceEndpoints(
        application,
        direction,
        length,
        bodyNormal
    ) {
        /*
         * The outward normal, falling back to the force direction
         * only when the body has no usable one. The fallback keeps
         * a force on a degenerate body - a zero-length span, or one
         * drawn without a body at all - from collapsing to nothing.
         */
        const away =
            bodyNormal &&
            (Math.abs(bodyNormal.x) > 1e-9 ||
             Math.abs(bodyNormal.y) > 1e-9)
                ? bodyNormal
                : direction;

        /*
         * Screen Y grows downward, so the world normal is carried
         * through with its Y flipped exactly as the force direction
         * is.
         */
        const screenAway = {
            x: away.x,
            y: -away.y
        };

        return {
            application,
            far: {
                x:
                    application.x +
                    screenAway.x * length,
                y:
                    application.y +
                    screenAway.y * length
            }
        };
    }

    /*
     * Where the arrowhead goes on a force line.
     *
     * Reversal flips WHICH endpoint is the head. It does not change
     * the line, so this is a choice between two points that both
     * already exist.
     */
    function arrowheadTip(
        endpoints,
        direction,
        reversed
    ) {
        return reversed
            ? endpoints.application
            : endpoints.far;
    }

    /*
     * The direction the head POINTS, for its own geometry.
     *
     * The head sits on ONE endpoint and points along the line,
     * outward, AWAY from the other endpoint. That is what makes it
     * an arrowhead rather than a fin: the apex is the extreme point
     * of the triangle and the base sits back along the shaft, so the
     * head is attached to the line and its tip is on the endpoint.
     *
     * The head is built from this vector as
     * `tip - head * direction` for the two base corners, so the sign
     * matters: a vector pointing back INTO the line puts the base
     * beyond the endpoint and the tip at the far end of the base,
     * which draws the arrowhead outside the force and pointing the
     * wrong way. Both branches below therefore point outward, away
     * from whichever endpoint is NOT carrying the head:
     *
     *   normal    head on the far end,     points far - application
     *   reversed  head on the application, points application - far
     */
    function arrowheadDirection(
        endpoints,
        reversed
    ) {
        return reversed
            ? {
                  x:
                      endpoints.application.x -
                      endpoints.far.x,
                  y:
                      endpoints.application.y -
                      endpoints.far.y
              }
            : {
                  x:
                      endpoints.far.x -
                      endpoints.application.x,
                  y:
                      endpoints.far.y -
                      endpoints.application.y
              };
    }

    /*
     * The screen length of one arrow of a distributed load.
     *
     * A load's arrows are drawn at the MAGNITUDE itself, in world
     * units converted to screen space by the caller. That is what
     * makes a heavier load look heavier: pulling the cursor
     * further from the body stores a larger magnitude, and the
     * arrow grows with it. There is no ceiling, because a capped
     * arrow stops telling the truth: the drawing would go on
     * saying "this is the biggest force here" for magnitudes
     * that differ several times over, and the student would be
     * shown a load that is not the one they built.
     *
     * The one thing that IS scaled is the head, which follows the
     * shaft rather than sitting at a fixed size, so a long arrow
     * does not end in a head too small to read.
     */
    const DISTRIBUTED_LOAD_ARROW_MIN_PX = 2;

    function distributedLoadArrowLength(
        magnitude,
        scale
    ) {
        const world = Math.abs(
            Number(magnitude) || 0
        );

        if (world <= 0) {
            return 0;
        }

        return Math.max(
            DISTRIBUTED_LOAD_ARROW_MIN_PX,
            world * Math.max(scale, 1e-6)
        );
    }

    /*
     * A force line's weight as it is actually drawn on screen.
     *
     * The Features panel's Line Width is the weight of the feature
     * in world units, but a force's shaft is drawn at the screen
     * scale, so the width is converted the same way the arrow
     * length is. Reading it back as a raw number is what made a
     * thicker load look identical to a thin one: the stored value
     * differs, but the drawn stroke did not.
     */
    function forceStrokeWidth(
        style,
        scale
    ) {
        const width =
            Number(style?.lineWidth);

        if (!Number.isFinite(width) || width <= 0) {
            return 1.3;
        }

        return Math.max(
            0.8,
            width * Math.max(scale, 1e-6)
        );
    }

    /*
     * The head of a distributed load's arrow, scaled to its own
     * shaft so a short arrow and a long one both end in a head
     * that reads as part of the same line, and scaled to the shaft's
     * WEIGHT as well so a heavy force line ends in a heavy head.
     *
     * Sizing the head from the arrow's length alone is not enough:
     * two loads of equal magnitude drawn at different line widths
     * are the same length, and without the width term they would
     * finish in identical heads, so a heavier line would end in a
     * head too small to read as belonging to it.
     */
    function distributedLoadHeadSize(
        length,
        strokeWidth
    ) {
        const width = Math.max(0, Number(strokeWidth) || 0);

        /*
         * The head is a multiple of the SHAFT WIDTH, because the
         * shaft width is what the user actually sets with Line
         * Width, and that weight has to keep reading all the way
         * to the tip. A heavier force line has to end in a heavier
         * head, or the weight the user chose stops at the shaft.
         *
         * The arrow's length is a BOUND and nothing more. Letting
         * length raise the head is what produced the fixed-size
         * behaviour this replaces: a long arrow computed the same
         * oversized head whatever its shaft was doing, so width
         * stopped mattering the moment the arrow got long.
         *
         * The head may never exceed its own shaft, or it stops
         * reading as an arrow and becomes a separate mark.
         */
        return Math.max(
            3,
            Math.min(width * 5, length)
        );
    }

    /*
     * The filled head of a distributed load's arrow, as an SVG
     * points string.
     *
     * It is built from the screen-space direction the arrow was
     * drawn along, so the head is always square to its own shaft
     * no matter which way the load points.
     */
    function distributedLoadArrowHead(
        tip,
        screenDirection,
        length,
        strokeWidth
    ) {
        const radians =
            Math.atan2(
                screenDirection.y,
                screenDirection.x
            );

        const head =
            distributedLoadHeadSize(
                length,
                strokeWidth
            );

        return [
            `${tip.x},${tip.y}`,
            `${tip.x - head * Math.cos(radians - 0.4)},${tip.y - head * Math.sin(radians - 0.4)}`,
            `${tip.x - head * Math.cos(radians + 0.4)},${tip.y - head * Math.sin(radians + 0.4)}`
        ].join(" ");
    }

    /*
     * A couple: two equal, opposite, parallel forces
     * separated by the stored distance, which is what makes
     * a couple physically meaningful. The pair is the visual
     * output of the one Couple feature, not two forces.
     */
    /*
     * THE ROTATIONAL ARROW.
     *
     * One curved arrow, drawn for a Moment and for a Couple Moment,
     * because the two are the same symbol: a centre it turns about, a
     * radius, a sense of rotation, and a head ON the curve. Giving
     * each its own routine is how they came to disagree - the Moment
     * was a pair of half-arcs with a hand-placed head and a radius
     * typed into the middle of it, and the Couple was two straight
     * forces - and two symbols for one idea is worse than either.
     *
     * The geometry itself - the sweep, the gap, the tangent and the
     * head - is asked of enggDrawingRotationalArrow rather than being
     * worked out here, so the drawing, the hit test and the Features
     * panel are all reading the same arc instead of three roughly
     * similar ones.
     *
     * The radius is a PRESENTATION value and nothing else. It is
     * taken from `arcRadius` when the student has set one and falls
     * back to the shared default otherwise, and it is never derived
     * from the magnitude: on a drawing a moment shows which way
     * something turns, and a moment that grew with its value would
     * be claiming an engineering meaning the symbol does not have.
     */
    function appendRotationalArrow(
        svg,
        center,
        clockwise,
        style = {},
        arcRadius
    ) {
        const rotational =
            window.enggDrawingRotationalArrow;

        if (!rotational) {
            return;
        }

        const stroke =
            style.stroke || "#000000";

        const arc =
            rotational.arcFor(
                center,
                clockwise,
                arcRadius
            );

        /*
         * The curve is drawn at the feature's OWN line weight, through
         * the same conversion every other line on the sheet uses. It
         * used to be a literal 1.6, which meant a moment on a 0.5 mm
         * sheet was drawn three times heavier than the beam it was
         * applied to, and changing the thickness in the panel did
         * nothing to it at all.
         */
        svg.appendChild(
            createSvgElement("path", {
                d: rotational.arcPath(arc),
                fill: "none",
                stroke,
                "stroke-width":
                    scaledStrokeWidth(
                        Number(style.lineWidth) || 0.5
                    ),
                "stroke-linecap": "round"
            })
        );

        /*
         * The head, sized from that same line weight so the two stay
         * in proportion, and placed at the arc's end along its
         * TANGENT - so it lies along the curve instead of pointing
         * inward at the centre, which is the difference between a
         * moment and a force arrow.
         */
        const lineWidth =
            Number(style.lineWidth) || 0.5;

        const head =
            rotational.headPoints(
                arc,
                arrowHeadSize(lineWidth) * 0.8
            );

        svg.appendChild(
            createSvgElement("polygon", {
                points: head
                    .map(
                        (point) =>
                            `${point.x},${point.y}`
                    )
                    .join(" "),
                fill: stroke,
                stroke: "none"
            })
        );
    }

    /*
     * THE SENSE OF ROTATION, AS THE ONE BOOLEAN THE GEOMETRY USES.
     *
     * A feature states its direction as the word "CCW" or "CW",
     * because that is what a student reads and what a saved file
     * should say. The geometry works in a boolean, and the conversion
     * belongs in one function so no two call sites can disagree about
     * which way round a moment turns.
     *
     * A file saved before directions were words stored a `clockwise`
     * flag, and it is still read here. Without that, every moment in
     * an older drawing would silently become anticlockwise the moment
     * it was opened: a direction change nobody asked for and nobody
     * can see.
     */
    function momentIsClockwise(
        geometry
    ) {
        if (
            geometry?.direction != null
        ) {
            return String(geometry.direction) === "CW";
        }

        return geometry?.clockwise === true;
    }

    /*
     * Standard engineering support symbols.
     *
     * Pin is a triangle on a hatched ground line, roller adds the
     * rollers, fixed is a hatched wall, and smooth shows a rounded
     * contact with its normal reaction.
     *
     * DRAWN IN THE BODY'S OWN FRAME, WHICH IS WHY THE ORIENTATION
     * MATTERS.
     *
     * Every offset below is measured along one axis - `out` away from
     * the body, `across` along it - and the two are turned into screen
     * coordinates by `at`. Nothing is written as a fixed screen x or y.
     *
     * That is the difference between a support that belongs to its
     * beam and one that merely sits near it. Written as screen
     * coordinates, every one of these symbols hangs straight down
     * regardless of the member it supports, so a beam drawn at an
     * angle carries four supports pointing off at four different wrong
     * angles - and a support placed on the far side of the body
     * renders in the same place as one on the near side, because the
     * drawing has no way to know which side it is on.
     *
     * The convention is kept exactly as it was: a symbol is drawn with
     * its apex against the body and its ground further out, so "out"
     * is the direction the ground faces.
     */
    function appendSupportSymbol(
        svg,
        anchor,
        type,
        orientation,
        stroke
    ) {
        const size = 9;
        const ground = 26;

        /*
         * The symbol's own axes, from the angle the caller derived
         * from the body.
         *
         * Screen y grows downward, which is why the perpendicular is
         * negated: an angle of -90 degrees means "straight up the
         * screen", and without the negation every symbol would be
         * drawn upside down and the two would be the same way up.
         */
        const out = {
            x: Math.cos(orientation),
            y: Math.sin(orientation)
        };

        const across = {
            x: -out.y,
            y: out.x
        };

        /*
         * A point `outward` units away from the anchor, `sideways`
         * units along the body.
         *
         * A signed pair rather than a distance and a side, so a
         * negative simply goes the other way - which is exactly what
         * Flip needs and is why a flipped support is the same drawing
         * turned round rather than a second drawing.
         */
        const at = (outward, sideways = 0) => ({
            x: anchor.x + out.x * outward + across.x * sideways,
            y: anchor.y + out.y * outward + across.y * sideways
        });

        const line = (from, to, width, opacity) => {
            const element =
                createSvgElement("line", {
                    x1: from.x,
                    y1: from.y,
                    x2: to.x,
                    y2: to.y,
                    stroke,
                    "stroke-width": width,
                    ...(opacity
                        ? { "stroke-opacity": opacity }
                        : {})
                });

            element.setAttribute(
                "pointer-events",
                "none"
            );

            svg.appendChild(element);

            return element;
        };

        if (type === "fixed-support") {
            /*
             * A hatched wall running ACROSS the body, with the
             * hatching on the far side of it.
             */
            const wall = 16;

            line(
                at(0, -wall),
                at(0, wall),
                2
            );

            for (
                let offset = -wall;
                offset <= wall;
                offset += 5
            ) {
                line(
                    at(0, offset),
                    at(7, offset + 5),
                    1
                );
            }

            return;
        }

        if (type === "smooth-support") {
            /*
             * A rounded contact with its normal reaction, which
             * is what distinguishes a smooth support.
             */
            const centre = at(4);

            const contact =
                createSvgElement("circle", {
                    cx: centre.x,
                    cy: centre.y,
                    r: 4,
                    fill: "none",
                    stroke,
                    "stroke-width": 1.4
                });

            contact.setAttribute(
                "pointer-events",
                "none"
            );

            svg.appendChild(contact);

            line(at(0), at(16), 1.4);
            line(at(-2, -ground / 2), at(-2, ground / 2), 1.4);

            return;
        }

        /*
         * Pin and roller share the triangle body; the roller
         * adds the rollers beneath it.
         */
        const rollers = type === "roller-support";

        const apex = at(-size);
        const base = at(size);

        const triangle =
            createSvgElement("polygon", {
                points: [
                    `${apex.x},${apex.y}`,
                    `${base.x + size},${base.y}`,
                    `${base.x - size},${base.y}`
                ].join(" "),
                fill: "none",
                stroke,
                "stroke-width": 1.6
            });

        triangle.setAttribute(
            "pointer-events",
            "none"
        );

        svg.appendChild(triangle);

        if (rollers) {
            [-5, 5].forEach(offset => {
                const centre = at(size + 3, offset);

                const roller =
                    createSvgElement("circle", {
                        cx: centre.x,
                        cy: centre.y,
                        r: 3,
                        fill: "none",
                        stroke,
                        "stroke-width": 1.2
                    });

                roller.setAttribute(
                    "pointer-events",
                    "none"
                );

                svg.appendChild(roller);
            });

            line(
                at(size + 7, -ground / 2),
                at(size + 7, ground / 2),
                1.4
            );
        } else {
            line(
                at(size, -ground / 2),
                at(size, ground / 2),
                1.4
            );
        }
    }

    /*
     * Connection symbols: pin shows a joint circle, fixed
     * shows a rigid block, slider shows a guided slider.
     */
    function appendConnectionSymbol(
        svg,
        anchor,
        type,
        stroke
    ) {
        if (type === "fixed-connection") {
            svg.appendChild(
                createSvgElement("rect", {
                    x: anchor.x - 8,
                    y: anchor.y - 8,
                    width: 16,
                    height: 16,
                    fill: "none",
                    stroke,
                    "stroke-width": 1.8
                })
            );

            return;
        }

        if (type === "slider-connection") {
            svg.appendChild(
                createSvgElement("line", {
                    x1: anchor.x - 14,
                    y1: anchor.y - 7,
                    x2: anchor.x + 14,
                    y2: anchor.y - 7,
                    stroke,
                    "stroke-width": 1.4
                })
            );

            svg.appendChild(
                createSvgElement("rect", {
                    x: anchor.x - 7,
                    y: anchor.y - 5,
                    width: 14,
                    height: 10,
                    fill: "none",
                    stroke,
                    "stroke-width": 1.6
                })
            );

            return;
        }

        svg.appendChild(
            createSvgElement("circle", {
                cx: anchor.x,
                cy: anchor.y,
                r: 4,
                fill: "none",
                stroke,
                "stroke-width": 1.6
            })
        );
    }

    function appendCoordinateSystem(
        svg,
        geometry,
        style,
        state,
        bounds,
        isPreview = false
    ) {
        const scale =
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
            state.camera.zoom;

        const origin =
            enggDrawingState
                .engineeringToScreen(
                    geometry.origin ||
                        {
                            x: 0,
                            y: 0
                        },
                    bounds,
                    state
                );

        /*
         * Four independent extensions one feature.
         *
         * xPositiveLength / xNegativeLength /
         * yPositiveLength / yNegativeLength are stored
         * separately, so extending one side never resizes
         * the others. Older files that only carry
         * axisLength still work through the fallback.
         */
        const legacyLength =
            Number(geometry.axisLength);

        const fallbackLength =
            Number.isFinite(legacyLength) && legacyLength > 0
                ? legacyLength
                : 25;

        const readLength = value =>
            Math.max(
                1,
                Number.isFinite(Number(value)) && Number(value) > 0
                    ? Number(value)
                    : fallbackLength
            ) * scale;

        const xAxisLength =
            readLength(geometry.xPositiveLength);

        const xNegativeLength =
            readLength(geometry.xNegativeLength);

        const yAxisLength =
            readLength(geometry.yPositiveLength);

        const yNegativeLength =
            readLength(geometry.yNegativeLength);

        const axisColor =
            style.stroke ||
            "#000000";

        /*
         * Axis stroke width is a SCREEN-space value.
         *
         * The previous implementation multiplied the line
         * width by the engineering scale. At normal zoom
         * this made the axes dramatically thicker than the
         * rest of the drawing.
         */
        const axisWidth =
            Math.max(
                1,
                Math.min(
                    1.5,
                    (
                        Number(
                            style.lineWidth
                        ) || 0.5
                    ) * 1.4
                )
            );

        const opacity =
            isPreview
                ? "0.45"
                : null;

        /*
         * Positive X axis
         */
        const xAxis =
            createSvgElement(
                "line",
                {
                    x1: origin.x,
                    y1: origin.y,
                    x2:
                        origin.x +
                        xAxisLength,
                    y2: origin.y,
                    stroke:
                        axisColor,
                    "stroke-width":
                        axisWidth,
                    "stroke-linecap":
                        "butt"
                }
            );

        const xAxisNegative = createSvgElement("line", {
            x1: origin.x - xNegativeLength,
            y1: origin.y,
            x2: origin.x,
            y2: origin.y,
            stroke: axisColor,
            "stroke-width": axisWidth,
            "stroke-linecap": "butt"
        });

        /*
         * Positive Y axis
         */
        const yAxis =
            createSvgElement(
                "line",
                {
                    x1: origin.x,
                    y1: origin.y,
                    x2: origin.x,
                    y2:
                        origin.y -
                        yAxisLength,
                    stroke:
                        axisColor,
                    "stroke-width":
                        axisWidth,
                    "stroke-linecap":
                        "butt"
                }
            );

        const yAxisNegative = createSvgElement("line", {
            x1: origin.x,
            y1: origin.y,
            x2: origin.x,
            y2: origin.y + yNegativeLength,
            stroke: axisColor,
            "stroke-width": axisWidth,
            "stroke-linecap": "butt"
        });

        /*
         * X arrowhead
         */
        const xArrow =
            createSvgElement(
                "path",
                {
                    d:
                        `M ${origin.x + xAxisLength} ${origin.y}
                         L ${origin.x + xAxisLength - 7} ${origin.y - 3}
                         L ${origin.x + xAxisLength - 7} ${origin.y + 3}
                         Z`,
                    fill:
                        axisColor
                }
            );

        /*
         * Y arrowhead
         */
        const yArrow =
            createSvgElement(
                "path",
                {
                    d:
                        `M ${origin.x} ${origin.y - yAxisLength}
                         L ${origin.x - 3} ${origin.y - yAxisLength + 7}
                         L ${origin.x + 3} ${origin.y - yAxisLength + 7}
                         Z`,
                    fill:
                        axisColor
                }
            );

        const originMarker =
            createSvgElement(
                "circle",
                {
                    cx: origin.x,
                    cy: origin.y,
                    r: 3,
                    fill:
                        "#ffffff",
                    stroke:
                        axisColor,
                    "stroke-width":
                        1
                }
            );

        /*
         * X label
         *
         * There is intentionally only one coordinate-system
         * renderer now. drawing.js no longer overlays another
         * copy of these labels.
         */
        const xLabel =
            createSvgElement(
                "text",
                {
                    x:
                        origin.x +
                        xAxisLength +
                        7,
                    y:
                        origin.y + 4,
                    fill:
                        axisColor,
                    "font-size":
                        11,
                    "font-family":
                        "Arial, sans-serif",
                    "font-weight":
                        600
                }
            );

        xLabel.textContent =
            "X";

        /*
         * Y label
         */
        const yLabel =
            createSvgElement(
                "text",
                {
                    x:
                        origin.x + 5,
                    y:
                        origin.y -
                        yAxisLength -
                        7,
                    fill:
                        axisColor,
                    "font-size":
                        11,
                    "font-family":
                        "Arial, sans-serif",
                    "font-weight":
                        600
                }
            );

        yLabel.textContent =
            "Y";

        const elements = [
            xAxis,
            xAxisNegative,
            yAxis,
            yAxisNegative,
            xArrow,
            yArrow,
            originMarker,
            xLabel,
            yLabel
        ];

        if (opacity) {
            elements.forEach(
                element =>
                    element.setAttribute(
                        "opacity",
                        opacity
                    )
            );
        }

        svg.append(
            ...elements
        );
    }

    /*
     * ========================================================
     * SNAP MARKERS
     * ========================================================
     *
     * Different snap types deliberately have different
     * geometric symbols so the user can immediately tell
     * what has been detected.
     */

    function renderSnapMarker(
        svg,
        candidate,
        screenPoint
    ) {
        const x =
            screenPoint.x;

        const y =
            screenPoint.y;

        const size = 6;

        const stroke =
            "#00a9c7";

        const fill =
            "#ffffff";

        /*
         * ENDPOINT
         *
         * Square
         */
        if (
            candidate.type ===
            "endpoint"
        ) {
            const square =
                createSvgElement(
                    "rect",
                    {
                        x:
                            x -
                            size / 2,
                        y:
                            y -
                            size / 2,
                        width:
                            size,
                        height:
                            size,
                        fill,
                        stroke,
                        "stroke-width":
                            1.5
                    }
                );

            svg.appendChild(
                square
            );

            return;
        }

        /*
         * MIDPOINT
         *
         * Triangle
         */
        if (
            candidate.type ===
            "midpoint"
        ) {
            const triangle =
                createSvgElement(
                    "path",
                    {
                        d:
                            `M ${x} ${y - size / 2}
                             L ${x + size / 2} ${y + size / 2}
                             L ${x - size / 2} ${y + size / 2}
                             Z`,
                        fill,
                        stroke,
                        "stroke-width":
                            1.5
                    }
                );

            svg.appendChild(
                triangle
            );

            return;
        }

        /*
         * CENTER
         *
         * Circle with crosshair.
         */
        if (
            candidate.type ===
            "center"
        ) {
            const circle =
                createSvgElement(
                    "circle",
                    {
                        cx: x,
                        cy: y,
                        r: 4,
                        fill,
                        stroke,
                        "stroke-width":
                            1.4
                    }
                );

            const horizontal =
                createSvgElement(
                    "line",
                    {
                        x1:
                            x - 6,
                        y1: y,
                        x2:
                            x + 6,
                        y2: y,
                        stroke,
                        "stroke-width":
                            1.2
                    }
                );

            const vertical =
                createSvgElement(
                    "line",
                    {
                        x1: x,
                        y1:
                            y - 6,
                        x2: x,
                        y2:
                            y + 6,
                        stroke,
                        "stroke-width":
                            1.2
                    }
                );

            svg.append(
                circle,
                horizontal,
                vertical
            );

            return;
        }

        /*
         * INTERSECTION
         *
         * X
         */
        if (
            candidate.type ===
            "intersection"
        ) {
            const intersection =
                createSvgElement(
                    "path",
                    {
                        d:
                            `M ${x - 5} ${y - 5}
                             L ${x + 5} ${y + 5}
                             M ${x + 5} ${y - 5}
                             L ${x - 5} ${y + 5}`,
                        fill: "none",
                        stroke,
                        "stroke-width":
                            1.7
                    }
                );

            svg.appendChild(
                intersection
            );

            return;
        }

        /*
         * QUADRANT
         *
         * Diamond
         */
        if (
            candidate.type ===
            "quadrant"
        ) {
            const diamond =
                createSvgElement(
                    "path",
                    {
                        d:
                            `M ${x} ${y - 5}
                             L ${x + 5} ${y}
                             L ${x} ${y + 5}
                             L ${x - 5} ${y}
                             Z`,
                        fill,
                        stroke,
                        "stroke-width":
                            1.5
                    }
                );

            svg.appendChild(
                diamond
            );

            return;
        }

        /*
         * POINT ON ENTITY
         *
         * Small circle.
         */
        if (
            candidate.type ===
            "pointOnEntity"
        ) {
            const pointMarker =
                createSvgElement(
                    "circle",
                    {
                        cx: x,
                        cy: y,
                        r: 3,
                        fill,
                        stroke,
                        "stroke-width":
                            1.5
                    }
                );

            svg.appendChild(
                pointMarker
            );

            return;
        }

        /*
         * Fallback
         */
        const fallback =
            createSvgElement(
                "circle",
                {
                    cx: x,
                    cy: y,
                    r: 4,
                    fill,
                    stroke,
                    "stroke-width":
                        1.5
                }
            );

        svg.appendChild(
            fallback
        );
    }

    function renderInferenceLine(
        svg,
        state,
        bounds
    ) {
        /*
         * The HELD guide, not the raw inference.
         *
         * The guide is kept up for a short period after the
         * cursor leaves its region, so that a student lining a
         * member up sees the guide settle rather than flicker
         * off and on with every small movement. Reading the
         * stored guideline rather than the current inference is
         * what makes that hold actually visible; reading the
         * live inference would draw the guide exactly as often
         * as before and the hold would be invisible.
         */
        const inference =
            state.interaction?.guideline
                ?.inference ||
            state.interaction?.inference;

        if (
            !inference?.referencePoint ||
            !inference?.point
        ) {
            return;
        }

        const pointScreen =
            enggDrawingState.engineeringToScreen(
                inference.point,
                bounds,
                state
            );

        /*
         * A combined inference aligns with one point
         * horizontally and another vertically, so draw
         * a guide line for each axis.
         */
        const references =
            inference.horizontalReferencePoint ||
            inference.verticalReferencePoint
                ? [
                    inference.horizontalReferencePoint,
                    inference.verticalReferencePoint
                ].filter(Boolean)
                : [
                    inference.referencePoint
                ];

        references.forEach(
            reference => {
                const referenceScreen =
                    enggDrawingState
                        .engineeringToScreen(
                            reference,
                            bounds,
                            state
                        );

                const line =
                    createSvgElement(
                        "line",
                        {
                            x1: referenceScreen.x,
                            y1: referenceScreen.y,
                            x2: pointScreen.x,
                            y2: pointScreen.y,
                            stroke: "#4b8198",
                            "stroke-width": 1,
                            "stroke-dasharray": "3 3",
                            opacity: 0.9
                        }
                    );

                svg.appendChild(line);
            }
        );
    }

    function renderSnapIndicator(
        svg,
        state,
        bounds
    ) {
        const candidate =
            state.interaction
                .snapCandidate;

        if (!candidate) {
            return;
        }

        const screenPoint =
            enggDrawingState
                .engineeringToScreen(
                    candidate.point,
                    bounds,
                    state
                );

        /*
         * THE MARKER, AND NOTHING ELSE.
         *
         * There used to be a text label drawn beside the marker, saying
         * what kind of snap it was - and falling back to the bare word
         * "Snap" for any candidate it had no name for. That put the
         * word "snap" on the drawing itself, next to the student's work,
         * where it is neither drafting nor annotation: it is status
         * output drawn into the document, and it is captured by every
         * export, print and Drawing Reference.
         *
         * The marker already says what happened, graphically and
         * unambiguously, and the bottom status line says it in words -
         * "Horizontal", "Centreline", "Endpoint" - which is where a
         * transient message belongs and where it does not travel with
         * the drawing. So the label is not moved to the status line,
         * because it is already there; it is simply removed from the
         * sheet.
         */
        renderSnapMarker(
            svg,
            candidate,
            screenPoint
        );
    }

    /*
     * ========================================================
     * SELECTION BOX
     * ========================================================
     */

    function renderSelectionBox(
        svg,
        state,
        bounds
    ) {
        const box =
            state.interaction
                .selectionBox;

        if (!box) {
            return;
        }

        if (
            Number.isFinite(
                box.minX
            ) &&
            Number.isFinite(
                box.maxX
            ) &&
            Number.isFinite(
                box.minY
            ) &&
            Number.isFinite(
                box.maxY
            )
        ) {
            const topLeft =
                enggDrawingState
                    .engineeringToScreen(
                        {
                            x: box.minX,
                            y: box.maxY
                        },
                        bounds,
                        state
                    );

            const bottomRight =
                enggDrawingState
                    .engineeringToScreen(
                        {
                            x: box.maxX,
                            y: box.minY
                        },
                        bounds,
                        state
                    );

            const rect =
                createSvgElement(
                    "rect",
                    {
                        x:
                            Math.min(
                                topLeft.x,
                                bottomRight.x
                            ),
                        y:
                            Math.min(
                                topLeft.y,
                                bottomRight.y
                            ),
                        width:
                            Math.abs(
                                bottomRight.x -
                                    topLeft.x
                            ),
                        height:
                            Math.abs(
                                bottomRight.y -
                                    topLeft.y
                            ),
                        class:
                            "drawing-selection-box"
                    }
                );

            svg.appendChild(
                rect
            );

            return;
        }

        if (
            Number.isFinite(
                box.x
            ) &&
            Number.isFinite(
                box.y
            ) &&
            Number.isFinite(
                box.width
            ) &&
            Number.isFinite(
                box.height
            )
        ) {
            const rect =
                createSvgElement(
                    "rect",
                    {
                        x: box.x,
                        y: box.y,
                        width:
                            box.width,
                        height:
                            box.height,
                        class:
                            "drawing-selection-box"
                    }
                );

            svg.appendChild(
                rect
            );
        }
    }

    function renderEngineeringGrid(svg, state, bounds) {
        const spacing = Number(state.grid?.spacing);
        if (!state.grid?.visible || !Number.isFinite(spacing) || spacing <= 0) return;
        const scale = enggDrawingState.BASE_PIXELS_PER_UNIT * state.camera.zoom;
        if (!Number.isFinite(scale) || scale <= 0) return;
        const minX = state.camera.panX - bounds.width / (2 * scale);
        const maxX = state.camera.panX + bounds.width / (2 * scale);
        const minY = state.camera.panY - bounds.height / (2 * scale);
        const maxY = state.camera.panY + bounds.height / (2 * scale);
        const segments = [];
        for (let x = Math.ceil(minX / spacing) * spacing, count = 0; x <= maxX && count < 1500; x += spacing, count += 1) {
            const screen = enggDrawingState.engineeringToScreen({ x, y: 0 }, bounds, state);
            segments.push(`M ${screen.x} 0 V ${bounds.height}`);
        }
        for (let y = Math.ceil(minY / spacing) * spacing, count = 0; y <= maxY && count < 1500; y += spacing, count += 1) {
            const screen = enggDrawingState.engineeringToScreen({ x: 0, y }, bounds, state);
            segments.push(`M 0 ${screen.y} H ${bounds.width}`);
        }
        if (!segments.length) return;

        /*
         * The grid's appearance is stated as presentation attributes
         * as well as through its class.
         *
         * The class is what makes it look right in the editor, where
         * the stylesheet is always present. But an SVG export, a
         * printed page and a Drawing Reference are all rendered
         * WITHOUT that stylesheet - they have to stand on their own -
         * and a grid drawn only by class name would simply not appear
         * in any of them. That would be the grid silently vanishing
         * from exactly the outputs where the user expects to see the
         * sheet as they see it.
         *
         * So the pale grey and the hairline width are stated here,
         * where the grid is drawn, and the class remains for the
         * editor. The values are the ones the stylesheet uses, and
         * they must stay subordinate to the geometry: the grid is a
         * guide behind the drawing, never a line the eye follows
         * instead of the beam.
         */
        svg.appendChild(createSvgElement("path", {
            d: segments.join(" "),
            class: "drawing-engineering-grid",
            fill: "none",
            stroke: "#e7ecef",
            "stroke-width": 0.65
        }));
    }

    /*
     * The rigid body handles, resolved the same way the drag
     * layer resolves them.
     *
     * The drag layer owns the list so there is one answer to
     * what a rigid body's handles are; the renderer only needs
     * to know where to draw them.
     */
    function rigidBodyHandlesForRender(object) {
        if (typeof rigidBodyHandles === "function") {
            return rigidBodyHandles(object);
        }

        return enggFeatureGeometry
            .rectangleCorners(object.geometry || {})
            .map((point) => ({ point }));
    }

    function renderSelectionHandles(svg, state, bounds) {
        const selected = new Set(state.selection?.selectedObjectIds || []);
        if (!selected.size) return;
        const toScreen = point => enggDrawingState.engineeringToScreen(point, bounds, state);
        const scale =
            enggDrawingState.BASE_PIXELS_PER_UNIT *
            state.camera.zoom;
        const add = (point, kind = "") => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const screen = toScreen(point);
            svg.appendChild(createSvgElement("circle", {
                cx: screen.x,
                cy: screen.y,
                r: 3.8,
                class: `drawing-manipulation-handle${kind ? ` ${kind}` : ""}`
            }));
        };
        const selectedGraphIds = new Set(
            state.objects
                .filter(object => selected.has(object.id))
                .map(object => object.engineering?.graphPlotId)
                .filter(Boolean)
        );

        selectedGraphIds.forEach(graphPlotId => {
            const graphObjects = state.objects.filter(
                object => object.engineering?.graphPlotId === graphPlotId
            );
            const graphBounds = window.enggGraphPlotter?.boundsOfObjects(graphObjects);

            if (!graphBounds) {
                return;
            }

            const topLeft = toScreen({ x: graphBounds.left, y: graphBounds.top });
            const bottomRight = toScreen({ x: graphBounds.right, y: graphBounds.bottom });
            svg.appendChild(createSvgElement("rect", {
                x: topLeft.x,
                y: topLeft.y,
                width: bottomRight.x - topLeft.x,
                height: bottomRight.y - topLeft.y,
                fill: "none",
                stroke: "#1f5c38",
                "stroke-width": 1,
                "stroke-dasharray": "4 3",
                "pointer-events": "none"
            }));

            [
                { x: graphBounds.left, y: graphBounds.bottom },
                { x: graphBounds.right, y: graphBounds.bottom },
                { x: graphBounds.right, y: graphBounds.top },
                { x: graphBounds.left, y: graphBounds.top }
            ].forEach((point, index) => add(point, `graph-corner-${index}`));
        });

        state.objects.forEach(object => {
            if (!selected.has(object.id)) return;
            if (object.engineering?.graphPlotId) return;
            const geometry = object.geometry || {};
            if (object.type === "point") {
                add(geometry.position || geometry.point || geometry);
            } else if (object.type === "line") {
                add(geometry.start);
                add(geometry.end);
            } else if (object.type === "circle") {
                add(geometry.center);
                add({ x: geometry.center.x + geometry.radius, y: geometry.center.y });
            } else if (object.type === "arc") {
                add(geometry.center);
                add({ x: geometry.center.x + geometry.radius * Math.cos(geometry.startAngle), y: geometry.center.y + geometry.radius * Math.sin(geometry.startAngle) });
                add({ x: geometry.center.x + geometry.radius * Math.cos(geometry.endAngle), y: geometry.center.y + geometry.radius * Math.sin(geometry.endAngle) });
            } else if (object.type === "rectangle") {
                enggFeatureGeometry
                    .rectangleCorners(geometry)
                    .forEach((point) => add(point));
            } else if (object.type === "rigid-body") {
                /*
                 * A rigid body's handles follow its current shape,
                 * resolved through the same helper the drag layer
                 * uses, so a drawn handle and a grabbable handle can
                 * never be in different places.
                 */
                rigidBodyHandlesForRender(object).forEach(
                    (handle) => add(handle.point)
                );
            } else if (object.type === "polygon") {
                enggDrawingState.polygonVertices(geometry).forEach((point) => add(point));
            } else if (object.type === "particle") {
                /*
                 * A particle has one position handle.
                 */
                add(geometry.position);
            } else if (object.type === "load" || object.type === "varying-load") {
                add(geometry.start);
                add(geometry.end);
                add({
                    x: geometry.start.x,
                    y: geometry.start.y + 26 / Math.max(scale, 1e-6)
                });
            } else if (geometry.start && geometry.end) {
                add(geometry.start);
                add(geometry.end);
            } else if (geometry.position) {
                add(geometry.position);
            } else if (object.type === "polyline") {
                const points = geometry.points || [];
                const lastPoint = points[points.length - 1];
                const closed = points.length > 2 && Math.hypot(points[0].x - lastPoint.x, points[0].y - lastPoint.y) < 1e-8;
                points.slice(0, closed ? -1 : undefined).forEach(point => add(point));
            } else if (object.type === "coordinate-system-2d") {
                /*
                 * One handle per axis end, so each of the four
                 * extensions can be dragged on its own while the
                 * feature stays a single object.
                 */
                coordinateSystemArms(
                    geometry
                ).forEach(
                    arm =>
                        add(arm.end, arm.kind)
                );

                add(geometry.origin, "origin");
            }
        });
    }

    /*
     * ========================================================
     * LIVE PREVIEW HELPERS
     * ========================================================
     */

    function previewStyle(preview) {
        return {
            stroke:
                preview?.style?.stroke || "#1f5c38",
            fill:
                "none",
            lineWidth:
                0.7,
            opacity:
                preview?.style?.opacity ?? 0.72,
            lineType:
                preview?.style?.lineType || "solid"
        };
    }

    function renderPreview(
        svg,
        state,
        bounds
    ) {
        /*
         * THE ANALYSIS AXIS BEING POSITIONED.
         *
         * Drawn through exactly the same routine that draws a committed
         * diagram, for the same reason the dimension preview is: a
         * preview that looked even slightly different from the real
         * thing would leave the student placing something other than
         * what they were shown.
         *
         * What marks it as a preview is the language, not a different
         * drawing - dashed and translucent, as every other preview in
         * this file is. The shape on screen is the shape the click will
         * produce.
         */
        const axisPlacement =
            state.interaction.analysisPlacement;

        if (axisPlacement) {
            const toScreen =
                point =>
                    enggDrawingState
                        .engineeringToScreen(
                            point,
                            bounds,
                            state
                        );

            const group =
                createSvgElement("g");

            group.classList.add(
                "drawing-analysis-axis-preview"
            );

            group.setAttribute(
                "opacity",
                "0.72"
            );

            /*
             * Drawn as a real analysis object so it is the same
             * routine, with the preview's own styling.
             */
            appendEntity(
                group,
                {
                    id: "analysis-axis-preview",
                    type: "analysis-diagram",
                    geometry: {
                        start: axisPlacement.start,
                        end: axisPlacement.end,
                        diagramType: axisPlacement.diagramType,
                        heading: axisPlacement.heading,
                        drawingHeight: 90,
                        backgroundVisible: true,
                        referencePositions: []
                    },
                    style: {
                        stroke: "#1f5c38",
                        lineWidth: 0.7
                    }
                },
                state,
                bounds
            );

            svg.appendChild(group);
        }

        /*
         * THE DIMENSION PREVIEW
         *
         * Drawn BEFORE the ordinary preview check below, because a
         * dimension being placed is not a `preview` object: it has no
         * geometry of its own yet - it refers to geometry that already
         * exists, and only its POSITION is still undecided.
         *
         * So the preview is built here as a throwaway dimension at the
         * cursor, and drawn through exactly the same routine that
         * draws a committed one. That is deliberate: a preview that
         * looked even slightly different from the real thing would
         * leave the student placing something other than what they
         * were shown, and the value they confirm is the value they
         * saw only because both come from the same measurement.
         */
        const armed =
            state.interaction
                .dimensionRefs;

        if (armed && armed.length) {
            const toScreen =
                point =>
                    enggDrawingState
                        .engineeringToScreen(
                            point,
                            bounds,
                            state
                        );

            const previewDimension = {
                id: "dimension-preview",
                type: "dimension",
                dimensionType:
                    state.interaction
                        .dimensionChoice,
                sourceRefs: armed,
                placement:
                    state.interaction
                        .dimensionPlacement,
                style: {
                    stroke: "#1f5c38",
                    lineWidth: 0.7
                }
            };

            const previewGroup =
                createSvgElement("g");

            previewGroup.classList.add(
                "drawing-dimension-preview"
            );

            /*
             * Dashed and translucent, the convention every other
             * preview in this file uses for "not placed yet".
             */
            previewGroup.setAttribute(
                "opacity",
                "0.72"
            );

            appendDimensionEntity(
                previewGroup,
                previewDimension,
                state,
                toScreen,
                previewDimension.style
            );

            svg.appendChild(previewGroup);
        }

/*
 * The annotation preview, appended to the Dimension preview branch in
 * renderPreview.
 */
        /*
         * THE ANNOTATION PREVIEW
         *
         * Drawn in the same place as the dimension preview and by the
         * same routine that draws a committed annotation, so what the
         * student is shown is exactly what will appear.
         *
         * A generated label previews the TEXT ITS FEATURE WOULD SHOW,
         * read from the source by the annotation model - not a
         * placeholder like "250 N". That matters when the point of the
         * label is the value: a student deciding where to put it should
         * be able to read it before committing.
         *
         * A note previews the words "Double-click to write", because
         * there is nothing to show until they have written something.
         */
        const armedAnnotation =
            state.interaction.annotationKind;

        if (armedAnnotation) {
            const toScreenAnnotation =
                (point) =>
                    enggDrawingState.engineeringToScreen(
                        point,
                        bounds,
                        state
                    );

            const placement =
                state.interaction
                    .annotationPlacement;

            if (placement) {
                const sourceFeatureId =
                    state.interaction
                        .annotationTarget;

                const sourceObject =
                    sourceFeatureId
                        ? state.objects.find(
                            (object) =>
                                object.id === sourceFeatureId
                        )
                        : null;

                const probe = {
                    id: "annotation-preview",
                    type: "annotation",
                    annotationKind: armedAnnotation,
                    textMode: "auto",
                    text: "",
                    sourceFeatureId,
                    placement
                };

                const shown =
                    sourceObject &&
                    window.enggAnnotationModel.textFor(
                        probe,
                        state
                    );

                const previewGroup =
                    createSvgElement("g");

                previewGroup.classList.add(
                    "drawing-annotation-preview"
                );
                previewGroup.setAttribute(
                    "opacity",
                    "0.72"
                );

                appendAnnotationEntity(
                    previewGroup,
                    {
                        ...probe,
                        text: shown || "Double-click to write"
                    },
                    state,
                    toScreenAnnotation,
                    { stroke: "#1f5c38", fontSize: 12 }
                );

                svg.appendChild(previewGroup);
            }
        }

        const preview =
            state.interaction
                .preview;

        if (
            !preview ||
            !preview.geometry
        ) {
            return;
        }

        const geometry =
            preview.geometry;

        const scale =
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
            state.camera.zoom;

        const toScreen =
            point =>
                enggDrawingState
                    .engineeringToScreen(
                        point,
                        bounds,
                        state
                    );

        const style =
            previewStyle(preview);

        /*
         * VALID PLACEMENT LOCATIONS
         *
         * The points along the selected body where this
         * feature may be placed. They are drawn as small
         * markers so the valid positions are obvious, and
         * they are pure preview: they are never features,
         * never enter the collection and cannot be picked.
         */
        if (
            Array.isArray(preview.locations)
        ) {
            preview.locations.forEach(location => {
                if (
                    !location ||
                    !Number.isFinite(location.x) ||
                    !Number.isFinite(location.y)
                ) {
                    return;
                }

                const screen =
                    toScreen(location);

                svg.appendChild(
                    createSvgElement("circle", {
                        cx: screen.x,
                        cy: screen.y,
                        r: 2.5,
                        fill: style.stroke,
                        stroke: "none",
                        opacity: 0.55
                    })
                );
            });
        }

        /*
         * THE CURRENT TARGET BODY
         *
         * The body being attached to is outlined while the
         * feature is being placed, so it is clear which body
         * the result will belong to.
         */
        if (
            preview.targetBody
        ) {
            enggFeatureGeometry
                .definingPoints(
                    preview.targetBody.geometry,
                    preview.targetBody.type
                )
                .forEach(point => {
                    const screen =
                        toScreen(point);

                    svg.appendChild(
                        createSvgElement("circle", {
                            cx: screen.x,
                            cy: screen.y,
                            r: 3,
                            fill: "none",
                            stroke: style.stroke,
                            "stroke-width": 1.2,
                            "stroke-dasharray": "3 2",
                            opacity: 0.75
                        })
                    );
                });
        }

        if (preview.type === "point") {
            const position = geometry.position || geometry.point || geometry;
            const screen = toScreen(position);
            svg.appendChild(createSvgElement("circle", {
                cx: screen.x,
                cy: screen.y,
                r: 4,
                fill: "none",
                stroke: style.stroke,
                "stroke-width": 1.5,
                opacity: style.opacity
            }));
            return;
        }

        /*
         * TRUSS CONSTRUCTION
         *
         * The members drawn so far and the member in progress are
         * preview geometry. They belong to the construction, not to
         * the feature collection, so they are never selectable and
         * never appear in the tree; they are replaced by the one
         * Truss feature when the student double-clicks.
         *
         * Every member already placed stays drawn, so the whole
         * structure being built is always visible, and all of it is
         * highlighted together with the member in progress. The
         * highlight is what distinguishes an unfinished truss from a
         * finished one, and it is dropped the moment the
         * construction is committed.
         *
         * This is drawn here, before the plain LINE branch, because
         * a truss member in progress previews as a line and would
         * otherwise be caught by that branch and return before the
         * rest of the structure was drawn.
         */
        if (state.interaction.phase === 'truss-construct') {
            const truss = state.interaction.trussMembers || [];
            const inProgress = state.interaction.trussInProgress;
            const constructionStroke =
                state.interaction.trussStyle?.stroke || style.stroke;

            if (truss.length) {
                /*
                 * A wide, translucent pass under the members. One
                 * path for the whole structure is what makes the
                 * construction read as a single highlighted object
                 * rather than as a set of loose lines.
                 */
                svg.appendChild(
                    createSvgElement("path", {
                        d: truss
                            .map(member => {
                                const a = toScreen(member.start);
                                const b = toScreen(member.end);

                                return `M${a.x},${a.y}L${b.x},${b.y}`;
                            })
                            .join(" "),
                        fill: "none",
                        stroke: constructionStroke,
                        "stroke-width": 7,
                        "stroke-opacity": 0.22,
                        "stroke-linecap": "round",
                        "stroke-linejoin": "round"
                    })
                );

                truss.forEach(member => {
                    const a = toScreen(member.start);
                    const b = toScreen(member.end);

                    svg.appendChild(
                        createSvgElement("line", {
                            x1: a.x,
                            y1: a.y,
                            x2: b.x,
                            y2: b.y,
                            stroke: constructionStroke,
                            "stroke-width": 1.8
                        })
                    );
                });

                /*
                 * The joints, so it is visible which points are
                 * already part of the structure and where a new member
                 * can meet it.
                 */
                trussJoints(truss).forEach(joint => {
                    const p = toScreen(joint);

                    svg.appendChild(
                        createSvgElement("circle", {
                            cx: p.x,
                            cy: p.y,
                            r: 3,
                            fill: "#ffffff",
                            stroke: constructionStroke,
                            "stroke-width": 1.4
                        })
                    );
                });
            }

            if (inProgress) {
                const a = toScreen(inProgress);
                const b = toScreen(geometry.end);

                /*
                 * The member in progress is drawn on the same
                 * highlight as the members already placed, with a
                 * dashed line only to mark it as not yet committed.
                 */
                svg.appendChild(
                    createSvgElement("line", {
                        x1: a.x,
                        y1: a.y,
                        x2: b.x,
                        y2: b.y,
                        stroke: constructionStroke,
                        "stroke-width": 6,
                        "stroke-opacity": 0.22,
                        "stroke-linecap": "round"
                    })
                );

                svg.appendChild(
                    createSvgElement("line", {
                        x1: a.x,
                        y1: a.y,
                        x2: b.x,
                        y2: b.y,
                        stroke: constructionStroke,
                        "stroke-width": 1.8,
                        "stroke-dasharray": "6 4"
                    })
                );
            }
        }

        /*
         * LINE
         */
        if (
            preview.type ===
            "line"
        ) {
            if (
                !geometry.start ||
                !geometry.end
            ) {
                return;
            }

            const start =
                toScreen(
                    geometry.start
                );

            const end =
                toScreen(
                    geometry.end
                );

            const line =
                createSvgElement(
                    "line",
                    {
                        x1: start.x,
                        y1: start.y,
                        x2: end.x,
                        y2: end.y,
                        stroke:
                            style.stroke,
                        "stroke-width":
                            1.5,
                        "stroke-dasharray":
                            "6 4",
                        opacity:
                            style.opacity
                    }
                );

            svg.appendChild(
                line
            );

            return;
        }

        /*
         * CIRCLE
         */
        if (
            preview.type ===
            "circle"
        ) {
            if (
                !geometry.center ||
                !Number.isFinite(
                    geometry.radius
                )
            ) {
                return;
            }

            const center =
                toScreen(
                    geometry.center
                );

            const circle =
                createSvgElement(
                    "circle",
                    {
                        cx:
                            center.x,
                        cy:
                            center.y,
                        r:
                            Math.max(
                                0,
                                geometry.radius *
                                    scale
                            ),
                        fill:
                            "none",
                        stroke:
                            style.stroke,
                        "stroke-width":
                            1.5,
                        "stroke-dasharray":
                            "6 4",
                        opacity:
                            style.opacity
                    }
                );

            svg.appendChild(
                circle
            );

            return;
        }

        /*
         * RECTANGLE
         */
        if (
            preview.type ===
            "rectangle"
        ) {
            if (
                !geometry.position
            ) {
                return;
            }

            const x =
                geometry.position.x;

            const y =
                geometry.position.y;

            const width =
                geometry.width ??
                0;

            const height =
                geometry.height ??
                0;

            const topLeft =
                toScreen({
                    x,
                    y
                });

            /*
             * Same convention as the committed rectangle:
             * position is the top-left corner and toScreen
             * already flips Y, so no extra height offset is
             * applied. This keeps the preview identical to
             * the committed geometry.
             */
            const rect =
                createSvgElement(
                    "rect",
                    {
                        x:
                            topLeft.x,
                        y:
                            topLeft.y,
                        width:
                            width *
                            scale,
                        height:
                            height *
                            scale,
                        fill:
                            "none",
                        stroke:
                            style.stroke,
                        "stroke-width":
                            1.5,
                        "stroke-dasharray":
                            "6 4",
                        opacity:
                            style.opacity
                    }
                );

            const rotation =
                geometry.rotation ??
                0;

            if (rotation) {
                /*
                 * Same convention as the committed rectangle:
                 * position is the top-left corner, so the pivot
                 * is half a height below it.
                 */
                const center =
                    toScreen({
                        x:
                            x +
                            width / 2,
                        y:
                            y -
                            height / 2
                    });

                rect.setAttribute(
                    "transform",
                    `rotate(${-rotation} ${center.x} ${center.y})`
                );
            }

            svg.appendChild(
                rect
            );

            return;
        }

        /*
         * POLYLINE
         */
        if (
            preview.type ===
            "polyline"
        ) {
            const points =
                (
                    geometry.points ||
                    []
                )
                    .filter(Boolean)
                    .map(toScreen)
                    .map(
                        point =>
                            `${point.x},${point.y}`
                    )
                    .join(" ");

            if (!points) {
                return;
            }

            const polyline =
                createSvgElement(
                    "polyline",
                    {
                        points,
                        fill:
                            "none",
                        stroke:
                            style.stroke,
                        "stroke-width":
                            1.5,
                        "stroke-dasharray":
                            "6 4",
                        opacity:
                            style.opacity
                    }
                );

            svg.appendChild(
                polyline
            );

            return;
        }

        /*
         * POLYGON
         *
         * Live preview derived from the same defining
         * parameters the committed feature will store.
         */
        if (
            preview.type ===
            "polygon"
        ) {
            const polygonPoints =
                enggDrawingState
                    .polygonVertices(
                        geometry
                    )
                    .map(toScreen)
                    .map(
                        point =>
                            `${point.x},${point.y}`
                    )
                    .join(" ");

            if (polygonPoints) {
                const polygon =
                    createSvgElement(
                        "polygon",
                        {
                            points:
                                polygonPoints,
                            fill:
                                "none",
                            stroke:
                                style.stroke,
                            "stroke-width":
                                1.5,
                            "stroke-dasharray":
                                "6 4",
                            opacity:
                                style.opacity
                        }
                    );

                svg.appendChild(
                    polygon
                );
            }

            return;
        }

        /*
         * TRIANGLE
         *
         * Live preview of all three sides, closed
         * back to the first point.
         */
        if (
            preview.type ===
            "triangle"
        ) {
            const trianglePoints =
                (
                    geometry.points ||
                    []
                )
                    .filter(Boolean)
                    .map(toScreen)
                    .map(
                        point =>
                            `${point.x},${point.y}`
                    )
                    .join(" ");

            if (trianglePoints) {
                const triangle =
                    createSvgElement(
                        "polygon",
                        {
                            points:
                                trianglePoints,
                            fill:
                                "none",
                            stroke:
                                style.stroke,
                            "stroke-width":
                                1.5,
                            "stroke-dasharray":
                                "6 4",
                            opacity:
                                style.opacity
                        }
                    );

                svg.appendChild(
                    triangle
                );
            }

            return;
        }

        /*
         * ARC
         */
        if (
            preview.type ===
            "arc"
        ) {
            if (
                !geometry.center ||
                !Number.isFinite(
                    geometry.radius
                )
            ) {
                return;
            }

            const center =
                toScreen(
                    geometry.center
                );

            const radius =
                geometry.radius *
                scale;

            const startAngle =
                geometry.startAngle ??
                0;

            const endAngle =
                geometry.endAngle ??
                0;

            const path =
                createSvgElement(
                    "path",
                    {
                        d:
                            arcPathData(
                                center,
                                radius,
                                startAngle,
                                endAngle
                            ),
                        fill:
                            "none",
                        stroke:
                            style.stroke,
                        "stroke-width":
                            1.5,
                        "stroke-dasharray":
                            "6 4",
                        opacity:
                            style.opacity
                    }
                );

            svg.appendChild(
                path
            );

            return;
        }

        /*
         * 2D COORDINATE SYSTEM
         */

        if (
            preview.type ===
            "coordinate-system-2d"
        ) {
            appendCoordinateSystem(
                svg,
                geometry,
                style,
                state,
                bounds,
                true
            );
            return;
        }

        /*
         * STATICS SPAN PREVIEW
         *
         * A force, a load or a connection previews as the
         * very symbol it will become, so it runs through the
         * ordinary entity renderer rather than gaining a
         * second drawing system just for the preview. The
         * preview id keeps it out of selection and hit
         * testing, and its dashed style keeps it visually
         * distinct from the committed feature.
         */
        if (
            STATICS_PREVIEW_TYPES.includes(
                preview.type
            )
        ) {
            appendEntity(
                svg,
                {
                    ...preview,
                    isPreview: true
                },
                state,
                bounds
            );
        }
    }

    /*
     * Statics features that can be previewed as a two-point
     * span. They are drawn by appendEntity, so the preview
     * and the committed feature always match.
     */
    const STATICS_PREVIEW_TYPES = [
        "force",
        "load",
        "varying-load",
        "pin-connection",
        "fixed-connection",
        "slider-connection",
        "moment",
        "couple",
        "pin-support",
        "roller-support",
        "fixed-support",
        "smooth-support",
        "beam",
        "truss",
        "cable",
        "shaft"
    ];

    /*
     * Draw a rigid body in whichever shape it currently has.
     *
     * Each shape is a real closed outline, so a body reads as
     * the body the student chose rather than as a stand-in
     * drawn with whatever primitive was to hand. The shape is
     * taken from the shared geometry module, which is also
     * what the handles and the transforms read, so a change of
     * shape moves through all three together.
     */
    function appendRigidBody(svg, entity, geometry, style, toScreen, scale) {
        const shape =
            enggFeatureGeometry.rigidBodyShape(geometry);

        const stroke = style.stroke || "#000000";

        if (shape === "circle") {
            const center = toScreen(geometry.center || { x: 0, y: 0 });
            const radius =
                (Number(geometry.radius) || 0) * scale;

            const circle = createSvgElement("circle", {
                cx: center.x,
                cy: center.y,
                r: radius
            });

            applyStyle(circle, style);
            svg.appendChild(circle);
            return;
        }

        if (shape === "polygon") {
            const vertices = enggDrawingState
                .polygonVertices(geometry)
                .map(toScreen);

            if (vertices.length < 3) return;

            const polygon = createSvgElement("polygon", {
                points: vertices
                    .map(v => `${v.x},${v.y}`)
                    .join(" ")
            });

            applyStyle(polygon, style);
            svg.appendChild(polygon);
            return;
        }

        if (shape === "triangle") {
            const points = (geometry.points || []).filter(Boolean).map(toScreen);

            if (points.length < 3) return;

            const polygon = createSvgElement("polygon", {
                points: points
                    .map(v => `${v.x},${v.y}`)
                    .join(" ")
            });

            applyStyle(polygon, style);
            svg.appendChild(polygon);
            return;
        }

        /*
         * A rectangle. Its corners come from the shared module
         * so the drawn outline is the same outline the
         * transforms act on.
         */
        const corners = enggFeatureGeometry
            .rectangleCorners(geometry)
            .map(toScreen);

        if (corners.length < 3) return;

        const polygon = createSvgElement("polygon", {
            points: corners
                .map(v => `${v.x},${v.y}`)
                .join(" ")
        });

        applyStyle(polygon, style);
        svg.appendChild(polygon);
    }

    /*
     * ========================================================
     * MAIN RENDERER
     * ========================================================
     */

    function renderDrawing(
        state,
        canvas
    ) {
        if (!canvas) {
            return;
        }

        const svg =
            ensureSvg(canvas);

        while (
            svg.firstChild
        ) {
            svg.removeChild(
                svg.firstChild
            );
        }

        const bounds =
            canvas.getBoundingClientRect();

        renderEngineeringGrid(svg, state, bounds);

        /*
         * Committed geometry
         */
        state.objects.forEach(
            entity => {
                appendEntity(
                    svg,
                    entity,
                    state,
                    bounds
                );
            }
        );

        /*
         * Live construction preview
         *
         * Must be rendered before snap feedback so that
         * the snap marker remains visually on top.
         */
        const activePreview = state.interaction.preview;
        for (const preview of state.interaction.previewObjects || []) {
            state.interaction.preview = preview;
            renderPreview(svg, state, bounds);
        }
        state.interaction.preview = activePreview;
        renderPreview(svg, state, bounds);

        renderInferenceLine(
            svg,
            state,
            bounds
        );

        /*
         * Snap marker
         */
        renderSnapIndicator(
            svg,
            state,
            bounds
        );

        /*
         * Selection rectangle
         */
        renderSelectionBox(
            svg,
            state,
            bounds
        );

        renderSelectionHandles(svg, state, bounds);
    }

    window.enggDrawingRenderer = {
        renderDrawing
    };
})();