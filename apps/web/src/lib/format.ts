const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const plain = new Intl.NumberFormat("vi-VN");

export const formatVnd = (value: number) => vnd.format(value);
export const formatNumber = (value: number) => plain.format(value);