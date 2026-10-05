/*
 * The Annotation object.
 *
 * An annotation DESCRIBES something. A dimension measures it. That is
 * the whole distinction this system turns on, and this module is the
 * other half of it:
 *
 *     "how long is this beam"      -> a Dimension
 *     "250 N at 30 degrees"        -> an Annotation
 *     "assume negligible self-weight"  -> an Annotation
 *
 * So nothing here computes a length, and nothing in the dimension
 * module computes a force. A Point Force has a magnitude, a direction
 * and an application point, and they are three different kinds of
 * fact: the point is geometry and can be dimensioned, while the
 * magnitude and direction are engineering values that only exist
 * because the student put them there. This module states them; it never
 * derives them.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING THIS MODULE EXISTS TO GET RIGHT
 * ---------------------------------------------------------------------------
 *
 * An annotation is a LABEL ATTACHED TO A FEATURE, not a child of it.
 * The student must be able to grab "250 N" and drag it to the other
 * side of the sheet while the force arrow stays exactly where it was,
 * and the label must keep updating from the force afterwards:
 *
 *     Point Force            Annotation "250 N"
 *          \                 at x = 300, y = 150
 *           \
 *            \                sourceFeatureId: pointForce_004
 *             *
 *
 * Move the annotation to x = 450, y = 100. The force does not move.
 * The annotation still says 250 N because it still points at the
 * force. Change the force to 300 N and the annotation says 300 N,
 * still at x = 450, because the student put it there and that choice
 * is theirs.
 *
 * Two properties, therefore, that must never be confused:
 *
 *     sourceFeatureId     WHO the annotation is about
 *     placement           WHERE the annotation sits
 *
 * Moving the annotation changes the second and must not touch the
 * first. Changing the source's value changes what the annotation SAYS
 * and must not touch the second. Conflating them is the failure this
 * module's whole design exists to prevent, so placement is stored with
 * an explicit record of whether the student chose it - and a placement
 * the student chose is never moved again on their behalf.
 *
 * ---------------------------------------------------------------------------
 * GENERATED VERSUS WRITTEN
 * ---------------------------------------------------------------------------
 *
 * A GENERATED annotation derives its text from the feature: a force's
 * magnitude, a moment's sense, a support's name. Change the feature
 * and the text follows, because the text is not stored - it is read
 * from the feature every time it is asked for, the same way a
 * dimension's value is measured rather than remembered.
 *
 * A WRITTEN annotation is the student's own words. "Assume negligible
 * self-weight" is not derived from anything, so editing it is normal
 * text editing and moving it does nothing to any feature.
 *
 * Both keep their text separate from their placement, so a written
 * annotation that the student has positioned still does not become
 * associated with anything just by being near it.
 */
import enggMeasurement from "../../core/geometry/measurement-core.js";

/*
 * ========================================================
 * ANNOTATION KINDS
 * ========================================================
 */

/*
 * The kinds of annotation, and what each is attached to.
 *
 * `generated` is the load-bearing field. A generated annotation has
 * its text read from its feature and is therefore always in step
 * with it; a written one has text of its own and is never in step
 * with anything. A kind that is not generated must be treated as
 * written - an absent flag must never mean "associate it anyway",
 * because that would make a student's own note start rewriting
 * itself when a nearby force is edited.
 */
/*
 * The label kinds, and what each one is able to talk about.
 *
 * `describes` is the honest answer to "may this label be written on

 * this feature". It is declared here rather than worked out from the data,

 * because the data alone is not enough: a moment has a magnitude just as
 * a force does, and probing for one alone would happily label a moment

 * "F = 500 N", which calls a moment a force and means it.

 * So a kind states what it describes, and kindsFor offers only those.

 * A new feature type opts in by naming itself here - in one place, next to

 * the label - rather than by editing the tool that offers them.

 */
const KINDS = {
  "free-text": {
    label: "Note",
    generated: false
  },
  label: {
    label: "Label",
    generated: false
  },
  caption: {
    label: "Caption",
    generated: false
  },
  "force-value": {
    label: "Force value",
    generated: true,
    describes: ["force", "resultant"]
  },
  "force-components": {
    label: "Force components",
    generated: true,
    describes: ["force", "resultant", "force-components"]
  },
  "moment-value": {
    label: "Moment value",
    generated: true,
    describes: ["moment", "couple"]
  },
  "load-value": {
    label: "Load value",
    generated: true,
    describes: ["load"]
  },
  "load-profile-value": {
    label: "Profile value",
    generated: true,
    describes: ["varying-load"]
  },
  "support-label": {
    label: "Support label",
    generated: true,
    describes: [
      "pin-support",
      "roller-support",
      "fixed-support",
      "smooth-support"
    ]
  },
  "connection-label": {
    label: "Connection label",
    generated: true,
    describes: [
      "pin-connection",
      "fixed-connection",
      "slider-connection"
    ]
  },
  "resultant-value": {
    label: "Resultant value",
    generated: true,
    describes: ["force", "resultant"]
  }
};

function isGenerated(kind) {
  return KINDS[kind]?.generated === true;
}

