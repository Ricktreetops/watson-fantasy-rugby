export const UNION_ORDER = ["IRE", "ENG", "SCO", "WAL", "FRA", "ITA", "NZL", "RSA", "AUS", "ARG", "JPN", "FIJ"];

export const GROUP_ORDER = ["PR", "HK", "LK", "BR", "FX", "SH", "FH", "CE", "B3", "BX"];

export function formatWhen(iso) {
  if (!iso) return "";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return `${formatted} UK`;
}

export function fmtPts(n) {
  if (!Number.isFinite(Number(n))) return "0";
  const rounded = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function inputValue(iso) {
  return iso ? String(iso).slice(0, 16) : "";
}

export function inputToIso(value) {
  if (!value) return null;
  return value.length === 16 ? `${value}:00Z` : value;
}

export function sortUnions(unions) {
  return [...unions].sort((a, b) => UNION_ORDER.indexOf(a.code) - UNION_ORDER.indexOf(b.code));
}
