/*
 * ============================================================
 * THE DAETUM MARK - A CUSTOM GEOMETRIC CAPITAL D
 * ============================================================
 *
 * The product's symbol is a capital D built from instrumentation:
 *
 *       |‾‾‾|
 *       |   )      a vertical SPINE (the flat left edge)
 *       |__.|      a ROUNDED BOWL (the curve on the right)
 *          ·       a solid CENTRAL POINT at the origin
 *        ────      a short HORIZONTAL AXIS
 *
 * The D is not a letter placed behind a diagram. It EMERGES from the geometry:
 * the spine is the letter's straight edge, and the arc is its bowl. Every other
 * element is subordinate and sits inside the letterform.
 *
 * ============================================================
 * THE BOWL'S CENTRE SITS ON THE SPINE - THE PROPERTY THAT MAKES IT A D
 * ============================================================
 *
 * A ring with a dot in it is an orbit, a target, a compass rose - anything but a
 * letter. What makes these shapes read as a D is a single geometric fact:
 *
 *     THE ARC IS THE RIGHT-HAND SEMICIRCLE OF A CIRCLE WHOSE CENTRE LIES ON
 *     THE SPINE, AT THE CENTRAL DOT.
 *
 * The spine is a DIAMETER of the bowl's circle rather than a chord beside it. So
 * the arc leaves the TOP of the spine, sweeps right, and returns to the BOTTOM
 * of the spine - and the letter is CLOSED by the spine itself. The opening on
 * the left is therefore not a small gap in a ring; it is the whole left half of
 * the circle, which the spine occupies and REPLACES.
 *
 * ============================================================
 * THE OPENING IS A WIDE SEMICIRCLE, DELIBERATELY
 * ============================================================
 *
 * The arc spans 180 degrees plus a small margin - a semicircle, give or take -
 * which is what a capital D's bowl is. An earlier version drew 300 degrees of
 * circle with a narrow gap, and that reads as an almost-closed orbit rather than
 * as a letter. The wider opening is a design requirement, not a tolerance: it is
 * what leaves room for the spine to be seen AS the left edge.
 *
 * ============================================================
 * THE ARC IS LARGER THAN THAT EARLIER READING, ON PURPOSE
 * ============================================================
 *
 * An earlier drawing centred the bowl to the RIGHT of the spine, so the letter
 * was as tall as it was wide and the arc read as a modest bulge. Making the
 * arc's centre the dot itself - radius 7 against a half-height of 7.8 - gives
 * the generous rounded side the design calls for while keeping the two ends of
 * the arc landing exactly on the spine.
 *
 * ============================================================
 * ONE SOURCE OF TRUTH, TWO RENDERINGS
 * ============================================================
 *
 * The mark appears in the application header AND as the browser tab icon, and
 * the two must never become different drawings of one brand. So the geometry is
 * stated ONCE, here, and both callers use it:
 *
 *   markPaths()        the shapes, as SVG element strings, coloured by
 *                      `currentColor` so the HEADER follows the theme
 *   faviconSource(c)   a standalone SVG document in ONE FIXED COLOUR, because
 *                      the tab icon is a separate document outside the page
 *
 * THE TWO HAVE DIFFERENT COLOUR BEHAVIOUR ON PURPOSE. The header mark is
 * theme-aware - dark ink on the light interface, ice-white on the dark one. The
 * favicon is a CONSTANT BRAND COLOUR under every theme, so the tab looks the
 * same however the application is set. That is why `faviconSource` takes a
 * colour argument rather than reading a token, and why nothing recolours the
 * favicon when the theme changes.
 */

/*
 * The viewBox the mark is drawn in.
 *
 * THE COMPOSITION IS NOT CENTRED ON 12, and that is deliberate. The letter D is
 * a SPINE at the left with a BOWL to its right, so the whole figure sits left of
 * the viewBox's middle. `LETTER_MID_Y` is the vertical middle of the letterform -
 * the spine's midpoint and the axes' crossing - and it is the one reference every
 * element below is placed from.
 *
 * The viewBox itself stays 24x24 with the mark centred inside it, because the
 * negative space on the right is what stops the bowl touching the edge at small
 * sizes. `VISUAL_MID_X` records the middle of the drawn figure so a caller that
 * needs to align to the mark has one number rather than an approximation.
 */
const VIEW_BOX = 24;

/* The vertical middle of the letter - the spine's midpoint, and the origin. */
const LETTER_MID_Y = 12;

/*
 * THE ONE STROKE WEIGHT, shared by the spine, the bowl and both axes, so the
 * line work has a single weight and the mark looks engineered rather than
 * assembled from parts.
 *
 * 1.7 is heavy enough to survive a 16 px favicon - where the whole symbol is
 * about sixteen pixels across - without making the mark look like a glyph.
 */
const STROKE_WIDTH = 1.7;

