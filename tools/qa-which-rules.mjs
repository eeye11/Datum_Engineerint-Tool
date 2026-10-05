/*
 * WHICH RULES ARE ACTUALLY APPLYING TO THE WORKSPACE?
 *
 * The computed grid says all six rows are `auto`, while the stylesheet
 * declares four of them as fixed pixels - and the COLUMNS from the very
 * same rule are applying correctly. Two declarations in one block cannot
 * disagree, so either the block is not the one in force or something
 * later is overriding it.
 *
 * Rather than reason about it, this asks the browser: it walks every
 * rule in every stylesheet, keeps the ones that match the workspace and
 * set the property in question, and reports them in source order. The
 * answer is the last matching declaration that wins.
 */
export default async function run(page) {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".tab"))
      .find((b) => b.textContent.trim() === "Engineering Drawing")
      ?.click();
  });

  await page.waitForFunction(
    () => {
      const v = document.querySelector("#drawing");
      return v && getComputedStyle(v).display !== "none";
    },
    { timeout: 15000 },
  );

  await page.waitForTimeout(800);

  return page.evaluate(() => {
    const target = document.querySelector(".drawing-workspace");
    const computed = getComputedStyle(target);

    const rows = [];
    const columns = [];

    const walk = (ruleList, mediaText) => {
      Array.from(ruleList).forEach((rule) => {
        if (rule.cssRules) {
          walk(rule.cssRules, rule.conditionText || mediaText);

          return;
        }

        if (!rule.selectorText) return;

        let matches = false;

        try {
          matches = target.matches(rule.selectorText);
        } catch (e) {
          matches = false;
        }

        if (!matches) return;

        const style = rule.style;

        if (style && style.gridTemplateRows) {
          rows.push({
            selector: rule.selectorText,
            value: style.gridTemplateRows,
            media: mediaText || null,
            important:
              style.getPropertyPriority("grid-template-rows") === "important",
          });
        }

        if (style && style.gridTemplateColumns) {
          columns.push({
            selector: rule.selectorText,
            value: style.gridTemplateColumns,
            media: mediaText || null,
          });
        }
      });
    };

    Array.from(document.styleSheets).forEach((sheet) => {
      let rules;

      try {
        rules = sheet.cssRules;
      } catch (e) {
        return;
      }

      if (rules) walk(rules, null);
    });

    return {
      computedRows: computed.gridTemplateRows,
      computedColumns: computed.gridTemplateColumns,
      workspaceHeight: Math.round(target.getBoundingClientRect().height),
      display: computed.display,
      alignItems: computed.alignItems,
      rulesSettingRows: rows,
      rulesSettingColumns: columns,
    };
  });
}
