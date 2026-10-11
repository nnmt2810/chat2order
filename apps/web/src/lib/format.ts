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
