// All "now" logic goes through here so demos can be time-pinned (RULES.md section 3).
export function now(): Date {
  const pinned = process.env.HOMEBASE_NOW;
  if (pinned) {
    const d = new Date(pinned);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Monday 00:00 (local time) of the week containing `d`, or the next Monday if `d` is Fri-Sun. */
export function upcomingWeekStart(d: Date = now()): Date {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day >= 5) {
    const add = day === 0 ? 1 : 8 - day;
    start.setDate(start.getDate() + add);
  } else {
    start.setDate(start.getDate() - (day - 1));
  }
  return start;
}