/*
 * ========================================================
 * THE FEATURE TYPES THAT CARRY SOMETHING WORTH ANNOTATING
 * ========================================================
 *
 * Read off the KINDS table rather than kept as a second list.
 *
 * The table is the authority: it already says, per kind, which feature types
 * that kind describes, and it is what decides whether a box can be produced
 * for a feature at all. A list written anywhere else is a list that can fall
 * behind - and it did, immediately: a list naming "distributed-load" and
 * "applied-moment" would offer the switch to features Datum does not have
 * (they are "load" and "moment") and so offer it to nothing at all, while
 * omitting the support and connection labels the table does carry.
 *
 * Two questions are deliberately NOT answered here:
 *
 *   - Whether a particular feature can state a value. That is asked per
 *     feature by `kindsFor`, which probes the feature itself, because a
 *     support with no reaction yet genuinely has nothing to say.
 *   - Whether the annotation should be shown. That is display state, and
 *     lives in `magnitudeShownFor`.
 *
 * This only answers the structural question: is there ever a box for this
 * kind of feature.
 */
function annotatableTypes() {
  const types = new Set();

  Object.keys(KINDS).forEach((kind) => {
    const describes = KINDS[kind]?.describes;

    if (!Array.isArray(describes)) {
      return;
    }

    describes.forEach((type) => types.add(type));
  });

  return types;
}

/*
 * How an annotation's text is chosen.
 *
 * The three are genuinely different, and conflating them is how
 * annotations come to misbehave:
 *
 *   "auto"      the feature's value, re-read every time
 *   "manual"    text the student typed, about anything
 *   "feature-name" the feature's own name, which a rename updates
 */
const TEXT_MODES = {
  auto: "auto",
  manual: "manual",
  "feature-name": "feature-name"
};

/*
 * ========================================================
 * IDENTITY
 * ========================================================
 */

function newAnnotationId() {
  const random =
    typeof globalThis.crypto === "object" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2);

  return `annotation-${random.slice(0, 8)}`;
}

/*
 * ========================================================
 * CREATION
 * ========================================================
 */

/*
 * Build an Annotation.
 *
 *   kind              what it is, from the KINDS table
 *   textMode          auto | manual | feature-name
 *   text              the student's own words, for a manual one
 *   sourceFeatureId   who it is about, or null
 *   anchorRef         which part of that feature, for a profile value
 *   position          where it sits, in drawing units
 *   leader            whether it has a leader, and to what
 *   style             text size, alignment, and so on
 *
 * There is deliberately no `value` parameter for a generated
 * annotation. Its text comes from the feature, and a parameter here
 * would invite a caller to pass a number that then disagreed with
 * the feature it claims to describe.
 */
function createAnnotation({
  kind = "free-text",
  textMode = TEXT_MODES.manual,
  text = "",
  sourceFeatureId = null,
  anchorRef = null,
  position = { x: 0, y: 0 },
  leader = null,
  style = {},
  name,
} = {}) {
  /*
   * A generated annotation is one that reads its text from a
   * feature. Without a feature there is nothing to read from, so it
   * becomes a written note rather than an annotation that silently
   * renders as an empty label forever. That is the safer of the two
   * wrong answers: an empty box on a drawing is a visible defect,
   * while a note is at least readable.
   */
  const generated = isGenerated(kind);

  const mode =
    generated && sourceFeatureId
      ? textMode === TEXT_MODES["feature-name"]
        ? TEXT_MODES["feature-name"]
        : TEXT_MODES.auto
      : TEXT_MODES.manual;

  return {
    id: newAnnotationId(),
    name:
      name || KINDS[kind]?.label || "Annotation",
    type: "annotation",

    annotationKind: kind,

    textMode: mode,

    /*
     * The student's own words. Kept even for a generated
     * annotation - it is what the annotation showed before it was
     * associated, and what it falls back to if the feature is
     * removed while the note is worth keeping.
     */
    text: String(text || ""),

    /*
     * WHO the annotation is about.
     *
     * Separate from everything below, and never written by anything
     * that moves the annotation. This is the field that must
     * survive the student dragging the text box across the sheet.
     */
    sourceFeatureId,

    /*
     * WHICH PART of that feature, for an annotation about one
     * profile point of a varying load rather than the load as a
     * whole.
     */
    anchorRef,

    /*
     * WHERE the annotation sits, in drawing units.
     *
     * The student's to choose, and independent of the feature. See
     * the note at the top of this file: this field changing must
     * never touch sourceFeatureId.
     */
    placement: {
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0
    },

    /*
     * Whether the student has taken charge of the position.
     *
     * Set when they move the annotation, and it is what stops
     * automatic placement reclaiming it. An automatically placed
     * annotation can be repositioned when its source moves; a
     * manually placed one never is, unless the student asks.
     */
    placementMode: "auto",

    /*
     * The leader, when the annotation has one.
     *
     * It belongs to the annotation and is stored as its geometry -
     * not as a Line feature. A leader that were a separate feature
     * would be selectable, listable, deletable and savable on its
     * own, and would survive its annotation being deleted, which is
     * a line left pointing at nothing.
     */
    leader: {
      enabled: Boolean(leader?.enabled),
      target: leader?.target || "source",
      elbow: leader?.elbow || null
    },

    style: {
      fontSize: 12,
      align: "left",
      ...style
    },

    /*
     * Whether the annotation is drawn. A real state rather than a
     * deletion, so hiding a label and losing it are different
     * things and the first can be undone.
     */
    visible: true
  };
}

/*
 * ========================================================
 * TEXT
 * ========================================================
 */

