
const path = require("path");
const fs = require("fs");

const { controllerSource, loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * SINGLE-CLICK STATICS CREATION - regression guard.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Six Statics tools - Particle, Rigid Body, Couple Moment and all four
 * Supports - could not be created at all. Selecting one armed it
 * correctly, the status line showed its instruction, and clicking the
 * canvas did nothing: no feature, no Features-panel row, and no error
 * anywhere on screen.
 *
 * The cause was one line, inside createStaticsFeature:
 *
 *     if (isSupportType(type)) { ... }   // read here
 *     ...
 *     const type = definition.type;      // declared here, 70 lines later
 *
 * `const` has no hoisted value, so that read threw a ReferenceError on
 * EVERY call. It was not specific to supports: the crash happened before
 * any type dispatch ran, which is why it took out all six tools. Being
 * raised inside a DOM event listener, it produced no user-visible
 * failure - the app looked armed and simply did nothing.
 *
 * WHY THE EXISTING 21 TESTS MISSED IT
 * -----------------------------------
 * Every one of them drives the geometry factories DIRECTLY. Those
 * factories were always correct. What was broken was the function that
 * decides WHICH factory to call, and that function lives in drawing.js,
 * a browser-coupled module that touches document at load time and so
 * cannot be required in Node.
 *
 * SCOPE, AND WHAT IS DELIBERATELY NOT HERE
 * ---------------------------------------
 * This file asserts two things and does not try to be a general linter.
 *
 * An earlier version ran a temporal-dead-zone detector over the WHOLE of
 * drawing.js. It reported several false positives - `axis` read out of
 * the string "analysis-axis", and several names whose declaration
 * belonged to a nested scope inside an enclosing function. A check that
 * cries wolf gets ignored, and then the one real finding gets dismissed
 * with it.
 *
 * So the ordering check below is scoped to createStaticsFeature: the one
 * function that actually failed, and the one every single-click Statics
 * body passes through. It is a plain line-order check over that
 * function's own text, simple enough to be obviously correct.
 *
 * Pure source analysis plus the real factory table, so it runs in Node.
 */



const source = controllerSource();

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
    if (ok) {
        pass++;
        console.log(`  ok   ${name}`);
    } else {
        fail++;
        console.log(
            `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`
        );
    }
};

console.log("\n  single-click Statics creation\n");

/*
 * The body of one named function, or "" when it cannot be found.
 */
function readFunctionBody(text, name) {
    const start = text.indexOf(`function ${name}(`);

    if (start === -1) {
        return "";
    }

    const open = text.indexOf("{", start);

    let depth = 0;

    for (let i = open; i < text.length; i++) {
        if (text[i] === "{") {
            depth++;
        } else if (text[i] === "}") {
            depth--;

            if (depth === 0) {
                return text.slice(open + 1, i);
            }
        }
    }

    return "";
}

/*
 * Report a `const`/`let` name READ on an earlier line than the one
 * declaring it, within a single function body.
 *
 * Comments and string literals are blanked while KEEPING their newlines,
 * so prose cannot supply a phantom read and a reported line number still
 * matches the file on disk.
 */
