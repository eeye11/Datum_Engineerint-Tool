/*
 * Drawing References in the written solution.
 *
 * This exists to PROVE THE CHAIN, not to be a written-solution editor:
 *
 *     written text  ->  drawing reference  ->  sheet  ->  render
 *
 * The written solution is a placeholder today, so this is a minimal
 * version of the same idea it will eventually need: a figure can be
 * inserted into text by naming a sheet, and the figure is rendered
 * from that sheet's CURRENT contents every time the solution is
 * rendered.
 *
 * A reference is a FIGURE IN THE SOLUTION, not a link to one. The
 * source carries a command naming the sheet, and the rendered solution
 * carries the drawing itself, in the place that command appears. There
 * is nothing to click and nothing to open: the diagram is part of the
 * written solution, at the position the author put it, the same as a
 * figure in any technical write-up.
 *
 * Two things are deliberately NOT coupled to the reference system:
 *
 *   - The SOURCE OF THE SHEET ID. Here it comes from a dropdown,
 *     because there is no document model on this side yet. The stored
 *     token is the same either way, so when the real editor can
 *     INSERT a figure in the course of a sentence, or name one with
 *     LaTeX, nothing about how a reference works has to change - only
 *     where the sheetId is read from.
 *
 *   - THE RENDERING. Nothing here draws anything. It asks the drawing
 *     side for a rendered sheet by ID, exactly as the written editor
 *     will. That is why the figure updates when the drawing changes
 *     without anything being re-inserted: there is no image here to
 *     go stale.
 */
import { enggDrawingSheets } from "../editor/index.js";
import enggDrawingReference from "../references/drawing-reference.js";

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 460;

/*
 * The solution renderer, available once the page is attached. Until then
 * a render request is a no-op rather than an error.
 */
let renderAttached = () => {};

/*
 * Render the written solution: the Update Output button and the live
 * updates call this same function, so clicking the button and editing the
 * drawing produce identical results.
 */
export function render() {
  return renderAttached();
}

const enggWrittenReferences = { render };

export default enggWrittenReferences;

