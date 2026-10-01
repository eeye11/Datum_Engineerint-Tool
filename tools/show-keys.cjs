/*
 * Prints selected keys from a verification run, so a long result does
 * not have to be read end to end to answer one question.
 */
const fs = require("fs");

const text = fs
  .readFileSync(process.argv[2] || "verify-wiring.txt", "utf8")
  .replace(/[ \t]+/g, " ")
  .replace(/^﻿/, "");

const keys = process.argv.slice(3);

const wanted =
  keys.length > 0
    ? keys
    : [
        "modulesLoaded",
        "calibrated",
        "beamCreated",
        "dimensionCreated",
        "annotationCreated",
        "numbered",
        "selectable",
        "secondDimension",
        "rendered",
        "undo",
        "roundTrip",
        "measuresAfterReload",
        "moveIsIndependent",
        "annotationMoveIsIndependent",
        "delete",
      ];

for (const key of wanted) {
  const marker = `"${key}"`;
  const at = text.indexOf(marker);

  if (at === -1) {
    console.log(`--- ${key}: (absent)`);
    continue;
  }

  /*
   * Read to the matching close of the value: walk braces from the
   * first one, so a nested object is not cut in half.
   */
  const braceAt = text.indexOf("{", at);
  const bracketAt = text.indexOf("[", at);

  let end;

  if (braceAt === -1) {
    end = text.indexOf("}", at);
  } else if (bracketAt === -1 || braceAt < bracketAt) {
    let depth = 0;
    end = braceAt;
    for (let i = braceAt; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
  } else {
    let depth = 0;
    end = bracketAt;
    for (let i = bracketAt; i < text.length; i += 1) {
      if (text[i] === "[") depth += 1;
      if (text[i] === "]") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
  }

  console.log(text.slice(at, end + 1).replace(/\n\s*/g, " "));
}