function findUseBeforeDeclaration(body) {
    const lines = body
        .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
        .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length))
        .replace(/`(?:\\.|[^`\\])*`/g, m => " ".repeat(m.length))
        .replace(/"(?:\\.|[^"\\\n])*"/g, m => " ".repeat(m.length))
        .replace(/'(?:\\.|[^'\\\n])*'/g, m => " ".repeat(m.length))
        .split("\n");

    /*
     * TWO PASSES, and the second one is the whole point.
     *
     * A single forward pass cannot find this fault at all: a read that
     * happens BEFORE its declaration is exactly the case, and at that
     * moment the name has not been recorded yet, so there is nothing to
     * compare against and nothing gets reported. An earlier version of
     * this file made exactly that mistake and returned an empty result
     * for deliberately broken input - a check that could only ever pass.
     *
     * So pass one collects where every `const`/`let` is declared, and
     * pass two reports any read that sits on an earlier line.
     */
    const declaredAt = new Map();

    lines.forEach((line, index) => {
        const declaration =
            /\b(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/.exec(line);

        if (declaration && !declaredAt.has(declaration[1])) {
            declaredAt.set(declaration[1], index);
        }
    });

    const violations = [];

    lines.forEach((line, index) => {
        /*
         * The identifier after `const` is being INTRODUCED on this line,
         * not read, so a declaration line never reports itself.
         */
        if (/\b(?:const|let)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=/.test(line)) {
            return;
        }

        const read =
            /(?<![.\w$])([A-Za-z_$][A-Za-z0-9_$]*)/g;

        let token;

        while ((token = read.exec(line)) !== null) {
            const at = declaredAt.get(token[1]);

            if (at !== undefined && at > index) {
                violations.push(
                    `${token[1]}: read on line ${index + 1}, ` +
                    `declared on line ${at + 1}`
                );
            }
        }
    });

    return violations;
}

const createStaticsBody = readFunctionBody(
    source,
    "createStaticsFeature"
);

check(
    "createStaticsFeature was found",
    createStaticsBody.length > 200,
    `body length ${createStaticsBody.length}`
);

/*
 * Prove the check can fail. Without this, an always-empty violation list
 * would be indistinguishable from a genuinely clean file.
 */
const badViolations = findUseBeforeDeclaration(
    [
        "function demo() {",
        "    if (isSupportType(type)) {",
        "        use(type);",
        "    }",
        "",
        "    const type = 'x';",
        "",
        "    return type;",
        "}"
    ].join("\n")
);

check(
    "the ordering check reports a known use-before-declaration",
    badViolations.some(v => v.startsWith("type:")),
    badViolations.join("; ") || "nothing reported for broken input"
);

const goodViolations = findUseBeforeDeclaration(
    [
        "function demo() {",
        "    const type = 'x';",
        "",
        "    if (isSupportType(type)) {",
        "        use(type);",
        "    }",
        "}"
    ].join("\n")
);

check(
    "the ordering check ignores correct ordering",
    goodViolations.length === 0,
    goodViolations.join("; ")
);

const realViolations = findUseBeforeDeclaration(createStaticsBody);

check(
    "createStaticsFeature reads nothing before it declares it",
    realViolations.length === 0,
    realViolations.join("; ")
);

/* The exact bug, named, so a regression is unmistakable. */
const bodyLines = createStaticsBody.split("\n");

const declareLine = bodyLines.findIndex(
    l => /^\s*const type\s*=/.test(l)
);

const readLine = bodyLines.findIndex(
    l => /isSupportType\(\s*type\s*\)/.test(l)
);

check(
    "createStaticsFeature declares `type` before it is read",
    declareLine !== -1 && readLine !== -1 && declareLine < readLine,
    `declared at body line ${declareLine}, first read at body line ${readLine}`
);

/*
 * Every single-click tool must have a factory to call. A missing factory
 * returns early and fails silently - the same failure shape as the bug
 * above.
 *
 * The lookup is by the feature TYPE a tool creates, not by the tool id,
 * because the two differ for at least one tool: the Reference Point tool
 * creates ordinary point geometry under its own Statics role.
 */
global.window = {
    crypto: {
        randomUUID: () => "statics-single-click-uuid"
    }
};

loadModule("drawing-state.js");

const factories = global.window.enggDrawingState.geometryFactories;

const toolTypes = readStaticsChildToolTypes(source);
const singleClickToolIds = readSingleClickToolIds(source);

check(
    "the single-click tool list was found in the controller",
    singleClickToolIds.length > 0,
    "no STATICS_SINGLE_CLICK_TOOLS entries parsed"
);

singleClickToolIds.forEach(toolId => {
    const type = toolTypes.get(toolId);

    check(
        `factory exists for "${toolId}" (creates "${type}")`,
        typeof factories[type] === "function",
        `geometryFactories.${type} is ${typeof factories[type]}`
    );
});

function readSingleClickToolIds(text) {
    const start = text.indexOf("STATICS_SINGLE_CLICK_TOOLS = [");

    if (start === -1) {
        return [];
    }

    const open = text.indexOf("[", start);
    const close = text.indexOf("]", open);

    return [
        ...text
            .slice(open + 1, close)
            .matchAll(/"([^"]+)"/g)
    ].map(m => m[1]);
}

function readStaticsChildToolTypes(text) {
    const map = new Map();

    const start = text.indexOf("STATICS_CHILD_TOOLS = {");

    if (start === -1) {
        return map;
    }

    const open = text.indexOf("{", start);

    let depth = 0;
    let end = -1;

    for (let i = open; i < text.length; i++) {
        if (text[i] === "{") {
            depth++;
        } else if (text[i] === "}") {
            depth--;

            if (depth === 0) {
                end = i;
                break;
            }
        }
    }

    if (end === -1) {
        return map;
    }

    const entry =
        /(?:"([^"]+)"|([A-Za-z0-9_$]+))\s*:\s*\{[^}]*?\btype\s*:\s*"([^"]+)"/g;

    let match;

    while ((match = entry.exec(text.slice(open, end))) !== null) {
        map.set(
            match[1] || match[2],
            match[3]
        );
    }

    return map;
}

console.log(
    `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
    process.exitCode = 1;
}
