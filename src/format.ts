/**
 * Byte-size formatting for the usage line ("3.2 GB", "412 MB", "38 KB").
 * Tiered B/KB/MB/GB/TB with one decimal below 100 of a unit; deterministic,
 * locale-neutral (hosts localize around the value, not inside it).
 */
const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 100 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded)} ${UNITS[unitIndex]}`;
}
