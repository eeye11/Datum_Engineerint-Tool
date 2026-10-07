/*
 * ========================================================
 * THE OPEN POPUP
 * ========================================================
 *
 * File -> Open is a DOCUMENT LAUNCHER, not the operating system's file panel.
 * The panel is an action inside this interface ("Import .enggdraw"), which is
 * the one thing it was always good at: choosing a file from the disk.
 *
 * Three sections, in the order a person usually wants them:
 *
 *     Templates   a starting document the user made from an .enggdraw
 *     Recent      a file that was open before, reopened directly
 *     Import      choose a .enggdraw from the laptop
 *
 * TEMPLATES START EMPTY. Datum ships no example drawings and no built-in
 * template cards; the library contains only what the user has added, and the
 * section says so plainly until there is something in it.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * It does not read, parse, validate, render or store anything. It builds an
 * element and reports the user's choice. Adding a template, opening a recent and
 * importing a file all end up in the SAME document pipeline the rest of the
 * application uses, so the launcher cannot become a second way in.
 */
import enggRecentFiles from "../file/recent-files.js";
import enggTemplates from "../file/templates.js";
import enggUi from "./ui.js";

/*
 * "Today", "Yesterday", "3 days ago", or a date once it is older than a week.
 */
export function relativeDay(timestamp, now = Date.now()) {
  const then = Number(timestamp) || 0;

  if (!then) {
    return "";
  }

  const day = 24 * 60 * 60 * 1000;

  const days = Math.floor((now - then) / day);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  const date = new Date(then);

  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "";
}

/* ---------------------------------------------------------- */
/* BUILDING THE PIECES                                         */
/* ---------------------------------------------------------- */

/*
 * WHERE THE POINTER WAS, for a menu that should open under the cursor.
 *
 * A keyboard-activated control has no pointer position, so this returns null
 * and the caller falls back to anchoring the menu to the button - which is
 * where a keyboard user expects it.
 */
function pointOf(event) {
  if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
    return null;
  }

  return { x: event.clientX, y: event.clientY };
}

function element(tag, className, text) {  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function section(title) {
  const wrapper = element("section", "datum-open-section");

  wrapper.appendChild(element("h3", "datum-open-section-title", title));

  return wrapper;
}

/*
 * The small square a preview lives in.
 *
 * A preview is an SVG string produced from a stored DOCUMENT by the caller.
 * Nothing here renders it, so generating a preview can never touch the drawing.
 * When there is none the square is left EMPTY rather than filled with a
 * placeholder, because a generic icon is worse than no picture: it claims to
 * show the drawing and does not.
 */
function previewBox(preview, className) {
  const box = element("span", className || "datum-open-thumb");

  if (typeof preview === "string" && preview.trim()) {
    try {
      box.innerHTML = preview;
    } catch (error) {
      /* A preview that will not parse is simply not shown. */
    }
  }

  return box;
}

/*
 * A template card: its name, that it is a user template, and a small menu for
 * renaming or deleting it.
 */
function templateCard(template, handlers) {
  const card = element("div", "datum-open-template-card");

  const button = element("button", "datum-open-template");

  button.type = "button";
  button.dataset.template = template.id;

  button.appendChild(
    previewBox(template.preview, "datum-open-template-preview")
  );

  const text = element("span", "datum-open-template-text");

  text.appendChild(
    element("span", "datum-open-template-label", template.name)
  );

  text.appendChild(
    element("span", "datum-open-template-note", "User template")
  );

  button.appendChild(text);

  button.addEventListener("click", () => handlers.onUseTemplate(template.id));

  card.appendChild(button);

  const menu = element("button", "datum-open-template-menu", "\u22ee");

  menu.type = "button";
  menu.title = "Rename or delete this template";
  menu.setAttribute("aria-label", `Manage ${template.name}`);

  menu.addEventListener("click", (event) => {
    /*
     * THE THREE-DOT BUTTON IS ITS OWN INTERACTION.
     *
     * Its click must not reach the card underneath, which would OPEN the file or
     * USE the template - and it must not reach the launcher's backdrop, which
     * would dismiss the Open page. Stopping propagation here is what keeps the
     * menu a menu rather than a second way to activate the card.
     */
    event.stopPropagation();
    event.preventDefault();

    handlers.onManageTemplate(template.id, menu, event);
  });

  card.appendChild(menu);

  return card;
}

/*
 * How the Recent section is presented: a grid of thumbnails, or a compact list.
 *
 * The preference is remembered, because it is a statement about how this person
 * recognises their own drawings rather than about one session. Grid is the
 * default: a drawing is recognised by what it looks like far more quickly than
 * by its file name, and the name is shown either way.
 */
const RECENT_VIEW_KEY = "datum:recent-view";

export function recentView() {
  try {
    return window.localStorage.getItem(RECENT_VIEW_KEY) === "list"
      ? "list"
      : "grid";
  } catch (error) {
    return "grid";
  }
}

function setRecentView(view) {
  try {
    window.localStorage.setItem(
      RECENT_VIEW_KEY,
      view === "list" ? "list" : "grid"
    );
  } catch (error) {
    /* A preference that cannot be stored is simply not remembered. */
  }
}

/*
 * The two view buttons.
 *
 * One is active at a time, and both are always visible so switching back is
 * never hidden behind the current choice.
 */
function viewSwitcher(onChange) {
  const wrapper = element("div", "datum-open-view-switch");

  const current = recentView();

  [
    { id: "grid", label: "\u25a6", title: "Thumbnail grid" },
    { id: "list", label: "\u2637", title: "Compact list" }
  ].forEach((option) => {
    const button = element("button", "datum-open-view-button", option.label);

    button.type = "button";
    button.title = option.title;
    button.dataset.view = option.id;
    button.setAttribute("aria-label", option.title);
    button.setAttribute("aria-pressed", String(current === option.id));

    if (current === option.id) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      setRecentView(option.id);
      onChange(option.id);
    });

    wrapper.appendChild(button);
  });

  return wrapper;
}