/*
 * What an annotation currently says.
 *
 * A generated annotation reads its feature and formats the value it
 * finds. A written one says what the student typed. The two paths
 * are separate functions rather than one function with a branch, so
 * there is no way for a generated annotation to fall through to its
 * stored text and quietly go stale - which is the exact failure
 * associative annotations exist to prevent.
 *
 * Returns null when an annotation is about something that is no
 * longer there, so a caller can mark it unresolved instead of
 * displaying text that no longer corresponds to anything.
 */
/*
 * ========================================================
 * THE UNIT IS PART OF THE QUANTITY, NOT A SETTING
 * ========================================================
 *
 * A magnitude annotation is ALWAYS written with its unit, and there
 * is no control anywhere that turns one off:
 *
 *     100 N          5 N/m          25 N·m
 *
 * A unit is not decoration on a number - it is what says whether 250
 * is millimetres, newtons or kilonewtons, and a drawing that routinely
 * carries a 250 mm dimension beside a 250 N force needs the reader to
 * be able to tell them apart. So the unit is assembled HERE and always
 * printed, rather than being printed at each call site where it could
 * be left out.
 *
 * THE UNIT USED TO BE A SETTING. There was a `Show Units` flag, and
 * with it off every value drew as a bare number - which is a different
 * STATEMENT, not a plainer rendering of the same one. It is gone, and
 * the remaining `showUnits` on a document is accepted only so a file
 * saved before the control was removed still reads back; it no longer
 * decides anything, and no path may branch on it.
 *
 * THE NUMBER IS NEVER ROUNDED DIFFERENTLY. The unit is text beside a
 * figure, not part of it.
 */
function unitSuffix(unit) {
  /*
   * ALWAYS WRITTEN, WITH NO FLAG BEHIND IT.
   *
   * There is deliberately no second parameter. A `showUnits` boolean
   * used to be threaded through every text builder and thrown away a
   * few lines later, which left the unit system reading as though it
   * were still optional - and left every caller passing a value that
   * could only ever have one answer. A magnitude without its unit is a
   * number that could be any quantity of that size, and a statics
   * drawing routinely carries a 100 N force beside a 100 mm span,
   * which is exactly the pair a reader must be able to tell apart.
   */
  return ` ${unit}`;
}

/*
 * The parts of a generated value, so a caller can decide what to do with
 * the unit without having to strip it back out of a string.
 */
function quantity(
  label,
  value,
  unit
) {
  return `${label} = ${formatNumber(value)}${unitSuffix(unit)}`;
}

/*
 * ========================================================
 * THE DISPLAY SETTINGS A LABEL IS DRAWN WITH
 * ========================================================
 *
 * Read from the document state, and DEFAULTED HERE rather than assumed.
 *
 * These are workspace settings - Show Magnitudes and Show Dimensions -
 * and they live on the state rather than on any feature, because they
 * are a property of the sheet being read rather than of anything drawn
 * on it. That is why a label has to be told them rather than find them
 * on its own source.
 *
 * UNITS ARE NOT ONE OF THEM. There is no unit setting, globally or per
 * feature: a visible quantity always carries its unit, because the
 * unit is what the number means rather than how it is dressed. A
 * document saved with a `showUnits` field still loads; the field is
 * simply not read, so it cannot strip a unit off anything.
 *
 * EVERY SETTING DEFAULTS TO ON.
 *
 * The absence of a setting must not silently mean "off": a drawing saved
 * before these existed, or one loaded by a test with a bare state, would
 * come back with every magnitude stripped off it. The conservative
 * reading of "nobody said otherwise" is the one that was always in
 * force, so that is what an absent field means.
 *
 * Only an explicit `false` turns one off.
 */
function displaySettingsOf(state) {
  const display = (state && state.display) || {};

  return {
    showMagnitudes: display.showMagnitudes !== false,
    showDimensions: display.showDimensions !== false
  };
}

/*
 * ========================================================
 * DOES THIS ONE FEATURE'S ANNOTATION APPEAR?
 * ========================================================
 *
 * There are two switches, and they are not the same question:
 *
 *   THE GLOBAL ONE says whether magnitude annotations are wanted on this
 *   sheet at all. It is a bulk control: turning it off means "no magnitudes
 *   anywhere", and no single feature may argue with that.
 *
 *   THE PER-FEATURE ONE says whether THIS feature's annotation is wanted,
 *   on a sheet where magnitudes are wanted. It exists because twenty forces
 *   on one diagram is unreadable, and the student is the only one who knows
 *   which three matter.
 *
 * The per-feature switch therefore only ever NARROWS the global one. Turning
 * Magnitudes off globally hides everything, including a feature that asked
 * to be shown; turning it back on restores each feature to what it had
 * asked for, rather than flattening them all to "on".
 *
 * That last part is why the preference is stored on the FEATURE and not
 * recomputed from the global switch: if it were derived, toggling the
 * global control off and on again would silently forget every individual
 * choice the student had made in between.
 *
 * An absent preference means "no opinion", which is not the same as "off":
 * it defers to the global setting, so a feature the student has never
 * touched follows the sheet.
 */
function magnitudeShownFor(object, state) {
  const settings = displaySettingsOf(state);

  if (!settings.showMagnitudes) {
    return false;
  }

  const preference = featurePreference(object);

  if (preference === null || preference === undefined) {
    return true;
  }

  return preference !== false;
}

