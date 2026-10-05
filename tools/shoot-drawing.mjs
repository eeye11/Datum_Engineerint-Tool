import { execSync } from "node:child_process";

const skill =
  "C:\\Users\\eeyei\\.codegpt\\skills\\browser-automation\\browser.mjs";

const shot = process.argv[2];

execSync(
  `node "${skill}" "http://127.0.0.1:8765/index.html" ` +
    `--script "tools/probe-shot.mjs" --screenshot "${shot}"`,
  { stdio: "inherit" },
);
