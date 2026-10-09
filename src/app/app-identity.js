/*
 * ============================================================
 * THE APPLICATION'S IDENTITY, IN ONE PLACE
 * ============================================================
 *
 * The product is DAETUM. This module is the ONE place its name is written
 * down, so a component that has to name the product imports it rather than
 * typing the word again - which is how a codebase ends up half-renamed.
 *
 * WHAT IS NOT RENAMED, AND WHY
 * ----------------------------
 * Several names still say "datum", and every one of them is a TECHNICAL
 * identifier rather than branding. Renaming any of them would break
 * compatibility for no gain, so they are deliberately left alone:
 *
 *   window.datum                      the integration API object
 *   createDatumApi                    the function that builds it
 *   onDatumEvent / emitDatumEvent     its event helpers
 *   DATUM_EVENTS                      its event-name table
 *   datum:request and friends         the postMessage protocol
 *   datum-* CSS classes               internal styling hooks
 *   datum:* storage keys              localStorage keys for theme, recents
 *   symbolId: "datum"                 an annotation symbol's own id
 *
 * The test `app-identity.test.cjs` records that distinction, so a later edit
 * cannot quietly rename an API contract or reintroduce the old product name.
 */

/* The product's name, and the spelling to use wherever the product is named. */
export const APP_NAME = "DAETUM";

/*
 * The name of a saved drawing document, as a PERSON would say it. Lowercase
 * "project" reads as a category beside the wordmark rather than as a second
 * product, so it is kept out of APP_NAME.
 */
export const APP_DOCUMENT_NOUN = "project";

/*
 * A console prefix. Console output is developer-facing, but it is still the
 * product's voice, so it takes the same name rather than the old one.
 */
export const APP_LOG_PREFIX = `[${APP_NAME}]`;

const enggAppIdentity = {
    APP_NAME,
    APP_DOCUMENT_NOUN,
    APP_LOG_PREFIX
};

export default enggAppIdentity;