/*
 * THE FEATURE'S OWN OPINION, read from where the panel writes it.
 *
 * `annotationDisplay` holds the per-feature overrides. It is read defensively
 * because an older document will not have it at all, and an absent holder
 * must mean "no opinion" rather than throwing while repainting a panel.
 */
function featurePreference(object) {
  if (!object || typeof object !== "object") {
    return null;
  }

  const holder =
      object.annotationDisplay ||
      object.display ||
      null;

  if (
      !holder ||
      typeof holder !== "object"
  ) {
      return null;
  }

  const value = holder.showMagnitude;

  if (value === undefined || value === null) {
    return null;
  }

  /*
   * Only an explicit boolean is an opinion. A string "false" here would be
   * truthy and would mean the opposite of what it says, which is how a
   * toggle ends up permanently on and inexplicable.
   */
  if (typeof value === "boolean") {
    return value;
  }

  return value === "true";
}

function textFor(
  annotation,
  state
) {
  if (annotation.textMode === TEXT_MODES.manual) {
    return annotation.text;
  }

  const object = findObject(
    state,
    annotation.sourceFeatureId
  );

  /*
   * A generated annotation whose feature has gone.
   *
   * The student's own words are kept where there are any, because a
   * note someone wrote by hand is worth more than a derived value
   * that has stopped existing. Where there are none, the annotation
   * reports that it can no longer be resolved - which shows as an
   * obvious problem rather than as a silently wrong label.
   */
  if (!object) {
    return annotation.text ? annotation.text : null;
  }

  if (
    annotation.textMode ===
    TEXT_MODES["feature-name"]
  ) {
    return object.name || null;
  }

  return generatedText(
    annotation,
    object
  );
}

/*
 * ========================================================
 * SHOULD THIS ANNOTATION BE DRAWN AT ALL?
 * ========================================================
 *
 * A second question from the first one, and the distinction is the whole
 * point of having Show Magnitudes as its own control.
 *
 * `textFor` answers "what does it say". This answers "is there
 * something to say". A force with Show Magnitudes OFF should have NO
 * annotation on it - not an annotation with its text emptied, which
 * would leave a leader line running to nowhere with a stub where the
 * value was.
 *
 * ONLY GENERATED ANNOTATIONS ARE SUBJECT TO IT. A note the student
 * WROTE is theirs: it is not a magnitude, it is their own words about
 * the drawing, and a setting about printed engineering values has no
 * business removing it. The same goes for a feature's name shown as a
 * label.
 */
function isVisible(annotation, state) {
  if (annotation.textMode === TEXT_MODES.manual) {
    return true;
  }

  if (
    annotation.textMode ===
    TEXT_MODES["feature-name"]
  ) {
    return true;
  }

  if (
    !displaySettingsOf(state).showMagnitudes
  ) {
    return false;
  }

  return Boolean(
    textFor(annotation, state)
  );
}

/*
 * WHICH LABELS CAN BE WRITTEN ABOUT THIS FEATURE.
 *
 * Answered by trying, not by type.

 * A kind is available for a feature when asking that kind to state

 * something about it produces real text. That is the honest test, and it is

 * the only one that stays correct as features are added: there is no list

 * of which kinds suit which types, so nothing here can fall out of step

 * with a new feature the way a lookup table would.

 * A feature with no magnitude, for instance, produces nothing for

 * "force-value", so that kind is simply not offered - rather than being

 * offered and then drawing an empty box on the student's drawing.

 * Probing is cheap (a handful of kinds, no drawing) and it is the same

 * code path the annotation will use once created, so what is offered is

 * exactly what will appear.

 * Order matters: the first is the default, so the kinds that say the most

 * come first and the plain label is the fallback.

 */
/*
 * ========================================================
 * A VALUE THAT FOLLOWS ITS FEATURE
 * ========================================================
 *
 * Show Magnitudes was only ever able to reveal annotations that ALREADY
 * existed, and the only thing that made one was the manual Annotation
 * tool. So a student who enabled it on a sheet of forces saw no change:
 * there was nothing underneath to reveal. The value was always
 * computable - `textFor` could state it - but nothing asked it to.
 *
 * So the value is derived HERE, at draw time, from the feature itself.
 *
 * IT IS NOT STORED IN THE DOCUMENT, and that is the point. A stored one
 * would be a second copy of a number the force already owns, free to go
 * stale the moment the magnitude is edited, and it would push back when
 * the force moves. Derived every frame, it cannot disagree with its
 * source: there is nothing to fall out of step.
 *
 * Returning null means "this feature has no magnitude to show", which
 * is a normal answer for a beam or a circle, not a failure.
 */
