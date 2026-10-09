/*
 * ========================================================
 * THE ANNOTATE FEATURES
 * ========================================================
 *
 * These are the drawing-side annotations: the marks a student puts ON a
 * drawing to explain it. They are not measurements - a Smart Dimension
 * measures, a Note does not - and they are not Statics features. They are
 * the engineering-drawing equivalent of a drafting pen.
 *
 * WHY THEY ARE ONE MODULE AND ONE FEATURE TYPE
 * --------------------------------------------
 * Every one of them is the same SHAPE of thing: a piece of content (text,
 * a symbol, a value), positioned in the drawing, optionally pointing at a
 * feature, with a style. What differs is the content and how it is drawn -
 * not what it IS. So they share a single feature type, `annotate`, with a
 * `kind` deciding the specifics:
 *
 *     kind        what it is                        geometry it carries
 *     ───────     ─────────────────────────────     ────────────────────
 *     note        free prose / equations            placement
 *     label       a short feature identifier        placement + target
 *     leader      text on a pointed line            start (target), end
 *     callout     text in a box on a leader         start (target), end
 *     arrow       a free-standing direction mark    start, end
 *     symbol      an engineering symbol             placement
 *     tolerance   a toleranced value                placement + target
 *     table       a grid of values                  placement, rows, cols
 *
 * The reason this is ONE type rather than eight is the same reason a
 * dimension is one type however it is measured: the selection, move,
 * delete, undo, save and panel code is identical for all eight, and
 * splitting them into eight types would mean eight copies of that code -
 * eight chances to fall out of step. A new annotation kind is added HERE,
 * in its data, not in the interaction layer.
 *
 * WHAT IS AUTHORITATIVE
 * ---------------------
 * Positions are stored in DRAWING units, never screen pixels, so an
 * annotation survives zoom, pan, Fit, resizing and save/reload (spec 65).
 * A leader's two ends are stored as the target point and the text point,
 * so it moves with the drawing rather than being pinned to the viewport.
 *
 * THE FEATURE'S OWN NAME IS NOT ITS TEXT
 * --------------------------------------
 * `name` identifies the feature in the Features list ("Note 1"); the text
 * is what is drawn. They are separate so renaming a note does not change
 * what it SAYS, and editing what it says does not rename the feature.
 */

/*
 * The kinds, and what each one is.
 *
 * `geometric` marks the kinds whose creation is a start-and-end gesture -
 * the ones that take BOTH the click-move-click and the drag workflow. The
 * rest are placed with a single click, which is the honest interaction for
 * a thing that sits at a point.
 *
 * `targeted` marks the kinds that attach to a feature under the cursor.
 */
export const ANNOTATE_KINDS = {
  note: {
    label: "Note",
    geometric: false,
    targeted: false,
    text: "Note"
  },
  label: {
    label: "Label",
    geometric: false,
    targeted: true,
    text: "A"
  },
  leader: {
    label: "Leader",
    geometric: true,
    targeted: true,
    text: "Leader"
  },
  callout: {
    label: "Callout",
    geometric: true,
    targeted: true,
    text: "Callout"
  },
  arrow: {
    label: "Arrow",
    geometric: true,
    targeted: false,
    text: ""
  },
  symbol: {
    label: "Symbol",
    geometric: false,
    targeted: false,
    text: "Symbol"
  },
  tolerance: {
    label: "Tolerance",
    geometric: false,
    targeted: true,
    text: "±0.00"
  },
  table: {
    label: "Table",
    geometric: false,
    targeted: false,
    text: ""
  }
};

/*
 * The symbol library the Symbol tool offers.
 *
 * Grouped the way an engineer looks for them rather than alphabetically,
 * and deliberately SHORT: each entry is a symbol drawing this application
 * actually renders. A longer list of names with nothing behind them would
 * be a menu that lies, which is worse than a short honest one.
 */
