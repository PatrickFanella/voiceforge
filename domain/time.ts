const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export function calculateDurationHours(startTimestamp: string, endTimestamp: string): number {
  const start = Date.parse(startTimestamp);
  const end = Date.parse(endTimestamp);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error('Invalid timestamp');
  }

  if (end <= start) {
    throw new Error('End time must be after start time');
  }

  return (end - start) / MILLISECONDS_PER_HOUR;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
