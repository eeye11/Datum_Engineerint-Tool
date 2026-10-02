/*
 * ========================================================
 * PLOT MODE EQUATIONS
 * ========================================================
 *
 * A Plot diagram is drawn from equations the STUDENT typed. This file is
 * the whole of what that means: turning a list of typed segments into
 * points on a frame.
 *
 * It is a separate module from the analysis dependencies because of the
 * one rule that governs all of it:
 *
 *   THE EQUATION IS THE SOURCE OF TRUTH. THE POINTS ARE A SAMPLE OF IT.
 *
 * So sampling happens here, and a sample is never written back onto the
 * feature as if it were the data. A student who plots a curve, moves the
 * frame and plots again gets the same curve - a stored polyline would have
 * frozen at whatever the first sample happened to be, and changing the
 * range would move the vertices rather than re-derive them.
 *
 * NOTHING HERE READS THE RENDERER. The frame, the beam, the vector scale
 * and the arrow sizes are all irrelevant to the value of V(x) at some
 * distance, which is exactly why a diagram here can be trusted: the curve
 * is a function of x alone.
 */
(function (window) {
    "use strict";

    /*
     * ========================================================
     * READING AN EQUATION
     * ========================================================
     *
     * A student types something like "10 - 5x" or "4x - x^2". This turns
     * that text into a function of x - without eval, and without a
     * general-purpose parser.
     *
     * WHY NOT eval. A parser that hands typed text to a JavaScript
     * evaluator is a way for a formula box to run code, and a formula box
     * is exactly where a student pastes whatever they were handed. The
     * grammar here accepts a fixed, tiny language and refuses everything
     * else, so an expression it does not understand is reported rather
     * than executed.
     *
     * The language is the small one a beam equation is written in:
     *
     *     10              a constant
     *     10 - 5x         linear
     *     4x - x^2        parabolic
     *     x^3 / 6         cubic
     *     2(3x - 1)       a factor
     *     -x + 4          a leading sign
     *     V(x) = 10       the quantity is a label, not part of the maths
     *
     * THERE IS EXACTLY ONE EVALUATOR. An earlier version of this file
     * parsed the tokens twice - once to validate, once to run - and that
     * is the kind of duplication that lets the check and the calculation
     * drift apart and quietly accept something the drawing cannot do.
     * Validation is not a separate pass: if the evaluator can read the
     * whole token stream then the expression is valid, and it is that
     * same code deciding.
     */

    var VARIABLE = "x";

    /*
     * A leading "V(x) =" is stripped before anything else looks at the
     * text, and only when it is genuinely there. The quantity is the NAME
     * of the equation - already on the frame and in the panel heading -
     * and not part of it. Anchoring the pattern at the start means
     * brackets appearing later in a real expression are left alone.
     */
    var QUANTITY_PREFIX =
        /^\s*[A-Za-z]\s*\(\s*[xX]\s*\)\s*=\s*/;

    function tokenize(text) {
        var source = String(text === null || text === undefined
            ? ""
            : text
        ).replace(QUANTITY_PREFIX, "");

        var tokens = [];
        var index = 0;

        while (index < source.length) {
            var char = source[index];

            if (/\s/.test(char)) {
                index++;
                continue;
            }

            if (/[0-9.]/.test(char)) {
                var digits = "";

                while (
                    index < source.length &&
                    /[0-9.]/.test(source[index])
                ) {
                    digits += source[index];
                    index++;
                }

                var value = Number(digits);

                /*
                 * "1.2.3" is a typo, not a number, and Number() would make
                 * it NaN and poison every sample after it.
                 */
                if (!isFinite(value)) {
                    return null;
                }

                tokens.push({ kind: "number", value: value });

                continue;
            }

            if (/[a-zA-Z]/.test(char)) {
                if (char.toLowerCase() !== VARIABLE) {
                    /*
                     * A letter that is not x. "sin" and "pi" are
                     * reasonable to want and are not supported yet;
                     * refusing says so, where guessing would draw
                     * something that merely looks like an answer.
                     */
                    return null;
                }

                tokens.push({ kind: "variable" });

                index++;
                continue;
            }

            if ("+-*/^()".indexOf(char) >= 0) {
                tokens.push({ kind: "op", value: char });

                index++;
                continue;
            }

            return null;
        }

        return tokens;
    }

    /*
     * COULD A FACTOR BEGIN HERE?
     *
     * This is what makes the asterisk optional. Once a factor has been
     * read, the next token continuing the product is a number, an x or an
     * opening bracket. Anything else - another operator, the end of the
     * text, an unrecognised token - ends the product, and the caller then
     * decides what the stray token means.
     */
    function startsFactor(token) {
        if (!token) {
            return false;
        }

        if (
            token.kind === "number" ||
            token.kind === "variable"
        ) {
            return true;
        }

        return (
            token.kind === "op" &&
            token.value === "("
        );
    }

    /*
     * Recursive descent, so the grammar is written as grammar rather than
     * as index arithmetic:
     *
     *     expression := term (('+' | '-') term)*
     *     term       := factor (('*' | '/')? factor)*
     *     factor     := ('-')? primary ('^' factor)?
     *     primary    := number | 'x' | '(' expression ')'
     *
     * The brackets around the star in `term` are what make the asterisk
     * optional, and optional is not a nicety: an equation that required
     * it would refuse nearly everything a student would actually type.
     *
     * The exponent is parsed as a FACTOR, which is what makes 2^-1 and
     * x^2^2 mean what they look like rather than stopping at the first
     * term.
     *
     * Returns null for anything not recognised, INCLUDING a trailing
     * operator. "10 +" is a half-typed equation, and accepting the
     * readable part would draw a wrong answer that looks right.
     */
    function evaluate(tokens, x) {
        var position = 0;

        function isOp(value) {
            var token = tokens[position];

            return Boolean(
                token &&
                token.kind === "op" &&
                token.value === value
            );
        }

        function expression() {
            var left = term();

            if (left === null) {
                return null;
            }

            while (isOp("+") || isOp("-")) {
                var operator = tokens[position].value;

                position++;

                var right = term();

                if (right === null) {
                    return null;
                }

                left = operator === "+"
                    ? left + right
                    : left - right;
            }

            return left;
        }

        function term() {
            var left = factor();

            if (left === null) {
                return null;
            }

            while (true) {
                if (isOp("/")) {
                    position++;

                    var divisor = factor();

                    if (divisor === null || divisor === 0) {
                        return null;
                    }

                    left = left / divisor;

                    continue;
                }

                if (isOp("*")) {
                    position++;
                } else if (!startsFactor(tokens[position])) {
                    break;
                } else if (
                    /*
                     * A NUMBER MAY NOT FOLLOW A COMPLETE FACTOR.
                     *
                     * "2(3x - 1)" is a product, and reading the bracket as
                     * an implicit multiply is right. "10 20" is two
                     * numbers, and the same rule would quietly read it as
                     * 10 x 20 - so a mistyped equation would draw a
                     * confident, wrong curve instead of being reported.
                     * The asterisk stays optional; only an adjacency of
                     * number-then-number is refused.
                     */
                    tokens[position].kind === "number"
                ) {
                    return null;
                }

                var right = factor();

                if (right === null) {
                    return null;
                }

                left = left * right;
            }

            return left;
        }

        function factor() {
            var sign = 1;

            while (isOp("-")) {
                sign = -sign;
                position++;
            }

            while (isOp("+")) {
                position++;
            }

            var base = primary();

            if (base === null) {
                return null;
            }

            var value = sign * base;

            if (isOp("^")) {
                position++;

                var exponent = factor();

                if (exponent === null) {
                    return null;
                }

                value = Math.pow(value, exponent);
            }

            return value;
        }

        function primary() {
            var token = tokens[position];

            if (!token) {
                return null;
            }

            if (token.kind === "number") {
                position++;

                return token.value;
            }

            if (token.kind === "variable") {
                position++;

                return x;
            }

            if (isOp("(")) {
                position++;

                var inner = expression();

                if (inner === null || !isOp(")")) {
                    return null;
                }

                position++;

                return inner;
            }

            return null;
        }

        var result = expression();

        if (
            result === null ||
            position !== tokens.length ||
            !isFinite(result)
        ) {
            return null;
        }

        return result;
    }

    /*
     * A checked equation: a function that yields null rather than NaN, so
     * one bad sample can be skipped instead of putting a hole in the whole
     * curve.
     */
    function equationFor(text) {
        var tokens = tokenize(text);

        if (!tokens || !tokens.length) {
            return null;
        }

        return function (x) {
            var value = evaluate(tokens, x);

            return isFinite(value) ? value : null;
        };
    }

    /*
     * ========================================================
     * SEGMENTS
     * ========================================================
     *
     * A diagram is a LIST of segments, each with its own range and its own
     * equation:
     *
     *     0 -> 2    V(x) = 10
     *     2 -> 5    V(x) = 10 - 5x
     *
     * Held in that order and in those terms - a real start, a real end and
     * a real equation - rather than as a sampled polyline, because the
     * ranges are what the student reasons about and what has to be
     * checked against the body.
     */

    var SAMPLES_PER_SEGMENT = 40;

    function normaliseSegment(segment, index) {
        var from = Number(segment && segment.from);
        var to = Number(segment && segment.to);

        if (!isFinite(from) || !isFinite(to)) {
            return null;
        }

        /*
         * A range typed backwards is a slip, not an error - "5 to 2" is
         * how people say it out loud - so it is read the way it was meant
         * rather than refused, which would leave the student to work out
         * why.
         */
        return {
            id: String(
                (segment && segment.id) || "seg-" + index
            ),
            from: Math.min(from, to),
            to: Math.max(from, to),
            equation: String(
                (segment && segment.equation) || ""
            ).replace(/^\s+|\s+$/g, "")
        };
    }

    /*
     * CHECK THE SEGMENTS AGAINST THE BODY.
     *
     * Reported, never repaired. A range running past the end of the beam is
     * the student having made a mistake, and quietly clamping it would
     * draw a diagram that looks right and is not - the one thing a diagram
     * must never be. So the problems come back as messages and the panel
     * shows them beside the segments.
     */
    function validateSegments(segments, range) {
        var problems = [];

        if (!range) {
            return {
                valid: false,
                problems: [
                    "No source body, so the range cannot be checked."
                ]
            };
        }

        (segments || []).forEach(function (segment, index) {
            if (
                segment.from < range.from - 1e-6 ||
                segment.to > range.to + 1e-6
            ) {
                problems.push(
                    "Segment " + (index + 1) +
                    " (" + segment.from + " to " + segment.to +
                    ") is outside the body, which runs " +
                    range.from + " to " + range.to + "."
                );
            }

            if (!equationFor(segment.equation)) {
                problems.push(
                    "Segment " + (index + 1) +
                    ' needs an equation, such as "10 - 5x".'
                );
            }
        });

        /*
         * A GAP means part of the body is not described at all, and an
         * OVERLAP means two values are claimed for one distance. Both are
         * worth saying: a diagram that is merely incomplete is a different
         * thing from one that is contradictory, and the student can only
         * fix what they have been told about.
         */
        var sorted = (segments || []).slice().sort(
            function (a, b) {
                return a.from - b.from;
            }
        );

        for (var i = 1; i < sorted.length; i++) {
            var previous = sorted[i - 1];
            var current = sorted[i];

            if (current.from > previous.to + 1e-6) {
                problems.push(
                    "Nothing is defined between " + previous.to +
                    " and " + current.from + "."
                );
            } else if (current.from < previous.to - 1e-6) {
                problems.push(
                    "Segments overlap between " + current.to +
                    " and " + previous.from + "."
                );
            }
        }

        if (!sorted.length) {
            problems.push("No segments yet.");
        } else {
            if (sorted[0].from > range.from + 1e-6) {
                problems.push(
                    "The diagram starts at " + sorted[0].from +
                    ", not at the end of the body (" +
                    range.from + ")."
                );
            }

            var last = sorted[sorted.length - 1];

            if (last.to < range.to - 1e-6) {
                problems.push(
                    "The diagram stops at " + last.to +
                    ", short of the end of the body (" +
                    range.to + ")."
                );
            }
        }

        return { valid: problems.length === 0, problems: problems };
    }

    /*
     * ========================================================
     * SAMPLING
     * ========================================================
     *
     * One POLYLINE per segment, returned as a LIST rather than joined.
     * That is what preserves a discontinuity: two segments meeting at
     * different values stay two strokes, because joining them would assert
     * a value for the distance where the jump happens, and there is no
     * such value. A single path has no way to say "do not connect these".
     */
    function sampleSegments(segments, options) {
        var samples = (options && options.samplesPerSegment) ||
            SAMPLES_PER_SEGMENT;

        return (segments || [])
            .map(function (segment) {
                var equation = equationFor(segment.equation);

                if (!equation) {
                    return null;
                }

                var width = segment.to - segment.from;

                /*
                 * A segment of no width has nothing to draw across, and
                 * dividing by it would loop rather than fail.
                 */
                if (!(width > 0)) {
                    return null;
                }

                var steps = Math.max(2, samples);
                var points = [];

                for (var i = 0; i <= steps; i++) {
                    var x = segment.from + width * (i / steps);
                    var value = equation(x);

                    if (value !== null) {
                        points.push({ x: x, value: value });
                    }
                }

                return points.length > 1 ? points : null;
            })
            .filter(Boolean);
    }

    /*
     * The largest magnitude anywhere in the diagram, which is what sets the
     * frame's vertical scale. Sampled rather than solved, so it is the same
     * answer the drawn curve actually has and cannot disagree with what is
     * on screen.
     */
    function peakMagnitude(segments) {
        var peak = 0;

        sampleSegments(segments).forEach(function (points) {
            points.forEach(function (point) {
                var magnitude = Math.abs(point.value);

                if (magnitude > peak) {
                    peak = magnitude;
                }
            });
        });

        return peak;
    }

    window.enggDiagramEquations = {
        equationFor: equationFor,
        normaliseSegment: normaliseSegment,
        validateSegments: validateSegments,
        sampleSegments: sampleSegments,
        peakMagnitude: peakMagnitude,
        SAMPLES_PER_SEGMENT: SAMPLES_PER_SEGMENT
    };
})(window);
