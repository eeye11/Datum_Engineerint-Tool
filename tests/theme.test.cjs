/*
 * ========================================================
 * THE APPLICATION THEME: ONE PREFERENCE, ONE ATTRIBUTE
 * ========================================================
 *
 * The theme is a preference with three values and exactly one way of applying
 * it: an attribute on the root element, which re-points the CSS tokens the whole
 * interface is styled through.
 *
 * What this pins:
 *
 *   system    REMOVES the attribute, so the stylesheet's media query decides -
 *             which is what makes the correct palette present before any script
 *             runs, and needs no listener for the OS changing
 *   light     sets data-theme="light"
 *   dark      sets data-theme="dark"
 *   rubbish   falls back to system rather than being trusted
 *   it is REMEMBERED, and it never touches the drawing
 */

const { JSDOM } = require("jsdom");

const { modulePath } = require("./helpers/source-path.cjs");

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
  url: "https://datum.test/",
});

global.window = dom.window;
global.document = dom.window.document;

/* A localStorage the module can use, since JSDOM's is not always present. */
const store = new Map();

global.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

global.window.localStorage = global.localStorage;

const theme = require(modulePath("theme.js")).default;

const root = global.document.documentElement;

console.log("\n  the three values, and what each one puts on the root\n");

{
  theme.applyTheme("dark");

  check(
    "dark sets the attribute",
    root.getAttribute("data-theme") === "dark",
    String(root.getAttribute("data-theme")),
  );

  theme.applyTheme("light");

  check(
    "light sets the attribute",
    root.getAttribute("data-theme") === "light",
  );

  theme.applyTheme("system");

  check(
    "system REMOVES it, rather than storing a third value",
    root.hasAttribute("data-theme") === false,
    "the stylesheet's media query decides in that state",
  );
}

console.log("\n  an unrecognised preference is not trusted\n");

{
  theme.applyTheme("spotty");

  check(
    "an unknown value falls back to system",
    root.hasAttribute("data-theme") === false,
  );

  check(
    "and to the system PREFERENCE, not to a made-up one",
    theme.readThemePreference() === "system" ||
      theme.THEME_VALUES.includes(theme.readThemePreference()),
  );
}

console.log("\n  the choice is REMEMBERED\n");

{
  theme.setThemePreference("dark");

  check(
    "a stored preference is read back",
    theme.readThemePreference() === "dark",
    theme.readThemePreference(),
  );

  check(
    "and reapplied on the next start-up",
    (() => {
      root.removeAttribute("data-theme");

      theme.installSavedTheme();

      return root.getAttribute("data-theme") === "dark";
    })(),
  );

  theme.setThemePreference("light");

  check(
    "changing it changes what is remembered",
    theme.readThemePreference() === "light",
  );
}

console.log("\n  storing a corrupt value is survivable\n");

{
  store.set("datum.theme", "chartreuse");

  check(
    "an unrecognised SAVED value reads as system",
    theme.readThemePreference() === "system",
    theme.readThemePreference(),
  );

  check(
    "and applying it does not throw",
    (() => {
      theme.installSavedTheme();
      return true;
    })(),
  );
}

console.log("\n  the resolved appearance, for a control that needs it\n");

{
  theme.setThemePreference("dark");
  check("dark resolves to dark", theme.resolvedTheme() === "dark");

  theme.setThemePreference("light");
  check("light resolves to light", theme.resolvedTheme() === "light");

  /*
   * With no matchMedia available, System Default must not claim to have
   * detected anything - it settles on light rather than pretending.
   */
  global.matchMedia = undefined;
  theme.setThemePreference("system");

  check(
    "system resolves honestly when detection is unavailable",
    theme.resolvedTheme() === "light",
    "it must not pretend to have detected an OS preference",
  );

  global.matchMedia = (query) => ({
    matches: query.includes("dark"),
  });

  check(
    "and follows the OS when it CAN be detected",
    theme.resolvedTheme() === "dark",
  );

  global.matchMedia = undefined;
}

console.log("\n  the theme never touches the drawing\n");

{
  const fs = require("fs");
  const { locate } = require("./helpers/source-path.cjs");

  const source = fs.readFileSync(locate("theme.js"), "utf8");

  /*
   * The document model must not be reachable from here: a theme is how somebody
   * likes to work, not a property of their drawing.
   */
  check(
    "the theme module does not import the drawing state",
    !/drawing-state/.test(source),
  );

  check("nor the renderer", !/renderer\.js/.test(source));

  check(
    "it only ever writes an attribute on the root element",
    !/setAttribute\(\s*["'](?!data-theme)/.test(source),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
