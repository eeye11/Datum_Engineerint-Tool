/* What dialog is blocking the drawing, and what can close it? */
import { mainWorld, openDrawingTab } from "./qa-bridge-driver.mjs";

export default async function run(page) {
  await openDrawingTab(page);

  return mainWorld(page, () => {
    const backdrop = document.querySelector(".engg-dialog-backdrop");

    if (!backdrop) return { noDialog: true };

    const dialog = backdrop.querySelector(".engg-dialog") || backdrop;

    return {
      classes: backdrop.className,
      dialogClasses: dialog.className,
      title:
        dialog.querySelector("h1, h2, h3, .engg-dialog-title")?.textContent ??
        null,
      text: dialog.innerText.replace(/\s+/g, " ").trim().slice(0, 220),
      buttons: Array.from(dialog.querySelectorAll("button")).map((b) => ({
        label: (b.textContent || "").trim(),
        cls: b.className,
      })),
    };
  });
}