export const SYMBOL_LIBRARY = [
  {
    id: "gdt",
    label: "Datum / GD&T",
    symbols: [
      { id: "datum", label: "Datum", text: "⌖" },
      { id: "flatness", label: "Flatness", text: "⏥" },
      { id: "parallelism", label: "Parallelism", text: "∥" },
      { id: "perpendicularity", label: "Perpendicularity", text: "⊥" },
      { id: "position", label: "Position", text: "⌖" },
      { id: "concentricity", label: "Concentricity", text: "◎" }
    ]
  },
  {
    id: "surface",
    label: "Surface Finish",
    symbols: [
      { id: "surface-finish", label: "Surface Finish", text: "⏓" },
      { id: "roughness", label: "Roughness Ra", text: "Ra" }
    ]
  },
  {
    id: "weld",
    label: "Weld",
    symbols: [
      { id: "fillet-weld", label: "Fillet Weld", text: "▷" },
      { id: "groove-weld", label: "Groove Weld", text: "⊻" }
    ]
  },
  {
    id: "center",
    label: "Center / Centerline",
    symbols: [
      { id: "centerline", label: "Centerline", text: "℄" },
      { id: "center-mark", label: "Center Mark", text: "⊕" }
    ]
  },
  {
    id: "section",
    label: "Section",
    symbols: [
      { id: "section", label: "Section Marker", text: "A–A" },
      { id: "detail", label: "Detail Marker", text: "Ⓐ" }
    ]
  },
  {
    id: "reference",
    label: "Reference",
    symbols: [
      { id: "reference", label: "Reference", text: "REF" },
      { id: "basic-dimension", label: "Basic Dimension", text: "▭" }
    ]
  },
  {
    id: "other",
    label: "Other Engineering Symbols",
    symbols: [
      { id: "diameter", label: "Diameter", text: "Ø" },
      { id: "radius", label: "Radius", text: "R" },
      { id: "degree", label: "Degree", text: "°" },
      { id: "plus-minus", label: "Plus / Minus", text: "±" },
      { id: "square", label: "Square", text: "□" },
      { id: "counterbore", label: "Counterbore", text: "⌴" },
      { id: "countersink", label: "Countersink", text: "⌵" }
    ]
  }
];

/* Every symbol, flat, keyed by id, for lookup from a stored feature. */
export const SYMBOL_BY_ID = Object.fromEntries(
  SYMBOL_LIBRARY.flatMap((group) =>
    group.symbols.map((symbol) => [symbol.id, symbol])
  )
);

/*
 * The tolerance modes, and the engineering meaning of each.
 *
 * A tolerance states how far a dimension may vary. The MODE decides which
 * values are meaningful - a symmetric tolerance has one ± value, a limit
 * tolerance has two absolute limits - and the panel offers only the fields
 * the chosen mode actually needs (spec 50).
 */
export const TOLERANCE_MODES = {
  symmetric: {
    label: "Symmetric (±)",
    fields: ["value"],
    text: (values) => `±${formatNumber(values.value)}`
  },
  deviation: {
    label: "Deviation (+/−)",
    fields: ["upper", "lower"],
    text: (values) =>
      `${signed(values.upper)} / ${signed(values.lower)}`
  },
  limits: {
    label: "Limits",
    fields: ["upper", "lower"],
    text: (values) =>
      `${formatNumber(values.upper)} / ${formatNumber(values.lower)}`
  },
  basic: {
    label: "Basic (theoretical)",
    fields: [],
    text: () => "□"
  }
};

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return String(Math.round(number * 100) / 100);
}

function signed(value) {
  const number = Number(value) || 0;

  return `${number >= 0 ? "+" : ""}${formatNumber(number)}`;
}

/*
 * ========================================================
 * CREATION
 * ========================================================
 */

function newId(kind) {
  const random =
    typeof globalThis.crypto === "object" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2);

  return `${kind}-${random.slice(0, 8)}`;
}

/*
 * Build an annotation feature.
 *
 * Everything a kind needs is assembled here, so the factory in
 * drawing-state is a straight pass-through and the interaction layer never
 * has to know what fields a table has that an arrow does not.
 */
