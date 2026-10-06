/*
 * ============================================================
 * WHAT EACH FEATURE TYPE IS
 * ============================================================
 *
 * One entry per stored feature type (the `type` field of a feature),
 * declaring the groups it belongs to. Code that needs to know "is this a
 * support?" or "can a load attach to this?" asks the predicates below,
 * rather than keeping its own list of type names - so adding a type, or
 * moving one between groups, is one edit here instead of a hunt through
 * every module that once listed it.
 *
 * TRAITS
 * ------
 *   body        a Statics body that other Statics features attach to
 *               (supports, loads, moments, connections)
 *   attachable  a Statics feature that can be attached to a body
 *   support     a support (pin, roller, fixed, smooth)
 *   connection  a connection between bodies (pin, fixed, slider)
 *   vector      drawn with the shared vector arrows, so it carries the
 *               Statics vector display settings
 *   spanShaped  a straight member between two ends: hit-tested and
 *               box-selected along its span rather than as an area
 *
 * The order of entries is meaningful where a list is derived from it:
 * typesWith("body") lists bodies in the order the Statics tools offer
 * them.
 */
export const FEATURE_TYPES = Object.freeze({
    line: { spanShaped: true },

    particle: { body: true },
    "rigid-body": { body: true },
    beam: { body: true, spanShaped: true },
    truss: { body: true, spanShaped: true },
    cable: { body: true, spanShaped: true },
    shaft: { body: true, spanShaped: true },

    force: { attachable: true, vector: true },
    resultant: { vector: true },
    load: { attachable: true, vector: true },
    "varying-load": { attachable: true, vector: true },
    moment: { attachable: true },

    "pin-support": { attachable: true, support: true },
    "roller-support": { attachable: true, support: true },
    "fixed-support": { attachable: true, support: true },
    "smooth-support": { attachable: true, support: true },

    "pin-connection": { connection: true, spanShaped: true },
    "fixed-connection": { connection: true, spanShaped: true },
    "slider-connection": { connection: true, spanShaped: true },
    /* The generic connection, kept so older documents still read correctly. */
    connection: { spanShaped: true }
});

const traitOf = (type, trait) => Boolean(FEATURE_TYPES[type]?.[trait]);

/* Every type with a trait, in the order they are declared above. */
export function typesWith(trait) {
    return Object.keys(FEATURE_TYPES).filter(type => traitOf(type, trait));
}

/* The Statics bodies, in the order the Statics tools offer them. */
export const STATICS_BODY_TYPES = Object.freeze(typesWith("body"));

export const isStaticsBodyType = type => traitOf(type, "body");
export const attachableStaticsType = type => traitOf(type, "attachable");
export const isSupportType = type => traitOf(type, "support");
export const isConnectionType = type => traitOf(type, "connection");
export const isSpanShapedType = type => traitOf(type, "spanShaped");
export const usesStaticsVectors = object => traitOf(object?.type, "vector");
