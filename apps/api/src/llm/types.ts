import type { ZodType } from "zod";

export type LlmConfig = {
  provider: "google";
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxRetries: number;
};

export type LlmUsage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
};

type BaseRequest = {
  // Nhãn của tác vụ, dùng cho log và đo đạc (ví dụ "classify-intent")
  task: string;
  // Chỉ thị do hệ thống viết. Tuyệt đối không đưa nội dung của khách vào đây.
  system: string;
  // Nội dung cần xử lý, thường chứa tin nhắn của khách (nên bọc bằng fenceUntrusted)
  prompt: string;
  // Mặc định che số điện thoại và email trong `prompt`; chỉ đặt false khi thật sự cần
  redact?: boolean;
  maxOutputTokens?: number;
};

export type LlmStructuredRequest<T> = BaseRequest & { schema: ZodType<T> };
export type LlmTextRequest = BaseRequest;

export type LlmStructuredResult<T> = { data: T; usage: LlmUsage; latencyMs: number };
export type LlmTextResult = { text: string; usage: LlmUsage; latencyMs: number };

export interface LlmGateway {
  readonly provider: string;
  readonly model: string;
  generateStructured<T>(request: LlmStructuredRequest<T>): Promise<LlmStructuredResult<T>>;
  generateText(request: LlmTextRequest): Promise<LlmTextResult>;
}
