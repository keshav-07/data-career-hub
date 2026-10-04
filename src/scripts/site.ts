import { initTheme } from "./theme";
import { initMenu } from "./menu";
import { initEnhance } from "./enhance";
import { initToc } from "./toc";

initTheme();
initMenu();
initEnhance();
initToc();

// Search runtime is loaded lazily: only when the dialog is opened or on /search/.
const dialog = document.querySelector<HTMLDialogElement>("#search-dialog");
const triggers = document.querySelectorAll<HTMLElement>("[data-search-open]");

async function openSearch() {
  if (!dialog) {
    location.assign("/search/");
    return;
  }
  if (!dialog.open) dialog.showModal();
  const { mountSearch } = await import("./search");
  mountSearch(dialog.querySelector<HTMLElement>("[data-search-root]")!);
}

triggers.forEach((t) => t.addEventListener("click", () => void openSearch()));
dialog
  ?.querySelectorAll("[data-search-close]")
  .forEach((b) => b.addEventListener("click", () => dialog.close()));
// Escape inside the search field would otherwise only clear the text first.
dialog?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    dialog.close();
  }
});
dialog?.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (location.pathname === "/search/")
      document.querySelector<HTMLInputElement>("#search-page-input")?.focus();
    else void openSearch();
  }
});
