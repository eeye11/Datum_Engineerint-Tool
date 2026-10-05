/*
 * The native EnggDraw project format.
 *
 * A .enggdraw file is the AUTHORITATIVE, editable document. It holds
 * the whole document model, not a rendering of it: every feature
 * keeps its real type, its real geometry, its parent, and its own
 * parameters, so reopening a file gives back a drawing that can be
 * selected, dragged, edited and re-saved exactly as one built in
 * the current session.
 *
 * That requirement is why this is a separate module rather than a
 * function inside the drawing controller. The file format is a
 * contract that outlives any of today's internal structures, so it
 * owns its own envelope, its own version number, and its own
 * migration path. If the internal model changes, what changes is
 * this file's idea of how to describe it - not the files people
 * already have.
 *
 * The envelope is deliberately small and explicit:
 *
 *   {
 *     "format":  "enggdraw",
 *     "version": 1,
 *     ...
 *   }
 *
 * `format` says what this is, and is checked before anything else.
 * `version` says which shape the body is in, and is what lets an
 * older file be read by a newer build.
 */
import enggSheets from "../sheets/sheets.js";

const FORMAT = "enggdraw";

/*
 * The version this build WRITES.
 *
 * A file is always written at the current version. A file is read
 * at whatever version it was written, and migrated forward to the
 * current one. Bumping this is a deliberate act: it means the body
 * shape has changed in a way older builds cannot read, and a
 * migration step has to exist for the old shape.
 */
const CURRENT_VERSION = 2;

/*
 * The oldest version this build can still read.
 *
 * Anything below this is refused rather than guessed at, because
 * interpreting a shape we do not understand risks silently
 * dropping the user's features on load.
 */
const MINIMUM_SUPPORTED_VERSION = 1;

const EXTENSION = "enggdraw";

const MEDIA_TYPE = "application/vnd.enggdraw+json";

/*
 * Wrap a serialised document in the envelope.
 *
 * The document body is passed in already serialised by the state
 * model, so the format layer never has to know what is inside it.
 * That separation is what lets the internal model change without
 * the file contract changing with it.
 */
function createDocument(document) {
  return {
    format: FORMAT,
    version: CURRENT_VERSION,
    application: "EnggDraw",
    savedAt: new Date().toISOString(),
    document
  };
}

/*
 * How a file failed to be read.
 *
 * The caller needs to tell the user WHY, and "it didn't work" is
 * not a reason. Each outcome names the problem and carries enough
 * detail to act on it, and never leaves the current document in a
 * half-loaded state.
 */
const Failure = {
  NOT_JSON: "not-json",
  WRONG_FORMAT: "wrong-format",
  TOO_OLD: "too-old",
  FROM_THE_FUTURE: "from-the-future",
  NO_DOCUMENT: "no-document"
};

/*
 * Read a parsed file into the current document shape.
 *
 * Returns either { ok: true, document } or
 * { ok: false, failure, detail }. It never throws and never
 * mutates anything: deciding whether a file can be opened is a
 * question with a definite answer, and answering it must not be
 * able to damage the drawing the user already has open.
 */
function readDocument(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      failure: Failure.NOT_JSON,
      detail: "The file does not contain a drawing."
    };
  }

  /*
   * An older very early draft wrote a different marker, and is
   * still openable. Recognised here so those files keep working,
   * and mapped forward rather than rejected.
   */
  const format =
      parsed.format === "engg-drawing"
          ? FORMAT
          : parsed.format;

  if (format !== FORMAT) {
    return {
      ok: false,
      failure: Failure.WRONG_FORMAT,
      detail:
          "This is not an EnggDraw drawing. An EnggDraw file " +
          "starts with \"format\": \"" + FORMAT + "\"."
    };
  }

  const version = Number(parsed.version);

  if (!Number.isFinite(version)) {
    return {
      ok: false,
      failure: Failure.NO_DOCUMENT,
      detail: "The file does not say which version it is."
    };
  }

  if (version > CURRENT_VERSION) {
    /*
     * A file from a NEWER build is refused outright. Reading it
     * with today's understanding would quietly discard whatever
     * this version does not know about, and the user would find
     * out by losing work rather than by being told.
     */
    return {
      ok: false,
      failure: Failure.FROM_THE_FUTURE,
      detail:
          "This drawing was made with a newer version of " +
          "EnggDraw (file version " + version + ", this build " +
          "understands up to " + CURRENT_VERSION + "). Update " +
          "EnggDraw to open it."
    };
  }

  if (version < MINIMUM_SUPPORTED_VERSION) {
    return {
      ok: false,
      failure: Failure.TOO_OLD,
      detail:
          "This drawing is too old to open (file version " +
          version + ")."
    };
  }

  const migrated =
      migrate(parsed.document, version);

  if (!migrated) {
      return {
          ok: false,
          failure: Failure.NO_DOCUMENT,
          detail: "The file contains no drawing."
      };
  }

  return {
    ok: true,
    document: migrated,
    migratedFrom: version
  };
}

