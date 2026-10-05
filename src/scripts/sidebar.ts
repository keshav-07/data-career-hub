/** Hide or show the left course menu; the choice is remembered in this browser. */
const KEY = "dch-sidebar";

export function initSidebar() {
  const root = document.documentElement;
  const sync = () => {
    const collapsed = root.dataset.sidebar === "collapsed";
    document.querySelectorAll<HTMLButtonElement>("[data-sidebar-toggle]").forEach((b) => {
      b.setAttribute("aria-expanded", String(!collapsed));
    });
  };
  document.querySelectorAll<HTMLButtonElement>("[data-sidebar-toggle]").forEach((b) =>
    b.addEventListener("click", () => {
      const collapsed = root.dataset.sidebar !== "collapsed";
      if (collapsed) root.dataset.sidebar = "collapsed";
      else delete root.dataset.sidebar;
      try {
        if (collapsed) localStorage.setItem(KEY, "collapsed");
        else localStorage.removeItem(KEY);
      } catch {
        /* storage unavailable */
      }
      sync();
      document
        .querySelector<HTMLElement>(
          collapsed ? "[data-sidebar-open]" : ".side-nav--desktop [data-sidebar-toggle]",
        )
        ?.focus();
    }),
  );
  sync();
}
