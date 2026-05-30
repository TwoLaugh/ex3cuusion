export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toTimeOnly(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

export function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

export function dayOfWeek(dateOnly: string): number {
  return new Date(`${dateOnly}T12:00:00.000Z`).getUTCDay();
}

export function daysUntil(fromDate: string, toDate?: string): number {
  if (!toDate) return Number.POSITIVE_INFINITY;
  const from = new Date(`${fromDate}T12:00:00.000Z`).getTime();
  const to = new Date(`${toDate}T12:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;
  return `${nextHours.toString().padStart(2, "0")}:${nextMinutes.toString().padStart(2, "0")}`;
}

export function maxTime(left: string, right: string): string {
  return timeToMinutes(left) >= timeToMinutes(right) ? left : right;
}

export function timeToMinutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}