function attach() {
  const sheetSelect =
    document.getElementById(
      "referenceSheetSelect"
    );
  const captionInput =
    document.getElementById(
      "referenceCaption"
    );
  const insertButton =
    document.getElementById(
      "referenceInsert"
    );
  const output =
    document.getElementById("writingOutput");
  const code =
    document.getElementById("writingCode");

  if (
    !sheetSelect ||
    !captionInput ||
    !insertButton ||
    !output ||
    !code
  ) {
    return;
  }

  if (!enggDrawingSheets) {
    return;
  }

  /*
   * The list of sheets is rebuilt from the document each time it is
   * refreshed, and valued by sheet ID rather than by position. That
   * is the same discipline the reference itself follows, so the
   * dropdown cannot silently insert a reference to whichever sheet
   * happens to be second after the user reorders the tabs.
   */
  function refreshSheetList() {
    const sheets = enggDrawingSheets.all();

    const previous = sheetSelect.value;

    sheetSelect.textContent = "";

    sheets.forEach((sheet) => {
      const option =
        document.createElement("option");

      option.value = sheet.id;
      option.textContent = sheet.name;

      sheetSelect.appendChild(option);
    });

    if (
      sheets.some(
        (sheet) => sheet.id === previous
      )
    ) {
      sheetSelect.value = previous;
    }

    if (
      !captionInput.value.trim() &&
      sheets.length
    ) {
      captionInput.value =
        sheetSelect.selectedOptions[0]?.textContent ||
        "";
    }
  }

  /*
   * Render the solution.
   *
   * The source is split at every drawing reference, and the
   * non-reference stretches are typeset normally. A reference is
   * replaced in place by the CURRENT rendering of its sheet, so the
   * diagram appears exactly where the student put it in the text -
   * which is the whole point of a figure being in a written
   * solution at all rather than beside it.
   *
   * The text is rendered ONE SEGMENT AT A TIME rather than as a
   * whole and patched afterwards. That ordering is what makes the
   * position correct: MathJax replaces the nodes it typesets, so a
   * figure inserted into an already-typeset document would have to
   * be matched against nodes MathJax has moved, and nothing would
   * reliably stay where it was put.
   */
  async function renderSolution() {
    const source = code.value;

    MathJax.typesetClear([output]);

    /*
     * Where every reference is, and the text either side of it.
     * Parsed once, from the same parse the figures are built from,
     * so the diagram and the gap it lands in cannot disagree about
     * where the reference was.
     */
    const found =
      enggDrawingReference.parseReferences(source);

    output.textContent = "";

    if (!found.length) {
      /*
       * No figures: the whole thing is ordinary text and is
       * typeset as one piece, exactly as it was before references
       * existed. There is no empty-state message here, because the
       * output is a solution - a solution with no figures in it is
       * a perfectly good solution, not a state that needs
       * announcing.
       */
      output.textContent = mathOrPlain(source);

      await MathJax.typesetPromise([output]);

      return;
    }

    let cursor = 0;

    for (const reference of found) {
      appendText(
        output,
        source.slice(cursor, reference.index)
      );

      appendFigure(output, reference);

      cursor = reference.index + reference.length;
    }

    appendText(
      output,
      source.slice(cursor)
    );

    /*
     * One typeset over the finished document rather than per
     * segment: the figures are real SVG, which MathJax leaves
     * alone, and a single pass is both faster and less likely to
     * renumber anything.
     */
    await MathJax.typesetPromise([output]);
  }

  /*
   * Text with the delimiters the source omits.
   *
   * The source is LaTeX, and a bare `F = ma` is not something
   * MathJax renders on its own, so text with no delimiters at all is
   * wrapped. Text that already has some is left alone - a document
   * that mixes prose and maths relies on the author having put the
   * delimiters where they meant them.
   */
  function mathOrPlain(text) {
    const trimmed = text.trim();

    if (!trimmed) {
      return text;
    }

    return /\\\[|\\\(|\$\$|\\begin\{/.test(trimmed)
      ? trimmed
      : `\\[${trimmed}\\]`;
  }

  function appendText(target, text) {
    if (!text || !text.trim()) {
      /*
       * A blank stretch - the newlines either side of a reference -
       * is skipped rather than typeset. Typesetting empty or
       * whitespace-only text adds empty maths blocks to the document
       * and, worse, MathJax numbers them, so a solution with three
       * figures would show three spurious numbered gaps between
       * them.
       */
      return;
    }

    const span =
      document.createElement("span");

    span.textContent = mathOrPlain(text);

    target.appendChild(span);
  }

  /*
   * A referenced sheet, as part of the solution.
   *
   * Rendered from the sheet's CURRENT contents at the moment the
   * solution is rendered - not from an image exported when the
   * reference was inserted, and not from anything stored. Move the
   * load, change a force, edit an annotation, and the next render
   * shows it.
   *
   * The reference in the source is the sheet ID, so renaming or
   * reordering the sheet changes nothing here: this resolves by ID
   * and there is nothing in it that knows either.
   */
  function appendFigure(target, reference) {
    const figure =
      document.createElement("figure");

    figure.className =
      "drawing-reference-figure";

    const rendered =
      enggDrawingSheets.renderReference(
        reference.sheetId,
        {
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT
        }
      );

    if (!rendered || !rendered.ok) {
      /*
       * A reference that could not be rendered is reported as a
       * fault, and the fault names ITSELF.
       *
       * It used to be reported as "The sheet this figure refers to is
       * no longer in this document", which is a confident claim about
       * why. But the same result covers a sheet that IS present and
       * whose extent could not be measured, and telling the reader
       * their sheet has vanished when it has not is worse than saying
       * nothing - it sends them looking for a deletion that never
       * happened.
       *
       * So the message is chosen from the reason. A genuinely missing
       * sheet still says so, because that is useful and true. Anything
       * else says what actually went wrong, and names the sheet it
       * happened on so the problem can be found.
       *
       * The point of this branch is that it is now reachable ONLY for
       * real faults. The reference renderer no longer reports a sheet
       * as "empty" merely because measuring it failed, so this
       * placeholder can never be shown over a sheet that has content.
       */
      const missing = document.createElement("p");

      missing.className = "drawing-reference-missing";

      missing.textContent =
        rendered?.reason === "missing-sheet"
          ? "The sheet this figure refers to is no longer in this document."
          : `This figure could not be drawn (${rendered?.reason || "render failed"})` +
            (rendered?.sheet?.name
              ? ` for "${rendered.sheet.name}".`
              : ".");

      figure.appendChild(missing);

      target.appendChild(figure);

      return;
    }

    if (rendered.empty) {
      /*
       * A sheet with genuinely nothing on it.
       *
       * The wording is deliberately plain and is now only reachable
       * when the sheet REALLY is empty: the renderer checks the sheet's
       * own feature list before saying so, so a measurement failure can
       * no longer produce a figure asserting that a full sheet is blank.
       */
      const blank = document.createElement("p");

      blank.className = "drawing-reference-empty";

      blank.textContent = rendered.caption
        ? `${rendered.caption} — this sheet is empty`
        : "This sheet is empty";

      figure.appendChild(blank);

      target.appendChild(figure);

      return;
    }

    const frame =
      document.createElement("div");

    frame.className =
      "drawing-reference-frame";

    frame.appendChild(
      rendered.svg.cloneNode(true)
    );

    figure.appendChild(frame);

    if (rendered.caption) {
      const caption =
        document.createElement(
          "figcaption"
        );

      caption.textContent =
        rendered.caption;

      figure.appendChild(caption);
    }

    target.appendChild(figure);
  }

  /*
   * Re-render the solution and the sheet list.
   *
   * Registered against the whole document, and on the page becoming
   * visible, because a reference must not be able to show a drawing
   * that has changed.
   *
   * It is not enough to refresh when the editor commits a change:
   * the drawing can also be edited from the inspector, undone, or
   * restored from a recovered document - none of which are a
   * "commit" in the drawing sense, and all of which change what the
   * figure should show. Re-rendering whenever the solution is
   * looked at is what makes the guarantee hold rather than nearly
   * hold.
   */
  function refreshAll() {
    refreshSheetList();

    renderSolution();
  }

  window.addEventListener(
    "focus",
    refreshAll
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        refreshAll();
      }
    }
  );

  /*
   * Insert a reference into the text.
   *
   * The token written is the ID. Not the name, and not the tab
   * position: those are the two things the user is most likely to
   * change next, and a reference that survived neither would be a
   * reference that quietly stopped meaning anything.
   */
  function insertReference() {
    const sheetId = sheetSelect.value;

    if (!sheetId) {
      return;
    }

    const reference =
      enggDrawingReference.createReference({
        sheetId,
        displayMode: "fit",
        caption:
          captionInput.value.trim() || null
      });

    const token =
      enggDrawingReference.serializeReference(
        reference
      );

    const start =
      code.selectionStart ??
      code.value.length;
    const end =
      code.selectionEnd ?? start;

    code.value =
      code.value.slice(0, start) +
      token +
      code.value.slice(end);

    code.focus();

    refreshAll();
  }

  insertButton.addEventListener(
    "click",
    insertReference
  );

  sheetSelect.addEventListener(
    "change",
    () => {
      captionInput.value =
        sheetSelect.selectedOptions[0]
          ?.textContent || "";
    }
  );

  code.addEventListener("input", refreshAll);

  /*
   * The drawing side tells us when something changed that a figure
   * would show. This is the live-update guarantee: a reference is
   * not a picture, so a drawing change is simply a reason to look
   * again rather than a reason to re-export.
   */
  enggDrawingSheets.setReferenceChangeHandler(
      refreshAll
  );

  renderAttached = renderSolution;

  refreshAll();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    attach
  );
} else {
  attach();
}
