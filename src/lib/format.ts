export function formatDate(value: string | null) {
  if (!value) {return "—";}
  return new Date(value).toLocaleString();
}

export function formatDurationMs(value: number | null) {
  if (value == null) {return "—";}
  if (value < 1000) {return `${value} ms`;}
  const seconds = Math.round(value / 1000);
  if (seconds < 60) {return `${seconds}s`;}
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
}

export function formatAgeMinutes(value: number | null) {
  if (value == null) {return "—";}
  if (value < 1) {return "<1m";}
  if (value < 60) {return `${Math.round(value)}m`;}
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function slugLabel(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
