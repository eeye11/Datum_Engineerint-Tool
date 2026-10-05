# Integrating with Datum

Datum is the drawing and written-solution tool in the submission pipeline:

```
handwritten page ──► OCR tool ──► LaTeX ──► Datum ──► submission ──► autograder
                                   (student corrects the LaTeX,
                                    draws the figures it refers to)
```

This document is for the teams building the tools around it. It covers the
three supported ways to work with Datum, and what each one guarantees:

| You want to…                                         | Use                                         |
| ---------------------------------------------------- | ------------------------------------------- |
| read or write a saved drawing                        | the [`.enggdraw` file format](FILE-FORMAT.md) |
| drive Datum running in the same page                 | the JavaScript API, `window.datum`          |
| show Datum inside your own page and talk to it       | an iframe plus the postMessage bridge       |

Everything else in `src/` is internal and can change without notice.

---

## What Datum holds

A Datum **document** is an ordered list of **sheets**. Each sheet is one
drawing (a free body diagram, a shear force diagram, …) with its own
features, view, grid and length scale.

The **written solution** is LaTeX source. It places a drawing with a
reference token:

```latex
The free body diagram of the beam is shown below.

[DRAWING_REFERENCE:sheet_8f31a2c4]

Taking moments about A, $\sum M_A = 0$ gives …
```

The token names a sheet **by id**, not by name or position, so it keeps
working when the student renames or reorders sheets. A reference is not a
picture: every time the solution is rendered, the figure is drawn from the
sheet's current contents.

---

## The JavaScript API (`window.datum`)

When Datum runs as a standalone page, the API is available as
`window.datum`. It is defined in [`src/api/datum-api.js`](../src/api/datum-api.js).

All results are plain, JSON-safe objects, so the same calls work across an
iframe.

### `datum.API_VERSION`, `datum.documentVersion`

`API_VERSION` (currently `1`) changes only when a call is removed or its
result changes shape. Adding a call does not change it.
`documentVersion` is the `.enggdraw` version this build writes.

### `datum.getDocument()` → `.enggdraw` file object

The whole document, exactly as **Save** would write it:

```js
const file = datum.getDocument();
// { format: "enggdraw", version: 2, application: "EnggDraw",
//   savedAt: "2026-…", document: { sheets: [...], activeSheetId, ... } }
```

### `datum.loadDocument(file)` → `{ ok, failure?, detail? }`

Replaces the document. Accepts the parsed object or its JSON text. Older
versions are migrated forward; anything that is not a Datum document is
refused and the current document is left untouched.

```js
const result = datum.loadDocument(await response.text());
if (!result.ok) console.warn(result.failure, result.detail);
// failure: "not-json" | "wrong-format" | "too-old" | "from-the-future" | "no-document"
```

### `datum.listSheets()` → `[{ id, name }]`

The sheets, in document order.

### `datum.renderSheetSvg(sheetId, options?)` → `{ ok, svg, width, height }`

One sheet drawn as a **standalone SVG document**, fitted to its contents.
This is the same rendering the written solution and the image export use,
so what the autograder receives is what the student saw.

```js
const figure = datum.renderSheetSvg("sheet_8f31a2c4", { width: 900, height: 600 });
if (figure.ok) saveFile(`figures/${figure.sheetId}.svg`, figure.svg);
// otherwise figure.reason: "missing-sheet" | "empty" | "unmeasured" | "unbounded"
```

### `datum.getSolution()` → `{ latex, references }`

The LaTeX source, and the drawings it references:

```js
const { latex, references } = datum.getSolution();
// references: [{ sheetId: "sheet_8f31a2c4", sheetName: "FBD" }, ...]
```

### `datum.setSolution(latex)` → `{ ok }`

Replaces the LaTeX source and renders it. This is how the OCR tool hands its
output to the student.

### `datum.on(event, listener)` → unsubscribe function

| Event              | When                                               |
| ------------------ | -------------------------------------------------- |
| `"documentchange"` | a drawing, sheet or document setting changed       |
| `"solutionchange"` | the LaTeX source was edited                        |

---

## Embedding Datum in another page

Load Datum in an iframe and name your origin in the URL. The bridge is
**off** unless the page is embedded *and* the embedding origin is listed,
so a page that merely frames Datum cannot read a student's work:

```html
<iframe id="datum" src="https://datum.example/?embedOrigin=https://grader.example"></iframe>
```

Several origins may be given, comma-separated. The bridge is
[`src/api/embed-bridge.js`](../src/api/embed-bridge.js).

### Protocol

Request (parent → Datum):

```js
frame.contentWindow.postMessage(
  { type: "datum:request", id: 1, method: "getSolution", params: [] },
  "https://datum.example"
);
```

Response (Datum → parent), with the same `id`:

```js
{ type: "datum:response", id: 1, ok: true,  result: { latex, references } }
{ type: "datum:response", id: 1, ok: false, error: "Unknown method \"…\"." }
```

Pushed by Datum:

```js
{ type: "datum:ready", apiVersion: 1, documentVersion: 2 }   // once, at start-up
{ type: "datum:event", event: "documentchange" }
{ type: "datum:event", event: "solutionchange" }
```

Methods: `getDocument`, `loadDocument`, `listSheets`, `renderSheetSvg`,
`getSolution`, `setSolution` — the same as the JavaScript API.

A small client:

```js
function datumClient(frame, origin) {
  let next = 0;
  const pending = new Map();
  window.addEventListener("message", ({ origin: from, data }) => {
    if (from !== origin || data?.type !== "datum:response") return;
    const { resolve, reject } = pending.get(data.id) || {};
    pending.delete(data.id);
    data.ok ? resolve?.(data.result) : reject?.(new Error(data.error));
  });
  return (method, ...params) => new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    frame.contentWindow.postMessage({ type: "datum:request", id, method, params }, origin);
  });
}

const call = datumClient(document.getElementById("datum"), "https://datum.example");
await call("setSolution", ocrLatex);
```

---

## Building a submission

Datum does not build the submission itself; it gives you the parts. A
typical integration:

1. `getSolution()` – the LaTeX source and its `references`.
2. For each reference, `renderSheetSvg(sheetId)` – the figure.
3. Replace each `[DRAWING_REFERENCE:<id>]` token with your own figure
   command, for example `\includegraphics{figures/<id>.pdf}` (after
   converting the SVG, e.g. with `rsvg-convert`) or `\includesvg{figures/<id>}`
   with the `svg` package.
4. `getDocument()` – keep the editable `.enggdraw` alongside the submission,
   so a grader can open the student's actual drawing.

---

## The optional server (`server/`)

`npm start` runs a small Node server that serves the built site and offers
one endpoint:

| Endpoint                 | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `GET /api/health`        | `{ status: "ok", tikz: "ready" | "loading" | "unavailable" }` |\| false }`        |
| `POST /api/render-tikz`  | `{ tikz }` → `{ success, svg }` (TikZ → SVG)   |

The editor does not depend on it: the hosted static site works without it.

---

## Versioning and compatibility

- **File format**: `version` in the file. Newer builds read older files; a
  file newer than the build is refused rather than misread. See
  [FILE-FORMAT.md](FILE-FORMAT.md).
- **API**: `API_VERSION`. Additive changes keep the version.
- **Reference token**: `[DRAWING_REFERENCE:<sheetId>]` is stable.