export function createAnnotate({
  kind = "note",
  text = null,
  position = { x: 0, y: 0 },
  start = null,
  end = null,
  targetFeatureId = null,
  symbolId = null,
  toleranceMode = "symmetric",
  toleranceValues = {},
  rows = 3,
  columns = 3,
  cells = null,
  bends = null,
  style = {},
  name
} = {}) {
  const definition = ANNOTATE_KINDS[kind] || ANNOTATE_KINDS.note;

  /*
   * THE STORED TEXT STARTS EMPTY, NOT AS A PLACEHOLDER.
   *
   * `definition.text` used to be seeded here as the content - "Note",
   * "Leader", "±0.00" - which put a word on the drawing the student never
   * chose and made "has the student written anything yet?" unanswerable. What
   * an empty annotation DISPLAYS is now its placeholder (see displayTextOf),
   * and what it STORES is the empty string. A caller that supplies real text
   * still gets it stored.
   */
  const resolvedText =
    text === null || text === undefined
      ? ""
      : text;

  const geometry = {
    /* Where a point-placed annotation sits, in drawing units. */
    position: {
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0
    }
  };

  /*
   * A GEOMETRIC KIND CARRIES ITS TWO ENDS.
   *
   * `start` is the pointed end - what the leader touches, or where the
   * arrow flies from - and `end` is where the content sits. Both are
   * drawing coordinates, so the whole annotation is anchored to the
   * drawing and not to the screen.
   */
  if (definition.geometric && start && end) {
    geometry.start = {
      x: Number(start.x) || 0,
      y: Number(start.y) || 0
    };

    geometry.end = {
      x: Number(end.x) || 0,
      y: Number(end.y) || 0
    };

    /*
     * A LEADER OR CALLOUT MAY CARRY BENDS - the ordered intermediate points
     * between attachment and endpoint. They are stored on the geometry rather
     * than derived, so they save, load, undo and copy with the feature like every
     * other part of it. An arrow carries none: it is a straight mark.
     */
    if (
      (kind === "leader" || kind === "callout") &&
      Array.isArray(bends) &&
      bends.length
    ) {
      geometry.bends = bends
        .filter(
          (bend) =>
            bend &&
            Number.isFinite(Number(bend.x)) &&
            Number.isFinite(Number(bend.y))
        )
        .map((bend) => ({
          x: Number(bend.x),
          y: Number(bend.y)
        }));
    }
  }

  if (kind === "symbol") {
    geometry.symbolId = symbolId || "datum";
  }

  if (kind === "tolerance") {
    geometry.toleranceMode = TOLERANCE_MODES[toleranceMode]
      ? toleranceMode
      : "symmetric";
    geometry.toleranceValues = {
      ...toleranceValues
    };
  }

  if (kind === "table") {
    geometry.rows = clampCount(rows, 1, 50);
    geometry.columns = clampCount(columns, 1, 20);
    geometry.cells = normaliseCells(
      cells,
      geometry.rows,
      geometry.columns
    );
  }

  return {
    id: newId(kind),
    type: "annotate",
    annotateKind: kind,
    name: name || definition.label,
    text: String(resolvedText ?? ""),

    /*
     * WHO the annotation points at. A label, a leader, a callout and a
     * tolerance may all be about a feature; a note, an arrow, a symbol and
     * a table are their own thing. Kept as one field with a null default
     * so the same move/select code serves every kind.
     */
    targetFeatureId: targetFeatureId || null,

    geometry,

    style: {
      fontSize: 12,
      stroke: "#000000",
      align: "left",
      arrowhead: kind === "arrow" || kind === "leader" ? "closed" : "none",
      leaderStyle: "straight",
      ...style
    },

    visible: true
  };
}

