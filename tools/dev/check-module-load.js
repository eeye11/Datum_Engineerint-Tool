/*
 * Loads every engineering-drawing module in the real order from
 * index.html, in one context, and reports the first that throws. A
 * top-level script that throws leaves its globals undefined and
 * stops nothing else, which is very hard to see from the outside.
 * Verification aid, not part of the application.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.join(__dirname, "..");
const html = fs.readFileSync(
    path.join(projectRoot, "index.html"),
    "utf8"
);

/* The real load order, read from the page rather than assumed. */
const order = [...html.matchAll(/js\/engineering-drawing\/([\w-]+\.js)/g)]
    .map((m) => m[1]);

const sandbox = {
    console,
    window: {},
    document: {
        /*
         * The real elements matter. drawing.js resolves its controls
         * with getElementById at load time and then writes to them
         * unconditionally, so a stub that answers null makes a
         * perfectly good module look like it crashes - which is
         * exactly the false failure this check must not report.
         */
        getElementById: (id) => ({
            id,
            textContent: "",
            value: "",
            hidden: false,
            disabled: false,
            style: {},
            dataset: {},
            classList: {
                add() {},
                remove() {},
                toggle() {},
                contains: () => false
            },
            setAttribute() {},
            getAttribute: () => null,
            appendChild() {},
            removeChild() {},
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            options: [],
            selectedIndex: 0,
            selectedOptions: [],
            closest: () => null,
            focus() {},
            blur() {},
            contains: () => false,
            insertBefore() {},
            cloneNode: () => ({
                childElementCount: 0,
                querySelector: () => null,
                querySelectorAll: () => [],
                setAttribute() {},
                appendChild() {}
            })
        }),
        querySelector: (sel) => ({
            id: sel,
            textContent: "",
            value: "",
            hidden: false,
            disabled: false,
            style: {},
            dataset: {},
            classList: {
                add() {},
                remove() {},
                toggle() {},
                contains: () => false
            },
            setAttribute() {},
            getAttribute: () => null,
            appendChild() {},
            removeChild() {},
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getBoundingClientRect: () => ({
                width: 800,
                height: 600,
                left: 0,
                top: 0,
                right: 800,
                bottom: 600
            })
        }),
        querySelectorAll: () => [],
        getElementsByClassName: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        createElementNS: () => ({
            setAttribute() {},
            getAttribute: () => null,
            appendChild() {},
            style: {},
            classList: { add() {}, remove() {}, toggle() {} },
            querySelectorAll: () => []
        }),
        createElement: () => ({
            style: {},
            dataset: {},
            classList: {
                add() {},
                remove() {},
                toggle() {},
                contains: () => false
            },
            setAttribute() {},
            getAttribute: () => null,
            appendChild() {},
            addEventListener() {}
        }),
        body: { appendChild() {} },
        activeElement: null
    },
    navigator: { clipboard: {}, userAgent: "node" },
    location: { href: "file:///x", protocol: "file:" },
    /*
     * drawing.js attaches its keyboard and pointer handlers at the
     * TOP LEVEL, so a context without these is not a faithful stand-in
     * for the page - it makes a working module look broken. The point
     * of this check is to find modules that genuinely fail, so the
     * browser surface they are written against has to exist.
     */
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    getComputedStyle: () => ({
        getPropertyValue: () => ""
    }),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    Math,
    JSON,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Date,
    Boolean,
    RegExp,
    Error,
    isNaN,
    parseFloat,
    parseInt,
    setTimeout,
    clearTimeout,
    performance: { now: () => 0 }
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.window.window = sandbox;

vm.createContext(sandbox);

let failures = 0;

console.log("Module load order\n");

order.forEach((name) => {
    const file = path.join(
        projectRoot,
        "js",
        "engineering-drawing",
        name
    );

    try {
        vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, {
            filename: name
        });

        console.log("  ok    " + name);
    } catch (error) {
        failures += 1;

        console.log("  FAIL  " + name + " :: " + error.message);
    }
});

/*
 * The globals the reference pipeline depends on. If a module above
 * threw, one of these will be missing - and that is the whole
 * explanation for a reference that never renders.
 */
console.log("\nGlobals the reference pipeline needs\n");

[
    "enggDrawingSheets",
    "enggDrawingReference",
    "enggDrawingState",
    "enggDrawingExport",
    "enggDrawingRenderer",
    "enggWrittenReferences"
].forEach((name) => {
    const present = typeof sandbox.window[name] !== "undefined";

    console.log(
        (present ? "  ok    " : "  MISSING  ") + name
    );

    if (!present) {
        failures += 1;
    }
});

console.log(
    "\n" +
        (failures
            ? failures + " problem(s)"
            : "all modules loaded")
);

process.exit(failures ? 1 : 0);