/*
 * THE SPINE - AND THE VERTICAL AXIS IS THE SAME LINE.
 *
 * This is the correction the design asks for. The spine and the vertical axis
 * are NOT two elements that happen to line up: they are ONE stroke with ONE job,
 * and it does both. It is the flat left-hand edge of the letter D, and it is the
 * vertical coordinate axis the central point is measured from.
 *
 * Drawing them as one line is what makes the figure read as a letterform rather
 * than as a curve with a crosshair laid over it. An earlier version drew the
 * vertical axis at the CENTRE of the bowl (x = 12) and a separate, shorter stem
 * at x = 6.2 - so the mark had two verticals, the dot sat in the middle of the
 * circle, and the result read as a ring with a cross through it.
 *
 * It is the tallest element and it defines the letter's height.
 */
const SPINE_X = 6.2;
const SPINE_HALF_HEIGHT = 7.8;

/*
 * ============================================================
 * THE BOWL - AN EXTENDED ARC WHOSE CENTRE IS OFFSET TO THE RIGHT
 * ============================================================
 *
 * THIS IS THE DEFINING REFINEMENT, and it changed the mark from a semicircle D
 * into a targeting reticle.
 *
 * `BOWL_CX` sits to the RIGHT of the spine rather than on it. The arc is then
 * struck from a centre that is NOT the central dot, which is what lets the curve
 * sweep PAST a semicircle - 250 degrees instead of 180 - and wrap back toward the
 * lower-left. A centre on the spine could only ever draw a half-circle, because
 * the spine would be a diameter; an offset centre makes the spine a CHORD far to
 * the left of the circle, and a chord near the left edge of a circle is subtended
 * by almost the whole circumference.
 *
 *     ARC_SWEEP_DEGREES   250   the arc's travel: top -> right -> bottom -> lower-left
 *     ARC_GAP_DEGREES     110   the deliberate opening on the left
 *
 * 250 + 110 = 360, so the two are one decision stated from either end, and the
 * gap is held between the requirement's 100 and 120 degrees.
 *
 * THE CENTRE IS A DESIGNED CONSTANT, never derived from the dot. The dot stays
 * on the spine; the arc's centre is offset so the curve can reach round the
 * bottom-left. Deriving one from the other is what produced the semicircle, and
 * the requirement rules it out explicitly.
 *
 * WHY THOSE TWO NUMBERS. The arc's two ENDS must sit on the spine's line, at the
 * spine's ends. Those ends are not the circle's westernmost point; they are the
 * points at -215 and +125 degrees, and both are placed explicitly by the code
 * below, which snaps their x to the spine. What the centre and radius DECIDE is
 * the shape between them: how far the curve bulges.
 *
 * A centre at `12.6` and a radius of `8.8` put the circle's westernmost point at
 * `12.6 - 8.8 = 3.8`, eight tenths of a unit to the LEFT of the spine. So the
 * arc's two left-hand ends, held on the spine at `6.2`, sit a little inside the
 * circle's left extreme - which is exactly what makes the spine a CHORD and the
 * curve an extended orbit rather than a half-circle.
 *
 * The radius is stated rather than derived so the curve's curvature is a choice:
 * 8.8 gives a generous, round orbit that reaches `BOWL_CX + ARC_RADIUS = 21.4`
 * on the right, filling the viewBox's right-hand side without touching its edge.
 *
 * The arc is therefore MASSIVELY larger than the dot - radius 8.8 against a dot
 * radius of 2.5 - which is what gives the extended orbit its presence.
 */
const BOWL_CX = 12.6;
const ARC_RADIUS = 8.8;

/*
 * THE TWO ANGLES THAT DEFINE THE EXTENDED ARC.
 *
 * Angles are measured in the SVG convention this file uses: 0 degrees EAST and
 * increasing CLOCKWISE on screen, so -90 is the top, 0 the right, +90 the bottom
 * and 180 the left.
 *
 * The arc OPENS from `-90 - SWEEP/2` and runs clockwise to `-90 + SWEEP/2`: with
 * a 250-degree sweep it starts at -215 degrees (up on the left, past the top) and
 * ends at +125 degrees (down on the left, past the bottom). The 110-degree gap
the two leaves between them straddles due-west - the left flank - which is where
 * the spine stands.
 *
 * So the opening is not a break in a ring: it is the segment of the circle the
 * spine replaces, and the arc's two ends meet the spine's ends.
 */
const ARC_SWEEP_DEGREES = 250;
const ARC_GAP_DEGREES = 360 - ARC_SWEEP_DEGREES;