function derivedAnnotation(object, state) {
  if (!object) {
    return null;
  }

  /*
   * Whether magnitudes are wanted at all, and whether this feature has an
   * opinion. The second defers to the first, and only ever narrows it.
   */
  if (!magnitudeShownFor(object, state)) {
    return null;
  }

  /*
   * The student's own annotations for this feature already say what
   * they want said. A derived value beside them would print the
   * magnitude twice, and neither copy would be the one they placed.
   */
  const existing = annotationsFor(state, object.id);

  if (existing.some((a) => isGenerated(a.annotationKind))) {
    return null;
  }

  const kind = kindsFor(object, state).find((k) =>
    /value|components|profile/.test(k)
  );

  if (!kind) {
    return null;
  }

  const annotation = {
    id: `derived-${object.id}-${kind}`,
    type: "annotation",
    sourceFeatureId: object.id,
    annotationKind: kind,
    textMode: TEXT_MODES.generated,
  };

  /*
   * Placement is asked for AFTERWARDS, because suggestPlacement reads
   * the kind off the annotation it is handed - so it has to be handed a
   * whole one. Building the placement inside the literal would refer to
   * `annotation` before it exists.
   */
  annotation.placement = suggestPlacement(annotation, state);

  /*
   * ========================================================
   * AND THEN THE STUDENT'S OWN MOVE IS APPLIED
   * ========================================================
   *
   * The suggestion above is where the box NATURALLY falls - beyond the
   * arrowhead, on the side the reader looks along. It is a starting
   * position, not a fixed one: `F = 100 N` printed across an arrowhead is
   * unreadable, and the student is the only one who knows where on a busy
   * sheet there is room for it.
   *
   * So a moved box stores WHERE IT WAS PUT and this adds that to the
   * suggestion. Only the position is remembered - the text is still
   * derived from the feature on every frame, so moving the box cannot
   * make its number disagree with the force it belongs to, and editing the
   * force cannot make the box drift off the number.
   *
   * An offset of zero or none means "where it naturally falls", which is
   * where a box that has never been moved sits, and where it returns if
   * the student drags it back to where it started.
   */
  const offset = object.geometry?.magnitudeOffset;

  if (offset && (offset.x || offset.y)) {
    annotation.placement = {
      x: annotation.placement.x + (offset.x || 0),
      y: annotation.placement.y + (offset.y || 0),
    };

    /*
     * MARKED AS MOVED, so the renderer and the hit test agree about which
     * box is being drawn and do not each work it out separately.
     */
    annotation.moved = true;
  }

  /*
   * Asked of the real object rather than assumed, so a kind that offers
   * but cannot state (no magnitude field on this particular feature)
   * contributes nothing instead of a leader to an empty spot.
   */
  if (!textFor(annotation, state)) {
    return null;
  }

  return annotation;
}

function kindsFor(object, state) {
  if (!object) {
    return [];
  }

  return Object.keys(KINDS).filter((kind) => {
    if (!isGenerated(kind)) {
      return false;
    }

    /*
     * A kind must be one this kind of feature can carry.
     *
     * Checked before probing, because the probe cannot tell a moment
     * from a force: both hold a magnitude, so both would answer "F = 500 N"
     * if asked. The declaration is what knows the difference.
     */
    const describes = KINDS[kind].describes;

    if (
      Array.isArray(describes) &&
      !describes.includes(object.type)
    ) {
      return false;
    }

    const probe = {
      annotationKind: kind,
      textMode: TEXT_MODES["auto"],
      text: null,
      sourceFeatureId: object.id
    };

    const text = textFor(probe, state);

    return (
      typeof text === "string" &&
      text.trim().length > 0
    );
  });
}

function findObject(state, objectId) {
  return (
    (state?.objects || []).find(
      (object) => object.id === objectId
    ) || null
  );
}

/*
 * The engineering values a feature actually holds.
 *
 * Reads only what the feature states. Nothing here computes a
 * reaction, an equilibrium or a resultant from other features: if a
 * value is not on the feature, it is not stated, and saying so is
 * better than inventing one. That is the line between annotating a
 * drawing and solving it, and the system stays on the right side of
 * it deliberately.
 */
function generatedText(
  annotation,
  object
) {
  const geometry = object.geometry || {};
  const type = object.type;

  switch (annotation.annotationKind) {
    case "force-value":
      return forceText(geometry);

    case "force-components":
      return forceComponentText(geometry);

    case "moment-value":
      return momentText(geometry);

    case "load-value":
      return loadText(geometry);

    case "load-profile-value":
      return profileText(
        annotation,
        geometry
      );

    case "support-label":
      return supportText(object);

    case "connection-label":
      return connectionText(object);

    case "resultant-value":
      return resultantText(geometry);

    case "label":
      return object.name || null;

    default:
      return annotation.text || null;
  }
}

/*
 * A force's magnitude and direction.
 *
 * The magnitude is stated, not computed: it is the number the
 * student typed onto the force. The direction is the force's own
 * angle field, and the components are that magnitude resolved along
 * the axes - which is a restatement of one stored value, not a
 * calculation about the drawing. No reaction is involved, because no
 * reaction exists on the force.
 */
function forceText(geometry) {
  const magnitude = Number(geometry.magnitude);

  if (!Number.isFinite(magnitude)) {
    return null;
  }

  /*
   * MAGNITUDE ONLY. NO ANGLE, EVER.
   *
   * The direction is the ARROW's job, and it is already doing it:
   * a vector drawn at 30 degrees needs nothing written beside it to
   * say so, and "F = 100 N / θ = 30°" stated the same fact twice -
   * once graphically, which is where a reader actually wants it, and
   * once as text that can disagree with the arrow if either is
   * edited alone.
   *
   * Removing the number also removes a class of bug. The arrow can be
   * dragged, flipped and re-angled; the text was a snapshot taken
   * when the annotation was built, so it was only ever a stale copy of
   * what the drawing already shows.
   */
  return quantity("F", magnitude, "N");
}

