#!/usr/bin/env sh
# Pure renames: js/ -> src/, css/ -> src/styles/, backend/ -> server/.
# Kept as its own commit so `git log --follow` and blame survive the move.
set -e
mkdir -p src/editor src/solution src/styles src/app server

git mv js/core src/core
git mv js/features src/features
git mv js/rendering src/rendering
git mv js/sheets src/sheets
git mv js/file src/file
git mv js/references src/references
git mv js/ui src/ui

git mv js/app/drawing.js src/editor/drawing.js
git mv js/app/tools.js src/editor/tools.js
git mv js/app/toolbar.js src/editor/toolbar.js
git mv js/app/ui.js src/ui/ui.js

git mv js/script.js src/solution/writing-tab.js
git mv src/references/written-references.js src/solution/written-references.js

git mv css/style.css src/styles/base.css
git mv css/engineering-drawing.css src/styles/editor.css

git mv backend/server.js server/server.js
