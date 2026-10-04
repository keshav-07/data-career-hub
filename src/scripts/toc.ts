export function initToc() {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".toc--desktop a[href^='#']"));
  if (!links.length || !("IntersectionObserver" in window)) return;
  const map = new Map<string, HTMLAnchorElement>();
  links.forEach((a) => map.set(decodeURIComponent(a.hash.slice(1)), a));
  const targets = Array.from(map.keys())
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => !!el);
  const setActive = (id: string) => {
    links.forEach((a) => a.removeAttribute("aria-current"));
    map.get(id)?.setAttribute("aria-current", "true");
  };
  const header = document.querySelector<HTMLElement>(".site-header");
  const offset = (header?.offsetHeight ?? 68) + 24;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    },
    { rootMargin: `-${offset}px 0px -65% 0px`, threshold: 0 },
  );
  targets.forEach((t) => observer.observe(t));
}