/*
 * A force resolved onto the axes.
 *
 * The components are what the drawing already implies about its own
 * arrow: a force of F at angle θ has those components. Stating them
 * is a reading of the force, not a new fact about it.
 */
function forceComponentText(geometry) {
  const magnitude = Number(geometry.magnitude);
  const angle = Number(geometry.angle);

  if (
    !Number.isFinite(magnitude) ||
    !Number.isFinite(angle)
  ) {
    return null;
  }

  const radians = (angle * Math.PI) / 180;

  return [
    quantity(
      "Fx",
      magnitude * Math.cos(radians),
      "N"
    ),
    quantity(
      "Fy",
      magnitude * Math.sin(radians),
      "N"
    )
  ].join("\n");
}

function momentText(geometry) {
  const magnitude = Number(geometry.magnitude);

  if (!Number.isFinite(magnitude)) {
    return null;
  }

  /*
   * THE SENSE IS NOT WRITTEN DOWN EITHER.
   *
   * A moment's direction is the curved arrow, drawn clockwise or
   * anticlockwise, and the arc is unambiguous. Appending "CW" or
   * "CCW" to the number repeated it as text - and, as with the force
   * angle, in a second place that could be stale the moment the
   * moment was flipped.
   */
  return quantity("M", magnitude, "N·m");
}

function loadText(geometry) {
  const intensity = Number(geometry.intensity);

  if (!Number.isFinite(intensity)) {
    return null;
  }

  const angle = Number(geometry.direction);

  /*
   * The intensity alone. Which way a distributed load pushes is
   * shown by the row of arrows above the member - that is the
   * standard way a load diagram reads, and adding a direction
   * glyph to the label duplicated what the arrows already say
   * while consuming space beside every annotation on the sheet.
   */
  void angle;

  return quantity("w", intensity, "kN/m");
}

/*
 * One profile point of a varying load.
 *
 * A varying load's magnitudes are the values the student placed at
 * its own distribution points, so each gets its own annotation
 * reading that point - not the whole profile, and not a fitted
 * value. Change the point's magnitude and the annotation at that
 * point changes with it.
 */
function profileText(
  annotation,
  geometry
) {
  const points = Array.isArray(geometry.points)
    ? geometry.points
    : [];

  /*
   * Which point this annotation is about. Without one, the first
   * point is described - which is the common case when a student
   * annotates a varying load they have just drawn.
   */
  const index = Math.max(
    0,
    Math.min(
      points.length - 1,
      Number(annotation.anchorRef?.index) || 0
    )
  );

  const point = points[index];

  if (!point) {
    return null;
  }

  const magnitude = Number(point.magnitude);

  if (!Number.isFinite(magnitude)) {
    return null;
  }

  /*
   * w1, w2, w3 for the first, second and third - the conventional
   * way of naming a distribution, and clearer than three identical
   * "w = " labels on one load.
   */
  const suffix = String.fromCharCode(
    49 + (index % 9)
  );

  return quantity(
    `w${suffix}`,
    magnitude,
    "kN/m"
  );
}

/*
 * A support's identity.
 *
 * "Pin A" is the support's own name - which is its type plus the
 * name the student gave it. Renaming the support renames the
 * annotation, which is the point: the label follows the feature.
 */
function supportText(object) {
  const label =
    SUPPORT_LABELS[object.type] ||
    humanise(object.type);

  /*
   * A name the student has set is more specific than the type, and
   * showing both is the useful form: "Pin A" identifies which
   * support is meant on a drawing with several.
   */
  return object.name && object.name !== humanise(object.type)
    ? `${label} ${object.name}`
    : label;
}

const SUPPORT_LABELS = {
  "pin-support": "Pin Support",
  "roller-support": "Roller Support",
  "fixed-support": "Fixed Support",
  "smooth-support": "Smooth Support"
};

function connectionText(object) {
  const label = {
    "pin-connection": "Pin Connection",
    "fixed-connection": "Fixed Connection",
    "slider-connection": "Slider Connection",
    connection: "Connection"
  }[object.type] || humanise(object.type);

  return object.name && object.name !== humanise(object.type)
    ? `${label} ${object.name}`
    : label;
}

function resultantText(geometry) {
  const magnitude = Number(geometry.magnitude);

  if (!Number.isFinite(magnitude)) {
    return null;
  }

  /*
   * The resultant's MAGNITUDE. Its direction is the drawn arrow,
   * for the same reason the force's is: the vector is the
   * statement of direction, and a number beside it can only ever be
   * a second copy that may disagree with it.
   */
  return quantity("R", magnitude, "N");
}

