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
            Math.max(
                0.5,
                lineWidth * 2.4
            )
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

            if (entity.type === "force") {
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
                        stroke
                    );
                } else {
                    appendForceArrow(
                        svg,
                        anchor,
                        Number(geometry.angle) || 0,
                        Math.abs(Number(geometry.magnitude) || 0),
                        stroke
                    );
                }
            } else if (
                entity.type === "pin-support" ||
                entity.type === "roller-support" ||
                entity.type === "fixed-support" ||
                entity.type === "smooth-support"
            ) {
                appendSupportSymbol(
                    svg,
                    anchor,
                    entity.type,
                    Number(geometry.orientation) || 0,
                    stroke
                );
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
         * MOMENT
         *
         * Drawn as a circular arrow, with the sense of
         * rotation shown by an arrow head on the arc.
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

            const center = toScreen(position);
            const stroke = style.stroke || "#000000";
            const radius = 16;
            const clockwise = geometry.clockwise === true;

            /*
             * Two half arcs so the gap leaves room for the
             * arrow head.
             */
            const start = clockwise ? -0.4 : Math.PI + 0.4;
            const end = clockwise ? Math.PI - 0.4 : 2 * Math.PI - 0.4;

            const from = {
                x: center.x + Math.cos(start) * radius,
                y: center.y + Math.sin(start) * radius
            };

            const to = {
                x: center.x + Math.cos(end) * radius,
                y: center.y + Math.sin(end) * radius
            };

            svg.appendChild(
                createSvgElement("path", {
                    d: `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 ${clockwise ? 1 : 0} ${to.x} ${to.y}`,
                    fill: "none",
                    stroke,
                    "stroke-width": 1.6
                })
            );

            /*
             * Arrow head at the open end, pointing along the
             * direction of rotation.
             */
            const tangent =
                end +
                (clockwise ? Math.PI / 2 : -Math.PI / 2);

            const head = 7;

            svg.appendChild(
                createSvgElement("polygon", {
                    points: [
                        `${to.x},${to.y}`,
                        `${to.x - head * Math.cos(tangent - 0.5)},${to.y - head * Math.sin(tangent - 0.5)}`,
                        `${to.x - head * Math.cos(tangent + 0.5)},${to.y - head * Math.sin(tangent + 0.5)}`
                    ].join(" "),
                    fill: stroke,
                    stroke: "none"
                })
            );

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

            appendCouple(
                svg,
                toScreen(position),
                Number(geometry.magnitude) || 0,
                Number(geometry.separation) || 0,
                geometry.clockwise === true,
                style.stroke || "#000000"
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
                 * The axial centreline, dashed so it reads as a
                 * centre line rather than an edge.
                 */
                svg.appendChild(
                    createSvgElement("line", {
                        x1: from.x,
                        y1: from.y,
                        x2: to.x,
                        y2: to.y,
                        stroke,
                        "stroke-width": 1,
                        "stroke-dasharray": "6 3"
                    })
                );
            }

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * DISTRIBUTED LOAD
         *
         * One coherent feature: the span line with a row of
         * arrows along it, which is the usual way a
         * distributed load is sketched. The arrows are
         * rendering only and are never separate features.
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

            /*
             * Arrows hang below the span, evenly spaced.
             */
            const arrows = 6;
            const drop = 22;

            for (let i = 0; i < arrows; i += 1) {
                const t = arrows === 1 ? 0.5 : i / (arrows - 1);
                const x = from.x + (to.x - from.x) * t;
                const y = from.y + (to.y - from.y) * t;

                svg.appendChild(
                    createSvgElement("line", {
                        x1: x,
                        y1: y,
                        x2: x,
                        y2: y + drop,
                        stroke,
                        "stroke-width": 1.2
                    })
                );

                svg.appendChild(
                    createSvgElement("polygon", {
                        points: [
                            `${x},${y + drop}`,
                            `${x - 4},${y + drop - 7}`,
                            `${x + 4},${y + drop - 7}`
                        ].join(" "),
                        fill: stroke,
                        stroke: "none"
                    })
                );
            }

            parentSvg.appendChild(svg);
            return;
        }

        /*
         * VARYING DISTRIBUTED LOAD
         *
         * The same span with arrows whose lengths follow the
         * stored intensities, so a triangular or trapezoidal
         * distribution is visible from the drawing itself.
         * The arrows are rendering only; the feature is one
         * object.
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

            const arrows = 8;
            const startIntensity =
                Math.abs(Number(geometry.startIntensity) || 0);

            const endIntensity =
                Math.abs(Number(geometry.endIntensity) || 0);

            /*
             * Arrow length is proportional to intensity, scaled
             * so the largest intensity on the span reaches a
             * readable screen length.
             */
            const peak =
                Math.max(startIntensity, endIntensity, 1e-6);

            for (let i = 0; i < arrows; i += 1) {
                const t = arrows === 1 ? 0.5 : i / (arrows - 1);
                const x = from.x + (to.x - from.x) * t;
                const y = from.y + (to.y - from.y) * t;

                const intensity =
                    startIntensity +
                    (endIntensity - startIntensity) * t;

                const drop =
                    6 +
                    (intensity / peak) * 22;

                svg.appendChild(
                    createSvgElement("line", {
                        x1: x,
                        y1: y,
                        x2: x,
                        y2: y + drop,
                        stroke,
                        "stroke-width": 1.2
                    })
                );

                svg.appendChild(
                    createSvgElement("polygon", {
                        points: [
                            `${x},${y + drop}`,
                            `${x - 4},${y + drop - 7}`,
                            `${x + 4},${y + drop - 7}`
                        ].join(" "),
                        fill: stroke,
                        stroke: "none"
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

    function appendForceArrow(
        svg,
        anchor,
        angleDegrees,
        magnitude,
        stroke
    ) {
        const length =
            Math.max(
                24,
                Math.min(
                    140,
                    Math.abs(magnitude)
                )
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
                "stroke-width": 1.6,
                "stroke-linecap": "round"
            })
        );

        appendArrowHead(svg, tip, radians, stroke, 9);
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
     * A couple: two equal, opposite, parallel forces
     * separated by the stored distance, which is what makes
     * a couple physically meaningful. The pair is the visual
     * output of the one Couple feature, not two forces.
     */
    function appendCouple(
        svg,
        anchor,
        magnitude,
        separation,
        clockwise,
        stroke
    ) {
        const half =
            Math.max(
                12,
                Math.min(
                    90,
                    Math.abs(separation)
                )
            ) / 2;

        const length =
            Math.max(
                20,
                Math.min(
                    90,
                    Math.abs(magnitude)
                )
            );

        /*
         * Upper force points up, lower force points down, so
         * the pair reads as a pure moment with no net force.
         * A clockwise couple swaps which end drives the
         * rotation, so the sense of rotation stays readable.
         */
        [
            {
                x: anchor.x,
                y: anchor.y - half,
                direction: clockwise ? -Math.PI / 2 : Math.PI / 2
            },
            {
                x: anchor.x,
                y: anchor.y + half,
                direction: clockwise ? Math.PI / 2 : -Math.PI / 2
            }
        ].forEach(force => {
            const tip = {
                x: force.x + Math.cos(force.direction) * length,
                y: force.y - Math.sin(force.direction) * length
            };

            svg.appendChild(
                createSvgElement("line", {
                    x1: force.x,
                    y1: force.y,
                    x2: tip.x,
                    y2: tip.y,
                    stroke,
                    "stroke-width": 1.6,
                    "stroke-linecap": "round"
                })
            );

            appendArrowHead(svg, tip, force.direction, stroke, 8);
        });
    }

    /*
     * Standard engineering support symbols.
     *
     * Pin is a triangle on a hatched ground line, roller adds
     * the rollers, fixed is a hatched wall, and smooth shows
     * a rounded contact with its normal reaction.
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

        if (type === "fixed-support") {
            /*
             * A hatched wall running along the support.
             */
            const wall = 16;

            svg.appendChild(
                createSvgElement("line", {
                    x1: anchor.x,
                    y1: anchor.y - wall,
                    x2: anchor.x,
                    y2: anchor.y + wall,
                    stroke,
                    "stroke-width": 2
                })
            );

            for (
                let i = -wall;
                i <= wall;
                i += 5
            ) {
                svg.appendChild(
                    createSvgElement("line", {
                        x1: anchor.x,
                        y1: anchor.y + i,
                        x2: anchor.x - 7,
                        y2: anchor.y + i + 5,
                        stroke,
                        "stroke-width": 1
                    })
                );
            }

            return;
        }

        if (type === "smooth-support") {
            /*
             * A rounded contact with its normal reaction, which
             * is what distinguishes a smooth support.
             */
            svg.appendChild(
                createSvgElement("circle", {
                    cx: anchor.x,
                    cy: anchor.y - 4,
                    r: 4,
                    fill: "none",
                    stroke,
                    "stroke-width": 1.4
                })
            );

            svg.appendChild(
                createSvgElement("line", {
                    x1: anchor.x,
                    y1: anchor.y,
                    x2: anchor.x,
                    y2: anchor.y - 16,
                    stroke,
                    "stroke-width": 1.4
                })
            );

            svg.appendChild(
                createSvgElement("line", {
                    x1: anchor.x - ground / 2,
                    y1: anchor.y + 2,
                    x2: anchor.x + ground / 2,
                    y2: anchor.y + 2,
                    stroke,
                    "stroke-width": 1.4
                })
            );

            return;
        }

        /*
         * Pin and roller share the triangle body; the roller
         * adds the rollers beneath it.
         */
        const apex = {
            x: anchor.x,
            y: anchor.y - size
        };

        const rollers = type === "roller-support";

        const base = {
            y:
                rollers
                    ? anchor.y + size
                    : anchor.y + size
        };

        svg.appendChild(
            createSvgElement("polygon", {
                points: [
                    `${apex.x},${apex.y}`,
                    `${anchor.x + size},${base.y}`,
                    `${anchor.x - size},${base.y}`
                ].join(" "),
                fill: "none",
                stroke,
                "stroke-width": 1.6
            })
        );

        if (rollers) {
            [-5, 5].forEach(offset => {
                svg.appendChild(
                    createSvgElement("circle", {
                        cx: anchor.x + offset,
                        cy: base.y + 3,
                        r: 3,
                        fill: "none",
                        stroke,
                        "stroke-width": 1.2
                    })
                );
            });

            svg.appendChild(
                createSvgElement("line", {
                    x1: anchor.x - ground / 2,
                    y1: base.y + 7,
                    x2: anchor.x + ground / 2,
                    y2: base.y + 7,
                    stroke,
                    "stroke-width": 1.4
                })
            );
        } else {
            svg.appendChild(
                createSvgElement("line", {
                    x1: anchor.x - ground / 2,
                    y1: base.y,
                    x2: anchor.x + ground / 2,
                    y2: base.y,
                    stroke,
                    "stroke-width": 1.4
                })
            );
        }

        void orientation;
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
        const inference =
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

        renderSnapMarker(
            svg,
            candidate,
            screenPoint
        );

        const labels = {
            endpoint:
                "Endpoint",
            intersection:
                "Intersection",
            center:
                "Center",
            midpoint:
                "Midpoint",
            quadrant:
                "Quadrant",
            pointOnEntity:
                "Point on Entity"
        };

        const label =
            createSvgElement(
                "text",
                {
                    x:
                        screenPoint.x +
                        9,
                    y:
                        screenPoint.y -
                        9,
                    class:
                        "drawing-snap-label"
                }
            );

        label.textContent =
            candidate.label ||
            labels[
                candidate.type
            ] ||
            "Snap";

        svg.appendChild(
            label
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
        svg.appendChild(createSvgElement("path", {
            d: segments.join(" "),
            class: "drawing-engineering-grid"
        }));
    }

    /*
     * Centre and rotation-handle anchor for a selected
     * feature.
     *
     * The centre is the pivot used when rotating, and the
     * handle sits a fixed screen distance beyond the
     * feature's top edge so it is always reachable and
     * always tracks the current geometry.
     */
    function rotationHandleFor(object, state, bounds) {
        const geometry = object.geometry || {};

        /*
         * A point has no extent, so there is nothing to
         * rotate and no rotation handle is drawn for it.
         */
        if (object.type === "point") {
            return null;
        }

        /*
         * The centre and the shape it describes both come from
         * the shared feature-geometry module, which is also what
         * the manipulation layer uses to place and hit-test this
         * handle. Deriving it here instead is how the drawn
         * handle drifts away from the shape after a rotation, and
         * why a Statics feature would show no handle at all.
         */
        const valid = enggFeatureGeometry
            .definingPoints(geometry, object.type)
            .filter(
                p => p && Number.isFinite(p.x) && Number.isFinite(p.y)
            );

        if (!valid.length) return null;

        const center = {
            x: valid.reduce((t, p) => t + p.x, 0) / valid.length,
            y: valid.reduce((t, p) => t + p.y, 0) / valid.length
        };

        const top = Math.max(...valid.map(p => p.y));

        /*
         * The handle sits a fixed screen distance above the
         * feature, converted to world units so it stays a
         * constant size on screen at any zoom.
         */
        const scale =
            enggDrawingState.BASE_PIXELS_PER_UNIT *
            state.camera.zoom;

        return {
            center,
            handle: {
                x: center.x,
                y: top + 26 / Math.max(scale, 1e-6)
            }
        };
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
                r: kind === "rotation" ? 4.2 : 3.8,
                class: `drawing-manipulation-handle${kind ? ` ${kind}` : ""}`
            }));
        };
        state.objects.forEach(object => {
            if (!selected.has(object.id)) return;
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
                 * A particle has one position handle and no
                 * rotation handle, since orientation is not
                 * meaningful for it.
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

            /*
             * Rotation handle.
             *
             * Derived from the feature's current geometry
             * every render, so it can never drift away from
             * the shape after a rotation or a move.
             */
            const rotation =
                rotationHandleFor(object, state, bounds);

            if (rotation) {
                add(rotation.handle, "rotation");
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
        /*
         * Truss construction
         *
         * The members drawn so far and the member in progress are
         * preview geometry. They belong to the construction, not to
         * the feature collection, so they are never selectable and
         * never appear in the tree; they are replaced by the one
         * Truss feature when the student finishes.
         */
        const truss = state.interaction.trussMembers || [];
        const inProgress = state.interaction.trussInProgress;

        if (truss.length) {
            truss.forEach(member => {
                const a = toScreen(member.start);
                const b = toScreen(member.end);

                svg.appendChild(
                    createSvgElement("line", {
                        x1: a.x,
                        y1: a.y,
                        x2: b.x,
                        y2: b.y,
                        stroke: style.stroke,
                        "stroke-width": 1.4
                    })
                );
            });

            /*
             * The joints, so it is visible which points are already
             * part of the structure and where a new member can meet
             * it.
             */
            trussJoints(truss).forEach(joint => {
                const p = toScreen(joint);

                svg.appendChild(
                    createSvgElement("circle", {
                        cx: p.x,
                        cy: p.y,
                        r: 3,
                        fill: "#ffffff",
                        stroke: style.stroke,
                        "stroke-width": 1.4
                    })
                );
            });
        }

        if (inProgress) {
            const a = toScreen(inProgress);
            const b = toScreen(geometry.end);

            svg.appendChild(
                createSvgElement("line", {
                    x1: a.x,
                    y1: a.y,
                    x2: b.x,
                    y2: b.y,
                    stroke: style.stroke,
                    "stroke-width": 1.4,
                    "stroke-dasharray": "6 4"
                })
            );
        }

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
