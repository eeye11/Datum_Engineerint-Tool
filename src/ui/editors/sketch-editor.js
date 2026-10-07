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
 * The drawing frame.
 *
 * WIDER AND TALLER THAN THE PLOT EDITOR'S, because a sketch is read as a
 * SHAPE and the graph is its main workspace. The rectangle the axes are drawn
 * into is what the student actually reads, so making the dialog bigger without
 * making this bigger would only enlarge the frame around an unchanged graph.
 */
const WIDTH = 900;
const HEIGHT = 320;
const PAD = 18;

const TOOLS = [
  { id: "select", label: "Select", hint: "Click an element to select it" },
  {
    id: "line",
    label: "Straight Line",
    hint: "Drag from the start to the end, then release",
  },
  {
    id: "curve",
    label: "Curve",
    hint: "Drag in three goes: Start, then Bend, then End",
  },
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
 * ========================================================
 * BUILD ONE CURVE FROM THREE POINTS
 * ========================================================
 *
 * The whole curve vocabulary in one function. Start and End are the ends of
 * the drawn curve; Bend is the control point that says how far and which way
 * it bows:
 *
 *   Bend on the Start-End line          -> a straight-ish segment
 *   Bend above it                       -> a rise into a peak
 *   Bend below it                       -> a fall into a trough
 *   Bend to one side of a rise          -> concave up or concave down
 *
 * There is deliberately no per-shape tool. The student places three points,
 * and the renderer draws a quadratic whose control IS the Bend - which gives
 * every one of increasing, decreasing, extremal and concave shapes from the
 * one tool.
 */
function buildThreePointCurve(id, start, bend, end) {
  return {
    id,
    kind: "curve3",
    start: { x: start.x, y: start.y },
    bend: { x: bend.x, y: bend.y },
    end: { x: end.x, y: end.y },
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

  /*
   * A THREE-POINT CURVE reports Start, Bend and End. The Bend is included so
   * the vertical scale makes room for the bulge it describes - a peak drawn
   * by bending would otherwise run off the top of the graph.
   */
  if (element.kind === "curve3") {
    return [element.start, element.bend, element.end].filter(
      (point) => point && Number.isFinite(point.x),
    );
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

  /*
   * ========================================================
   * THE TICKS ARE THE BODY'S OWN ELEMENT LOCATIONS
   * ========================================================
   *
   * A diagram changes shape where something happens on the body - under a
   * point force, at a support, where a load starts. Those places are the
   * structural positions of the diagram, so the ticks along the graph are the
   * BODY'S ELEMENT LOCATIONS, not evenly spaced graph-paper marks.
   *
   * They are derived, not stored: the caller passes the same station list the
   * analysis layer already computes from the source body every pass, so a
   * force that moves slides its tick with it, a deleted support takes its
   * tick away, and a new load grows one - with nothing to rebuild and no
   * second list to fall out of step.
   *
   * Each tick is drawn the full height of the plot so the vertical line reads
   * as "something is at this station", and the horizontal axis keeps the same
   * relationship to the body axis the diagram itself uses.
   */
  const stations = Array.isArray(options?.stations) ? options.stations : [];

  stations.forEach(station => {
    const x = Number(station?.position?.x);

    if (!Number.isFinite(x)) {
      return;
    }

    const screenX = scale.toScreen({ x, y: 0 }).x;

    parts.push(`
        <line class="sketch-editor-tick"
          x1="${screenX}" y1="${PAD}"
          x2="${screenX}" y2="${HEIGHT - PAD - 14}"/>
      `);
  });

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
     * ========================================================
     * A THREE-POINT CURVE: START -> BEND -> END
     * ========================================================
     *
     * ONE smooth curve from three meaningful points. The Start and End are the
     * curve's ends; the Bend is a CONTROL point that says how far and which way
     * the curve bows, and it is drawn as a quadratic whose control is the Bend
     * itself - so pulling the Bend out makes the bow stronger, and putting it
     * above or below the Start-End line turns the same tool into a peak or a
     * trough.
     *
     * The Bend is a control point, not a vertex of the result: the drawn curve
     * passes through the Start and the End and is pulled toward the Bend, which
     * is what makes one tool cover increasing, decreasing, concave and extremal
     * shapes without a separate tool for each.
     */
    if (element.kind === "curve3") {
      const s = scale.toScreen(element.start);
      const b = scale.toScreen(element.bend || element.start);
      const e = scale.toScreen(element.end);

      parts.push(`
          <path class="${cls}"
            d="M ${s.x} ${s.y} Q ${b.x} ${b.y} ${e.x} ${e.y}"/>
        `);

      /*
       * THE BEND HANDLE, SHOWN ONLY WHILE SELECTED. It is a control point, so
       * it is an editing aid rather than part of the diagram - the finished
       * result is the smooth curve alone.
       */
      if (selected) {
        parts.push(`
            <circle class="sketch-editor-bend-handle"
              cx="${b.x}" cy="${b.y}" r="3.5"/>
          `);
      }

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

/*
 * ========================================================
 * ASK FOR THE EXACT Y VALUE OF A PLACED POINT
 * ========================================================
 *
 * The cursor decides WHERE on the sheet the point sits - which station along
 * the body, and roughly how high - but the ordinate is an ENGINEERING VALUE,
 * and asking the student to hit 250 kN by eye is asking them to aim at a
 * number. So the placement gives the position and this gives the number.
 *
 * The unit is the graph's own: a shear diagram is kN, a moment diagram kN·m.
 * It is passed in, because it belongs to the QUANTITY rather than to the
 * editor.
 *
 * Returning the number, or null when the student cancels, keeps the caller in
 * charge of the model: this only asks a question.
 */
function askForYValue({ label, value, unit, onCommit, onCancel }) {
  const host = document.createElement("div");

  host.className = "drawing-creation-dimension sketch-editor-y-popup";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-label", label);

  host.innerHTML = `
      <div class="drawing-creation-dimension-title">${escapeHtml(label)}</div>
      <div class="drawing-creation-dimension-body">
        <span class="drawing-creation-dimension-label">Y Value</span>
        <span class="drawing-creation-dimension-input-wrap">
          <input type="text" class="drawing-creation-dimension-input"
              data-y-input inputmode="decimal" autocomplete="off"
              aria-label="Y value">
          <span class="drawing-creation-dimension-unit">${escapeHtml(
            unit || "",
          )}</span>
        </span>
      </div>
    `;

  document.body.appendChild(host);

  const input = host.querySelector("[data-y-input]");

  input.value = Number.isFinite(Number(value)) ? String(value) : "";

  input.focus();
  input.select();

  const close = () => host.remove();

  const confirm = () => {
    const parsed = Number(input.value);

    if (!Number.isFinite(parsed)) {
      input.focus();
      return;
    }

    close();
    onCommit(parsed);
  };

  /*
   * ENTER CONFIRMS FROM ANYWHERE IN THE POPUP, and Escape abandons it - the
   * same two keys every other value popup in the application uses.
   */
  host.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      confirm();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      onCancel();
    }
  });

  return host;
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

/*
 * ========================================================
 * SNAP THE X ONTO A BODY-ELEMENT TICK
 * ========================================================
 *
 * A diagram changes shape where something happens on the body - under a point
 * force, at a support, where a load starts - so those are the positions worth
 * landing on, and the graph's ticks mark them.
 *
 * The snap is a MAGNET, NOT A WALL: only a point within a few pixels of a
 * tick is pulled onto it, so the student can still place an element anywhere
 * BETWEEN two events. A snap that captured the whole gap would make the middle
 * of every span unreachable, which is the opposite of what a diagram needs -
 * the interesting part of a curve is usually between the ticks.
 *
 * The tolerance is in SCREEN pixels, so the magnet feels the same at any zoom,
 * and it is converted to the graph's own units through the scale.
 */
const SNAP_TOLERANCE_PX = 8;

function snapXToStations(x, stations, scale, range) {
  if (!Array.isArray(stations) || !stations.length) {
    return x;
  }

  const span = (Number(range?.to) || 1) - (Number(range?.from) || 0) || 1;

  const plotWidth = WIDTH - PAD * 2;

  /* One screen pixel, in the graph's x units. */
  const unitsPerPixel = span / plotWidth;

  const tolerance = SNAP_TOLERANCE_PX * unitsPerPixel;

  let best = x;
  let bestDistance = tolerance;

  stations.forEach(station => {
    const sx = Number(station?.position?.x);

    if (!Number.isFinite(sx)) {
      return;
    }

    const distance = Math.abs(sx - x);

    if (distance <= bestDistance) {
      bestDistance = distance;
      best = sx;
    }
  });

  void scale;

  return best;
}

function elementRowHtml(element, selectedId) {
  const pts = pointsOf(element);

  const label =
    element.kind === "line"
      ? `Line ${numberText(element.start.x)}, ${numberText(element.start.y)} to ${numberText(element.end.x)}, ${numberText(element.end.y)}`
      : element.kind === "curve3"
        ? `Curve ${numberText(element.start.x)} to ${numberText(element.end.x)}`
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
   * THE BODY'S ELEMENT STATIONS, read once from the caller's live list.
   * Each carries the world x of an element on the parent body, which is what
   * the graph's ticks mark.
   */
  const stations = Array.isArray(options.stations)
    ? options.stations
    : [];

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
          <!--
            THE GRAPH COMES FIRST, AND ACROSS THE FULL WIDTH.

            A diagram is a SHAPE, and reading a shape is what the graph is
            for - so it takes the whole width of the workspace rather than
            sharing a row with the controls. The tools and the element's
            properties sit BELOW it, where they are reached for only when
            something is being placed or changed.
          -->
          <div class="sketch-editor-graph-area">
            <svg class="sketch-editor-graph" data-sketch-graph
                viewBox="0 0 ${WIDTH} ${HEIGHT}"
                preserveAspectRatio="xMidYMid meet"></svg>
          </div>

          <div class="sketch-editor-lower">
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
            </div>

            <div class="plot-editor-right">
              <div class="plot-editor-section">ELEMENTS</div>

              <div class="sketch-editor-list" data-sketch-list></div>

              <div data-sketch-detail></div>
            </div>
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

      /*
       * THE BODY'S STATIONS, for the ticks. Passed through unchanged from the
       * caller's live reference list, so the ticks are the body's own element
       * locations rather than anything the sketch maintains.
       */
      stations,
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
   * ========================================================
   * DRAWING IS PRESS, HOLD, DRAG, RELEASE
   * ========================================================
   *
   * A sketch element is a start and an end, so it is drawn in ONE gesture: the
   * press is the start, the drag follows the cursor, and the release fixes the
   * end. The preview redraws on every move, so the shape is visible while it
   * is being made, and the horizontal position snaps to a body-element tick
   * whenever the cursor is near one.
   *
   * The three-point Curve is the same gesture THREE times - Start, then Bend,
   * then End - each ending in a release, which is what lets the middle point be
   * placed deliberately rather than guessed at the end.
   *
   * ON RELEASE THE Y IS ASKED FOR. The cursor decided WHERE the point is; the
   * popup decides the exact ORDINATE, so a peak is entered as 250 kN rather
   * than aimed at.
   */
  let dragging = null;

  const worldPoint = (event) => {
    const raw = pointFromEvent(event, svg, scale);

    /*
     * SNAP THE X TO A TICK, keep the Y the student is pointing at. The snap
     * is horizontal only: the ordinate is the value being chosen, and pulling
     * it would change the diagram's shape rather than its station.
     */
    return {
      x: snapXToStations(raw.x, stations, scale, range),
      y: raw.y,
    };
  };

  svg.addEventListener("pointerdown", (event) => {
    if (tool !== "line" && tool !== "curve") {
      return;
    }

    event.preventDefault();

    const point = worldPoint(event);

    /*
     * A LINE BEGINS A NEW STROKE; A CURVE CONTINUES ONE.
     *
     * A line is a single gesture - press, drag, release - so each press starts
     * fresh. A curve is THREE gestures: the press commits the point that was
     * being dragged (the Start, then the Bend), and the new cursor becomes the
     * point now under the cursor. The third release has three committed points
     * and the curve is built.
     */
    if (tool === "curve") {
      if (!pending || pending.kind !== "curve3") {
        pending = { kind: "curve3", points: [point], live: 1 };
      } else {
        pending.points = [...pending.points, point];
        pending.live = pending.points.length;
      }
    } else {
      pending = { kind: "line", points: [point, point] };
    }

    dragging = { pointerId: event.pointerId };

    svg.setPointerCapture?.(event.pointerId);

    redraw();
  });

  svg.addEventListener("pointermove", (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) {
      return;
    }

    if (!pending || !pending.points.length) {
      return;
    }

    const point = worldPoint(event);

    /*
     * THE POINT UNDER THE CURSOR IS THE LAST ONE, and it is still MOVING.
     *
     * A line's start was fixed by the press, so the cursor is its end. A
     * curve's already-committed points (the Start, then the Bend) stand; only
     * the newest point follows the cursor until the next press fixes it.
     */
    if (tool === "line") {
      pending.points = [pending.points[0], point];
    } else {
      pending.points = [
        ...pending.points.slice(0, pending.live - 1),
        point,
      ];
    }

    redraw();
  });

  svg.addEventListener("pointerup", (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) {
      return;
    }

    dragging = null;

    if (tool === "line") {
      finishLineStroke();
      return;
    }

    if (tool === "curve") {
      finishCurveStroke();
    }
  });

  /*
   * A LINE IS DONE AT THE RELEASE. Its two points are the shape, so the
   * element is committed, the end's ordinate is asked for, and the tool is
   * ready for the next one.
   */
  function finishLineStroke() {
    if (!pending || pending.points.length < 2) {
      pending = null;
      redraw();
      return;
    }

    const [start, end] = pending.points;

    const element = {
      id: newId(++sequence),
      kind: "line",
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
    };

    pending = null;

    elements.push(element);

    selectedId = element.id;

    redraw();

    askForY({
      element,
      pointKey: "end",
      label: "Sketch Element",
    });
  }

  /*
   * A CURVE NEEDS THREE POINTS. The first two gestures place Start and Bend;
   * the third places End and builds the curve, then asks for its ordinate.
   */
  function finishCurveStroke() {
    if (!pending || pending.points.length < 3) {
      redraw();
      return;
    }

    const [start, bend, end] = pending.points;

    const element = buildThreePointCurve(
      newId(++sequence),
      start,
      bend,
      end,
    );

    pending = null;

    elements.push(element);

    selectedId = element.id;

    redraw();

    askForY({
      element,
      pointKey: "end",
      label: "Curve",
    });
  }

  /*
   * ASK FOR THE EXACT Y OF A JUST-PLACED POINT, then redraw at that value.
   *
   * The popup is opened with the ordinate the cursor gave as the suggestion,
   * so a student who is happy with it presses Enter and one who wants a round
   * number types it. The element is already on the sheet - the popup edits it
   * - so cancelling simply leaves the placed value in place.
   */
  function askForY({ element, pointKey, label }) {
    askForYValue({
      label,
      value: element[pointKey]?.y ?? 0,
      unit: options.yUnit || "",
      onCommit: (value) => {
        element[pointKey] = { ...element[pointKey], y: value };

        redraw();
      },
      onCancel: () => {},
    });
  }

  /*
   * DRAWING ON THE GRAPH.
   *
   * The pointer position is converted through the SAME scale the axes
   * were drawn with, so what is stored is engineering geometry and not a
   * pixel that happens to look right at the current zoom.
   */
  svg.addEventListener("click", (event) => {
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

    /*
     * CREATION IS NOT HANDLED ON `click` ANY MORE.
     *
     * A Line and a Curve are drawn by PRESS, DRAG, RELEASE (see the
     * `pointerdown`/`pointermove`/`pointerup` listeners), so the `click` that
     * the browser fires afterwards is a leftover of that gesture and must not
     * build a second element. Select and Erase still act on a click, because
     * they are not gestures - they are a single act on an existing element.
     */
  });

  /*
   * DOUBLE-CLICK FINISHES A LEGACY MULTI-POINT STROKE.
   *
   * The three-point Curve completes itself on its third release, so this only
   * serves a legacy `curve` element - one drawn by clicking point after point.
   * It is kept so an existing sketch still opens and can be extended the way
   * it was made.
   */
  svg.addEventListener("dblclick", (event) => {
    event.preventDefault();

    if (
      pending &&
      pending.kind === "curve" &&
      pending.points.length >= 2
    ) {
      elements.push({
        id: newId(++sequence),
        kind: "curve",
        points: pending.points.slice(),
      });
    }

    pending = null;

    redraw();
  });

  /*
   * ENTER FINISHES A LEGACY MULTI-POINT STROKE; ESCAPE ABANDONS ONE.
   *
   * The Line and the three-point Curve complete on release, so Enter has
   * nothing to finish for them. It is kept for a legacy `curve`, whose points
   * are placed one click at a time.
   */
  dialog.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      pending &&
      pending.kind === "curve"
    ) {
      event.preventDefault();

      if (pending.points.length >= 2) {
        elements.push({
          id: newId(++sequence),
          kind: "curve",
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
  SNAP_TOLERANCE_PX,
  askForYValue,
  buildThreePointCurve,
  close,
  distanceToElement,
  handleEscape,
  isOpen,
  makeScale,
  open,
  pointsOf,
  snapXToStations,
};

export default enggSketchEditor;