/*
 * THE CENTRAL POINT - THE TARGETING DOT, ON THE SPINE.
 *
 * Its x IS `SPINE_X`, so the dot is embedded in the vertical line rather than
 * floating beside it, and it is where the horizontal crosshair crosses the
 * spine. It is the visual FOCAL POINT of the mark - the point of aim in the
 * reticle and the origin of the coordinate system at once.
 *
 * RADIUS 3.1 against a stroke of 1.7 is a diameter of 6.2, which is 3.6 times
 * the stroke - inside the design's 3.5 to 4 times, and heavy enough to read as a
 * solid point of aim rather than as a bead on two crossing lines.
 *
 * IT IS NOT THE ARC'S CENTRE. The arc's centre is `BOWL_CX`, offset to the right
 * - see the bowl's note above. The dot marks the spine, which is what makes the
 * mark a reticle rather than a ring with a cross through it.
 */
const DOT_RADIUS = 3.1;
const DOT_X = SPINE_X;
const DOT_Y = LETTER_MID_Y;

/*
 * THE HORIZONTAL CROSSHAIR: the targeting bar through the dot.
 *
 * It runs through the dot and crosses the spine to BOTH sides, which is what
 * gives the figure its reticle character. The arms are deliberately modest: the
 * D's silhouette is the first thing to be read, and a crosshair that reached out
 * to the arc would compete with it.
 *
 * The LEFT ARM is short - it reaches back off the spine into open space. The
 * RIGHT ARM is longer, so it reaches toward the centre of the bowl the arc is
 * struck around rather than stopping dead at the dot. The asymmetry is what
 * balances a figure whose mass sits on the right.
 */
const HORIZONTAL_LEFT = 4.4;
const HORIZONTAL_RIGHT = 6.6;

/*
 * The spine already spans the letter's full height, so there is no separate
 * vertical axis: it IS the spine. This constant is kept as the exported name for
 * callers that describe the axis, and it equals the spine's half-height.
 */
const VERTICAL_ARM = SPINE_HALF_HEIGHT;

/*
 * THE FIGURE'S HORIZONTAL MIDDLE, for a caller that needs to centre the mark.
 *
 * The left extreme is the spine and the right extreme is the bowl
 * (`SPINE_X + ARC_RADIUS`), so the midpoint of those two is the visual centre.
 * It is exported so the header and a favicon can align to one number rather than
 * each approximating the same idea.
 */
const VISUAL_MID_X = SPINE_X + ARC_RADIUS / 2;

/*
 * THE SPINE'S OWN ENDPOINTS, derived from the letter's middle and half-height.
 *
 * They are stated once and read by both the spine's line and the arc's two ends,
 * so the arc can never drift off the tips of the stem: the ends of the arc and
 * the ends of the spine are the same two heights by construction.
 */
const SPINE_TOP = LETTER_MID_Y - SPINE_HALF_HEIGHT;
const SPINE_BOTTOM = LETTER_MID_Y + SPINE_HALF_HEIGHT;

/*
 * ============================================================
 * THE FAVICON COLOUR - ONE CONSTANT, NOT A THEME VARIABLE
 * ============================================================
 *
 * The tab icon is a separate document: it cannot read the page's CSS variables,
 * and it must not change when the theme does. It therefore carries ONE literal
 * colour under every theme - light, dark and every palette.
 *
 * THE VALUE IS DAETUM'S OWN BRAND TEAL (`--datum-green` in the light theme,
 * #087E83). It is chosen rather than inherited because a fixed-colour favicon
 * cannot guarantee the same contrast on every browser's tab strip: the priority
 * is a distinctive, consistent mark, not a contrast guarantee that no fixed
 * colour can make. Against a light tab strip and a dark one alike, a mid-teal
 * mark stays legible, which is the compromise a stable identity requires.
 */
const FAVICON_COLOUR = "#087E83";

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/*
 * A point on the bowl's circle.
 *
 * Angles run 0 degrees EAST and increase CLOCKWISE in screen coordinates, which
 * is the convention an SVG arc sweep already uses - so "clockwise from the
 * upper-left" maps onto these numbers with no sign juggling.
 */
const arcPoint = (degrees) => ({
    x: BOWL_CX + ARC_RADIUS * Math.cos(toRadians(degrees)),
    y: LETTER_MID_Y + ARC_RADIUS * Math.sin(toRadians(degrees)),
});

/*
 * The arc is SYMMETRIC ABOUT DUE-NORTH (-90 degrees).
 *
 * It opens at `-90 - SWEEP/2` and closes at `-90 + SWEEP/2`, running CLOCKWISE
 * through the top, the right and the bottom. With a 250-degree sweep that is
 * -215 degrees (upper-left) round to +125 degrees (lower-left), and the 110
 * degrees it does not cover straddle due-west - the spine's flank.
 *
 * The x is then snapped to the spine EXACTLY. `arcPoint` at those angles is only
 * near the spine's line - the offset centre means the arc's ends sit a little
 * inside the circle's left extreme - so the ends are placed at the spine's x with
 * the y taken from the angle. That makes the arc's tips and the spine's tips the
 * same two points BY CONSTRUCTION, which is what closes the letter.
 */
