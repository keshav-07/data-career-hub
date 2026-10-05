/**
 * Learning progress saved in this browser only (localStorage). Nothing is sent to a server.
 * Records pages visited and items marked done, and decorates the page from that state.
 */
type Kind = "lesson" | "question" | "project" | "other";
type Rec = { kind: Kind; course?: string; title?: string; t: number };
type State = {
  v: 1;
  done: Record<string, Rec>;
  visited: Record<string, Rec>;
  last?: { url: string; title: string; course?: string; t: number };
  lastByCourse: Record<string, { url: string; title: string; t: number }>;
};

const KEY = "dch-progress-v1";
const empty = (): State => ({ v: 1, done: {}, visited: {}, lastByCourse: {} });

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw) as State;
    return s && s.v === 1 ? { ...empty(), ...s } : empty();
  } catch {
    return empty();
  }
}

function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable or full: progress lasts for this page view only */
  }
}

let state = load();

function count(kind: Kind, course?: string, of: "done" | "visited" = "done") {
  return Object.values(state[of]).filter((r) => r.kind === kind && (!course || r.course === course))
    .length;
}

function decorate() {
  document.querySelectorAll<HTMLElement>("[data-progress-url]").forEach((el) => {
    const url = el.dataset.progressUrl!;
    el.dataset.state = state.done[url] ? "done" : state.visited[url] ? "visited" : "";
  });
  document.querySelectorAll<HTMLInputElement>("input[data-done-url]").forEach((box) => {
    box.checked = !!state.done[box.dataset.doneUrl!];
  });
  document.querySelectorAll<HTMLButtonElement>("button[data-done-toggle]").forEach((b) => {
    const on = !!state.done[b.dataset.url!];
    b.setAttribute("aria-pressed", String(on));
    const label = b.querySelector("[data-done-label]");
    if (label) label.textContent = on ? b.dataset.labelOn! : b.dataset.labelOff!;
  });
  document.querySelectorAll<HTMLElement>("[data-ring]").forEach((ring) => {
    const total = Number(ring.dataset.total) || 0;
    const done = Math.min(
      total,
      count(ring.dataset.kind as Kind, ring.dataset.course || undefined),
    );
    const pct = total ? Math.round((done / total) * 100) : 0;
    ring.style.setProperty("--pct", String(pct));
    const value = ring.querySelector("[data-ring-value]");
    if (value) value.textContent = `${pct}%`;
    const detail = ring.querySelector("[data-ring-detail]");
    if (detail) detail.textContent = `${done} of ${total}`;
    ring.setAttribute(
      "aria-label",
      `${ring.dataset.label ?? ""}: ${done} of ${total} done (${pct}%)`,
    );
  });
  document.querySelectorAll<HTMLAnchorElement>("a[data-continue]").forEach((a) => {
    const course = a.dataset.course;
    const target = course ? state.lastByCourse[course] : state.last;
    if (target && target.url !== location.pathname) {
      a.href = target.url;
      const t = a.querySelector("[data-continue-title]");
      if (t) t.textContent = target.title;
      a.hidden = false;
      document
        .querySelectorAll<HTMLElement>(`[data-hide-when-continue${course ? `="${course}"` : ""}]`)
        .forEach((el) => (el.hidden = true));
    }
  });
  const any = Object.keys(state.done).length + Object.keys(state.visited).length > 0;
  document
    .querySelectorAll<HTMLElement>("[data-progress-empty]")
    .forEach((el) => (el.hidden = any));
  document.querySelectorAll<HTMLElement>("[data-progress-has]").forEach((el) => (el.hidden = !any));
}

function recordVisit() {
  const page = document.querySelector<HTMLElement>("[data-progress-page]");
  if (!page) return;
  const url = page.dataset.url!;
  const rec: Rec = {
    kind: (page.dataset.kind as Kind) ?? "other",
    course: page.dataset.course || undefined,
    title: page.dataset.title,
    t: Date.now(),
  };
  state.visited[url] = rec;
  if (rec.kind !== "other") {
    state.last = { url, title: rec.title ?? url, course: rec.course, t: rec.t };
    if (rec.course && rec.kind === "lesson")
      state.lastByCourse[rec.course] = { url, title: rec.title ?? url, t: rec.t };
  }
  save(state);
}

function setDone(url: string, on: boolean, meta: Partial<Rec>) {
  if (on)
    state.done[url] = {
      kind: (meta.kind as Kind) ?? "other",
      course: meta.course,
      title: meta.title,
      t: Date.now(),
    };
  else delete state.done[url];
  save(state);
  decorate();
}

export function initProgress() {
  recordVisit();
  decorate();
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-done-toggle]");
    if (b) {
      setDone(b.dataset.url!, !state.done[b.dataset.url!], {
        kind: b.dataset.kind as Kind,
        course: b.dataset.course,
        title: b.dataset.title,
      });
      const live = document.querySelector("[data-done-status]");
      if (live)
        live.textContent = state.done[b.dataset.url!] ? "Marked as done" : "Marked as not done";
    }
    const reset = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-progress-reset]",
    );
    if (reset && window.confirm("Clear all progress saved in this browser?")) {
      state = empty();
      save(state);
      decorate();
    }
  });
  document.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (box.matches?.("input[data-done-url]")) {
      setDone(box.dataset.doneUrl!, box.checked, {
        kind: box.dataset.kind as Kind,
        course: box.dataset.course,
        title: box.dataset.title,
      });
    }
  });
  // Keep several open tabs in sync.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      state = load();
      decorate();
    }
  });
}

export function isDone(url: string) {
  return !!state.done[url];
}
