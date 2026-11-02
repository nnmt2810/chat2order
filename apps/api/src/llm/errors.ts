export type LlmErrorCode =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "PROVIDER_ERROR";

// `retryable` cho biết thử lại có thể thành công hay không (quá tải, hết thời gian: có; sai khóa, đầu ra sai cấu trúc: không)
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(
    code: LlmErrorCode,
    message: string,
    retryable: boolean,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LlmError";
    this.code = code;
    this.retryable = retryable;
    this.status = options.status;
  }
}
