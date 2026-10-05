/*
 * The page's top-level tabs: Written Solution and Engineering Drawing.
 *
 * Each tab button names the section it shows with data-tab="<section id>".
 */
export function showTab(tabName, button) {
    document.querySelectorAll(".review-content").forEach(section => {
        section.classList.remove("active");
    });

    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
    });

    document.getElementById(tabName).classList.add("active");
    button.classList.add("active");
}

document.querySelectorAll(".tab[data-tab]").forEach(button => {
    button.addEventListener("click", () => showTab(button.dataset.tab, button));
});
