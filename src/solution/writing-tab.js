function showTab(tabName, button) {
    document.querySelectorAll(".review-content").forEach(section => {
        section.classList.remove("active");
    });

    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
    });

    document.getElementById(tabName).classList.add("active");
    button.classList.add("active");
}

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
    if (window.enggWrittenReferences) {
        window.enggWrittenReferences.render();
    }
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