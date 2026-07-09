export function isClockTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

export function normalizeMoveTime(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;

  const colon = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (colon) return `${colon[1].padStart(2, "0")}:${colon[2]}`;

  const meridiem = trimmed.match(/^(1[0-2]|0?[1-9])(?:[.:]([0-5]\d))?\s*(am|pm)$/);
  if (!meridiem) return undefined;
  let hours = Number(meridiem[1]);
  const minutes = meridiem[2] ?? "00";
  if (meridiem[3] === "pm" && hours !== 12) hours += 12;
  if (meridiem[3] === "am" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function fromMinutes(minutes: number): string {
  const wrapped = minutes % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export function addClockMinutes(time: string, minutes: number): string {
  return fromMinutes(toMinutes(time) + minutes);
}

export function formatDate(dateOnly: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${dateOnly}T12:00:00.000Z`));
}

export function formatShortDate(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-");
  return `${day}.${month}.${year.slice(2)}`;
}

export function formatDay(dateOnly: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short"
  }).format(new Date(`${dateOnly}T12:00:00.000Z`));
}

// Real local wall-clock now, as the app's date/time format. Used to anchor the app to the
// user's actual current time on load (the in-memory state would otherwise stay frozen at
// whatever time the server process first created it).
export function localNowParts() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`
  };
}
