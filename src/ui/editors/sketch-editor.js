/* SVG renderer for the engineering drawing workspace. */
/*
 * ========================================================
 * THE SKETCH EDITOR
 * ========================================================
 *
 * The other half of the Analysis Editor. A Plot is entered as equations
 * and a Sketch is drawn by hand, and both are reached from the same place
 * - openAnalysisEditorFor - so a student who placed an SFD and a BMD works
 * the same dialog either way, in the mode their feature was created in.
 *
 * FOUR TOOLS, AND ONLY FOUR
 * ------------------------
 *
 * Select, Straight Line, Curve, Erase.
 *
 * The general Geometry toolbar is deliberately NOT offered here. It is
 * built for a drawing sheet, where a rectangle or a construction line is a
 * normal thing to want. Here the student is sketching the SHAPE of one
 * diagram, and offering them forty tools to do it makes the obvious one
 * harder to find. Everything the sketch needs - two points and a pen - is
 * on those four buttons, and a Rectangle would be a Line with one more
 * click.
 *
 * DRAWING IS ENGINEERING, NOT PIXELS
 * ---------------------------------
 *
 * A point is stored as an engineering (x, y) in the graph's own
 * coordinate system - x being the source body's longitudinal station, and
 * y the value on the vertical axis. The screen mapping happens once, when
 * the graph is drawn. A sketch made at one zoom therefore reads identically
 * at another, which is the only way it can be measured later.
 *
 * THE STUDENT NEVER TYPES A COORDINATE.
 *
 * They click, and the click is resolved through the same scale the
 * axes are drawn with. Exact values are still available - on the element
 * list, once something is selected - but they are a way of checking the
 * work, not a way of doing it. Asking someone to type "x = 250" to place
 * a point at 250 is a way of making the graph harder to use than it needs
 * to be.
 *
 * A VERTICAL LINE IS JUST A LINE.
 *
 * There is no Vertical Jump tool. A Straight Line whose ends share an x is
 * a vertical line, and it is stored as one, so nothing has to convert it
 * afterwards and there is no second thing to get wrong.
 *
 * APPLY IS ONE HISTORY STEP.
 *
 * Nothing here touches the document until Apply. The preview callback
 * shows the work on the sheet while it is being done, exactly as the Plot
 * editor does, so Cancel genuinely cancels.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

/*
 * The drawing frame. The same numbers the Plot editor uses, so the two
 * modes are literally the same size and the student does not have to
 * re-learn where things are when they switch between them.
 */
const WIDTH = 560;
const HEIGHT = 260;
const PAD = 18;

const TOOLS = [
  { id: "select", label: "Select", hint: "Click an element to select it" },
  { id: "line", label: "Straight Line", hint: "Click start, then end" },
  { id: "curve", label: "Curve", hint: "Click points, then press Enter or double-click to finish" },
  { id: "erase", label: "Erase", hint: "Click an element to remove it" },
];

let openDialog = null;
let closeCurrent = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*
 * A stable id for a new element.
 *
 * NOT the array position. An element identified by where it happens to
 * sit in a list cannot be renamed, re-selected or referenced after
 * anything above it is deleted - which is what makes "the wrong element
 * got deleted" possible at all.
 */
function newId(sequence) {
  return `sketch-${sequence}`;
}

function numberText(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return String(Math.round(value * 1000) / 1000);
}

/*
 * ENGINEERING <-> SCREEN.
 *
 * One function, used by everything that draws and everything that reads
 * a click, so the two can never disagree. The y scale is the SAME
 * `unitHeight` the Plot editor uses, which is the peak of the diagram:
 * a sketch of a shear diagram therefore sits in the same box a plotted
 * one would, and switching modes does not make the drawing jump.
 */
