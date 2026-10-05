const fs = require("fs");
const files = process.argv.slice(2);
const lines = fs.readFileSync(files[0], "utf8").split(/\r?\n/);
lines.forEach((l, i) => {
  const t = l.trim();
  const bad = [
    /^\s*\}\s*,\s*\$\{/, // "}, ${unit}" orphan separator
    /join\(\s*["'],[\s"']/, // join(',')
    /,\s*mm`/, // "150, 300 mm"
    /\$\{[^}]*\}\s*,\s*\$\{/,
    /:\s*,\s*</, // "label: ,"
    /,\s*<\/span>/,
  ];
  if (bad.some((r) => r.test(l))) console.log(`${i + 1}: ${t}`);
});