function clampCount(value, min, max) {
  const number = Math.round(Number(value));

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

/*
 * A grid of cell strings, made to fit the declared size.
 *
 * A stored table with the wrong number of cells would render as a grid
 * with holes in it, so the cell list is reconciled against rows×columns
 * on the way in - kept where it exists, blank where it does not. The table
 * therefore always has exactly the cells its size says it has.
 */
function normaliseCells(cells, rows, columns) {
  const total = rows * columns;
  const given = Array.isArray(cells) ? cells : [];

  return Array.from({ length: total }, (_, index) =>
    given[index] === undefined || given[index] === null
      ? ""
      : String(given[index])
  );
}

/*
 * ========================================================
 * THE PLACEHOLDER SYSTEM
 * ========================================================
 *
 * A text-bearing annotation created without content is a VALID FEATURE that
 * says what the student still has to write. The prompt is a PLACEHOLDER: it is
 * drawn so the empty annotation is visible and legible on the sheet, but it is
 * NOT the student's content and is never stored as such.
 *
 *     content = ""                    the truth
 *     placeholder = "Enter note"      what is shown until there is content
 *
 * NOT the other way round:
 *
 *     content = "Enter note"          a word the student never chose,
 *                                     saved, searched and exported as theirs
 *
 * The distinction matters for saving, searching, exporting, editing and for
 * answering "has the student actually written anything here yet?" - which is a
 * question `hasContent` answers and "is the text non-empty" would answer wrong,
 * because a placeholder makes the stored text non-empty while the content is
 * still empty.
 *
 * EVERY PROMPT IS CONTEXTUAL. "Enter note", "Enter label", "Enter datum" -
 * never a generic "Text"/"Value"/"Input" where a more useful word is possible.
 * A new text-bearing kind follows the same pattern: "Enter <what the student is
 * expected to provide>".
 */
export const PLACEHOLDERS = {
  note: "Enter note",
  label: "Enter label",
  leader: "Enter text",
  callout: "Enter callout",
  symbol: "Enter value",
  tolerance: "Enter tolerance",
  table: "Enter text"
};

/*
 * The prompt for one annotation, which for a symbol depends on WHAT the
 * symbol needs: a datum carries an identifier, a value-carrying symbol a
 * value, and a reference a reference. The kind alone is not always enough.
 */
export function placeholderOf(annotation) {
  if (!annotation) {
    return PLACEHOLDERS.note;
  }

  const kind = annotation.annotateKind;

  if (kind === "symbol") {
    const symbol = SYMBOL_BY_ID[annotation.geometry?.symbolId];

    if (symbol?.placeholder) {
      return symbol.placeholder;
    }

    return PLACEHOLDERS.symbol;
  }

  return PLACEHOLDERS[kind] || "Enter text";
}

/*
 * IS THERE ANY CONTENT, as against a placeholder?
 *
 * The stored text and the drawn content are two different questions: a
 * tolerance's content is composed from its values and a symbol's from its
 * symbol, so neither reads `annotation.text` at all. This asks the same
 * question `displayTextOf` answers, without drawing anything.
 */
export function hasContent(annotation) {
  if (!annotation) {
    return false;
  }

  const kind = annotation.annotateKind;
  const geometry = annotation.geometry || {};

  if (kind === "tolerance") {
    const mode =
      TOLERANCE_MODES[geometry.toleranceMode] ||
      TOLERANCE_MODES.symmetric;

    const values = geometry.toleranceValues || {};

    /*
     * A tolerance has content once every field its mode needs is a real
     * value. A symmetric tolerance with no value, or limits with no upper,
     * is still waiting for the student.
     */
    return mode.fields.every(
      (field) =>
        values[field] !== undefined &&
        values[field] !== null &&
        String(values[field]).trim() !== ""
    );
  }

  if (kind === "symbol") {
    const symbol = SYMBOL_BY_ID[geometry.symbolId];

    /*
     * A symbol WITH a symbol id always has something to draw - the glyph
     * itself - so it is never "empty" in the sense a note can be. Its
     * placeholder applies only to the extra value it may carry.
     */
    return Boolean(symbol && String(annotation.text || "").trim() !== "");
  }

  if (kind === "arrow") {
    return true;
  }

  return String(annotation.text || "").trim() !== "";
}

/*
 * WHAT TO DRAW.
 *
 * The real content when there is any, and the contextual placeholder when
 * there is not - so an empty note is still a visible, editable thing on the
 * sheet rather than nothing at all. The placeholder is returned for DISPLAY
 * only; nothing here writes it back onto the feature.
 */
export function displayTextOf(annotation) {
  if (hasContent(annotation)) {
    return textOf(annotation);
  }

  /*
   * AN ARROW HAS NO TEXT AT ALL, so it never gets a placeholder - there is
   * nothing the student was ever going to type.
   */
  if (annotation.annotateKind === "arrow") {
    return "";
  }

  /*
   * A TABLE'S CONTENT IS ITS CELLS, so a bare table is not "waiting for text"
   * in the way a note is - its empty cells are edited individually and the
   * grid itself is the content. It draws no table-level placeholder.
   */
  if (annotation.annotateKind === "table") {
    return "";
  }

  /*
   * A SYMBOL ALWAYS DRAWS ITS GLYPH. Its placeholder belongs to the value it
   * may carry, which the symbol renderer draws beneath the glyph - so the
   * glyph is still returned here, not replaced.
   */
  if (annotation.annotateKind === "symbol") {
    return textOf(annotation);
  }

  return placeholderOf(annotation);
}

/*
 * Whether what is being drawn is a PLACEHOLDER rather than the student's
 * content. The renderer uses this to draw it in a muted style, so the sheet
 * distinguishes "not written yet" from "written, and it says this".
 */
export function isPlaceholder(annotation) {
  if (!annotation || annotation.annotateKind === "arrow") {
    return false;
  }

  if (
    annotation.annotateKind === "table" ||
    annotation.annotateKind === "symbol"
  ) {
    return false;
  }

  return !hasContent(annotation);
}

/*
 * What an annotation SAYS, as drawn.
 *
 * A tolerance and a symbol render from their own data rather than from
 * free text, because what they state is composed from fields the panel
 * edits - so the drawn text cannot disagree with the values behind it.
 */
export function textOf(annotation) {
  if (!annotation) {
    return "";
  }

  const kind = annotation.annotateKind;
  const geometry = annotation.geometry || {};

  if (kind === "tolerance") {
    const mode =
      TOLERANCE_MODES[geometry.toleranceMode] ||
      TOLERANCE_MODES.symmetric;

    return mode.text(geometry.toleranceValues || {});
  }

  if (kind === "symbol") {
    const symbol = SYMBOL_BY_ID[geometry.symbolId];

    return symbol ? symbol.text : annotation.text || "";
  }

  return annotation.text || "";
}

/*
 * ========================================================
 * THE LEADER PATH: ATTACHMENT -> BENDS -> ENDPOINT
 * ========================================================
 *
 * A leader or a callout is a PEN: an attachment point, zero or more bends, and
 * an endpoint. The bends are the whole reason a leader is useful - they carry
 * the pen around the drawing so it reaches the text without crossing the thing
 * it is annotating - and they are ONE ordered list, not a collection of
 * unrelated segments.
 *
 *     attachment  ->  bend 1  ->  bend 2  ->  endpoint
 *
 * Each consecutive pair is one straight segment, which is why the list is the
 * authoritative shape: inserting a bend and moving a bend are both edits to the
 * SAME list, and the rendered line is always exactly the list joined up. There
 * is deliberately no per-segment object to keep in step.
 */
export function leaderPathPoints(annotation) {
  const geometry = annotation?.geometry;

  if (!geometry?.start || !geometry?.end) {
    return [];
  }

  const bends = Array.isArray(geometry.bends) ? geometry.bends : [];

  return [
    geometry.start,
    ...bends.filter(
      (bend) => bend && Number.isFinite(bend.x) && Number.isFinite(bend.y)
    ),
    geometry.end
  ];
}

/*
 * Insert a bend into a leader's path.
 *
 * The new bend is placed at the MIDPOINT of the segment it splits, so the
 * drawn line does not move when the bend is added - the student then drags it
 * where they want it. Inserting at the segment's midpoint rather than at an
 * index the caller guesses keeps the path CONTINUOUS by construction: the
 * segments either side of it still join the same points they did.
 *
 * `segmentIndex` names the segment whose midpoint is used: 0 is the first
 * segment (attachment -> first bend or endpoint).
 */
export function addLeaderBend(annotation, segmentIndex = 0) {
  const path = leaderPathPoints(annotation);

  if (path.length < 2) {
    return -1;
  }

  const index = Math.min(
    Math.max(0, Math.trunc(Number(segmentIndex)) || 0),
    path.length - 2
  );

  const from = path[index];
  const to = path[index + 1];

  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2
  };

  const geometry = annotation.geometry;

  if (!Array.isArray(geometry.bends)) {
    geometry.bends = [];
  }

  /*
   * The bend's index in the STORED list is its index in the path minus the
   * attachment point, which is not stored among the bends.
   */
  geometry.bends.splice(index, 0, midpoint);

  return index;
}

