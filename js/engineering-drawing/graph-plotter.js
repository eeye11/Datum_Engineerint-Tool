(function (root) {
    "use strict";

    const allowedSymbols = new Set(["x", "e", "pi", "tau"]);
    const allowedFunctions = new Set([
        "abs", "acos", "asin", "atan", "ceil", "cos", "cosh",
        "exp", "floor", "log", "log10", "max", "min", "pow",
        "round", "sign", "sin", "sinh", "sqrt", "tan", "tanh"
    ]);
    const allowedOperators = new Set(["+", "-", "*", "/", "%", "^"]);
    let backdrop = null;
    let resizeObserver = null;
    let activePlot = null;
    let returnFocus = null;
    let inputTimer = null;
    const plotColors = ["#1f6b43", "#c24b36", "#3266a8", "#9a6b16", "#75469a", "#16828a"];

    function validateExpressionNode(node) {
        if (node.isConstantNode) {
            if (typeof node.value !== "number" || !Number.isFinite(node.value)) {
                throw new Error("Only finite numeric constants are supported");
            }

            return;
        }

        if (node.isSymbolNode) {
            if (!allowedSymbols.has(node.name)) {
                throw new Error(`Unknown symbol: ${node.name}`);
            }

            return;
        }

        if (node.isParenthesisNode) {
            validateExpressionNode(node.content);
            return;
        }

        if (node.isOperatorNode) {
            if (!allowedOperators.has(node.op)) {
                throw new Error(`Operator not supported: ${node.op}`);
            }

            node.args.forEach(validateExpressionNode);
            return;
        }

        if (node.isFunctionNode && node.fn.isSymbolNode) {
            if (!allowedFunctions.has(node.fn.name)) {
                throw new Error(`Function not supported: ${node.fn.name}`);
            }

            node.args.forEach(validateExpressionNode);
            return;
        }

        throw new Error("Use numbers, x, arithmetic, and supported functions only");
    }

    function compileExpression(source) {
        if (!root.math || typeof root.math.parse !== "function") {
            throw new Error("The graphing library could not be loaded. Check your internet connection and reopen the plotter.");
        }

        const expression = String(source || "")
            .trim()
            .replace(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, "");

        if (!expression) {
            throw new Error("Enter an equation to plot");
        }

        const parsed = root.math.parse(expression);
        validateExpressionNode(parsed);
        const compiled = parsed.compile();

        return x => {
            try {
                const value = compiled.evaluate({ x });
                return typeof value === "number" && Number.isFinite(value)
                    ? value
                    : null;
            } catch {
                return null;
            }
        };
    }

    function validateDomain(minimum, maximum) {
        const minText = String(minimum ?? "").trim();
        const maxText = String(maximum ?? "").trim();
        const min = Number(minText);
        const max = Number(maxText);

        if (!minText || !maxText || !Number.isFinite(min) || !Number.isFinite(max)) {
            throw new Error("Enter finite numbers for both domain limits");
        }

        if (Math.abs(min) > 1e6 || Math.abs(max) > 1e6) {
            throw new Error("Domain limits must be between -1,000,000 and 1,000,000");
        }

        if (min >= max) {
            throw new Error("The domain minimum must be less than the maximum");
        }

        return { min, max };
    }

    function sampleValues(evaluate, min, max, count) {
        const sampleCount = Math.max(2, Math.floor(count));
        const step = (max - min) / (sampleCount - 1);

        return Array.from({ length: sampleCount }, (_, index) => {
            const x = index === sampleCount - 1
                ? max
                : min + step * index;
            let y = null;

            try {
                const value = evaluate(x);
                y = typeof value === "number" && Number.isFinite(value)
                    ? value
                    : null;
            } catch {
                y = null;
            }

            return { x, y };
        });
    }

    function combinedDomain(domains) {
        if (!domains.length) {
            return { min: 0, max: 10 };
        }

        return {
            min: Math.min(...domains.map(domain => domain.min)),
            max: Math.max(...domains.map(domain => domain.max))
        };
    }

    function boundsOfObjects(objects) {
        const bounds = {
            left: Infinity,
            right: -Infinity,
            bottom: Infinity,
            top: -Infinity
        };

        const includePoint = point => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                return;
            }

            bounds.left = Math.min(bounds.left, point.x);
            bounds.right = Math.max(bounds.right, point.x);
            bounds.bottom = Math.min(bounds.bottom, point.y);
            bounds.top = Math.max(bounds.top, point.y);
        };

        objects.forEach(object => {
            const geometry = object.geometry || {};

            if (object.type === "line") {
                includePoint(geometry.start);
                includePoint(geometry.end);
            } else if (object.type === "polyline") {
                (geometry.points || []).forEach(includePoint);
            } else if (object.type === "circle") {
                const radius = Math.abs(Number(geometry.radius) || 0);
                includePoint({ x: geometry.center?.x - radius, y: geometry.center?.y - radius });
                includePoint({ x: geometry.center?.x + radius, y: geometry.center?.y + radius });
            } else if (object.type === "rectangle") {
                const position = geometry.position || {};
                includePoint(position);
                includePoint({
                    x: position.x + (Number(geometry.width) || 0),
                    y: position.y - (Number(geometry.height) || 0)
                });
            } else if (object.type === "annotation" && object.placement) {
                const fontSize = Number(object.style?.fontSize) || 5.2;
                const lines = String(object.text || "").split("\n");
                const textWidth = Math.max(...lines.map(line => line.length)) * fontSize * 0.58;
                const textHeight = lines.length * fontSize * 1.2;
                includePoint({ x: object.placement.x - textWidth / 2, y: object.placement.y - textHeight / 2 });
                includePoint({ x: object.placement.x + textWidth / 2, y: object.placement.y + textHeight / 2 });
            }
        });

        return Number.isFinite(bounds.left) ? bounds : null;
    }

    function findVerticalConnectors(points, yMin, yMax) {
        const yRange = yMax - yMin;
        if (!(yRange > 0)) {
            return [];
        }

        const pairs = [];
        let previousIndex = -1;
        let skippedSamples = 0;

        points.forEach((point, index) => {
            if (point.y === null) {
                skippedSamples += 1;
                return;
            }

            if (previousIndex >= 0 && skippedSamples <= 2) {
                const previous = points[previousIndex];
                pairs.push({ previous, point, skippedSamples });
            }

            previousIndex = index;
            skippedSamples = 0;
        });

        const localChanges = pairs
            .map(({ previous, point, skippedSamples: skipped }) =>
                Math.abs(point.y - previous.y) / (skipped + 1)
            )
            .filter(Number.isFinite)
            .sort((first, second) => first - second);
        const typicalChange = localChanges.length >= 4
            ? localChanges[Math.floor(localChanges.length / 2)]
            : 0;
        const minimumJump = Math.max(yRange * 0.035, typicalChange * 8);

        return pairs.flatMap(({ previous, point }) => {
            const start = Math.max(yMin, Math.min(yMax, previous.y));
            const end = Math.max(yMin, Math.min(yMax, point.y));
            const visibleJump = Math.abs(end - start) / yRange;
            const rawJump = Math.abs(point.y - previous.y);

            if (visibleJump < 0.08 || rawJump < minimumJump) {
                return [];
            }

            return [{
                x: (previous.x + point.x) / 2,
                yStart: start,
                yEnd: end
            }];
        });
    }

    function createDrawingSnapshot(graph) {
        return {
            domain: { ...graph.domain },
            yMin: graph.yMin,
            yMax: graph.yMax,
            aspect: graph.plot.height / graph.plot.width,
            xTicks: [...graph.xTicks],
            yTicks: [...graph.yTicks],
            series: graph.series.map(({ expression, color, domain, points, endpoints, connectors }) => ({
                expression,
                color,
                domain: { ...domain },
                points: points.map(point => ({ ...point })),
                endpoints: endpoints.map(point => ({ ...point })),
                connectors: connectors.map(connector => ({ ...connector }))
            }))
        };
    }

    function niceStep(span, targetCount) {
        const roughStep = span / targetCount;
        const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
        const fraction = roughStep / power;
        const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;

        return niceFraction * power;
    }

    function tickValues(min, max, targetCount) {
        const step = niceStep(max - min, targetCount);
        const ticks = [];
        const first = Math.ceil(min / step) * step;

        for (let value = first; value <= max + step * 1e-9 && ticks.length < 100; value += step) {
            ticks.push(Math.abs(value) < step * 1e-10 ? 0 : value);
        }

        return ticks;
    }

    function formatTick(value) {
        if (value !== 0 && (Math.abs(value) >= 1e5 || Math.abs(value) < 1e-3)) {
            return value.toExponential(1);
        }

        return Number(value.toPrecision(4)).toString();
    }

    function drawGraph(canvas, series, domain) {
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(320, bounds.width);
        const height = Math.max(260, bounds.height);
        const pixelRatio = Math.min(root.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);

        const context = canvas.getContext("2d");
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);

        const plot = {
            left: 62,
            right: width - 18,
            top: 18,
            bottom: height - 38
        };
        plot.width = plot.right - plot.left;
        plot.height = plot.bottom - plot.top;

        const sampleCount = Math.min(3000, Math.max(800, Math.round(plot.width * 2)));
        const plottedSeries = series.map(curve => {
            const points = sampleValues(
                curve.evaluate,
                curve.domain.min,
                curve.domain.max,
                sampleCount
            );

            return {
                ...curve,
                points,
                endpoints: [points[0], points[points.length - 1]]
                    .filter(point => point && point.y !== null),
                connectors: []
            };
        });
        const finiteValues = plottedSeries
            .flatMap(curve => curve.points)
            .filter(point => point.y !== null)
            .map(point => point.y)
            .sort((first, second) => first - second);
        const endpointValues = plottedSeries
            .flatMap(curve => curve.endpoints)
            .map(point => point.y);

        const quantileLow = finiteValues.length
            ? finiteValues[Math.floor((finiteValues.length - 1) * 0.01)]
            : -1;
        const quantileHigh = finiteValues.length
            ? finiteValues[Math.ceil((finiteValues.length - 1) * 0.99)]
            : 1;
        const low = endpointValues.length
            ? Math.min(quantileLow, ...endpointValues)
            : quantileLow;
        const high = endpointValues.length
            ? Math.max(quantileHigh, ...endpointValues)
            : quantileHigh;
        const spread = high - low;
        const padding = spread > 0 ? spread * 0.08 : Math.max(1, Math.abs(low) * 0.1);
        const yMin = Math.min(0, low - padding);
        const yMax = Math.max(0, high + padding);
        const safeYMin = yMin === yMax ? yMin - 1 : yMin;
        const safeYMax = yMin === yMax ? yMax + 1 : yMax;
        const xToPixel = x => plot.left + ((x - domain.min) / (domain.max - domain.min)) * plot.width;
        const yToPixel = y => plot.bottom - ((y - safeYMin) / (safeYMax - safeYMin)) * plot.height;
        const xTicks = tickValues(domain.min, domain.max, Math.max(4, Math.floor(plot.width / 90)));
        const yTicks = tickValues(safeYMin, safeYMax, Math.max(3, Math.floor(plot.height / 58)));

        plottedSeries.forEach(curve => {
            curve.connectors = findVerticalConnectors(
                curve.points,
                safeYMin,
                safeYMax
            );
        });

        context.font = "11px Arial, sans-serif";
        context.textBaseline = "middle";
        context.lineWidth = 1;
        context.strokeStyle = "#e5ebed";
        context.fillStyle = "#64747b";

        xTicks.forEach(value => {
            const x = xToPixel(value);
            context.beginPath();
            context.moveTo(x, plot.top);
            context.lineTo(x, plot.bottom);
            context.stroke();
            context.textAlign = "center";
            context.fillText(formatTick(value), x, plot.bottom + 17);
        });

        yTicks.forEach(value => {
            const y = yToPixel(value);
            context.beginPath();
            context.moveTo(plot.left, y);
            context.lineTo(plot.right, y);
            context.stroke();
            context.textAlign = "right";
            context.fillText(formatTick(value), plot.left - 9, y);
        });

        context.strokeStyle = "#52646c";
        context.lineWidth = 1.4;
        context.beginPath();
        const yAxisX = domain.min <= 0 && domain.max >= 0 ? xToPixel(0) : plot.left;
        const xAxisY = safeYMin <= 0 && safeYMax >= 0 ? yToPixel(0) : plot.bottom;
        context.moveTo(yAxisX, plot.top);
        context.lineTo(yAxisX, plot.bottom);
        context.moveTo(plot.left, xAxisY);
        context.lineTo(plot.right, xAxisY);
        context.stroke();

        context.save();
        context.beginPath();
        context.rect(plot.left, plot.top, plot.width, plot.height);
        context.clip();
        context.lineWidth = 2.25;
        context.lineJoin = "round";
        context.lineCap = "round";

        plottedSeries.forEach(curve => {
            context.strokeStyle = curve.color;
            context.beginPath();

            let started = false;
            let previousY = null;

            curve.points.forEach(point => {
                if (point.y === null) {
                    started = false;
                    previousY = null;
                    return;
                }

                const pixelY = yToPixel(point.y);

                if (pixelY < plot.top || pixelY > plot.bottom) {
                    started = false;
                    previousY = null;
                    return;
                }

                const pixelX = xToPixel(point.x);
                if (!started || Math.abs(pixelY - previousY) > plot.height * 0.65) {
                    context.moveTo(pixelX, pixelY);
                    started = true;
                } else {
                    context.lineTo(pixelX, pixelY);
                }

                previousY = pixelY;
            });

            context.stroke();

            if (curve.connectors.length) {
                context.strokeStyle = curve.color;
                context.lineWidth = 1.4;
                context.setLineDash([4, 3]);
                curve.connectors.forEach(connector => {
                    const x = xToPixel(connector.x);
                    context.beginPath();
                    context.moveTo(x, yToPixel(connector.yStart));
                    context.lineTo(x, yToPixel(connector.yEnd));
                    context.stroke();
                });
                context.setLineDash([]);
            }
        });

        context.restore();

        plottedSeries.forEach(curve => {
            curve.endpoints.forEach((point, index) => {
                const x = xToPixel(point.x);
                const y = yToPixel(point.y);

                context.beginPath();
                context.arc(x, y, 4, 0, Math.PI * 2);
                context.fillStyle = "#ffffff";
                context.fill();
                context.strokeStyle = curve.color;
                context.lineWidth = 2;
                context.stroke();

                const atStart = index === 0;
                const labelY = y - plot.top < 16
                    ? y + 13
                    : y - 8;
                context.font = "10px Arial, sans-serif";
                context.fillStyle = curve.color;
                context.textAlign = atStart ? "left" : "right";
                context.fillText(
                    `(${formatTick(point.x)}, ${formatTick(point.y)})`,
                    x + (atStart ? 7 : -7),
                    labelY
                );
            });
        });

        return {
            plot,
            domain,
            yMin: safeYMin,
            yMax: safeYMax,
            xTicks,
            yTicks,
            series: plottedSeries
        };
    }

    function close() {
        if (!backdrop) {
            return;
        }

        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        root.clearTimeout(inputTimer);
        root.removeEventListener("resize", redraw);
        backdrop.remove();
        backdrop = null;
        activePlot = null;

        if (returnFocus && returnFocus.isConnected) {
            returnFocus.focus();
        }

        returnFocus = null;
    }

    function redraw() {
        if (activePlot) {
            activePlot.update();
        }
    }

    function open(trigger) {
        if (backdrop) {
            return;
        }

        returnFocus = trigger || document.activeElement;
        backdrop = document.createElement("div");
        backdrop.className = "engg-plotter-backdrop";
        backdrop.innerHTML = `
            <section class="engg-plotter" role="dialog" aria-modal="true" aria-labelledby="enggPlotterTitle">
                <header class="engg-plotter-header">
                    <div><h2 id="enggPlotterTitle">Graph Plotter</h2></div>
                    <button class="engg-plotter-close" type="button" aria-label="Close plotter">&times;</button>
                </header>
                <div class="engg-plotter-body">
                    <aside class="engg-plotter-sidebar" aria-label="Functions">
                        <div class="engg-plotter-sidebar-header">
                            <h3>Functions</h3>
                            <button class="engg-plotter-add" type="button">+ Add function</button>
                        </div>
                        <div class="engg-plotter-function-list"></div>
                    </aside>
                    <div class="engg-plotter-stage">
                        <canvas class="engg-plotter-canvas" aria-label="Function graph with coordinate axes"></canvas>
                    </div>
                </div>
                <footer class="engg-plotter-footer">
                    <output class="engg-plotter-status" aria-live="polite"></output>
                    <span class="engg-plotter-coordinate" aria-live="off"></span>
                    <button class="engg-plotter-insert" type="button" disabled>Add to drawing</button>
                </footer>
            </section>
        `;

        document.body.appendChild(backdrop);

        const dialog = backdrop.querySelector(".engg-plotter");
        const functionList = backdrop.querySelector(".engg-plotter-function-list");
        const canvas = backdrop.querySelector(".engg-plotter-canvas");
        const status = backdrop.querySelector(".engg-plotter-status");
        const coordinate = backdrop.querySelector(".engg-plotter-coordinate");
        const insertButton = backdrop.querySelector(".engg-plotter-insert");
        let graphTransform = null;

        const update = () => {
            const rows = Array.from(functionList.children);
            const plottedSeries = [];
            const validDomains = [];

            rows.forEach((row, index) => {
                const equation = row.querySelector(".engg-plotter-equation");
                const minimum = row.querySelector(".engg-plotter-min");
                const maximum = row.querySelector(".engg-plotter-max");
                const error = row.querySelector(".engg-plotter-function-error");
                const color = plotColors[index % plotColors.length];
                row.style.setProperty("--plot-color", color);
                row.querySelector(".engg-plotter-function-label").textContent = `f${index + 1}(x) =`;
                row.querySelector(".engg-plotter-remove").disabled = rows.length === 1;

                try {
                    const domain = validateDomain(minimum.value, maximum.value);
                    validDomains.push(domain);
                    const evaluate = compileExpression(equation.value);
                    if (!sampleValues(evaluate, domain.min, domain.max, 32).some(point => point.y !== null)) {
                        throw new Error("No real values to plot in this domain");
                    }

                    plottedSeries.push({
                        evaluate,
                        domain,
                        color,
                        expression: equation.value.trim()
                    });
                    error.textContent = "";
                    row.classList.remove("invalid");
                } catch (plotError) {
                    error.textContent = plotError.message;
                    row.classList.add("invalid");
                }
            });

            const domainSource = plottedSeries.length
                ? plottedSeries.map(curve => curve.domain)
                : validDomains;
            const domain = combinedDomain(domainSource);

            graphTransform = drawGraph(canvas, plottedSeries, domain);
            const invalidCount = rows.length - plottedSeries.length;
            status.textContent = plottedSeries.length
                ? `${plottedSeries.length} function${plottedSeries.length === 1 ? "" : "s"} plotted${invalidCount ? ` · ${invalidCount} needs attention` : ""}`
                : "Enter a valid equation and domain to plot";
            status.classList.toggle("error", plottedSeries.length === 0);
            insertButton.disabled = plottedSeries.length === 0;
        };

        activePlot = { update };
        const addFunction = (expression = "", min = "0", max = "10") => {
            const row = document.createElement("section");
            row.className = "engg-plotter-function";
            row.innerHTML = `
                <div class="engg-plotter-function-formula">
                    <span class="engg-plotter-swatch" aria-hidden="true"></span>
                    <label class="engg-plotter-function-label"></label>
                    <input class="engg-plotter-equation" type="text" autocomplete="off" spellcheck="false" aria-label="Function equation" placeholder="e.g. sin(x)">
                    <button class="engg-plotter-remove" type="button" aria-label="Remove function" title="Remove function">&times;</button>
                </div>
                <div class="engg-plotter-domain-row">
                    <span>Domain</span>
                    <input class="engg-plotter-min" type="number" step="any" aria-label="Domain lower bound" placeholder="a">
                    <span class="engg-plotter-inequality">&lt; x &lt;</span>
                    <input class="engg-plotter-max" type="number" step="any" aria-label="Domain upper bound" placeholder="b">
                </div>
                <output class="engg-plotter-function-error" aria-live="polite"></output>
            `;
            row.querySelector(".engg-plotter-equation").value = expression;
            row.querySelector(".engg-plotter-min").value = min;
            row.querySelector(".engg-plotter-max").value = max;
            functionList.appendChild(row);

            row.querySelectorAll("input").forEach(input => {
                input.addEventListener("input", () => {
                    root.clearTimeout(inputTimer);
                    inputTimer = root.setTimeout(update, 90);
                });
            });
            row.querySelector(".engg-plotter-remove").addEventListener("click", () => {
                if (functionList.children.length > 1) {
                    row.remove();
                    update();
                }
            });

            update();
            row.querySelector(".engg-plotter-equation").focus();
        };

        backdrop.querySelector(".engg-plotter-add").addEventListener("click", () => addFunction());
        insertButton.addEventListener("click", () => {
            activePlot.update();

            if (!graphTransform?.series.length) {
                return;
            }

            if (!graphTransform || typeof root.enggInsertGraphPlot !== "function") {
                status.textContent = "Could not add the plot to the drawing";
                status.classList.add("error");
                return;
            }

            const plot = createDrawingSnapshot(graphTransform);

            if (root.enggInsertGraphPlot(plot)) {
                close();
            } else {
                status.textContent = "Could not add the plot to the drawing";
                status.classList.add("error");
            }
        });

        backdrop.querySelector(".engg-plotter-close").addEventListener("click", close);
        backdrop.addEventListener("click", event => {
            if (event.target === backdrop) {
                close();
            }
        });
        dialog.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                close();
            }
        });
        canvas.addEventListener("mousemove", event => {
            if (!graphTransform) {
                coordinate.textContent = "";
                return;
            }

            const bounds = canvas.getBoundingClientRect();
            const ratioX = (event.clientX - bounds.left - graphTransform.plot.left) / graphTransform.plot.width;
            const ratioY = (event.clientY - bounds.top - graphTransform.plot.top) / graphTransform.plot.height;
            const x = graphTransform.domain.min + ratioX * (graphTransform.domain.max - graphTransform.domain.min);
            const y = graphTransform.yMax - ratioY * (graphTransform.yMax - graphTransform.yMin);
            coordinate.textContent = `x ${formatTick(x)}   y ${formatTick(y)}`;
        });
        canvas.addEventListener("mouseleave", () => {
            coordinate.textContent = "";
        });

        if (typeof root.ResizeObserver === "function") {
            resizeObserver = new root.ResizeObserver(redraw);
            resizeObserver.observe(canvas.parentElement);
        }

        root.addEventListener("resize", redraw);
        addFunction("x^2");
    }

    const api = {
        compileExpression,
        validateDomain,
        sampleValues,
        combinedDomain,
        boundsOfObjects,
        findVerticalConnectors,
        createDrawingSnapshot,
        open,
        close
    };
    root.enggGraphPlotter = api;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof window !== "undefined" ? window : globalThis);