/*
 * One recent file row: a thumbnail, the drawing's name, its file name and when
 * it was last opened, and a small menu for the file.
 *
 * THE ROW AND ITS MENU ARE SEPARATE CONTROLS, SIDE BY SIDE.
 *
 * The three-dot used to be appended INSIDE the row's `<button>`, so it sat in
 * the button's own hit area - it looked like part of a long control, and a
 * click on it was also a click on the row. They are siblings in a wrapper
 * instead: the row opens the file, the menu button manages it, and neither is
 * inside the other.
 */
function recentRow(entry, handlers) {
  const wrapper = element(
    "div",
    "datum-open-recent-wrap" +
      (entry.missing ? " datum-open-recent-missing" : "")
  );

  const row = element("button", "datum-open-recent");

  row.type = "button";
  row.dataset.recentKey = entry.key;

  row.appendChild(previewBox(entry.preview, "datum-open-thumb"));

  const text = element("span", "datum-open-recent-text");

  text.appendChild(element("span", "datum-open-recent-name", entry.label));

  text.appendChild(element("span", "datum-open-recent-file", entry.fileName));

  text.appendChild(
    element(
      "span",
      "datum-open-recent-when",
      entry.missing ? "File not found" : relativeDay(entry.openedAt)
    )
  );

  row.appendChild(text);

  /*
   * EVERY RECENT ROW HAS A MENU, INCLUDING A MISSING FILE.
   *
   * A missing file must still be REMOVABLE, and that is a management action
   * rather than a recovery one - so the menu is offered whatever the file's
   * state. It is deliberately independent of whether the file can be opened.
   */
  const menu = element("button", "datum-open-recent-menu", "\u22ee");

  menu.type = "button";
  menu.title = "More actions";
  menu.setAttribute("aria-label", `Actions for ${entry.fileName}`);

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();

    handlers.onRecentMenu(entry, menu, event);
  });

  row.addEventListener("click", () => handlers.onOpenRecent(entry));

  /*
   * SIBLINGS, NOT NESTED. The row is the Open action; the menu button sits
   * beside it in the same wrapper, so each has its own hit area and neither
   * contains the other.
   */
  wrapper.appendChild(row);
  wrapper.appendChild(menu);

  return wrapper;
}

/*
 * The Templates section: the user's templates, then Add Template, and the
 * empty-state line ONLY while there is nothing in the library.
 */
function templatesSection(handlers) {
  const templates = enggTemplates.list();

  const wrapper = section("Templates");

  if (templates.length) {
    const grid = element("div", "datum-open-templates");

    templates.forEach((template) => {
      grid.appendChild(templateCard(template, handlers));
    });

    wrapper.appendChild(grid);
  } else {
    wrapper.appendChild(element("p", "datum-open-empty", "No templates yet."));
  }

  const add = element("button", "datum-open-add-template", "+ Add Template");

  add.type = "button";

  add.addEventListener("click", () => handlers.onAddTemplate());

  wrapper.appendChild(add);

  return wrapper;
}

function recentsSection(handlers) {
  const wrapper = section("Recent");

  const entries = enggRecentFiles.list();

  if (!entries.length) {
    wrapper.appendChild(
      element(
        "p",
        "datum-open-empty",
        "No recent drawings yet. Import a .enggdraw file to add one."
      )
    );

    return wrapper;
  }

  /*
   * The view control sits with the heading, so switching views is part of the
   * Recent section rather than an action on the whole popup.
   */
  const head = element("div", "datum-open-section-head");

  head.appendChild(wrapper.querySelector(".datum-open-section-title"));
  head.appendChild(viewSwitcher(() => handlers.onRedraw()));

  wrapper.insertBefore(head, wrapper.firstChild);

  const view = recentView();

  const list = element(
    "div",
    view === "grid" ? "datum-open-recents-grid" : "datum-open-recents"
  );

  entries.forEach((entry) => {
    list.appendChild(recentRow(entry, handlers));
  });

  wrapper.appendChild(list);

  return wrapper;
}

