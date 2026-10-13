const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const plain = new Intl.NumberFormat("vi-VN");

export const formatVnd = (value: number) => vnd.format(value);
export const formatNumber = (value: number) => plain.format(value);

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

const timeOnly = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
const fullDay = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatTime(iso: string): string {
  return timeOnly.format(new Date(iso));
}

export function formatDay(iso: string): string {
  return fullDay.format(new Date(iso));
}

export function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Hôm nay thì hiện giờ, ngày khác thì hiện ngày/tháng
export function formatListTime(iso: string): string {
  const sameDay = dayKey(iso) === dayKey(new Date().toISOString());
  return sameDay ? formatTime(iso) : dayMonth.format(new Date(iso));
}
