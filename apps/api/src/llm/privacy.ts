const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

// Số điện thoại Việt Nam: 0xxxxxxxxx, +84 xxx xxx xxx, 84xxxxxxxxx, có thể ngăn cách bằng dấu cách, chấm, gạch nối
const PHONE_PATTERN = /(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g;

// Che thông tin liên lạc trước khi gửi cho bên thứ ba. Việc đặt hàng không cần số điện thoại hay email.
// Dựa trên biểu thức chính quy nên không hoàn hảo (ví dụ không che địa chỉ, số căn cước).
export function redactPii(text: string): string {
  return text.replace(EMAIL_PATTERN, "[email]").replace(PHONE_PATTERN, "[số điện thoại]");
}

// Bọc dữ liệu không đáng tin (tin nhắn của khách) trong một thẻ, và gỡ mọi thẻ cùng tên nằm trong nội dung
// để khách không thể tự "đóng" vùng dữ liệu rồi chèn chỉ thị riêng.
export function fenceUntrusted(text: string, tag = "customer_messages"): string {
  const tagPattern = new RegExp(`<\\/?\\s*${tag}[^>]*>`, "gi");
  const safe = text.replace(tagPattern, "[thẻ bị gỡ]");
  return `<${tag}>\n${safe}\n</${tag}>`;
}
