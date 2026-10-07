/*
 * ============================================================
 * THE LOAD MAGNITUDE POPUP
 * ============================================================
 *
 * A Distributed Load's magnitude is a physical quantity - a force per unit
 * length - and asking for it is the same kind of question the creation
 * popup asks for a length: one number, with the unit it is stated in.
 *
 * So this is a SMALL, SELF-CONTAINED POPUP that reuses the creation
 * popup's styling and conventions but offers the LOAD units - kN/m and
 * N/mm - rather than length units. It deliberately does not touch the
 * shared creation-dimension popup, which is wired to the document's length
 * units and the world scale; a load magnitude is neither.
 *
 * WHAT IT COLLECTS, AND WHAT IT DOES NOT
 * --------------------------------------
 * It collects a NUMBER AND A UNIT and hands them back:
 *
 *     { value: 5, unit: "kN/m" }
 *
 * It performs NO conversion. kN/m and N/mm are the same physical quantity -
 * one kilonewton per metre is one newton per millimetre - so the number the
 * student types is the number that is stored, and the unit travels beside
 * it. Whoever called this decides what the quantity means; this module is
 * only a question about input.
 *
 * THE STUDENT MAY TYPE THE UNIT. "5 kN/m" is read as 5 in kN/m and switches
 * the control to match, so the box never shows one unit while the value was
 * entered in another.
 */
import enggLoadProfile from "../../features/analysis/load-profile.js";

/*
 * The dialog element currently on screen, and the way to close it from the
 * outside. One at a time: opening a second closes the first, so a load
 * being built point by point cannot stack popups behind one another.
 */
let openPopup = null;

export function closeLoadValuePopup() {
    if (!openPopup) {
        return;
    }

    const closing = openPopup;

    openPopup = null;

    closing.remove();
}

/*
 * How a value is written into the field: no exponent notation, no forced
 * decimals, and trailing zeros trimmed by the number itself. The same rule
 * the drawing uses, so a suggested magnitude reads here as it does on the
 * sheet.
 */
function formatValue(value) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return "";
    }

    return String(Number(numeric.toFixed(6)));
}

function unitOptions(selected, units) {
    const list =
        Array.isArray(units) && units.length
            ? units
            : enggLoadProfile?.LOAD_UNITS || ["kN/m", "N/mm"];

    return list
        .map(
            unit =>
                `<option value="${unit}"${
                    unit === selected ? " selected" : ""
                }>${unit}</option>`
        )
        .join("");
}

