/** Mobile menu uses a native modal <dialog>: focus trap, Escape and focus return come from the platform. */
export function initMenu() {
  const dialog = document.querySelector<HTMLDialogElement>("#mobile-menu");
  const toggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  if (!dialog || !toggle) return;
  const open = () => {
    dialog.showModal();
    toggle.setAttribute("aria-expanded", "true");
  };
  const close = () => dialog.close();
  toggle.addEventListener("click", open);
  dialog.querySelectorAll("[data-menu-close]").forEach((b) => b.addEventListener("click", close));
  dialog.addEventListener("close", () => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  });
  // Clicking the backdrop (the dialog element itself) closes the menu.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  dialog.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
}