function makeScale(range, elements) {
  const from = Number(range?.from) || 0;
  const to = Number(range?.to) || 1;
  const span = to - from || 1;

  const plotWidth = WIDTH - PAD * 2;
  const plotHeight = HEIGHT - PAD * 2 - 14;
  const centre = PAD + plotHeight / 2;

  /*
   * The vertical scale follows the CONTENT, not the user's zoom, and it
   * is padded to a whole number of units either side so a diagram that
   * touches the top does not touch the frame. A sketch that has not been
   * started gets the Plot editor's default rather than a range of zero,
   * because a y-axis with no extent cannot be drawn against.
   */
  let peak = 0;

  elements.forEach((element) => {
    pointsOf(element).forEach((point) => {
      if (Number.isFinite(point.y)) {
        peak = Math.max(peak, Math.abs(point.y));
      }
    });
  });

  const unitHeight =
    peak > 0
      ? peak * 1.2
      : Math.max(span * 0.16, 1);

  const halfHeight = (plotHeight / 2) * 0.92;

  return {
    toScreen(point) {
      return {
        x: PAD + ((point.x - from) / span) * plotWidth,
        y: centre - (point.y / unitHeight) * halfHeight,
      };
    },
    fromScreen(screen) {
      return {
        x: from + ((screen.x - PAD) / plotWidth) * span,
        y: ((centre - screen.y) / halfHeight) * unitHeight,
      };
    },
    unitHeight,
  };
}

/*
 * The points an element is drawn through.
 *
 * A LINE has two and a CURVE has as many as were clicked. Reading them
 * through one function means the scale above does not have to know which
 * kind of element it is looking at, and adding a kind later touches one
 * place.
 */
function pointsOf(element) {
  if (!element) {
    return [];
  }

  return element.kind === "line"
    ? [element.start, element.end]
    : Array.isArray(element.points)
      ? element.points
      : [];
}

/*
 * THE GRAPH.
 *
 * The same axes the Plot editor draws, plus the sketch on top. Sharing
 * the shape rather than reimplementing it is what stops the two modes
 * from looking like two different applications.
 */
function drawGraph(svg, elements, range, options) {
  if (!svg) {
    return null;
  }

  const selectedId = options?.selectedId || null;
  const scale = makeScale(range, elements);
  const zeroY = scale.toScreen({ x: 0, y: 0 }).y;

  const parts = [`
      <line class="sketch-editor-axis"
        x1="${PAD}" y1="${zeroY}" x2="${WIDTH - PAD}" y2="${zeroY}"/>
    `];

  elements.forEach((element) => {
    const pts = pointsOf(element);

    if (pts.length < 2) {
      return;
    }

    const screen = pts.map((p) => scale.toScreen(p));
    const selected = element.id === selectedId;
    const cls = selected
      ? "sketch-editor-stroke sketch-editor-stroke-selected"
      : "sketch-editor-stroke";

    if (element.kind === "line") {
      parts.push(`
          <line class="${cls}"
            x1="${screen[0].x}" y1="${screen[0].y}"
            x2="${screen[1].x}" y2="${screen[1].y}"/>
        `);
      return;
    }

    /*
     * A CURVE IS ONE ELEMENT WITH MANY POINTS, NOT MANY LINES.
     *
     * Drawn as a quadratic through the midpoints of consecutive control
     * points rather than through the points themselves: that passes
     * through none of them, so the student cannot tell where the shape
     * they drew ended and the curve began. A Catmull-Rom spline would
     * pass through them and overshoot sharply between them - the
     * characteristic overshoot that makes an auto-smoothed curve look
     * wrong on the very shape it was drawn for.
     */
    const d = [`M ${screen[0].x} ${screen[0].y}`];

    for (let i = 1; i < screen.length - 1; i++) {
      const mid = {
        x: (screen[i].x + screen[i + 1].x) / 2,
        y: (screen[i].y + screen[i + 1].y) / 2,
      };

      d.push(`Q ${screen[i].x} ${screen[i].y} ${mid.x} ${mid.y}`);
    }

    const last = screen[screen.length - 1];

    d.push(`L ${last.x} ${last.y}`);

    parts.push(`<path class="${cls}" d="${d.join(" ")}"/>`);
  });

  /*
   * THE PEN IN PROGRESS.
   *
   * Drawn while the student is mid-stroke, so the shape they are about
   * to get is visible before they commit to it. Without this, a curve
   * of four points shows only the first two until it is finished, and
   * there is no way to see that a click landed where they meant.
   */
  const pending = options?.pending || null;

  if (pending && pending.points.length) {
    const screen = pending.points.map((p) => scale.toScreen(p));

    if (screen.length === 1) {
      parts.push(
        `<circle class="sketch-editor-cursor-point"
            cx="${screen[0].x}" cy="${screen[0].y}" r="3"/>`,
      );
    } else {
      parts.push(`
          <path class="sketch-editor-pending" d="M ${screen
            .map((p) => `${p.x} ${p.y}`)
            .join(" L ")}"/>
        `);
    }
  }

  parts.push(`
      <text x="${PAD}" y="${HEIGHT - 5}" class="sketch-editor-label">
        ${escapeHtml(numberText(Number(range?.from) || 0))}
      </text>
      <text x="${WIDTH - PAD}" y="${HEIGHT - 5}"
        class="sketch-editor-label" text-anchor="end">
        ${escapeHtml(numberText(Number(range?.to) || 0))}
      </text>
    `);

  svg.innerHTML = parts.join("");

  return scale;
}

