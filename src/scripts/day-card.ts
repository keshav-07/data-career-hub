/**
 * Homepage Day card: renders the same plan day content as /planner/90-day-plan/.
 * Completion and topic progress are stored by scripts/planner.ts.
 */
type Topic = { topic: string; href?: string; key?: string };
type Task = {
  track: string;
  minutes: number;
  kind: string;
  topics: Topic[];
  practice?: { title: string; url: string }[];
};
type Day = {
  d: number;
  th: string;
  h: number;
  tasks: Task[];
};

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

/** A planner topic tile with the same links and progress checkbox as the 90-day plan. */
function topicTile(track: string, topic: Topic) {
  const li = document.createElement("li");
  li.className = "day-task";
  li.title = `${track}: ${topic.topic}`;
  const link = document.createElement(topic.href ? "a" : "span");
  link.className = "day-task__link";
  if (topic.href) (link as HTMLAnchorElement).href = topic.href;
  const skill = document.createElement("span");
  skill.className = "day-task__skill";
  skill.textContent = track;
  const title = document.createElement("span");
  title.className = "day-task__topic";
  title.textContent = topic.topic;
  link.append(skill, title);
  li.append(link);

  if (topic.key) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "day-task__check";
    box.dataset.plKey = topic.key;
    box.dataset.plField = "learn";
    box.setAttribute("aria-label", `Studied: ${track}, ${topic.topic}`);
    li.append(box);
  }
  return li;
}

function practiceTile(track: string, practice: NonNullable<Task["practice"]>[number]) {
  const item = document.createElement("li");
  item.className = "day-task";
  item.title = `${track} practice: ${practice.title}`;
  const link = document.createElement("a");
  link.className = "day-task__link";
  link.href = practice.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const skill = document.createElement("span");
  skill.className = "day-task__skill";
  skill.textContent = `${track} practice`;
  const title = document.createElement("span");
  title.className = "day-task__topic";
  title.textContent = `${practice.title} ↗`;
  link.append(skill, title);
  item.append(link);
  return item;
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

    const list = $<HTMLElement>("[data-dc-tasks]");
    if (list.dataset.day !== String(shown)) {
      list.replaceChildren(
        ...day.tasks.flatMap((task) => [
          ...task.topics.map((topic) => topicTile(task.track, topic)),
          ...(task.practice ?? []).map((practice) => practiceTile(task.track, practice)),
        ]),
      );
      list.dataset.day = String(shown);
    }
    const topics = stored().t ?? {};
    let studied = 0;
    list
      .querySelectorAll<HTMLInputElement>('input[data-pl-key][data-pl-field="learn"]')
      .forEach((box) => {
        box.checked = !!topics[box.dataset.plKey!]?.learn;
        box.closest("li")!.toggleAttribute("data-done", box.checked);
        if (box.checked) studied++;
      });
    const trackedTopics = day.tasks.reduce(
      (count, task) => count + task.topics.filter((topic) => topic.key).length,
      0,
    );
    const taskCount = day.tasks.reduce(
      (count, task) => count + task.topics.length + (task.practice?.length ?? 0),
      0,
    );
    $("[data-dc-count]").textContent = `${studied}/${trackedTopics} topics · ${taskCount} tasks`;
    $("[data-dc-foot]").textContent = `${day.h} h planned`;

    check.dataset.plDay = String(shown);
    check.dataset.hours = String(day.h);
    check.checked = isDone;
    $("[data-dc-check-label]").textContent = isDone ? "Completed" : "Mark complete";
    check.setAttribute("aria-label", `Day ${shown} complete`);
    card.dataset.state = isDone ? "done" : "";
    prev.disabled = shown <= 1;
    next.disabled = shown >= total;

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
