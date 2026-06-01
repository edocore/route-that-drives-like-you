import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a duration in minutes as "40 min" under an hour, or
 * "2 hours and 1 minute" / "3 hours" once it crosses an hour.
 */
export function formatDuration(durationMin: number): string {
  const total = Math.max(0, Math.round(durationMin));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total - hours * 60;
  const hStr = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  if (mins === 0) return hStr;
  const mStr = `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  return `${hStr} and ${mStr}`;
}
