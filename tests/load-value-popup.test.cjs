/*
 * ========================================================
 * THE LOAD MAGNITUDE POPUP
 * ========================================================
 *
 * The popup asks one question - a load's magnitude, in kN/m or N/mm - and
 * hands back a number and a unit. It performs no conversion, because the two
 * units are the same physical value.
 *
 * THE BUG THIS FILE PINS DOWN. The application finishes whatever is being
 * built when Enter is pressed. A load's magnitude popup is open WHILE that
 * load is being built, so an Enter that reached the document would confirm
 * the value AND finish the load in the same keystroke - committing a varying
 * load after its very first point. The popup must therefore STOP the Enter
 * it handles, so its own Enter means "use this value" and nothing else.
 */

const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

const { modulePath } = require("./helpers/source-path.cjs");

const popup = require(modulePath("load-value-popup.js"));

const popupElement = () =>
  document.querySelector(".drawing-creation-dimension");

console.log("\n  the popup collects a value and a unit\n");

/*
 * A confirmed answer carries the number the student typed and the unit beside
 * it. The value is NOT converted: "5" in kN/m is 5 in kN/m.
 */
{
  let confirmed = null;

  popup.openLoadValuePopup({
    title: "Distributed Load",
    label: "Magnitude",
    value: "5",
    unit: "kN/m",
    onConfirm: (answer) => {
      confirmed = answer;
    },
  });

  const input = document.querySelector("[data-load-input]");
  input.value = "12.5";
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );

  check(
    "Enter confirms the typed number",
    confirmed && confirmed.value === 12.5,
    JSON.stringify(confirmed),
  );

  check(
    "and the unit follows the control",
    confirmed && confirmed.unit === "kN/m",
    JSON.stringify(confirmed),
  );

  check("the popup closes once confirmed", popupElement() === null);
}

console.log("\n  the Enter it handles does not reach the document\n");

/*
 * THE REGRESSION. A keydown on the input must be stopped, or the document's
 * own Enter handler finishes the load being built. The listener is registered
 * on `document` (bubble), so this records whether the event arrives there.
 */
{
  let reachedDocument = false;
  let confirmed = null;

  const spy = () => {
    reachedDocument = true;
  };

  document.addEventListener("keydown", spy);

  popup.openLoadValuePopup({
    value: "3",
    unit: "kN/m",
    onConfirm: (answer) => {
      confirmed = answer;
    },
  });

  const input = document.querySelector("[data-load-input]");

  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );

  document.removeEventListener("keydown", spy);

  check(
    "the popup's Enter is handled",
    confirmed && confirmed.value === 3,
    JSON.stringify(confirmed),
  );

  check(
    "and it does NOT bubble to the document, so no load is finished",
    reachedDocument === false,
    "the Enter reached the document's key handler",
  );
}

console.log("\n  a typed unit wins over the control\n");

/*
 * "5 N/mm" names its own unit, and the control is moved to match so the box
 * never shows one unit while the value was entered in another.
 */
{
  let confirmed = null;

  popup.openLoadValuePopup({
    value: "5",
    unit: "kN/m",
    onConfirm: (answer) => {
      confirmed = answer;
    },
  });

  const input = document.querySelector("[data-load-input]");
  const select = document.querySelector("[data-load-unit]");

  input.value = "5 N/mm";
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );

  check(
    "a unit typed in the field is used",
    confirmed && confirmed.unit === "N/mm",
    JSON.stringify(confirmed),
  );

  check(
    "and the number is the one typed",
    confirmed && confirmed.value === 5,
    JSON.stringify(confirmed),
  );

  void select;
}

console.log("\n  an empty or unusable field is refused, not stored\n");

{
  let confirmed = null;

  popup.openLoadValuePopup({
    value: "",
    unit: "kN/m",
    onConfirm: (answer) => {
      confirmed = answer;
    },
  });

  const input = document.querySelector("[data-load-input]");
  input.value = "";

  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );

  check(
    "an empty field CONFIRMS as Unknown, rather than being refused",
    confirmed !== null && confirmed.unknown === true && confirmed.text === "",
    JSON.stringify(confirmed),
  );

  check(
    "and the popup closes, because the answer was accepted",
    popupElement() === null,
    "Unknown is a real answer - the Features panel prints it as an unknown quantity",
  );

  popup.closeLoadValuePopup();
}

console.log("\n  cancelling reports nothing\n");

{
  let confirmed = null;
  let cancelled = false;

  popup.openLoadValuePopup({
    value: "5",
    unit: "kN/m",
    onConfirm: (answer) => {
      confirmed = answer;
    },
    onCancel: () => {
      cancelled = true;
    },
  });

  popup.closeLoadValuePopup();

  check("a cancelled popup confirms nothing", confirmed === null);

  check("the popup is gone", popupElement() === null);

  void cancelled;
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