/*
 * Remove a bend and RECONNECT its neighbours.
 *
 * Deleting from the ordered list reconnects the two segments that met at the
 * bend automatically - the segments either side simply become a straight line
 * between the points that remain - so the path can never be left broken.
 */
export function removeLeaderBend(annotation, index) {
  const geometry = annotation?.geometry;

  if (!geometry || !Array.isArray(geometry.bends)) {
    return false;
  }

  const at = Math.trunc(Number(index));

  if (!Number.isFinite(at) || at < 0 || at >= geometry.bends.length) {
    return false;
  }

  geometry.bends.splice(at, 1);

  return true;
}

/*
 * Whether this annotation's kind carries a bendable path.
 */
export function hasLeaderPath(kind) {
  return kind === "leader" || kind === "callout";
}

/*
 * Whether this annotation has a drawn body beyond a single point, so the
 * interaction layer and the renderer agree about which kinds flow from a
 * gesture and which do not.
 */
export function isGeometricKind(kind) {
  return ANNOTATE_KINDS[kind]?.geometric === true;
}

/*
 * ========================================================
 * MOVEMENT
 * ========================================================
 *
 * One function moves any annotation by a world-space delta. A point-placed
 * one moves its position; a geometric one moves BOTH ends by the same
 * delta, so it keeps its shape and its length and simply relocates - which
 * is what dragging a leader or an arrow means.
 */
