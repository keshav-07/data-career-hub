const monthYear = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const full = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export const formatMonthYear = (d: Date) => monthYear.format(d);
export const formatDate = (d: Date) => full.format(d);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function readingMinutes(body: string | undefined): number {
  const text = body ?? "";
  const code = (text.match(/```[\s\S]*?```/g) ?? []).join(" ");
  const prose = text.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ");
  const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
  // Prose at about 220 words per minute; code is read at roughly half that speed.
  return Math.max(2, Math.round(count(prose) / 220 + count(code) / 110));
}