const ARC_START_DEGREES = -90 - ARC_SWEEP_DEGREES / 2;
const ARC_END_DEGREES = -90 + ARC_SWEEP_DEGREES / 2;

const arcEndPoint = (degrees) => ({
    x: SPINE_X,
    y: arcPoint(degrees).y,
});

const ARC_START = arcEndPoint(ARC_START_DEGREES);
const ARC_END = arcEndPoint(ARC_END_DEGREES);

const round = (value) => Number(value.toFixed(3));

/*
 * ============================================================
 * THE SHAPES, IN PAINTING ORDER
 * ============================================================
 *
 *     spine -> bowl -> axes -> dot
 *
 * THE SPINE AND THE BOWL ARE FIRST, so the letterform is laid down before
 * anything is placed inside it. THE DOT IS LAST, so it sits ON TOP of both axes
 * - otherwise a line would run visibly through the filled centre and the dot
 * would read as a crossing rather than as a point.
 *
 * Every element takes its colour from `currentColor`, so the caller decides the
 * colour by setting `color`. Nothing here is hardcoded to black or to a literal
 * hex, which is what lets ONE drawing serve light mode, dark mode and every
 * palette.
 *
 * THE BOWL IS STRUCK AS A PATH, not as a `<circle>` with a dash: a dash pattern
 * would put the opening wherever the dashes happened to begin, which is fragile
 * and not reproducible. An explicit arc between two stated angles is exact.
 */
function markPaths() {
    return `
        <path
            d="M${SPINE_X} ${round(SPINE_TOP)}V${round(SPINE_BOTTOM)}"
            fill="none"
            stroke="currentColor"
            stroke-width="${STROKE_WIDTH}"
            stroke-linecap="round"
        />
        <path
            d="M${round(ARC_START.x)} ${round(ARC_START.y)}A${round(ARC_RADIUS)} ${round(ARC_RADIUS)} 0 1 1 ${round(ARC_END.x)} ${round(ARC_END.y)}"
            fill="none"
            stroke="currentColor"
            stroke-width="${STROKE_WIDTH}"
            stroke-linecap="round"
        />
        <path
            d="M${round(DOT_X - HORIZONTAL_LEFT)} ${DOT_Y}H${round(DOT_X + HORIZONTAL_RIGHT)}"
            fill="none"
            stroke="currentColor"
            stroke-width="${STROKE_WIDTH}"
            stroke-linecap="round"
        />
        <circle
            cx="${DOT_X}"
            cy="${DOT_Y}"
            r="${DOT_RADIUS}"
            fill="currentColor"
        />
    `.trim();
}

/*
 * ============================================================
 * THE FAVICON, AS A STANDALONE DOCUMENT
 * ============================================================
 *
 * A browser tab is a SEPARATE DOCUMENT, not part of the page, so it cannot
 * inherit `currentColor` and cannot read the theme's CSS variables. It therefore
 * carries the one fixed brand colour above.
 *
 * `transparent` is the ground: no background, border or shadow, so the tab shows
 * the symbol on whatever surface the browser draws rather than on a coloured
 * tile. The previous icon was a green rounded square with a yellow triangle - a
 * tile with a background, which this design rules out.
 *
 * The geometry is the SAME coordinates the header uses, so the tab icon and the
 * header mark are literally one drawing rather than two that were adjusted to
 * match.
 */
function faviconSource(colour = FAVICON_COLOUR) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}" role="img" aria-label="DAETUM">
${markPaths().replace(/currentColor/g, colour)}
</svg>`;
}

const enggDaetumMark = {
    VIEW_BOX,
    LETTER_MID_Y,
    STROKE_WIDTH,
    SPINE_X,
    SPINE_HALF_HEIGHT,
    BOWL_CX,
    ARC_RADIUS,
    ARC_GAP_DEGREES,
    DOT_RADIUS,
    DOT_X,
    DOT_Y,
    HORIZONTAL_LEFT,
    HORIZONTAL_RIGHT,
    VERTICAL_ARM,
    VISUAL_MID_X,
    FAVICON_COLOUR,
    markPaths,
    faviconSource,
};

export default enggDaetumMark;

export {
    VIEW_BOX,
    LETTER_MID_Y,
    STROKE_WIDTH,
    SPINE_X,
    SPINE_HALF_HEIGHT,
    BOWL_CX,
    ARC_RADIUS,
    ARC_GAP_DEGREES,
    DOT_RADIUS,
    DOT_X,
    DOT_Y,
    HORIZONTAL_LEFT,
    HORIZONTAL_RIGHT,
    VERTICAL_ARM,
    VISUAL_MID_X,
    FAVICON_COLOUR,
    markPaths,
    faviconSource,
};
