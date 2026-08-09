const KST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toKstDateKey(date: Date) {
  const parts = Object.fromEntries(
    KST_DATE_FORMAT.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isOnKstDate(date: Date, sourceDate: string) {
  return toKstDateKey(date) === sourceDate;
}

export function previousKstDate(now = new Date()) {
  const current = toKstDateKey(now);
  const [year, month, day] = current.split("-").map(Number);
  return toKstDateKey(new Date(Date.UTC(year, month - 1, day - 1, 12)));
}

export function isDigestStale(sourceDate: string | null | undefined, now = new Date()) {
  return sourceDate ? sourceDate < previousKstDate(now) : false;
}

export function isValidKstDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00+09:00`);
  return !Number.isNaN(date.getTime()) && toKstDateKey(date) === value;
}

export function nextKstDate(sourceDate: string) {
  const [year, month, day] = sourceDate.split("-").map(Number);
  return toKstDateKey(new Date(Date.UTC(year, month - 1, day + 1, 12)));
}

export function kstDateAtTime(sourceDate: string, time: string) {
  const iso = `${sourceDate}T${time}:00+09:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error("유효하지 않은 KST 날짜/시간입니다.");
  return date;
}
