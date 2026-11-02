import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  RetryError,
  type LanguageModel,
} from "ai";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { LlmError } from "./errors.js";
import { redactPii } from "./privacy.js";
import type {
  LlmConfig,
  LlmGateway,
  LlmStructuredRequest,
  LlmStructuredResult,
  LlmTextRequest,
  LlmTextResult,
  LlmUsage,
} from "./types.js";

const MAX_RETRIES = 2;

function createModel(config: LlmConfig): LanguageModel {
  switch (config.provider) {
    case "google":
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
  }
}

export function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;

  // Sau khi hết lượt thử lại, SDK bọc lỗi cuối cùng trong RetryError
  const root = RetryError.isInstance(err) ? err.lastError : err;

  if (NoObjectGeneratedError.isInstance(root)) {
    return new LlmError("INVALID_OUTPUT", "Mô hình trả về dữ liệu không đúng cấu trúc", false, {
      cause: err,
    });
  }
  // Nguồn duy nhất có thể hủy cuộc gọi là bộ đếm thời gian của chính cổng này
  if (root instanceof Error && (root.name === "TimeoutError" || root.name === "AbortError")) {
    return new LlmError("TIMEOUT", "Cuộc gọi AI quá thời gian chờ", true, { cause: err });
  }
  if (APICallError.isInstance(root)) {
    const status = root.statusCode;
    if (status === 429) {
      return new LlmError("RATE_LIMITED", "Nhà cung cấp AI đang giới hạn tốc độ", true, {
        status,
        cause: err,
      });
    }
    if (status === 408 || (status !== undefined && status >= 500)) {
      return new LlmError("UNAVAILABLE", "Nhà cung cấp AI tạm thời không phản hồi", true, {
        status,
        cause: err,
      });
    }
    if (status === 401 || status === 403) {
      return new LlmError("PROVIDER_ERROR", "Khóa API không hợp lệ hoặc không có quyền", false, {
        status,
        cause: err,
      });
    }
    return new LlmError("PROVIDER_ERROR", "Nhà cung cấp AI từ chối yêu cầu", root.isRetryable, {
      ...(status !== undefined ? { status } : {}),
      cause: err,
    });
  }
  return new LlmError("PROVIDER_ERROR", "Lỗi không xác định từ nhà cung cấp AI", false, {
    cause: err,
  });
}

type UsageSource = {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
};

function toUsage(usage: UsageSource): LlmUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

export function createLlmGateway(config: LlmConfig): LlmGateway {
  const model = createModel(config);

  const baseParams = (request: LlmTextRequest) => ({
    model,
    system: request.system,
    prompt: request.redact === false ? request.prompt : redactPii(request.prompt),
    temperature: 0,
    maxOutputTokens: request.maxOutputTokens ?? config.maxOutputTokens,
    maxRetries: config.maxRetries,
    abortSignal: AbortSignal.timeout(config.timeoutMs),
  });

  // Chỉ ghi log tên tác vụ, thời gian và số token, không bao giờ ghi nội dung gửi đi hay nhận về
  async function measure<R extends { usage: UsageSource }>(
    task: string,
    call: () => Promise<R>,
  ): Promise<{ result: R; usage: LlmUsage; latencyMs: number }> {
    const started = Date.now();
    try {
      const result = await call();
      const latencyMs = Date.now() - started;
      const usage = toUsage(result.usage);
      logger.info(
        { task, provider: config.provider, model: config.model, latencyMs, ...usage },
        "LLM call completed",
      );
      return { result, usage, latencyMs };
    } catch (err) {
      const llmError = toLlmError(err);
      logger.warn(
        {
          task,
          provider: config.provider,
          model: config.model,
          latencyMs: Date.now() - started,
          code: llmError.code,
          retryable: llmError.retryable,
          status: llmError.status,
        },
        "LLM call failed",
      );
      throw llmError;
    }
  }

  return {
    provider: config.provider,
    model: config.model,

    async generateStructured<T>(request: LlmStructuredRequest<T>): Promise<LlmStructuredResult<T>> {
      const { result, usage, latencyMs } = await measure(request.task, () =>
        generateText({
          ...baseParams(request),
          output: Output.object({ schema: request.schema }),
        }),
      );
      return { data: result.output, usage, latencyMs };
    },

    async generateText(request: LlmTextRequest): Promise<LlmTextResult> {
      const { result, usage, latencyMs } = await measure(request.task, () =>
        generateText(baseParams(request)),
      );
      return { text: result.text, usage, latencyMs };
    },
  };
}

let cached: LlmGateway | null | undefined;

// Trả về null khi AI bị tắt (LLM_PROVIDER=none): nơi gọi phải tự bỏ qua phần AI
export function getLlmGateway(): LlmGateway | null {
  if (cached !== undefined) return cached;

  if (env.LLM_PROVIDER === "none") {
    cached = null;
    return cached;
  }
  if (!env.LLM_API_KEY || !env.LLM_MODEL) {
    throw new LlmError("NOT_CONFIGURED", "Thiếu LLM_API_KEY hoặc LLM_MODEL", false);
  }

  cached = createLlmGateway({
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxOutputTokens: env.LLM_MAX_OUTPUT_TOKENS,
    maxRetries: MAX_RETRIES,
  });
  return cached;
}
