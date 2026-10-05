/**
 * Study planner state, saved in this browser only (localStorage), like learning progress.
 * Tracks per-topic study fields (studied, practised, revisions, confidence) and 90-day plan days.
 */
type TopicState = Partial<Record<"learn" | "practice" | "mock" | "r1" | "r2" | "r3", 1>> & {
  c?: number;
};
type State = {
  v: 1;
  t: Record<string, TopicState>;
  days: Record<string, number>;
  start?: string;
};

const KEY = "dch-planner-v1";
const empty = (): State => ({ v: 1, t: {}, days: {} });

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    return s && s.v === 1 ? { ...empty(), ...s } : empty();
  } catch {
    return empty();
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: changes last for this page view only */
  }
}

export function topicState(key: string): TopicState {
  return state.t[key] ?? {};
}

const DAY = 86_400_000;
function dateForDay(day: number): Date | undefined {
  if (!state.start) return undefined;
  const d = new Date(`${state.start}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : new Date(d.getTime() + (day - 1) * DAY);
}

function decorate() {
  document.querySelectorAll<HTMLInputElement>("input[data-pl-key][data-pl-field]").forEach((b) => {
    b.checked = !!topicState(b.dataset.plKey!)[b.dataset.plField as keyof TopicState];
  });
  document.querySelectorAll<HTMLSelectElement>("select[data-pl-key]").forEach((s) => {
    s.value = String(topicState(s.dataset.plKey!).c ?? "");
  });
  document.querySelectorAll<HTMLElement>("tr[data-pl-row]").forEach((r) => {
    const t = topicState(r.dataset.plRow!);
    r.dataset.state = t.learn ? "done" : Object.keys(t).length ? "started" : "";
  });
  document.querySelectorAll<HTMLInputElement>("input[data-pl-day]").forEach((b) => {
    b.checked = state.days[b.dataset.plDay!] !== undefined;
    b.closest<HTMLElement>("[data-pl-day-card]")?.setAttribute(
      "data-state",
      b.checked ? "done" : "",
    );
  });
  document.querySelectorAll<HTMLInputElement>("input[data-pl-start]").forEach((i) => {
    i.value = state.start ?? "";
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  document.querySelectorAll<HTMLElement>("[data-pl-date]").forEach((el) => {
    const d = dateForDay(Number(el.dataset.plDate));
    el.textContent = d
      ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
      : "";
    const card = el.closest<HTMLElement>("[data-pl-day-card]");
    if (card) card.toggleAttribute("data-today", !!d && d.getTime() === today.getTime());
  });
  document.querySelectorAll<HTMLElement>("[data-pl-ring]").forEach((ring) => {
    let done = 0;
    let total = Number(ring.dataset.total) || 0;
    let detail = "";
    if (ring.dataset.plRing === "days") {
      done = Object.keys(state.days).length;
      const hours = Object.values(state.days).reduce((a, b) => a + b, 0);
      detail = `${done} of ${total} days · ${hours} of ${ring.dataset.hours} h`;
    } else {
      const prefix = ring.dataset.plRing ? `${ring.dataset.plRing}:` : "";
      const keys = (ring.dataset.prefixes ?? prefix).split(",").filter(Boolean);
      done = Object.entries(state.t).filter(
        ([k, v]) => v.learn && (keys.length === 0 || keys.some((p) => k.startsWith(p))),
      ).length;
      detail = `${done} of ${total}`;
    }
    total = Math.max(total, done);
    const pct = total ? Math.round((done / total) * 100) : 0;
    ring.style.setProperty("--pct", String(pct));
    const v = ring.querySelector("[data-ring-value]");
    if (v) v.textContent = `${pct}%`;
    const d = ring.querySelector("[data-ring-detail]");
    if (d) d.textContent = detail;
    ring.setAttribute("aria-label", `${ring.dataset.label ?? ""}: ${detail} (${pct}%)`);
  });
  document.dispatchEvent(new CustomEvent("planner:change"));
}

function onChange(e: Event) {
  const el = e.target as HTMLElement;
  if (el.matches("input[data-pl-key][data-pl-field]")) {
    const b = el as HTMLInputElement;
    const key = b.dataset.plKey!;
    const t = { ...topicState(key) };
    const f = b.dataset.plField as keyof Omit<TopicState, "c">;
    if (b.checked) t[f] = 1;
    else delete t[f];
    setTopic(key, t);
  } else if (el.matches("select[data-pl-key]")) {
    const s = el as HTMLSelectElement;
    const key = s.dataset.plKey!;
    const t = { ...topicState(key) };
    if (s.value) t.c = Number(s.value);
    else delete t.c;
    setTopic(key, t);
  } else if (el.matches("input[data-pl-day]")) {
    const b = el as HTMLInputElement;
    if (b.checked) state.days[b.dataset.plDay!] = Number(b.dataset.hours) || 0;
    else delete state.days[b.dataset.plDay!];
    save();
    decorate();
  } else if (el.matches("input[data-pl-start]")) {
    state.start = (el as HTMLInputElement).value || undefined;
    save();
    decorate();
  }
}

function setTopic(key: string, t: TopicState) {
  if (Object.keys(t).length) state.t[key] = t;
  else delete state.t[key];
  save();
  decorate();
}

function onClick(e: Event) {
  const el = (e.target as HTMLElement).closest<HTMLElement>(
    "[data-pl-export],[data-pl-reset],[data-pl-import]",
  );
  if (!el) return;
  if (el.hasAttribute("data-pl-export")) {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `data-career-hub-planner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else if (el.hasAttribute("data-pl-reset")) {
    if (
      confirm("Clear all planner ticks, confidence scores and plan days saved in this browser?")
    ) {
      state = empty();
      save();
      decorate();
    }
  } else if (el.hasAttribute("data-pl-import")) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const s = JSON.parse(await file.text()) as State;
        if (s?.v !== 1 || typeof s.t !== "object") throw new Error("format");
        state = { ...empty(), ...s };
        save();
        decorate();
        alert("Planner restored from backup.");
      } catch {
        alert("That file is not a Data Career Hub planner backup.");
      }
    });
    input.click();
  }
}

export function initPlanner() {
  if (!document.querySelector("[data-planner]")) return;
  decorate();
  document.addEventListener("change", onChange);
  document.addEventListener("click", onClick);
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      state = load();
      decorate();
    }
  });
}
