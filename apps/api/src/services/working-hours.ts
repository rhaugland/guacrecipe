type WorkingHoursConfig = {
  workingHoursEnabled: boolean;
  workingHoursStart: string; // "HH:MM"
  workingHoursEnd: string;
  workingHoursTimezone: string;
  workingHoursDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
};

export function isWithinWorkingHours(config: WorkingHoursConfig, now: Date): boolean {
  if (!config.workingHoursEnabled) return true;

  const local = new Date(now.toLocaleString("en-US", { timeZone: config.workingHoursTimezone }));
  const day = local.getDay();
  if (!config.workingHoursDays.includes(day)) return false;

  const currentMinutes = local.getHours() * 60 + local.getMinutes();
  const [startH, startM] = config.workingHoursStart.split(":").map(Number);
  const [endH, endM] = config.workingHoursEnd.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function getNextWorkingTime(config: WorkingHoursConfig, now: Date): Date {
  const local = new Date(now.toLocaleString("en-US", { timeZone: config.workingHoursTimezone }));
  const [startH, startM] = config.workingHoursStart.split(":").map(Number);

  const currentMinutes = local.getHours() * 60 + local.getMinutes();
  const startMinutes = startH * 60 + startM;
  if (config.workingHoursDays.includes(local.getDay()) && currentMinutes < startMinutes) {
    local.setHours(startH, startM, 0, 0);
    return new Date(local.toLocaleString("en-US", { timeZone: config.workingHoursTimezone }));
  }

  for (let i = 1; i <= 7; i++) {
    const candidate = new Date(local);
    candidate.setDate(candidate.getDate() + i);
    if (config.workingHoursDays.includes(candidate.getDay())) {
      candidate.setHours(startH, startM, 0, 0);
      return candidate;
    }
  }

  local.setDate(local.getDate() + 1);
  local.setHours(startH, startM, 0, 0);
  return local;
}
