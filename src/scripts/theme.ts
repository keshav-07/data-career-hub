type Pref = "system" | "light" | "dark";
const KEY = "dch-theme";
const ORDER: Pref[] = ["system", "light", "dark"];

function read(): Pref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: Pref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

export function initTheme() {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]");
  const label = (pref: Pref) => `Theme: ${pref}. Activate to change.`;
  let current = read();
  const sync = () => {
    apply(current);
    buttons.forEach((b) => {
      b.setAttribute("aria-label", label(current));
      b.title = label(current);
      const text = b.querySelector("[data-theme-label]");
      if (text) text.textContent = current;
    });
  };
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      try {
        if (current === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, current);
      } catch {
        /* storage unavailable: preference lasts for this page view only */
      }
      sync();
    }),
  );
  sync();
}