/*
 * HOW NEAR IS THIS CLICK TO THAT ELEMENT?
 *
 * In SCREEN pixels, because what the student is aiming at is what they
 * can see. The comparison is made after projection so it respects the
 * current scale - a point that is visually on the line is on the line.
 */
function distanceToElement(screen, element, scale) {
  const pts = pointsOf(element).map((p) => scale.toScreen(p));

  if (pts.length < 2) {
    return pts.length === 1
      ? Math.hypot(
          screen.x - pts[0].x,
          screen.y - pts[0].y,
        )
      : Infinity;
  }

  let best = Infinity;

  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(
      best,
      distanceToSegment(screen, pts[i], pts[i + 1]),
    );
  }

  return best;
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;

  t = Math.max(0, Math.min(1, t));

  return Math.hypot(
    p.x - (a.x + t * dx),
    p.y - (a.y + t * dy),
  );
}

function elementAt(screen, elements, scale) {
  let best = null;
  let bestDistance = Infinity;

  elements.forEach((element) => {
    const distance = distanceToElement(screen, element, scale);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = element;
    }
  });

  /*
   * A tolerance, so a click near an element selects it. It is a
   * SCREEN distance on purpose: the student is aiming with a mouse at
   * something they can see, and a tolerance expressed in millimetres
   * would be far too tight at one zoom and far too loose at another.
   */
  return bestDistance <= 8 ? best : null;
}

function pointFromEvent(event, svg, scale) {
  const rect = svg.getBoundingClientRect
    ? svg.getBoundingClientRect()
    : { left: 0, top: 0 };

  return scale.fromScreen({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  });
}

function elementRowHtml(element, selectedId) {
  const pts = pointsOf(element);

  const label =
    element.kind === "line"
      ? `Line ${numberText(element.start.x)}, ${numberText(element.start.y)} to ${numberText(element.end.x)}, ${numberText(element.end.y)}`
      : `Curve (${pts.length} points)`;

  const cls =
    element.id === selectedId
      ? "sketch-editor-element sketch-editor-element-selected"
      : "sketch-editor-element";

  return `
      <div class="${cls}" data-sketch-element="${escapeHtml(element.id)}">
        <button type="button" class="sketch-editor-element-label"
            data-sketch-select="${escapeHtml(element.id)}">
            ${escapeHtml(label)}
        </button>

        <button type="button" class="sketch-editor-element-delete"
            data-sketch-delete="${escapeHtml(element.id)}"
            aria-label="Delete element">&times;</button>
      </div>
    `;
}

/*
 * THE EXACT COORDINATES OF A SELECTION.
 *
 * Available once something is selected, and never while drawing. The
 * student draws by clicking; this is how they CHECK what they drew, and
 * how they put it exactly right when the click was a few pixels out.
 */
function detailHtml(element) {
  if (!element) {
    return `
        <div class="sketch-editor-detail">
            Select an element to see its exact coordinates.
        </div>
      `;
  }

  const rows = pointsOf(element)
    .map(
      (point, index) => `
          <label class="sketch-editor-point">
            <span>P${index + 1}</span>
            <input type="number" step="any"
                data-sketch-point="${index}"
                data-sketch-axis="x" value="${numberText(point.x)}"/>
            <input type="number" step="any"
                data-sketch-point="${index}"
                data-sketch-axis="y" value="${numberText(point.y)}"/>
          </label>
        `,
    )
    .join("");

  return `
      <div class="sketch-editor-detail">
        <div class="sketch-editor-detail-title">
          ${escapeHtml(element.kind === "line" ? "Straight Line" : "Curve")}
        </div>
        ${rows}
      </div>
    `;
}