/*
 * Bring a document body forward from the version it was written
 * at to the one this build understands.
 *
 * Each step is small and named after the version it upgrades FROM,
 * and the chain is walked in order. A version that needs no change
 * passes straight through, so a file written by this build costs
 * nothing to open.
 *
 * When a step DOES change something, it must be added here and to
 * MIGRATIONS. That pairing is the whole compatibility story, and
 * keeping it in one file is what stops the two drifting apart.
 */
const MIGRATIONS = {};

/*
 * Version 1 -> version 2: a drawing became a document of sheets.
 *
 * A version 1 file has no sheets at all - it IS one sheet, unnamed,
 * with no id, because nothing needed one. Rather than invent a
 * history that never happened, the migration says exactly what is
 * true: this drawing's features become the first sheet of the
 * document, and it keeps the settings it had.
 *
 * The id is minted now, at migration, and then it is permanent. So a
 * file opened once from version 1 and saved again carries a stable
 * id from that moment on, and any reference made after that point
 * resolves. Nothing is lost and nothing is guessed: the single sheet
 * of the old file is genuinely the first sheet of the new one.
 */
MIGRATIONS[1] = function (document) {
  const collection =
    enggSheets.createCollection();

  const first =
    collection.sheets[0];

  first.objects = Array.isArray(document?.objects)
    ? document.objects
    : [];

  first.units = document?.units || first.units;

  if (document?.snap) {
    first.snap = {
      ...first.snap,
      ...document.snap
    };
  }

  if (document?.objectSnap) {
    first.objectSnap = {
      ...first.objectSnap,
      ...document.objectSnap
    };
  }

  if (document?.styleDefaults) {
    first.styleDefaults = {
      ...document.styleDefaults
    };
  }

  if (document?.camera) {
    first.viewport = {
      zoom: Number(document.camera.zoom) || 1,
      panX: Number(document.camera.panX) || 0,
      panY: Number(document.camera.panY) || 0
    };
  }

  if (document?.grid) {
    first.grid = {
      ...first.grid,
      ...document.grid
    };
  }

  /*
   * THE DOCUMENT SCALE BECOMES THE FIRST SHEET'S SCALE.
   *
   * An old file had one scale for the whole document, because it
   * had one sheet. The scale now belongs to a sheet, so it is moved
   * onto the one sheet the migration produces rather than left at
   * the top level.
   *
   * Leaving it where it was would mean an old drawing reopened with
   * every length uncalibrated - the geometry would still be there,
   * and so would the number that gave it meaning, but they would
   * no longer be connected to each other.
   */
  if (document?.scale) {
    first.scale = {
      ...document.scale
    };
  }

  /*
   * The settings that belong to the DOCUMENT rather than to any one
   * sheet - units, the active tool - stay at the top level.
   *
   * Units are still a document-wide convention: millimetres are
   * millimetres on every sheet. The LENGTH SCALE is not - that is a
   * physical relationship between a sheet's geometry and real
   * lengths, so two sheets may legitimately disagree about it, and
   * it travels with the sheet that owns the geometry.
   */
  return {
    ...document,
    sheets: enggSheets.serializeCollection(
      collection
    ).sheets,
    activeSheetId: first.id,
    objects: undefined
  };
};

function migrate(document, fromVersion) {
  let current = document;

  for (
    let version = fromVersion;
    version < CURRENT_VERSION;
    version += 1
  ) {
    const step = MIGRATIONS[version];

    if (!step) {
      /*
       * A step is missing for a version we claim to support.
       * Refusing is the only safe answer: continuing would mean
       * handing back a document whose shape we do not actually
       * understand.
       */
      return null;
    }

    current = step(current);
  }

  return normalize(current);
}

/*
 * Make sure the sheets in a document are usable.
 *
 * Migration brings an OLD shape forward; this makes a shape that is
 * merely damaged usable. The two are different jobs and the
 * difference matters: a file with no sheets is not an older file, it
 * is a file with something missing, and the user's response to that
 * should be "here is a blank drawing" rather than "this file cannot
 * be opened".
 *
 * Doing it here means every sheet list in the application - the one
 * being edited, the one being recovered, the one a reference points
 * into - has already been through the same repair, so no other
 * module has to ask whether the list is there.
 */
function normalize(document) {
  if (!document || typeof document !== "object") {
    return document;
  }

  const collection =
    enggSheets.createCollection({
      sheets: document.sheets,
      activeSheetId: document.activeSheetId
    });

  return {
    ...document,
    sheets: collection.sheets,
    activeSheetId: collection.activeSheetId
  };
}

/*
 * A document file name.
 *
 * The extension is added only when it is missing, so naming a
 * file "Report" does not become "Report.enggdraw.enggdraw" when
 * the user has already typed it.
 */
function withExtension(name) {
  const trimmed = String(name || "").trim();

  if (!trimmed) {
    return "drawing." + EXTENSION;
  }

  return trimmed.toLowerCase().endsWith("." + EXTENSION)
    ? trimmed
    : trimmed + "." + EXTENSION;
}

const enggDocumentFile = {
  CURRENT_VERSION,
  EXTENSION,
  Failure,
  MEDIA_TYPE,
  MINIMUM_SUPPORTED_VERSION,
  createDocument,
  migrate,
  readDocument,
  withExtension
};

export default enggDocumentFile;
