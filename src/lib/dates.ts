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

export function startOfWeek(dateOnly: string): string {
  const day = dayOfWeek(dateOnly);
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(dateOnly, mondayOffset);
}

export function endOfWeek(dateOnly: string): string {
  return addDays(startOfWeek(dateOnly), 6);
}

export function weekRange(dateOnly: string): { startDate: string; endDate: string } {
  return { startDate: startOfWeek(dateOnly), endDate: endOfWeek(dateOnly) };
}

export function nextWeekRange(dateOnly: string): { startDate: string; endDate: string } {
  const startDate = addDays(startOfWeek(dateOnly), 7);
  return { startDate, endDate: addDays(startDate, 6) };
}

export function nextDayOfWeek(dateOnly: string, targetDay: number, includeToday = true): string {
  const currentDay = dayOfWeek(dateOnly);
  const rawDelta = (targetDay - currentDay + 7) % 7;
  const delta = rawDelta === 0 && !includeToday ? 7 : rawDelta;
  return addDays(dateOnly, delta);
}

export function isDateInRange(dateOnly: string | undefined, startDate: string, endDate: string): boolean {
  return Boolean(dateOnly && dateOnly >= startDate && dateOnly <= endDate);
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
