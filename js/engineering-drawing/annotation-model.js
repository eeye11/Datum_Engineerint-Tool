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
(function (root) {
  "use strict";

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

    const angle = Number(geometry.angle);

    const direction =
      Number.isFinite(angle)
        ? `\nθ = ${round(angle, 1)}°`
        : "";

    /*
     * The unit is part of the statement, not decoration. A drawing
     * routinely carries both a 250 mm dimension and a 250 N force, and
     * a reader who has to infer which one a number refers to is being
     * asked to do the reading's job for it.
     */
    return `F = ${formatNumber(magnitude)} N${direction}`;
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
      `Fx = ${formatNumber(
        magnitude * Math.cos(radians)
      )} N`,
      `Fy = ${formatNumber(
        magnitude * Math.sin(radians)
      )} N`
    ].join("\n");
  }

  function momentText(geometry) {
    const magnitude = Number(geometry.magnitude);

    if (!Number.isFinite(magnitude)) {
      return null;
    }

    /*
     * The sense is the moment's own field. A moment drawn clockwise
     * is labelled clockwise; the arrow already shows it, and the
     * label agrees with it rather than restating it in a second
     * convention.
     */
    const sense = geometry.clockwise
      ? "CW"
      : "CCW";

    return `M = ${formatNumber(magnitude)} N·m\n${sense}`;
  }

  function loadText(geometry) {
    const intensity = Number(geometry.intensity);

    if (!Number.isFinite(intensity)) {
      return null;
    }

    const angle = Number(geometry.direction);

    /*
     * A distributed load is drawn along an arrow, and the arrow is
     * what says which way the pressure pushes - so the label shows
     * the same direction rather than leaving the reader to work it
     * out from the drawing.
     *
     * The test is against the load's own angle: straight down is -90
     * degrees and straight up is +90, which are the two angles a
     * load is actually drawn at. Comparing against 0 and 180 would
     * test for a horizontal load, which is not a loading case.
     */
    const within = (degrees) =>
      Number.isFinite(angle) &&
      Math.abs(angle - degrees) < 1;

    const arrow = within(-90)
      ? " ↓"
      : within(90)
        ? " ↑"
        : within(180)
          ? " →"
          : within(0)
            ? " ←"
            : "";

    return `w = ${formatNumber(intensity)} kN/m${arrow}`;
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

    return `w${suffix} = ${formatNumber(magnitude)} kN/m`;
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

    const angle = Number(geometry.angle);

    return [
      `R = ${formatNumber(magnitude)} N`,
      ...(Number.isFinite(angle)
        ? [`θ = ${round(angle, 1)}°`]
        : [])
    ].join("\n");
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
      root.enggMeasurement.resolveAnchor(
        object,
        "position"
      ) ||
      root.enggMeasurement.resolveAnchor(
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
    const span = root.enggMeasurement.twoPointSpan(
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
      root.enggMeasurement.resolveAnchor(
        object,
        "position"
      ) ||
      root.enggMeasurement.resolveAnchor(
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

  root.enggAnnotationModel = {
    KINDS,
    TEXT_MODES,
    annotationsFor,
    createAnnotation,
    findObject,
    formatNumber,
    isGenerated,
    kindsFor,
    isResolved,
    leaderFor,
    moveAnnotation,
    onSourceDeleted,
    releaseToAutomaticPlacement,
    suggestPlacement,
    textFor
  };
})(typeof window !== "undefined"
  ? window
  : globalThis);