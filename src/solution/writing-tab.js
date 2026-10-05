/*
 * The Written Solution tab: the uploaded handwritten page, the LaTeX
 * source, and the rendered solution.
 */
import { render } from "./written-references.js";

/*
 * Render the written solution.
 *
 * A thin wrapper, and deliberately so. The rendering itself belongs to
 * the reference module, because it is the reference module that knows
 * a drawing reference is a command in the text that resolves to a
 * sheet - and the solution cannot be rendered correctly without that
 * knowledge. Rendering it here instead would mean the solution showed
 * the reference token verbatim, or dropped the figure, or put it in
 * some other panel rather than where the token is.
 *
 * So the button calls the one renderer, and there is exactly one.
 */
function updateWriting() {
    render();
}

function previewImage(uploadId, imageId, messageId) {
    const upload = document.getElementById(uploadId);
    const image = document.getElementById(imageId);
    const message = document.getElementById(messageId);

    upload.addEventListener("change", () => {
        const file = upload.files[0];

        if (!file) return;

        image.src = URL.createObjectURL(file);
        image.style.display = "block";
        message.style.display = "none";
    });
}

previewImage("writingImageUpload", "writingImage", "writingImageMessage");

document
    .querySelector("[data-action='render-solution']")
    ?.addEventListener("click", updateWriting);
