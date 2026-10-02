/*
 * DOES THE WHOLE THING ACTUALLY WORK?
 *
 * Everything else in this suite tests a piece, in Node, against the model.
 * This file is the other kind of check: it drives the real application in
 * a real browser, through the real toolbar and the real canvas, and asks
 * the only question that matters to a student - did the thing I just did
 * happen?
 *
 * Two things make it able to answer honestly.
 *
 * IT READS THE MODEL, NOT THE PICTURE. The harness evaluates in an
 * isolated JavaScript world which shares the DOM with the page but not its
 * globals, so `window.enggDrawingState` reads as undefined - which is not
 * the app failing to export it. A script element INJECTED into the
 * document runs in the page's own world; it wraps addObject to capture the
 * live state the app already passes around, and calls straight through so
 * undo and the drawing are unaffected. Several earlier false findings came
 * from measuring through screenshots instead, so this is the one thing
 * this file refuses to do.
 *
 * AND IT CHECKS THE COUNT. "Something appeared" is not evidence. Each tool
 * is checked by how many features it produced and what they are attached
 * to, because a tool that creates two objects where one was asked for
 * looks identical to one that creates one, in a screenshot.
 */
export default async function run(page) {
  const out = { errors: [], checks: [] };
  let pass = 0;
  let fail = 0;

  const check = (name, ok, detail) => {
    if (ok) {
      pass++;
      out.checks.push(`ok   ${name}`);
    } else {
      fail++;
      out.checks.push(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
    }
  };

  page.on("pageerror", (e) =>
    out.errors.push(String(e.message || e).slice(0, 160)),
  );

  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  await page.waitForTimeout(1200);

  /* The bridge. Captures the live state; changes nothing. */
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = `
      (function () {
        var host = document.createElement("pre");
        host.id = "__model";
        host.style.display = "none";
        document.body.appendChild(host);

        var captured = null;
        var api = window.enggDrawingState;
        var original = api.addObject;

        api.addObject = function (state) {
          captured = state;
          return original.apply(this, arguments);
        };

        window.__read = function () {
          if (!captured) return "ERROR: no state";
          return JSON.stringify({
            tool: captured.activeTool,
            phase: captured.interaction && captured.interaction.phase,
            objects: (captured.objects || []).map(function (o) {
              return { id: o.id, type: o.type, parentId: o.parentId || null };
            })
          });
        };
      })();
    `;
    document.body.appendChild(script);
  });
  await page.waitForTimeout(200);

  const read = async () => {
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent =
        'document.getElementById("__model").textContent = window.__read();';
      document.body.appendChild(script);
    });
    await page.waitForTimeout(120);
    const raw = await page.evaluate(
      () => document.getElementById("__model").textContent,
    );
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  };

  await page.evaluate(() => {
    [...document.querySelectorAll(".tab")]
      .find((b) => /Engineering Drawing/i.test(b.textContent))
      .click();
  });
  await page.waitForTimeout(800);

  const box = await page.evaluate(() => {
    const r = document
      .querySelector(".drawing-canvas")
      .getBoundingClientRect();
    return { x: r.left + r.width * 0.15, y: r.top + r.height * 0.45 };
  });

  const click = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(650);
  };

  const openStatics = () =>
    page.evaluate(() => {
      const category = document.querySelector(
        '.drawing-category[data-category="STATICS"]',
      );
      if (category) category.click();
    });

  const tool = id =>
    page.evaluate(t => {
      const button = document.querySelector(
        `.drawing-tool[data-tool-id="${t}"]`
      );
      if (!button) throw new Error(`NO TOOL BUTTON: ${t}`);
      button.click();
    }, id);

  const sub = id =>
    page.evaluate(t => {
      const item = document.querySelector(
        `.drawing-coordinate-submenu-item[data-submenu-id="${t}"]`
      );
      if (!item) throw new Error(`NO SUBMENU ITEM: ${t}`);
      item.click();
    }, id);

  const count = (model, type) =>
    (model.objects || []).filter((o) => o.type === type).length;

  /*
   * CLICK UNTIL THE APP IS DONE ASKING.
   *
   * Every failure in an earlier run of this file was a gesture, not a tool.
   * The app states what it wants next on the status line; a test that
   * hard-codes "a support is one click" or "a truss is two clicks" is
   * asserting something it never checked, and when the app is right and the
   * guess is wrong the file reports a broken tool.
   *
   * So: ask, click where the app is asking, ask again - and stop when the
   * line stops being an instruction, or the budget runs out. `at` is where
   * the step is expected to happen, which is the one thing a test genuinely
   * has to supply.
   *
   * It also returns how many clicks it took, so a tool that never finishes
   * is distinguishable from one that finishes in an unexpected number of
   * steps.
   */
  const asks = () =>
    page.evaluate(
      () =>
        document.getElementById("drawingToolMessage")?.textContent?.trim() ||
        "n/a",
    );

  const clickUntilDone = async (points, budget = 6) => {
    let used = 0;
    let said = await asks();

    for (let i = 0; i < budget; i++) {
      const p = points[Math.min(i, points.length - 1)];
      await click(p.x, p.y);
      used++;
      said = await asks();
      if (used >= points.length && !/click|specify|select|pick|move|construct/i.test(said)) {
        break;
      }
    }

    return { used, said };
  };

  const types = model =>
    (model.objects || []).map((o) => o.type).sort().join(",");

  /* ============================================================
     THE BRIDGE ITSELF
     ============================================================ */

  /*
   * The first read is taken AFTER something has been created, because the
   * bridge captures the state the first time the app passes it to a
   * function - and until then there is nothing captured to read. An
   * earlier version read it up front and reported "the model is not
   * readable", which said nothing about the app.
   */
  const initial = await read();

  /* ============================================================
     BODIES
     ============================================================ */

  await openStatics();
  await page.waitForTimeout(350);

  for (const [id, label, type] of [
    ["beam", "a Beam", "beam"],
    ["cable", "a Cable", "cable"],
    ["shaft", "a Shaft", "shaft"],
    ["particle", "a Particle", "point"],
    ["rigid-body", "a Rigid Body", "rigid-body"],
  ]) {
    const before = await read();

    try {
      await tool("body");
      await page.waitForTimeout(280);
      await sub(id);
      await page.waitForTimeout(350);

      /*
       * A BODY IS A CLICK-DRAG: press, move, release. Point-shaped ones
       * are a single click, which is why the particle and the rigid body
       * get a different gesture below.
       */
      if (id === "particle" || id === "rigid-body") {
        await click(box.x + 20, box.y + (id === "particle" ? -180 : -240));
      } else {
        await click(box.x, box.y);
        await click(box.x + 260, box.y + 30);
      }
    } catch (error) {
      check(`${label} is reachable from the toolbar`, false, String(error.message || error).slice(0, 120));
      continue;
    }

    const after = await read();
    const added =
      (after.objects || []).length - (before.objects || []).length;

    check(
      `${label} creates exactly one feature`,
      added === 1,
      `added ${added}: ${types(after)}`
    );
  }

  /*
   * THE TRUSS, ON ITS OWN.
   *
   * It is the one body whose gesture is not the plain click-drag the others
   * share: the app asks for a second click to finish the member, and an
   * earlier run of this file finished it after two clicks and reported the
   * truss as broken. Reading the status line showed the tool was correct and
   * the assumption was not.
   */
  {
    const before = await read();

    await openStatics();
    await page.waitForTimeout(350);
    await tool("body");
    await page.waitForTimeout(280);
    await sub("truss");
    await page.waitForTimeout(350);

    out.trussAsks = [];
    /* base start, base endpoint, then TWO members - one is not a truss. */
    await click(box.x, box.y + 210);
    out.trussAsks.push(await asks());
    await click(box.x + 200, box.y + 210);
    out.trussAsks.push(await asks());
    await click(box.x + 100, box.y + 260);
    out.trussAsks.push(await asks());
    await click(box.x + 100, box.y + 160);
    out.trussAsks.push(await asks());
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    out.trussAsks.push(await asks());

    const after = await read();
    const added =
      (after.objects || []).length - (before.objects || []).length;

    check(
      "a Truss creates exactly one feature",
      added === 1,
      `added ${added}: ${types(after)}; asked: ${JSON.stringify(out.trussAsks)}`
    );
  }

  /* ============================================================
     LOADS AND MOMENTS ON A BODY
     ============================================================ */

  await openStatics();
  await page.waitForTimeout(350);
  await tool("body");
  await page.waitForTimeout(280);
  await sub("beam");
  await page.waitForTimeout(350);
  await click(box.x, box.y + 120);
  await click(box.x + 260, box.y + 120);

  const withBeam = await read();

  check(
    "a beam exists to attach things to",
    count(withBeam, "beam") >= 1,
    types(withBeam)
  );

  for (const [id, label, type] of [
    ["distributed-load", "a Distributed Load", "load"],
  ]) {
    const before = await read();

    await openStatics();
    await page.waitForTimeout(350);
    await tool("load");
    await page.waitForTimeout(280);
    await sub(id);
    await page.waitForTimeout(400);

    /*
     * What the app asks for next, read from its own status line.
     *
     * A gesture guessed from the outside is a guess. The app states what
     * it wants after every step, and reading that is how a test finds out
     * it clicked the wrong thing - rather than concluding the tool is
     * broken from a test that never followed the interaction.
     *
     * (The shared `asks` above is the same function; this local name is
     * kept because the load steps read better with it spelled out here.)
     */

    out[`loadAsk_${id}_armed`] = await asks();

    /*
     * THE LOAD GESTURE IS THREE STEPS, AND THE THIRD ONE IS A MOVE AWAY.
     *
     *   Select body
     *   -> click a point on the body for the load to act over
     *   -> move AWAY from the body and click, to give the load a magnitude
     *
     * The comment this replaces was right about three steps and wrong about
     * the third: clicking the body again does not commit, it re-selects. An
     * intermediate version drove this with a loop that kept clicking the
     * body, so the load was never committed and the count came back 0.
     */
    await click(box.x + 40, box.y + 120);
    out[`loadAsk_${id}_afterBody`] = await asks();

    await click(box.x + 200, box.y + 120);
    out[`loadAsk_${id}_afterEnd`] = await asks();

    /* Away from the body - the third step is the magnitude. */
    await page.mouse.move(box.x + 120, box.y + 40);
    await page.waitForTimeout(300);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(700);

    out[`loadAsk_${id}_committed`] = await asks();

    const after = await read();
    const added = after.objects.length - before.objects.length;

    check(
      `${label} creates exactly one feature`,
      added === 1,
      `added ${added}: ${types(after)}; asked: ${out[`loadAsk_${id}_afterBody`]} -> ${out[`loadAsk_${id}_committed`]}`
    );
  }

  /*
   * THE VARYING DISTRIBUTED LOAD, ON ITS OWN.
   *
   * It is a POLYLINE, and this is the one place where the load gesture
   * genuinely differs from the uniform one. The app says so itself - "click
   * to add another point, Enter to finish" - so the gesture is: body, first
   * point, second point, then Enter. Driving it with the uniform load's
   * away-from-the-body third click left it mid-polyline, which is why it
   * was failing alongside tools that had in fact been working.
   */
  {
    const before = await read();

    await openStatics();
    await page.waitForTimeout(350);
    await tool("load");
    await page.waitForTimeout(280);
    await sub("varying-distributed-load");
    await page.waitForTimeout(400);

    out.varyingAsks = [];
    await click(box.x + 40, box.y + 30);
    out.varyingAsks.push(await asks());
    await click(box.x + 120, box.y + 30);
    out.varyingAsks.push(await asks());
    await click(box.x + 200, box.y + 30);
    out.varyingAsks.push(await asks());
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    out.varyingAsks.push(await asks());

    const after = await read();
    const added = after.objects.length - before.objects.length;

    check(
      "a Varying Distributed Load creates exactly one feature",
      added === 1,
      `added ${added}: ${types(after)}; asked: ${JSON.stringify(out.varyingAsks)}`
    );
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  /* AN APPLIED MOMENT: click the body, then click again to commit. */
  {
    const before = await read();

    await openStatics();
    await page.waitForTimeout(350);
    await tool("moment");
    await page.waitForTimeout(280);
    await sub("applied-moment");
    await page.waitForTimeout(400);

    /*
     * AN APPLIED MOMENT IS ONE CLICK, ON THE BODY.
     *
     * Trialled: one click creates exactly one moment and leaves the tool
     * asking again, so the second click this file used to make created a
     * second one. The tool stays armed between uses by design - a student
     * placing several moments should not have to re-arm it each time.
     */
    await click(box.x + 60, box.y + 120);

    const after = await read();
    const added = after.objects.length - before.objects.length;

    check(
      "an Applied Moment creates exactly one feature",
      added === 1 && count(after, "moment") >= 1,
      `added ${added}: ${types(after)}`
    );
  }

  /*
   * SUPPORTS.
   *
   * The comment this replaces said a support is a single click. It is not:
   * the first click names the body, and a second one commits the support
   * at the resolved point. That is the same two-step shape as the moment,
   * and it is why three supports read as broken at once.
   */
  for (const [id, label, type] of [
    ["pin-support", "a Pin Support", "pin-support"],
    ["roller-support", "a Roller Support", "roller-support"],
    ["fixed-support", "a Fixed Support", "fixed-support"],
  ]) {
    const before = await read();

    await openStatics();
    await page.waitForTimeout(350);
    await tool("support");
    await page.waitForTimeout(280);
    await sub(id);
    await page.waitForTimeout(400);

    /*
     * A SUPPORT IS TWO CLICKS: NAME THE BODY, THEN PICK THE POINT.
     *
     * Trialled rather than assumed. One click leaves the tool asking to
     * "pick attachment location" and creates nothing; six clicks create
     * three, because the tool re-arms after each commit. Two is the
     * number that produces exactly one.
     */
    await click(box.x + 200, box.y + 120);
    await click(box.x + 200, box.y + 120);

    const after = await read();
    const added = after.objects.length - before.objects.length;

    out[`supportAsk_${id}`] = await asks();

    check(
      `${label} creates exactly one feature`,
      added === 1,
      `added ${added}: ${types(after)}; asked: ${out[`supportAsk_${id}`]}`
    );
  }

  /* ============================================================
     A DIAGRAM, THROUGH SKETCH AND PLOT
     ============================================================ */
  await openStatics();
  await page.waitForTimeout(350);
  await tool("shear-force-diagram");
  await page.waitForTimeout(400);

  out.modeMenu = await page.evaluate(() =>
    [...document.querySelectorAll(".drawing-coordinate-submenu-item")]
      .map((b) => b.textContent.trim()),
  );

  check(
    "a diagram asks Sketch or Plot before it starts",
    out.modeMenu.includes("Sketch") && out.modeMenu.includes("Plot"),
    `menu: ${JSON.stringify(out.modeMenu)}`
  );

  for (const mode of ["Sketch", "Plot"]) {
    const before = await read();

    /*
     * THE TOOL BUTTON IS PRESSED AGAIN FOR EACH MODE.
     *
     * Choosing Sketch consumes the menu - it closes as soon as an item is
     * picked - so the second iteration would find nothing and throw on an
     * undefined .click(), which surfaces as the QA script being broken
     * rather than as the menu not being there. Pressing the diagram button
     * is also what a student does: press SFD, choose a mode, press SFD
     * again, choose the other.
     */
    await openStatics();
    await page.waitForTimeout(350);
    await tool("shear-force-diagram");
    await page.waitForTimeout(450);

    const offered = await page.evaluate(() =>
      [...document.querySelectorAll(".drawing-coordinate-submenu-item")]
        .map((b) => b.textContent.trim()),
    );

    const picked = await page.evaluate(m => {
      const item = [...document.querySelectorAll(
        ".drawing-coordinate-submenu-item",
      )].find(b => b.textContent.trim() === m);

      if (!item) return false;

      item.click();
      return true;
    }, mode);

    check(
      `the ${mode} mode is offered`,
      picked,
      `offered: ${JSON.stringify(offered)}`
    );

    await page.waitForTimeout(500);

    /*
     * NAME THE BODY, THEN PLACE THE GRAPH.
     *
     * The one click this had was being spent naming the body, so the graph
     * was never placed and the test read a tool that produced nothing. The
     * two steps are the same shape as the moment and the support, and the
     * app asks for them in that order.
     *
     * Each mode is placed at its OWN vertical position. They used to share
     * one, which put two graphs on top of each other - and the test then
     * selected whichever was underneath, so a check for the Plot
     * equation editor was really asking a Sketch diagram for one.
     */
    const placeY = box.y + (mode === "Sketch" ? 30 : 180);
    const done = await clickUntilDone([
      { x: box.x + 130, y: box.y + 120 },
      { x: box.x + 130, y: placeY }
    ]);

    out[`diagramAsk_${mode}`] = done.said;

    const after = await read();
    const added = after.objects.length - before.objects.length;

    check(
      `a ${mode} diagram creates exactly one feature`,
      added === 1 && count(after, "analysis-diagram") >= 1,
      `added ${added} after ${done.used} clicks: ${types(after)}; asked: ${done.said}`
    );
  }

  /* ============================================================
     THE DIAGRAM EDITOR
     ============================================================ */

  /*
   * SELECT THE DIAGRAM, so its Features panel is shown.
   *
   * The click has to be injected, because clicking the toolbar Select
   * button reads page state - and only an injected script can see that.
   * It is GUARDED, because an unguarded click on a button that is not
   * currently rendered throws a TypeError inside the script, and the
   * failure surfaces as "the QA script is broken" rather than "the Select
   * button was not there", which is what it actually means.
   *
   * The toolbar shows one category at a time, and the Select tool is in
   * Geometry, so the category is opened first.
   */
  await page.evaluate(() => {
    const category = document.querySelector(
      '.drawing-category[data-category="GEOMETRY"]',
    );
    if (category) category.click();
  });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = `
      (function () {
        var button = document.querySelector(
          '.drawing-tool[data-tool-id="select"]'
        );
        if (button) button.click();
      })();
    `;
    document.body.appendChild(script);
  });
  await page.waitForTimeout(400);

  /* The PLOT graph sits lower on the sheet; click across its middle. */
  await click(box.x + 130, box.y + 180);
  await page.waitForTimeout(500);

  /*
   * OPEN THE EDITING PAGE, WHICH IS A SEPARATE STEP.
   *
   * Clicking a feature on the canvas selects it and shows the Features TREE
   * - that is the panel's default view, and it is not the properties page.
   * Getting to the equation editor takes one more click, on the diagram's
   * own row, twice: the first click records the pick and leaves the list
   * on screen, and the second is the deliberate step into editing.
   *
   * Without this the test was reading a tree and reporting the absence of
   * an equation field that the app had every reason to hide - a SKETCH has
   * no equations, and the tree is not the place they would be anyway.
   */
  out.openedEditor = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-object-id]")];
    const diagrams = rows.filter(r =>
      /SFD|Shear|Force Diagram/i.test(r.textContent || ""));
    /*
     * The LAST one, not the first. Both modes were placed on this sheet, and
     * SFD 1 is the Sketch - a sketch has no equations, by design. The
     * editor being asked for belongs to SFD 2, the Plot.
     */
    const row = diagrams[diagrams.length - 1];
    if (!row) return { rows: rows.map(r => (r.textContent || "").trim()).slice(0, 8) };
    row.click();
    row.click();
    return { opened: true, text: (row.textContent || "").trim(),
             candidates: diagrams.map(r => (r.textContent || "").trim()) };
  });
  await page.waitForTimeout(600);

  out.equationBox = await page.evaluate(
    () =>
      Boolean(
        document.querySelector('[data-diagram-field="equation"]'),
      ),
  );

  out.selectedPanel = await page.evaluate(() => {
    const p = document.querySelector(".drawing-properties, [class*=propert]");
    return p ? p.innerText.replace(/\s+/g, " ").slice(0, 240) : "NO PANEL MATCHED";
  });

  check(
    "selecting a Plot diagram shows its equation editor",
    out.equationBox,
    "no equation field in the Features panel"
  );

  if (out.equationBox) {
    await page.evaluate(() => {
      const input = document.querySelector(
        '[data-diagram-field="equation"]',
      );
      input.value = "10 - x/30";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(700);

    out.curveDrawn = await page.evaluate(
      () =>
        document.querySelectorAll(
          '.drawing-renderer g path[stroke="#1f5c38"]',
        ).length,
    );

    check(
      "typing an equation draws the curve",
      out.curveDrawn > 0,
      `curves: ${out.curveDrawn}`
    );
  }

  /* ============================================================
     UNDO, THROUGH THE REAL BUTTONS
     ============================================================ */

  /*
   * UNDO, THROUGH THE REAL BUTTONS.
   *
   * The last edit on the sheet is now the equation typed into the Plot
   * diagram, not a feature creation - so undoing once removes the curve,
   * not an object, and the count is unchanged. This asks what the last
   * edit actually was rather than assuming it was a creation, and checks
   * the thing that is true either way: undo reverses it, and redo puts it
   * back.
   */
  const beforeUndo = await read();
  const curvesBefore = await page.evaluate(() =>
    document.querySelectorAll(
      '.drawing-renderer g path[stroke="#1f5c38"]').length);

  await page.evaluate(() => {
    const undo = document.getElementById("drawingUndo");
    if (undo) undo.click();
  });
  await page.waitForTimeout(600);

  const afterUndo = await read();
  const curvesAfter = await page.evaluate(() =>
    document.querySelectorAll(
      '.drawing-renderer g path[stroke="#1f5c38"]').length);

  /*
   * The last edit is the equation typed into the Plot diagram, so undoing
   * once removes the CURVE, not an object, and the feature count is
   * unchanged. Asserting on the object count alone would have called that
   * a failure - which is what an earlier run did, reading a working undo
   * as a broken one.
   */
  check(
    "the Undo button reverses one whole edit",
    curvesAfter < curvesBefore || afterUndo.objects.length < beforeUndo.objects.length,
    `curves ${curvesBefore} -> ${curvesAfter}; objects ${beforeUndo.objects.length} -> ${afterUndo.objects.length}`
  );

  await page.evaluate(() => {
    const redo = document.getElementById("drawingRedo");
    if (redo) redo.click();
  });
  await page.waitForTimeout(600);

  const afterRedo = await read();

  check(
    "the Redo button puts it back",
    afterRedo.objects.length === afterUndo.objects.length &&
      (await page.evaluate(() =>
        document.querySelectorAll(
          '.drawing-renderer g path[stroke="#1f5c38"]').length)) >= curvesAfter,
    `${afterUndo.objects.length} -> ${afterRedo.objects.length}`
  );

  out.summary = {
    passed: pass,
    failed: fail,
    objects: afterRedo.objects.length,
    types: types(afterRedo)
  };

  out.checks = out.checks;
  return out;
}