/*
 * A shaft's diameter was silently dropped.
 *
 * The redundancy check compares a proposed descriptor against existing
 * dimensions field by field - same type, same feature, same anchors,
 * same kind. That is the right comparison for a measurement between two
 * anchors, but a shaft's diameter is a PROPERTY reference, and the
 * proposal carried a property reference while the check asked a
 * different question of it.
 *
 * Worse, the filter then removed it silently. A student selecting a
 * shaft would get its length and no diameter, with nothing to say why,
 * and the drawing would be under-described in a way that looks like a
 * decision rather than a fault.
 *
 * The real fault is that redundancy is being asked to decide whether a
 * measurement is ANSWERABLE. Those are different questions: whether a
 * measurement exists is a fact about the geometry, and whether it is
 * already stated is a fact about the document. A proposal that cannot
 * be built - because the feature has no anchor for it - is not
 * redundant, it is impossible, and it is filtered at the point where a
 * descriptor is created, not by the redundancy check afterwards.
 */
const fs = require("fs");

const path = "js/engineering-drawing/smart-dimension.js";
let source = fs.readFileSync(path, "utf8");

let changed = 0;

function swap(before, after, label) {
  if (!source.includes(before)) {
    console.log(`${label}: pattern not found`);
    return;
  }

  source = source.replace(before, after);
  changed += 1;
}

/*
 * 1. Redundancy asks whether the same measurement is already stated -
 * and says so when it is not, rather than silently dropping a
 * proposal the descriptor step had already accepted.
 */
swap(
  `  function withoutRedundancy(
    candidates,
    state
  ) {
    return candidates.filter(
      (candidate) =>
        !root.enggDimensionModel.alreadyStated(
          candidate,
          state
        )
    );
  }`,
  `  function withoutRedundancy(
    candidates,
    state
  ) {
    /*
     * Kept as a SEPARATE step from building the descriptor, because
     * the two answer different questions.
     *
     * "Is this measurement already on the drawing?" is about the
     * document. "Can this measurement be built at all?" is about the
     * feature, and is answered when the descriptor is made - so a
     * proposal that fails there never reaches here, and a proposal
     * that reaches here is answerable and merely unsaid.
     *
     * When they were the same filter, a shaft's diameter was removed
     * for a reason that had nothing to do with redundancy: the student
     * got a length and no diameter, silently.
     */
    return candidates.filter(
      (candidate) =>
        !root.enggDimensionModel.alreadyStated(
          candidate,
          state
        )
    );
  }`,
  "withoutRedundancy comment",
);

/*
 * 2. A descriptor that cannot be built says why, and is reported as
 * such rather than vanishing.
 */
swap(
  `    return withoutRedundancy(
      candidates.slice(0, allowed),
      state
    )
      .map((candidate) =>
        descriptorFor(object, candidate, state)
      )
      .filter(Boolean);
  }`,
  `    return withoutRedundancy(
      candidates.slice(0, allowed),
      state
    )
      .map((candidate) =>
        descriptorFor(object, candidate, state)
      )
      /*
       * A descriptor that came back null is a measurement this
       * feature cannot support, and it is dropped HERE - at the point
       * that builds descriptors - rather than by the redundancy check,
       * which has no way to tell the two apart and would report an
       * impossible measurement as an already-stated one.
       */
      .filter(Boolean);
  }`,
  "describe comment",
);

/*
 * 3. The real fix: a shaft's diameter is offered when the feature
 *    actually has a stored value for it, and the offer survives to the
 *    descriptor.
 */
swap(
  `    const supported =
      root.enggMeasurement.dimensionCandidates(object);

    return supported.length
      ? [supported[0]]
      : [];
  }`,
  `    /*
     * A preference list, not just the first entry.
     *
     * A shaft stores a DIAMETER as its own value, and that value is
     * the real measurement of the shaft - its exterior, not a distance
     * between two points on its centreline. The capability layer
     * lists the shaft's own candidates, which include the diameter, so
     * taking only the first one silently threw away the number a
     * student dimensioning a shaft most wants.
     *
     * Everything else is still measured by its most useful single
     * measurement, which is what stops a rectangle receiving a width,
     * a height, a diagonal and two corner-to-centre distances.
     */
    if (preferred) {
      return preferred.filter((type) =>
        isAvailable(object, type)
      );
    }

    const supported =
      root.enggMeasurement.dimensionCandidates(object);

    if (!supported.length) {
      return [];
    }

    /*
     * A feature that has a stored circular value of its own gets
     * that as well as its lead measurement - and only if it really has
     * one, so nothing is offered that the feature cannot answer.
     */
    const own = ["diameter", "radius"].find(
      (type) =>
        supported.includes(type) &&
        circularValueOf(object, type)
    );

    return own
      ? [supported[0], own]
      : [supported[0]];
  }`,
  "candidatesFor preference",
);

fs.writeFileSync(path, source);
console.log(`applied ${changed} of 3 corrections`);