function open(options = {}) {
  close();

  const range = options.range || null;

  /*
   * A COPY of the elements, edited here. The feature is not touched
   * until Apply, so Cancel is genuinely Cancel rather than a request to
   * put everything back afterwards.
   */
  let elements = JSON.parse(
    JSON.stringify(options.elements || []),
  );

  let tool = options.tool || "line";
  let selectedId = null;
  let pending = null;
  let sequence = elements.length;

  const dialog = document.createElement("div");

  dialog.className = "drawing-plot-editor sketch-editor";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute(
    "aria-label",
    options.title || "Sketch Editor",
  );

  dialog.innerHTML = `
      <div class="plot-editor">
        <div class="plot-editor-header">
          <div class="plot-editor-title">
            ${escapeHtml(options.title || "Sketch")}
          </div>

          <button type="button" class="plot-editor-close"
              data-sketch-cancel aria-label="Close the sketch editor">
            &times;
          </button>
        </div>

        <div class="plot-editor-body">
          <div class="plot-editor-left">
            <div class="plot-editor-section">TOOLS</div>

            <div class="sketch-editor-tools" data-sketch-tools>
              ${TOOLS.map(
                (entry) => `
                  <button type="button"
                      class="sketch-editor-tool"
                      data-sketch-tool="${escapeHtml(entry.id)}">
                      ${escapeHtml(entry.label)}
                  </button>
                `,
              ).join("")}
            </div>

            <div class="sketch-editor-hint" data-sketch-hint></div>

            <div class="plot-editor-section">ELEMENTS</div>

            <div class="sketch-editor-list" data-sketch-list></div>

            <div data-sketch-detail></div>
          </div>

          <div class="plot-editor-right">
            <div class="plot-editor-section">GRAPH</div>

            <svg class="sketch-editor-graph" data-sketch-graph
                viewBox="0 0 ${WIDTH} ${HEIGHT}"
                preserveAspectRatio="xMidYMid meet"></svg>
          </div>
        </div>

        <div class="plot-editor-actions">
          <button type="button" data-sketch-cancel>Cancel</button>

          <button type="button" class="primary" data-sketch-apply>
            Apply
          </button>
        </div>
      </div>
    `;

  document.body.appendChild(dialog);

  const list = dialog.querySelector("[data-sketch-list]");
  const detail = dialog.querySelector("[data-sketch-detail]");
  const svg = dialog.querySelector("[data-sketch-graph]");
  const tools = dialog.querySelector("[data-sketch-tools]");
  const hint = dialog.querySelector("[data-sketch-hint]");

  let scale = makeScale(range, elements);

  function selected() {
    return elements.find((entry) => entry.id === selectedId) || null;
  }

  function redraw() {
    scale = drawGraph(svg, elements, range, {
      selectedId,
      pending,
    });

    list.innerHTML = elements.length
      ? elements
          .map((element) => elementRowHtml(element, selectedId))
          .join("")
      : `<div class="sketch-editor-empty">Nothing drawn yet</div>`;

    detail.innerHTML = detailHtml(selected());

    tools
      .querySelectorAll("[data-sketch-tool]")
      .forEach((button) => {
        button.classList.toggle(
          "sketch-editor-tool-active",
          button.dataset.sketchTool === tool,
        );
      });

    const def = TOOLS.find((entry) => entry.id === tool);

    let message = def?.hint || "";

    if (pending?.points.length) {
      message = `${pending.points.length} point(s) placed - press Enter to finish`;
    }

    hint.textContent = message;

    options.onPreview?.(elements);
  }

  tools.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sketch-tool]");

    if (!button) {
      return;
    }

    tool = button.dataset.sketchTool;

    /*
     * Switching tool abandons a half-drawn stroke. Leaving the points
     * in place would mean they silently survive as an element the
     * student never finished, which is not a state they asked for.
     */
    pending = null;

    redraw();
  });

  /*
   * DRAWING ON THE GRAPH.
   *
   * The pointer position is converted through the SAME scale the axes
   * were drawn with, so what is stored is engineering geometry and not a
   * pixel that happens to look right at the current zoom.
   */
  svg.addEventListener("click", (event) => {
    const point = pointFromEvent(event, svg, scale);

    if (tool === "select") {
      const hit = elementAt(
        pointFromEvent(event, svg, {
          fromScreen: (screen) => screen,
        }),
        elements,
        scale,
      );

      selectedId = hit ? hit.id : null;

      redraw();

      return;
    }

    if (tool === "erase") {
      const hit = elementAt(
        pointFromEvent(event, svg, {
          fromScreen: (screen) => screen,
        }),
        elements,
        scale,
      );

      if (hit) {
        elements = elements.filter((entry) => entry.id !== hit.id);

        if (selectedId === hit.id) {
          selectedId = null;
        }
      }

      redraw();

      return;
    }

    if (tool === "line") {
      const start = pending?.points?.[0];

      if (!start) {
        pending = { kind: "line", points: [point] };

        redraw();

        return;
      }

      elements.push({
        id: newId(++sequence),
        kind: "line",
        start,
        end: point,
      });

      pending = null;

      selectedId = null;

      redraw();

      return;
    }

    if (tool === "curve") {
      if (!pending) {
        pending = { kind: "curve", points: [point] };

        redraw();

        return;
      }

      pending.points.push(point);

      /*
       * TWO POINTS IS ALREADY A SHAPE. Waiting for a third would mean the
       * student cannot draw the simplest thing - a sloped line they want
       * to look curved - without having to press a key they were never
       * told about.
       */
      if (pending.points.length === 2) {
        elements.push({
          id: newId(++sequence),
          kind: "curve",
          points: pending.points.slice(),
        });

        pending = null;
      }

      redraw();
    }
  });

  svg.addEventListener("dblclick", (event) => {
    event.preventDefault();

    if (pending?.points.length >= 2) {
      elements.push({
        id: newId(++sequence),
        kind: pending.kind,
        points: pending.points.slice(),
      });
    }

    pending = null;

    redraw();
  });

  /*
   * FINISHING A CURVE.
   *
   * Enter completes what has been drawn so far. A stroke of one point is
   * discarded: a curve needs two, and leaving it behind would put an
   * element on the diagram that draws nothing.
   */
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && pending) {
      event.preventDefault();

      if (pending.points.length >= 2) {
        elements.push({
          id: newId(++sequence),
          kind: pending.kind,
          points: pending.points.slice(),
        });
      }

      pending = null;

      redraw();

      return;
    }

    if (event.key === "Escape") {
      /*
       * Escape FIRST abandons the stroke in progress, and only closes
       * the editor if there was nothing in progress. Otherwise every
       * mistyped Escape would throw away the whole dialog rather than
       * the one unfinished line.
       */
      if (pending) {
        pending = null;

        redraw();

        return;
      }

      event.preventDefault();

      cancel();
    }
  });

  list.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-sketch-delete]");

    if (remove) {
      const id = remove.dataset.sketchDelete;

      elements = elements.filter((entry) => entry.id !== id);

      if (selectedId === id) {
        selectedId = null;
      }

      redraw();

      return;
    }

    const pick = event.target.closest("[data-sketch-select]");

    if (pick) {
      selectedId = pick.dataset.sketchSelect;

      redraw();
    }
  });

  detail.addEventListener("input", (event) => {
    const input = event.target.closest("[data-sketch-point]");

    if (!input) {
      return;
    }

    const element = selected();

    if (!element) {
      return;
    }

    const index = Number(input.dataset.sketchPoint);
    const value = Number(input.value);

    if (!Number.isFinite(value)) {
      return;
    }

    const point =
      element.kind === "line"
        ? [element.start, element.end][index]
        : element.points?.[index];

    if (!point) {
      return;
    }

    if (input.dataset.sketchAxis === "x") {
      point.x = value;
    } else {
      point.y = value;
    }

    redraw();
  });

  const cancel = () => {
    close();

    options.onCancel?.();
  };

  dialog
    .querySelector("[data-sketch-apply]")
    .addEventListener("click", () => {
      const committed = JSON.parse(JSON.stringify(elements));

      close();

      options.onApply?.(committed);
    });

  dialog
    .querySelectorAll("[data-sketch-cancel]")
    .forEach((button) => button.addEventListener("click", cancel));

  openDialog = dialog;
  closeCurrent = cancel;

  redraw();

  dialog.querySelector(".plot-editor-close")?.focus();

  return dialog;
}

function close() {
  if (openDialog) {
    openDialog.remove();
    openDialog = null;
  }

  closeCurrent = null;
}

function isOpen() {
  return openDialog !== null;
}

function handleEscape() {
  if (!openDialog) {
    return false;
  }

  closeCurrent?.();

  return true;
}

const enggSketchEditor = {
  TOOLS,
  close,
  distanceToElement,
  handleEscape,
  isOpen,
  makeScale,
  open,
  pointsOf,
};

export default enggSketchEditor;
