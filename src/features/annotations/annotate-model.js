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
  style = {},
  name
} = {}) {
  const definition = ANNOTATE_KINDS[kind] || ANNOTATE_KINDS.note;

  const resolvedText =
    text === null || text === undefined
      ? definition.text
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
  isGeometricKind,
  translateAnnotation,
  boundsOf,
  tableWidthOf,
  tableHeightOf,
  TABLE_CELL_W,
  TABLE_CELL_H
};

export default enggAnnotate;
