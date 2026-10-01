// HH:MM timer entry. Digits shift in from the right like a microwave keypad.

/** 4 digits (HHMM) for a number of minutes: 180 -> "0300" (not "0180"). Capped at 99:59. */
export function minutesToDigits(minutes: number): string {
  const m = Math.max(0, Math.min(99 * 60 + 59, Math.floor(minutes || 0)));
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`;
}

/** Minutes for HHMM digits; minutes above 59 carry over ("0090" -> 90). */
export function digitsToMinutes(digits: string): number {
  const d = normalizeDigits(digits);
  return Number(d.slice(0, 2)) * 60 + Number(d.slice(2));
}

/** Keeps the last 4 digits, left-padded with zeros. */
export function normalizeDigits(input: string): string {
  return input.replace(/\D/g, "").slice(-4).padStart(4, "0");
}

export function formatDigits(digits: string): string {
  const d = normalizeDigits(digits);
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** "1 h 30 min", "45 min", "Off". */
export function describeMinutes(minutes: number): string {
  if (!minutes) return "Off";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** The timer field's label: time left only while heating with a timer set. */
export function timerLabel(heating: boolean, minutes: number): string {
  return heating && minutes > 0
    ? `Timer (${describeMinutes(minutes)} left)`
    : "Timer";
}
