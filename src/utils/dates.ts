const monthYear = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const full = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export const formatMonthYear = (d: Date) => monthYear.format(d);
export const formatDate = (d: Date) => full.format(d);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function readingMinutes(body: string | undefined): number {
  const words = (body ?? "").replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 220));
}
