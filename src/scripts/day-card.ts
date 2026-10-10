/**
 * Homepage Day card: shows the first 90-day-plan day not yet completed, lets the reader step through days and tick
 * one complete. Completion is stored by scripts/planner.ts (the checkbox is a normal `data-pl-day` input); this
 * module only chooses which day the card shows and re-renders it on `planner:change`.
 */
type Day = { d: number; th: string; h: number; m: string; t: [string, string, string, string][] };

const KEY = "dch-planner-v1";

type Stored = { days?: Record<string, number>; t?: Record<string, { learn?: 1 }> };
function stored(): Stored {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored) ?? {};
  } catch {
    return {};
  }
}
const doneDays = () => stored().days ?? {};

/** One topic tile: the lesson link plus a "studied" checkbox (saved by planner.ts like the tracker pages). */
function tile([skill, topic, href, key]: [string, string, string, string]) {
  const li = document.createElement("li");
  li.className = "day-task";
  li.title = `${skill}: ${topic}`;
  const link = document.createElement(href ? "a" : "span");
  link.className = "day-task__link";
  if (href) (link as HTMLAnchorElement).href = href;
  const s = document.createElement("span");
  s.className = "day-task__skill";
  s.textContent = skill;
  const t = document.createElement("span");
  t.className = "day-task__topic";
  t.textContent = topic;
  link.append(s, t);
  const box = document.createElement("input");
  if (key) {
    box.type = "checkbox";
    box.className = "day-task__check";
    box.dataset.plKey = key;
    box.dataset.plField = "learn";
    box.setAttribute("aria-label", `Studied: ${skill}, ${topic}`);
    li.append(link, box);
  } else {
    li.append(link);
  }
  return li;
}

export function initDayCard() {
  const found = document.querySelector<HTMLElement>("[data-day-card]");
  const data = found?.querySelector("[data-dc-data]")?.textContent;
  if (!found || !data) return;
  const card: HTMLElement = found;
  const days = JSON.parse(data) as Day[];
  const total = days.length;
  const $ = <T extends Element>(sel: string) => card.querySelector<T>(sel)!;
  const check = $<HTMLInputElement>("[data-dc-check]");
  const prev = $<HTMLButtonElement>("[data-dc-prev]");
  const next = $<HTMLButtonElement>("[data-dc-next]");
  const live = $<HTMLElement>("[data-dc-live]");

  const firstOpen = () => {
    const done = doneDays();
    let n = 1;
    while (n <= total && done[String(n)] !== undefined) n++;
    return n;
  };
  let shown = Math.min(firstOpen(), total);

  function render() {
    const day = days[shown - 1];
    const done = doneDays();
    const open = firstOpen();
    const isDone = done[String(shown)] !== undefined;
    $("[data-dc-status]").textContent = String(shown);
    $("[data-dc-theme]").textContent = day.th;
    $("[data-dc-title]").textContent = isDone
      ? "Completed"
      : shown === open
        ? shown === 1 && Object.keys(done).length === 0
          ? "Start here"
          : "Up next"
        : shown < open
          ? "Catch up"
          : "Coming up";
    // Rebuild the tiles only when the day changes, so a ticked checkbox keeps keyboard focus.
    const list = $<HTMLElement>("[data-dc-tasks]");
    if (list.dataset.day !== String(shown)) {
      list.replaceChildren(...day.t.map(tile));
      list.dataset.day = String(shown);
    }
    const topics = stored().t ?? {};
    let studied = 0;
    list.querySelectorAll<HTMLInputElement>("input[data-pl-key]").forEach((b) => {
      b.checked = !!topics[b.dataset.plKey!]?.learn;
      b.closest("li")!.toggleAttribute("data-done", b.checked);
      if (b.checked) studied++;
    });
    $("[data-dc-count]").textContent = `${studied}/${day.t.length} topics`;
    $("[data-dc-foot]").textContent = `${day.h} h · ${day.t.length} planned topics`;
    $("[data-dc-outcome]").textContent = day.m;
    check.dataset.plDay = String(shown);
    check.dataset.hours = String(day.h);
    check.checked = isDone;
    $("[data-dc-check-label]").textContent = isDone ? "Completed" : "Mark complete";
    check.setAttribute("aria-label", `Day ${shown} complete`);
    card.dataset.state = isDone ? "done" : "";
    prev.disabled = shown <= 1;
    next.disabled = shown >= total;

    // Main hero button: continue from the first day not yet completed.
    const cta = document.querySelector<HTMLAnchorElement>("[data-plan-cta]");
    const label = cta?.querySelector("[data-plan-cta-label]");
    if (cta && label && Object.keys(done).length) {
      label.textContent = open > total ? "Review your plan" : `Continue Day ${open}`;
      cta.href = open > total ? "/planner/90-day-plan/" : `/planner/90-day-plan/#day-${open}`;
    }
  }

  const go = (n: number) => {
    shown = Math.min(Math.max(n, 1), total);
    render();
    live.textContent = `Showing day ${shown}`;
  };
  prev.addEventListener("click", () => go(shown - 1));
  next.addEventListener("click", () => go(shown + 1));
  // planner.ts saves the tick, then fires planner:change. After ticking the day shown, move on to the next
  // open day so the card always points at what to study next.
  let justTicked = false;
  check.addEventListener("change", () => {
    justTicked = check.checked;
  });
  document.addEventListener("planner:change", () => {
    render();
    if (justTicked) {
      justTicked = false;
      const was = shown;
      const open = firstOpen();
      // A short pause so the tick is seen before the card moves on.
      if (open <= total && open !== shown)
        setTimeout(() => {
          if (shown !== was) return;
          shown = open;
          render();
          live.textContent = `Day ${was} completed. Showing day ${shown}.`;
        }, 500);
    }
  });
  render();
}
