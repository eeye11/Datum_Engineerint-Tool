/*
 * ========================================================
 * ERROR REPORTING
 * ========================================================
 *
 * One place to report a failure that was caught, so that "handled safely" never
 * means "swallowed". A silent `catch {}` is the most dangerous line in an
 * engineering application, because it can leave a student believing their work
 * was saved, or created, when it was not.
 *
 * WHAT THIS DOES
 * --------------
 *   - records the failure with the operation that was running and any context
 *     the caller has (a feature's type and id, a document version, a file name)
 *   - keeps a short in-memory ring of the most recent failures, so a bug report
 *     can say what happened without the user reproducing it
 *   - logs to the console in full, with the stack
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It does not show anything to the user. A failure that the application can
 * recover from should not interrupt a drawing session - the caller decides
 * whether the person needs to be told. A stack trace in a dialog is noise to
 * everyone except the person fixing it.
 *
 * PRIVACY. The context carried here is the drawing's own metadata - feature
 * types, ids, counts, a file name. No drawing contents, no personal data and no
 * storage of what was typed are recorded.
 */

/*
 * The failures kept. Small on purpose: this is for "what just happened", not a
 * log file. A hundred entries is far more than any real session produces in a
 * burst, and it cannot grow without bound.
 */
const MAX_ENTRIES = 100;

const entries = [];

/*
 * Whether to write to the console.
 *
 * Always, unless the page says otherwise. A developer with the console open is
 * the person these are for, and a caught error that is never printed is a bug
 * that will take an afternoon to find.
 */
function verbose() {
    return globalThis.__DATUM_QUIET_ERRORS__ !== true;
}

/*
 * Report a caught failure.
 *
 *   reportError(operation, error, context)
 *
 * `operation` names what was being attempted - "render feature", "save
 * document", "load file" - so the entries read as a sequence of actions rather
 * than a list of messages. `context` is optional and should carry only what
 * identifies the thing that failed.
 */
function reportError(operation, error, context = {}) {
    const entry = {
        at: Date.now(),
        operation: String(operation || "unknown operation"),
        message: String(
            (error && error.message) || error || "unknown error"
        ),
        name: (error && error.name) || "Error",
        stack: (error && error.stack) || null,
        context: { ...context }
    };

    entries.push(entry);

    while (entries.length > MAX_ENTRIES) {
        entries.shift();
    }

    if (verbose() && typeof console !== "undefined" && console.error) {
        console.error(
            `[DAETUM] ${entry.operation} failed:`,
            entry.message,
            context,
            error
        );
    }

    return entry;
}

/*
 * The most recent failures, newest last.
 *
 * A COPY, so a caller cannot mutate the log by accident. The log is evidence,
 * and evidence that a consumer can edit in place is not evidence - the next
 * reader would see a changed record rather than what actually happened.
 */
function recent() {
    return entries.map((entry) => ({ ...entry }));
}

function clear() {
    entries.length = 0;
}

/*
 * Wire the two failures the application cannot catch itself.
 *
 * An error inside an event listener or a promise nobody awaited never reaches
 * a `try`, and without these it is lost - the drawing simply stops responding
 * with no explanation. Both are recorded rather than handled: there is nothing
 * safe to do about an error from nowhere, but knowing it happened is the
 * difference between a fixable report and "it just broke".
 */
function installGlobalErrorHandlers(target = window) {
    target.addEventListener("error", (event) => {
        /*
         * A failed <img> fires an `error` event on the element, which is not an
         * application failure - a missing thumbnail must never look like a
         * crash. Only a genuine uncaught script error is recorded.
         */
        if (event && event.message === undefined && !event.error) {
            return;
        }

        reportError("uncaught error", event.error || event.message, {
            source: event.filename,
            line: event.lineno,
            column: event.colno
        });
    });

    target.addEventListener("unhandledrejection", (event) => {
        reportError("unhandled promise rejection", event.reason, {});
    });
}

const enggErrorLog = {
  MAX_ENTRIES,
  clear,
  installGlobalErrorHandlers,
  recent,
  reportError
};

export default enggErrorLog;
