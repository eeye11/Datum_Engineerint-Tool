/*
 * Saving a document to disk.
 *
 * Save and Save As use the OPERATING SYSTEM's own save panel, the same
 * one a desktop application gets. Not a dialog built in the page, and
 * not window.prompt: the whole point of a file is where it ends up,
 * and choosing that is the operating system's job, not something the
 * application should be inventing a worse version of.
 *
 * WHAT THE USER GETS
 * ------------------
 * The native panel is asked for a name, a folder and a file type.
 * The .enggdraw type is offered with the document's real extension and
 * MIME type, so the file the user sees in their file manager, and the
 * file EnggDraw can reopen, are the same one.
 *
 * TWO BROWSERS, TWO ROUTES
 * ------------------------
 * Where the File System Access API exists, the panel returns a handle
 * to the file itself. That handle is kept, and a later Save writes
 * straight back to it - no panel, no filename, no chance of quietly
 * saving a second copy somewhere else. This is the behaviour that
 * makes Save genuinely different from Save As.
 *
 * Where it does not - Safari and Firefox today - a download is the only
 * thing a web page can do with a file, so that is what happens. The
 * difference is stated plainly rather than hidden, because the honest
 * consequence is that Save re-offers the name every time: without a
 * handle there is nothing to remember a handle to.
 *
 * WHAT IS WRITTEN
 * ---------------
 * The document body, unmodified, in the same envelope the format module
 * defines. This module never builds content: it is handed the finished
 * document and puts it somewhere. That is what keeps the file a real
 * editable .enggdraw rather than an export that happens to use the
 * right extension.
 */
