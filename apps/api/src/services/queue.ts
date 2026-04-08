export function shouldDeliverNow(deliverAt: Date): boolean {
  return deliverAt <= new Date();
}

const TIMING_DAYS: Record<string, number> = {
  "2_weeks": 14,
  "1_week": 7,
  "3_days": 3,
  "2_days": 2,
  "day_of": 0,
};

export function shouldSkipReminder(timing: string, dueDate: Date): boolean {
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const reminderDays = TIMING_DAYS[timing] ?? 0;
  return daysUntilDue < reminderDays;
}