export function translateAnnotation(annotation, dx, dy) {
  if (!annotation || !annotation.geometry) {
    return;
  }

  const geometry = annotation.geometry;

  if (geometry.position) {
    geometry.position = {
      x: geometry.position.x + dx,
      y: geometry.position.y + dy
    };
  }

  if (geometry.start) {
    geometry.start = {
      x: geometry.start.x + dx,
      y: geometry.start.y + dy
    };
  }

  if (geometry.end) {
    geometry.end = {
      x: geometry.end.x + dx,
      y: geometry.end.y + dy
    };
  }

  /*
   * A LEADER'S BENDS MOVE WITH IT.
   *
   * Every point of the path is translated by the same delta, so the whole pen
   * relocates and keeps its shape - which is what dragging a leader means. A
   * bend left behind would tear the path apart.
   */
  if (Array.isArray(geometry.bends)) {
    geometry.bends = geometry.bends.map((bend) => ({
      x: bend.x + dx,
      y: bend.y + dy
    }));
  }
}

/*
 * The points that bound an annotation, for Fit, the selection box and hit
 * testing. Computed from the stored geometry, so it is right at any zoom.
 */
export function boundsOf(annotation) {  if (!annotation || !annotation.geometry) {
    return [];
  }

  const geometry = annotation.geometry;
  const points = [];

  if (geometry.position) {
    points.push(geometry.position);
  }

  if (geometry.start) {
    points.push(geometry.start);
  }

  if (geometry.end) {
    points.push(geometry.end);
  }

  /*
   * AND EVERY BEND, so Fit, box selection and the selection box all cover the
   * pen the student can actually see - a leader swept up by a box that crosses
   * one of its bends must be selected.
   */
  if (Array.isArray(geometry.bends)) {
    geometry.bends.forEach((bend) => {
      if (bend && Number.isFinite(bend.x) && Number.isFinite(bend.y)) {
        points.push(bend);
      }
    });
  }

  if (annotation.annotateKind === "table") {
    points.push({
      x: geometry.position.x + tableWidthOf(annotation),
      y: geometry.position.y + tableHeightOf(annotation)
    });
  }

  return points;
}

const TABLE_CELL_W = 60;
const TABLE_CELL_H = 22;

export function tableWidthOf(annotation) {
  const columns = Number(annotation?.geometry?.columns) || 1;

  return columns * TABLE_CELL_W;
}

export function tableHeightOf(annotation) {
  const rows = Number(annotation?.geometry?.rows) || 1;

  return rows * TABLE_CELL_H;
}

/*
 * ========================================================
 * THE PUBLIC SURFACE
 * ========================================================
 */
const enggAnnotate = {
  ANNOTATE_KINDS,
  SYMBOL_LIBRARY,
  SYMBOL_BY_ID,
  TOLERANCE_MODES,
  createAnnotate,
  textOf,
  PLACEHOLDERS,
  placeholderOf,
  hasContent,
  displayTextOf,
  isPlaceholder,
  isGeometricKind,
  leaderPathPoints,
  addLeaderBend,
  removeLeaderBend,
  hasLeaderPath,
  translateAnnotation,
  boundsOf,
  tableWidthOf,
  tableHeightOf,
  TABLE_CELL_W,
  TABLE_CELL_H
};

export default enggAnnotate;
