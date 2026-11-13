export const REMINDER_OPTIONS = [
  { minutes: 15, label: "15 minutes before", short: "15m" },
  { minutes: 30, label: "30 minutes before", short: "30m" },
  { minutes: 60, label: "1 hour before", short: "1h" },
  { minutes: 120, label: "2 hours before", short: "2h" },
  { minutes: 1440, label: "1 day before", short: "1d" },
  { minutes: 2880, label: "2 days before", short: "2d" },
  { minutes: 10080, label: "1 week before", short: "1w" },
] as const;

export type ReminderMinutes = (typeof REMINDER_OPTIONS)[number]["minutes"];

export function isReminderMinutes(value: unknown): value is ReminderMinutes {
  return REMINDER_OPTIONS.some((option) => option.minutes === value);
}