export function openLoadValuePopup({
    title = "Distributed Load",
    label = "Magnitude",
    value = "",
    unit = enggLoadProfile?.DEFAULT_LOAD_UNIT || "kN/m",

    /*
     * WHICH UNITS THIS POPUP OFFERS.
     *
     * A load is stated in kN/m or N/mm; a force is stated in N. The popup is
     * the same one either way - it is a number and a unit - but the unit list
     * belongs to the QUANTITY, so it is passed in. Without this a force would
     * have been offered load units, which is a category error the student
     * would see immediately.
     */
    units,
    onOpen,
    onConfirm,
    onPreview,
    onCancel
} = {}) {
    closeLoadValuePopup();

    const popup = document.createElement("div");

    popup.className = "drawing-creation-dimension";

    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", title);

    const allowedUnits =
        Array.isArray(units) && units.length
            ? units
            : enggLoadProfile?.LOAD_UNITS || ["kN/m", "N/mm"];

    const initialUnit = allowedUnits.includes(unit)
        ? unit
        : allowedUnits[0];

    const chosen = {
        unit: initialUnit
    };

    popup.innerHTML = `
            <div class="drawing-creation-dimension-title">${title}</div>
            <div class="drawing-creation-dimension-body">
                <span class="drawing-creation-dimension-label"
                    data-load-label>${label}</span>
                <span class="drawing-creation-dimension-input-wrap">
                    <input type="text"
                        class="drawing-creation-dimension-input"
                        data-load-input
                        inputmode="decimal"
                        autocomplete="off"
                        aria-label="${label}">
                    <select
                        class="drawing-creation-dimension-unit"
                        data-load-unit
                        aria-label="Unit">
                        ${unitOptions(chosen.unit, allowedUnits)}
                    </select>
                </span>
            </div>
            <div class="drawing-creation-dimension-error"
                data-load-error hidden></div>
        `;

    document.body.appendChild(popup);

    const input = popup.querySelector("[data-load-input]");
    const select = popup.querySelector("[data-load-unit]");
    const errorEl = popup.querySelector("[data-load-error]");

    input.value = value === null || value === undefined
        ? ""
        : formatValue(value);

    openPopup = popup;

    /*
     * THE FIELD OPENS FOCUSED AND SELECTED, so a student who accepts the
     * suggestion can press Enter at once, and one who wants a different
     * number just types over the top of it.
     */
    input.focus();
    input.select();

    /*
     * TELL THE CALLER THE POPUP IS OPEN, so it can report the current step in
     * the ONE place instructions live - the bottom bar. The popup itself never
     * prints instructions into the Features tab.
     */
    if (typeof onOpen === "function") {
        onOpen();
    }

    const reportPreview = () => {
        if (typeof onPreview !== "function") {
            return;
        }

        const text = input.value.trim();

        const read = enggLoadProfile.readLoadValue(
            text,
            select.value
        );

        onPreview(read);    };

    const confirm = () => {
        const text = input.value.trim();

        /*
         * AN EMPTY FIELD IS NOT A ZERO LOAD. A blank answer has no number to
         * store, so it is refused rather than read as "no load at all" -
         * which is a different statement and one the student did not make.
         */
        if (!text) {
            errorEl.textContent = "Enter a magnitude";
            errorEl.hidden = false;
            input.focus();
            return;
        }

        const read = enggLoadProfile.readLoadValue(
            text,
            select.value
        );

        if (!read) {
            errorEl.textContent =
                "Enter a number, optionally with kN/m or N/mm";
            errorEl.hidden = false;
            input.focus();
            return;
        }

        /*
         * THE STUDENT'S OWN UNIT, if the field named one. Typing an
         * explicit unit is the most specific answer available, so it wins
         * over the control - and the control is moved to match, so the two
         * never disagree about what was entered.
         */
        chosen.unit = read.unit;

        select.value = read.unit;

        errorEl.hidden = true;

        const confirmed = {
            value: read.value,
            unit: read.unit
        };

        if (openPopup === popup) {
            openPopup = null;
        }

        popup.remove();

        if (typeof onConfirm === "function") {
            onConfirm(confirmed);
        }
    };

    const cancel = () => {
        if (openPopup === popup) {
            openPopup = null;
        }

        popup.remove();

        if (typeof onCancel === "function") {
            onCancel();
        }
    };

    /*
     * THE UNIT CONTROL MOVES THE NUMBER WITH IT.
     *
     * kN/m and N/mm are numerically identical, so switching the control
     * does not have to convert anything - but the field is left as typed,
     * and the newly chosen unit is what it will be read in. The preview is
     * re-reported so what is shown follows the choice.
     */
    select.addEventListener("change", () => {
        chosen.unit = select.value;

        reportPreview();
    });

    input.addEventListener("input", () => {
        errorEl.hidden = true;
        reportPreview();
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            /*
             * THE ENTER BELONGS TO THIS POPUP, AND MUST NOT REACH THE
             * CANVAS.
             *
             * The application finishes whatever is being built when Enter is
             * pressed - a truss, a polyline, a varying load. A load's
             * magnitude popup is open WHILE that load is being built, so an
             * Enter that reached the canvas would confirm the value and, in
             * the same keystroke, finish the whole load - committing it after
             * the very first point. The event is therefore stopped here, so
             * the popup's own Enter means "use this value" and nothing else.
             */
            event.preventDefault();
            event.stopPropagation();
            confirm();
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
        }
    });

    /*
     * ENTER CONFIRMS, WHICHEVER CONTROL HAS FOCUS.
     *
     * The student's rhythm is "type the number, pick the unit, press Enter",
     * so the Enter arrives while the UNIT SELECT has focus - not the text
     * field. Listening on the popup (which sees every keydown inside it, from
     * any control) means the confirmation is the same whichever control was
     * last touched, and an Apply-button click is never required.
     *
     * Escape anywhere closes it. Neither key is allowed to reach the canvas: a
     * load's popup is open WHILE that load is being built, and the canvas
     * treats Enter as "finish what I am making" - which would commit the load
     * on the same keystroke that accepted its first value.
     */
    popup.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            confirm();
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
        }
    });

    document.addEventListener(
        "pointerdown",
        function onOutside(event) {
            if (!popup.isConnected) {
                document.removeEventListener(
                    "pointerdown",
                    onOutside
                );
                return;
            }

            if (!popup.contains(event.target)) {
                document.removeEventListener(
                    "pointerdown",
                    onOutside
                );

                cancel();
            }
        },
        true
    );

    return popup;
}
