import { readFileSync } from "node:fs";

const path = new URL("../docs/curriculum/plan-90-days.json", import.meta.url);
const days = JSON.parse(readFileSync(path, "utf8"));
const errors = [];
const requiredText = ["Phase", "Focus Theme", "Primary Track", "Primary Focus", "Practice / Reinforcement", "Expected Outcome"];
const expectedDays = Array.from({ length: 90 }, (_, i) => i + 1);
const actualDays = days.map((d) => d.Day);
const uniqueDays = new Set(actualDays);

if (!Array.isArray(days) || days.length !== 90) errors.push(`expected 90 planner entries, found ${days.length}`);
if (uniqueDays.size !== 90) errors.push("planner day numbers are not unique");
if (actualDays.some((day, i) => day !== expectedDays[i])) errors.push("planner days must be ordered from 1 through 90");

for (const d of days) {
  for (const field of requiredText) {
    if (typeof d[field] !== "string" || !d[field].trim()) errors.push(`Day ${d.Day}: missing ${field}`);
  }
  if (!Number.isFinite(d["Planned Hrs"]) || d["Planned Hrs"] <= 0) {
    errors.push(`Day ${d.Day}: Planned Hrs must be positive`);
    continue;
  }
  const budget = d["Activity Budget"];
  const budgetFields = ["Learning Min", "Practice Min", "Review Min", "Project Min"];
  if (!budget || budgetFields.some((key) => !Number.isFinite(budget[key]) || budget[key] < 0)) {
    errors.push(`Day ${d.Day}: activity budget must define non-negative minutes for every activity`);
  } else {
    const minutes = budgetFields.reduce((sum, key) => sum + budget[key], 0);
    if (Math.abs(minutes - d["Planned Hrs"] * 60) > 0.01) {
      errors.push(`Day ${d.Day}: activity budget (${minutes} min) does not match planned hours (${d["Planned Hrs"]} h)`);
    }
  }
  if ((d.Day % 7 === 0 || d.Day === 90) && !String(d["Weekly Milestone"] ?? "").trim()) {
    errors.push(`Day ${d.Day}: weekly checkpoint is missing`);
  }
  if ([30, 60, 90].includes(d.Day) && !String(d["Monthly Milestone"] ?? "").trim()) {
    errors.push(`Day ${d.Day}: phase/month checkpoint is missing`);
  }
  if (/offers? in hand|guaranteed? job|job-ready in 90 days/i.test(String(d["Expected Outcome"]))) {
    errors.push(`Day ${d.Day}: outcome must be learner-controlled, not a job guarantee`);
  }
}

if (!String(days.at(-1)?.["Monthly Milestone"] ?? "").includes("not guaranteed")) {
  errors.push("Day 90 must explicitly state that employment outcomes are not guaranteed");
}

if (errors.length) {
  errors.forEach((error) => console.error(`error: ${error}`));
  console.error(`\\n${errors.length} planner validation error(s).`);
  process.exit(1);
}

const hours = days.reduce((sum, d) => sum + d["Planned Hrs"], 0);
console.log(`Planner OK: 90 ordered days, ${hours} planned hours, all outcomes and time budgets present, checkpoints validated.`);