function humanise(type) {
  return String(type || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

/*
 * A number for a label.
 *
 * Two decimal places by default and no thousands separator: a force
 * or a magnitude is a measured quantity, and a label that varied its
 * precision with its magnitude would be one the reader has to
 * interpret rather than read. A large value is not written as
 * "1,500.00" on a drawing.
 */
function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  const magnitude = Math.abs(number);

  /*
   * Small values keep more places, because at these scales the
   * decimal places ARE the measurement - 0.25 kN/m and 0.00 kN/m
   * are different loadings.
   */
  const places =
    magnitude === 0
      ? 2
      : magnitude < 1
        ? 3
        : magnitude < 10
          ? 2
          : 1;

  return round(number, places).toFixed(places);
}

function round(value, places) {
  const factor = 10 ** places;

  return (
    Math.round(value * factor * (1 + Number.EPSILON)) /
    factor
  );
}

/*
 * ========================================================
 * PLACEMENT
 * ========================================================
 */

/*
 * Move an annotation, and take charge of where it is.
 *
 * This is the operation the whole module exists to get right.
 *
 * It changes `placement` and NOTHING else. The source feature is
 * not looked up, let alone modified; the association is not
 * revalidated; the text is not regenerated. Moving a label does
 * not move the thing it labels, and does not break the relationship
 * that keeps the label in step with it.
 *
 * The consequence is the one the specification asks for: a student
 * who drags "250 N" to the far side of the sheet gets a label there
 * that still says what the force says, and will say the new number
 * when the force's magnitude changes.
 */
function moveAnnotation(
  annotation,
  position
) {
  annotation.placement = {
    x: Number(position?.x) || 0,
    y: Number(position?.y) || 0
  };

  /*
   * The student has now chosen this position, so automatic
   * placement stops managing it. This is the flag that makes a
   * manually positioned annotation stay where it was put when the
   * source feature later moves - which is the behaviour a label
   * needs in order to be usable on a busy drawing.
   */
  annotation.placementMode = "manual";

  return annotation;
}

/*
 * Hand an annotation back to automatic placement.
 *
 * The explicit act the specification reserves for this: once a
 * student has said "I want it here", nothing moves it until they
 * say otherwise.
 */
function releaseToAutomaticPlacement(
  annotation
) {
  annotation.placementMode = "auto";

  return annotation;
}

/*
 * Where an annotation should sit when it has not been placed.
 *
 * A position just off the feature's own edge, on the side the
 * feature points towards for a force or a load, and above it
 * otherwise. Deliberately simple and never worth defending at
 * length: this is only the FIRST position, and the student's first
 * adjustment overrides it permanently.
 *
 * Avoidance - scoring candidate positions against the geometry and
 * the other annotations - is the placement tool's job, not this
 * module's, because it needs the whole document and this function
 * deliberately only knows one feature.
 */
function suggestPlacement(
  annotation,
  state
) {
  const object = findObject(
    state,
    annotation.sourceFeatureId
  );

  if (!object) {
    return { ...annotation.placement };
  }

  const geometry = object.geometry || {};

  /*
   * A force or a load is drawn along an arrow, so its label goes
   * beyond the arrow's head - the only part of the feature with
   * room, and the side the reader looks along.
   */
  if (
    object.type === "force" ||
    object.type === "load" ||
    object.type === "varying-load"
  ) {
    const end =
      geometry.end || geometry.position;

    const start = geometry.start || end;

    if (end && start) {
      const direction = normalise({
        x: end.x - start.x,
        y: end.y - start.y
      });

      const reach =
        Math.hypot(
          end.x - start.x,
          end.y - start.y
        ) || 1;

      /*
       * Beyond the arrowhead, by a distance that does not shrink
       * with the arrow. A fraction of the arrow's length put the
       * label back INSIDE a short arrow, which is worse than not
       * suggesting a position at all - it suggests one that covers
       * the thing it is labelling.
       */
      const standoff = 10;

      return {
        x: end.x + direction.x * standoff,
        y:
          end.y +
          direction.y * standoff -
          4
      };
    }
  }

  /*
   * A point feature has no extent to sit beside, so the label goes
   * above and to the right - the conventional place for a name, and
   * clear of the coordinate axes drawn from an origin.
   */
  const anchor =
    enggMeasurement.resolveAnchor(
      object,
      "position"
    ) ||
    enggMeasurement.resolveAnchor(
      object,
      "center"
    ) ||
    geometry.start;

  if (!anchor) {
    return { ...annotation.placement };
  }

  return { x: anchor.x + 10, y: anchor.y - 10 };
}

function normalise(vector) {
  const length = Math.hypot(vector.x, vector.y);

  return length < 1e-9
    ? { x: 1, y: 0 }
    : { x: vector.x / length, y: vector.y / length };
}

/*
 * ========================================================
 * LEADERS
 * ========================================================
 */

/*
 * A leader's two ends, in drawing units.
 *
 * Computed fresh every time it is asked for, from the annotation's
 * own placement and the feature's current geometry. That is what
 * makes a leader follow both: move the annotation and its end moves
 * with it, move the feature and the other end moves with it, and
 * neither requires the leader to be stored or re-created.
 *
 * The leader is described, not created. It is not pushed into the
 * document as a Line, so it cannot be selected on its own, cannot
 * appear in the Features list, and cannot outlive the annotation it
 * belongs to.
 */
function leaderFor(
  annotation,
  state
) {
  if (!annotation.leader?.enabled) {
    return null;
  }

  const from = {
    x: annotation.placement.x,
    y: annotation.placement.y
  };

  /*
   * A leader may point at the feature or at somewhere fixed. Fixed
   * is what a caption or a note in a corner of the sheet wants; the
   * default is the feature, which is what an engineering label
   * wants.
   */
  const to =
    annotation.leader.target === "fixed" &&
    annotation.leader.elbow
      ? annotation.leader.elbow
      : anchorFor(annotation, state);

  if (!to) {
    return null;
  }

  /*
   * The line stops short of the feature rather than touching it.
   * A leader whose end sits exactly on a force's arrowhead reads as
   * part of the arrow, and the label then looks like it belongs to
   * the line rather than to the value.
   */
  const trimmed = trim(from, to);

  return {
    from: trimmed.from,
    to: trimmed.to,
    /*
     * The direction the leader runs, so a renderer can put a small
     * termination at the feature end without having to work it out
     * again.
     */
    direction: normalise({
      x: trimmed.to.x - trimmed.from.x,
      y: trimmed.to.y - trimmed.from.y
    })
  };
}

/*
 * Where a leader should attach on the feature.
 *
 * The nearest edge of the feature, so a label sat below a beam has
 * its leader point up at the beam's underside rather than at its
 * centre - which is what makes the leader read as pointing AT the
 * feature rather than crossing it.
 */
function anchorFor(
  annotation,
  state
) {
  const object = findObject(
    state,
    annotation.sourceFeatureId
  );

  if (!object) {
    return annotation.leader.elbow || null;
  }

  const geometry = object.geometry || {};

  /*
   * A feature with an extent contributes the edge nearest the
   * annotation; one without contributes its own point.
   */
  const span = enggMeasurement.twoPointSpan(
    object
  );

  if (span) {
    const reach = Math.hypot(
      span.end.x - span.start.x,
      span.end.y - span.start.y
    );

    const mid = {
      x: (span.start.x + span.end.x) / 2,
      y: (span.start.y + span.end.y) / 2
    };

    /*
     * Offset perpendicular to the span, on whichever side the
     * annotation is, so the leader meets the feature's flank.
     */
    const along = normalise({
      x: span.end.x - span.start.x,
      y: span.end.y - span.start.y
    });

    const side = normalise({
      x: -along.y,
      y: along.x
    });

    const towards =
      (annotation.placement.x - mid.x) * side.x +
        (annotation.placement.y - mid.y) * side.y >=
      0
        ? 1
        : -1;

    const standoff = Math.max(
      4,
      (reach || 10) * 0.1
    );

    return {
      x: mid.x + side.x * standoff * towards,
      y: mid.y + side.y * standoff * towards
    };
  }

  return (
    enggMeasurement.resolveAnchor(
      object,
      "position"
    ) ||
    enggMeasurement.resolveAnchor(
      object,
      "center"
    ) ||
    geometry.position ||
    geometry.start ||
    null
  );
}

/*
 * Stop a leader just short of what it points at.
 */
function trim(from, to) {
  const gap = 3;

  const length = Math.hypot(
    to.x - from.x,
    to.y - from.y
  );

  if (length <= gap) {
    return { from, to };
  }

  const direction = {
    x: (to.x - from.x) / length,
    y: (to.y - from.y) / length
  };

  return {
    from,
    to: {
      x: to.x - direction.x * gap,
      y: to.y - direction.y * gap
    }
  };
}

/*
 * ========================================================
 * RESOLUTION
 * ========================================================
 */

/*
 * Whether an annotation can currently say what it is for.
 *
 * A written annotation always can - it is not about anything. A
 * generated one cannot once its feature has gone, and saying so
 * openly is what stops a deleted force leaving a confident "250 N"
 * pointing at empty space.
 */
function isResolved(
  annotation,
  state
) {
  if (
    annotation.textMode === TEXT_MODES.manual
  ) {
    return true;
  }

  return (
    textFor(annotation, state) !== null
  );
}

/*
 * The annotations that depend on a feature.
 *
 * Returned as a list so a caller can update exactly these and
 * nothing else. This is what makes an edit to one force cost one
 * annotation rather than a sweep of the document: the dependency is
 * resolved from the object's own id, not by asking every annotation
 * whether it cares.
 */
function annotationsFor(
  state,
  featureId
) {
  return (state?.objects || []).filter(
    (object) =>
      object.type === "annotation" &&
      object.sourceFeatureId === featureId
  );
}

/*
 * ========================================================
 * CLEANUP
 * ========================================================
 */

/*
 * What should happen to an annotation whose feature has been deleted.
 *
 * Two kinds of annotation, two answers, and the difference matters:
 *
 *   GENERATED   the text was only ever a reading of the feature, so
 *               there is nothing left. It goes, along with its
 *               leader, because a label of nothing is clutter.
 *
 *   WRITTEN     the student wrote these words. Deleting a force must
 *               not silently destroy something a person typed, so it
 *               is kept and marked unresolved - the text stays, and
 *               it is visibly no longer attached to anything.
 *
 * Automatic cleanup for the first and preservation for the second is
 * what "handle it cleanly" means when the two cases are this
 * different in kind.
 */
function onSourceDeleted(
  annotation
) {
  if (
    isGenerated(annotation.annotationKind) &&
    annotation.textMode !== TEXT_MODES.manual
  ) {
    return { action: "delete" };
  }

  return {
    action: "keep",
    annotation: {
      ...annotation,
      sourceFeatureId: null,
      unresolved: true
    }
  };
}

const enggAnnotationModel = {
  KINDS,
  TEXT_MODES,
  annotationsFor,
  createAnnotation,
  derivedAnnotation,
  displaySettingsOf,
  findObject,
  formatNumber,
  isGenerated,
  kindsFor,
  isResolved,
  isVisible,
  magnitudeShownFor,
  annotatableTypes,
  leaderFor,
  moveAnnotation,
  onSourceDeleted,
  releaseToAutomaticPlacement,
  suggestPlacement,
  textFor
};

export default enggAnnotationModel;