function buildBody(handlers) {
  const body = element("div", "datum-open");

  body.appendChild(templatesSection(handlers));
  body.appendChild(recentsSection(handlers));

  return body;
}

/* ---------------------------------------------------------- */
/* THE POPUP                                                   */
/* ---------------------------------------------------------- */

/*
 * Show the Open launcher.
 *
 * Returns a promise resolving with one of
 *
 *     { action: "template", id }       a template was chosen
 *     { action: "recent", key, entry } a recent was chosen
 *     { action: "import" }             Import was chosen
 *     { action: "add-template" }       + Add Template was chosen
 *     { action: "cancel" }             the popup was dismissed
 *
 * THE POPUP ONLY REPORTS THE CHOICE. It closes first and then resolves, so
 * whatever the caller does next - a prompt, a file panel, a name dialog - has
 * nothing competing for the user's attention.
 */
function openOpenPopup() {
  return new Promise((resolve) => {
    let settled = false;

    const choose = (result) => {
      if (settled) {
        return;
      }

      settled = true;

      enggUi.closeDialog();

      resolve(result);
    };

    let currentBody = null;

    /*
     * Rebuilt in place when a template is deleted, so the list stays correct
     * while the user keeps working in the popup.
     */
    function redraw() {
      const next = buildBody({
        onUseTemplate: (id) => choose({ action: "template", id }),
        onOpenRecent: (entry) =>
          choose({ action: "recent", key: entry.key, entry }),
        onForget: () => redraw(),
        onAddTemplate: () => choose({ action: "add-template" }),

        /*
         * Switching the Recent view redraws the body IN PLACE. The choice is
         * already stored, so the rebuilt section reads it back - which is what
         * keeps the buttons and the layout from being able to disagree.
         */
        onRedraw: () => redraw(),

        /*
         * A TEMPLATE'S MENU.
         *
         * An anchored context menu, NOT a dialog - a dialog would close the
         * launcher behind it, which is the bug this replaces. Deleting redraws
         * in place; renaming is handed to the caller, which owns the name
         * dialog and re-opens the launcher afterwards.
         */
        onManageTemplate: (id, anchor, event) => {
          enggUi.openContextMenu(
            anchor,
            [
              {
                id: "use",
                label: "Use Template",
                onSelect: () => choose({ action: "template", id })
              },
              {
                id: "rename",
                label: "Rename",
                onSelect: () => choose({ action: "rename-template", id })
              },
              {
                id: "delete",
                label: "Delete Template",
                danger: true,
                onSelect: () => {
                  enggTemplates.deleteTemplate(id);
                  redraw();
                }
              }
            ],
            pointOf(event)
          );
        },

        /*
         * A RECENT FILE'S MENU.
         *
         * Every action here is one the environment can actually perform. Remove
         * touches only Datum's record and always works; Delete is the
         * destructive one and goes through the caller, which confirms it; Reveal
         * is offered only where the browser has a way to do it.
         */
        onRecentMenu: (entry, anchor, event) => {
          const items = [];

          if (!entry.missing) {
            items.push({
              id: "open",
              label: "Open",
              onSelect: () => choose({ action: "recent", key: entry.key, entry })
            });
          }

          items.push({
            id: "remove",
            label: "Remove from Recents",
            onSelect: () => {
              enggRecentFiles.forget(entry.key);
              redraw();
            }
          });

          if (!entry.missing) {
            items.push({
              id: "delete",
              label: "Delete File",
              danger: true,
              onSelect: () =>
                choose({ action: "delete-recent", key: entry.key, entry })
            });
          }

          if (entry.hasHandle) {
            items.push({
              id: "reveal",
              label: "Reveal in Folder",
              onSelect: () =>
                choose({ action: "reveal-recent", key: entry.key, entry })
            });
          }

          enggUi.openContextMenu(anchor, items, pointOf(event));
        }
      });

      if (currentBody && currentBody.parentNode) {
        currentBody.replaceWith(next);
      }

      currentBody = next;

      return next;
    }

    currentBody = redraw();

    enggUi.openDialog({
      title: "Open",
      className: "engg-dialog-lg",
      body: currentBody,
      buttons: [
        { id: "import", label: "Import .enggdraw", primary: true },
        { id: "cancel", label: "Cancel", dismiss: true }
      ],
      onChoose: (id) =>
        choose({ action: id === "import" ? "import" : "cancel" })
    });
  });
}

const enggOpenPopup = {
  openOpenPopup,
  relativeDay
};

export default enggOpenPopup;