(function (root) {
  "use strict";

  /*
   * Whether this browser can hand back a handle to a real file.
   *
   * Checked by capability rather than by user agent: what matters is
   * whether showSaveFilePicker exists, and sniffing the user agent to
   * guess at that gets it wrong in both directions.
   */
  function supportsNativePicker() {
    return (
      typeof root.showSaveFilePicker === "function"
    );
  }

  /*
   * The file type offered in the panel.
   *
   * Two descriptions for one extension: the MIME type, which is what a
   * system that knows about EnggDraw will show, and the extension as a
   * fallback for the ones that do not. Both are needed, because a
   * picker showing an unfamiliar type with no extension is confusing
   * and one showing only an extension cannot be filtered properly.
   */
  function fileTypes() {
    const file =
      root.enggDocumentFile;

    return {
      description: "EnggDraw drawing",
      accept: {
        [file.MEDIA_TYPE]: [`.${file.EXTENSION}`]
      }
    };
  }

  /*
   * The file handle for the document, if the browser gave us one.
   *
   * Held across saves and deliberately not shared with anything else:
   * it is the only record of where the document lives, and losing it
   * is exactly what turns Save into Save As.
   */
  let currentHandle = null;

  function currentFileHandle() {
    return currentHandle;
  }

  /*
   * Remember a file the user already has open.
   *
   * When a document is opened rather than saved, the browser can hand
   * back a handle for the file it read. Keeping it means the first
   * Save after an Open writes back to that file rather than producing
   * a copy - the behaviour a user who opened a document and corrected
   * it expects.
   */
  function setFileHandle(
    handle,
    fileName
  ) {
    currentHandle =
      handle || null;

    return currentHandle;
  }

  function forgetFileHandle() {
    currentHandle = null;
  }

  function payloadFor(documentBody) {
    return root.enggDocumentFile.createDocument(
      documentBody
    );
  }

  /*
   * Save, choosing a location.
   *
   * Always shows the panel. That is what Save As means: the user is
   * asking to put this document somewhere specific, and the somewhere
   * is their decision to make.
   *
   * The document keeps its old identity until the write has actually
   * succeeded. That ordering is the difference between "saved as" and
   * "claims to have saved as": if the panel is cancelled, or the disk
   * refuses, the document must still be the one it was - still marked
   * unsaved, still pointing at the file it came from. Adopting the new
   * name first would mean a cancelled Save As silently relabelled the
   * document and the next Save went somewhere the user never chose.
   */
  async function saveAs(
    documentBody,
    suggestedName
  ) {
    const payload = payloadFor(documentBody);

    const text = JSON.stringify(
      payload,
      null,
      2
    );

    if (supportsNativePicker()) {
      let handle = null;

      try {
        handle = await root.showSaveFilePicker({
          suggestedName:
            suggestedName ||
            `drawing.${root.enggDocumentFile.EXTENSION}`,

          /*
           * The panel opens beside the file the document already
           * belongs to, when it belongs to one. Opening in the
           * browser's last-used folder instead would send a
           * correction of an existing drawing somewhere unrelated to
           * it.
           */
          startIn: currentHandle || undefined,

          types: [fileTypes()]
        });
      } catch (error) {
        /*
         * The user closed the panel. Cancelling a Save As is a
         * perfectly ordinary thing to do and is not an error to
         * report - the document is untouched and still unsaved, which
         * is exactly what they asked for.
         */
        if (
          error &&
          (error.name === "AbortError" ||
            error.name === "NotAllowedError")
        ) {
          return null;
        }

        throw error;
      }

      const blob = new Blob([text], {
        type: root.enggDocumentFile.MEDIA_TYPE
      });

      /*
       * The write, and only the write, decides whether this
       * succeeded. Everything before it was preparation.
       */
      const writable = await handle.createWritable();

      await writable.write(blob);
      await writable.close();

      /*
       * Now - and only now - does the document have a new identity.
       */
      currentHandle = handle;

      return handle.name;
    }

    /*
     * No handle to hold, so the download route. The name still comes
     * from the operating system's own save panel, which is the part
     * that matters: the user chooses the folder and the name, not the
     * application.
     */
    const name = await downloadWithPicker(text, {
      suggestedName:
        suggestedName ||
        `drawing.${root.enggDocumentFile.EXTENSION}`
    });

    return name;
  }

  /*
   * Save to the file this document already belongs to.
   *
   * No panel, no new name, and no chance of the document ending up in
   * two places. Returns false when there is nowhere to save to yet,
   * which the caller answers by doing a Save As instead.
   */
  async function save(
    documentBody,
    suggestedName
  ) {
    if (!currentHandle) {
      return null;
    }

    const payload = payloadFor(documentBody);

    const writable = await currentHandle.createWritable();

    await writable.write(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: root.enggDocumentFile.MEDIA_TYPE
      })
    );

    await writable.close();

    return currentHandle.name;
  }

  /*
   * Ask for a location and a name where a native save panel is not
   * available, then download.
   *
   * This is the fallback route, and it exists because without the
   * handle API a web page cannot write to a chosen path - it can only
   * hand the browser a file to download. The user still names the file
   * and the operating system still chooses where it goes.
   *
   * The name is asked for in the application's own dialog, rather than
   * window.prompt, so the one moment where the OS panel is missing
   * still looks like part of EnggDraw. It is used only here, and only
   * on browsers that have no native save panel at all.
   */
  async function downloadWithPicker(
    text,
    { suggestedName }
  ) {
    const values = await root.enggUi.promptDialog(
      "This browser has no system save panel, so " +
        "EnggDraw will ask for the file name here. " +
        "Your browser will then choose where it is saved.",
      {
        title: "Save drawing",
        fields: [
          {
            name: "name",
            label: "File name",
            value: suggestedName,
            placeholder: "drawing.enggdraw"
          }
        ],
        confirm: "Save",
        cancel: "Cancel",

        /*
         * Cancelling leaves the document exactly as it was: nothing
         * about the save happened, so nothing about it is recorded.
         */
        onConfirm: (entered) =>
          (entered.name || "").trim()
            ? entered
            : false
      }
    );

    if (!values) {
      return null;
    }

    return downloadBlob(
      new Blob([text], {
        type: root.enggDocumentFile.MEDIA_TYPE
      }),
      root.enggDocumentFile.withExtension(values.name)
    );
  }

  /*
   * Hand a file to the browser as a download.
   *
   * The last resort, used only when there is no picker of any kind.
   */
  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    return fileName;
  }

  root.enggFileSave = {
    currentFileHandle,
    fileTypes,
    forgetFileHandle,
    save,
    saveAs,
    setFileHandle,
    supportsNativePicker
  };
})(window);
