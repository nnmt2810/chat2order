import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { generateTextMock, errors, loggerMock, mockEnv } = vi.hoisted(() => {
  class MockError extends Error {
    static isInstance(value: unknown): boolean {
      return value instanceof this;
    }
  }
  class APICallError extends MockError {
    statusCode: number | undefined;
    isRetryable: boolean;
    constructor(options: { message: string; statusCode?: number; isRetryable?: boolean }) {
      super(options.message);
      this.statusCode = options.statusCode;
      this.isRetryable = options.isRetryable ?? false;
    }
  }
  class NoObjectGeneratedError extends MockError {}
  class RetryError extends MockError {
    lastError: unknown;
    constructor(lastError: unknown) {
      super("retries exhausted");
      this.lastError = lastError;
    }
  }
  return {
    generateTextMock: vi.fn(),
    errors: { APICallError, NoObjectGeneratedError, RetryError },
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    mockEnv: {
      LLM_PROVIDER: "google",
      LLM_API_KEY: "test-key" as string | undefined,
      LLM_MODEL: "test-model" as string | undefined,
      LLM_TIMEOUT_MS: 5000,
      LLM_MAX_OUTPUT_TOKENS: 512,
    },
  };
});

vi.mock("ai", () => ({
  generateText: generateTextMock,
  Output: { object: (options: unknown) => ({ kind: "object", options }) },
  ...errors,
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (modelId: string) => ({ provider: "google", modelId }),
}));
vi.mock("./lib/logger.js", () => ({ logger: loggerMock }));
vi.mock("./config/env.js", () => ({ env: mockEnv }));

import { LlmError } from "./llm/errors.js";
import { createLlmGateway } from "./llm/gateway.js";

const config = {
  provider: "google" as const,
  apiKey: "test-key",
  model: "test-model",
  timeoutMs: 5000,
  maxOutputTokens: 512,
  maxRetries: 2,
};

const schema = z.object({ items: z.array(z.string()) });
const request = { task: "unit-test", system: "extract", prompt: "chi lay 2 thung", schema };

beforeEach(() => {
  vi.clearAllMocks();
  generateTextMock.mockResolvedValue({
    output: { items: ["nuoc"] },
    text: "xin chao",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  });
});

describe("generateStructured", () => {
  it("returns the parsed data with usage and latency", async () => {
    const gateway = createLlmGateway(config);

    const result = await gateway.generateStructured(request);

    expect(result.data).toEqual({ items: ["nuoc"] });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(gateway).toMatchObject({ provider: "google", model: "test-model" });
  });

  it("asks for deterministic, bounded, time-limited output validated by the schema", async () => {
    await createLlmGateway(config).generateStructured(request);

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "extract",
        prompt: "chi lay 2 thung",
        temperature: 0,
        maxOutputTokens: 512,
        maxRetries: 2,
        abortSignal: expect.any(AbortSignal),
        output: { kind: "object", options: { schema } },
      }),
    );
  });

  it("lets a request lower the output limit", async () => {
    await createLlmGateway(config).generateStructured({ ...request, maxOutputTokens: 64 });

    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 64 }));
  });

  it("masks phone numbers and emails in the prompt, but not in the system instructions", async () => {
    await createLlmGateway(config).generateStructured({
      ...request,
      system: "goi 0901234567 neu can",
      prompt: "sdt 0901234567, mail a@b.vn",
    });

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "goi 0901234567 neu can",
        prompt: "sdt [số điện thoại], mail [email]",
      }),
    );
  });

  it("can skip the masking when explicitly asked", async () => {
    await createLlmGateway(config).generateStructured({
      ...request,
      prompt: "sdt 0901234567",
      redact: false,
    });

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "sdt 0901234567" }),
    );
  });
});

describe("generateText", () => {
  it("returns the text and does not ask for structured output", async () => {
    const result = await createLlmGateway(config).generateText({
      task: "faq",
      system: "tra loi",
      prompt: "may gio mo cua",
    });

    expect(result.text).toBe("xin chao");
    expect(generateTextMock.mock.calls[0]?.[0]).not.toHaveProperty("output");
  });
});

describe("logging", () => {
  it("never writes the prompt or the model's answer to the logs", async () => {
    generateTextMock.mockResolvedValue({
      output: { items: ["TRA-LOI-BI-MAT-67890"] },
      text: "",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    await createLlmGateway(config).generateStructured({
      ...request,
      prompt: "NOI-DUNG-BI-MAT-12345",
    });

    const logged = JSON.stringify([...loggerMock.info.mock.calls, ...loggerMock.warn.mock.calls]);
    expect(logged).not.toContain("NOI-DUNG-BI-MAT-12345");
    expect(logged).not.toContain("TRA-LOI-BI-MAT-67890");
    expect(logged).toContain("unit-test");
  });

  it("does not leak the prompt when a call fails either", async () => {
    generateTextMock.mockRejectedValue(new Error("NOI-DUNG-BI-MAT-12345"));

    await expect(
      createLlmGateway(config).generateStructured({ ...request, prompt: "NOI-DUNG-BI-MAT-12345" }),
    ).rejects.toBeInstanceOf(LlmError);

    expect(JSON.stringify(loggerMock.warn.mock.calls)).not.toContain("NOI-DUNG-BI-MAT-12345");
  });
});

describe("error mapping", () => {
  const cases: [string, () => unknown, string, boolean][] = [
    [
      "rate limit",
      () => new errors.APICallError({ message: "429", statusCode: 429, isRetryable: true }),
      "RATE_LIMITED",
      true,
    ],
    [
      "server error",
      () => new errors.APICallError({ message: "503", statusCode: 503, isRetryable: true }),
      "UNAVAILABLE",
      true,
    ],
    [
      "invalid key",
      () => new errors.APICallError({ message: "401", statusCode: 401 }),
      "PROVIDER_ERROR",
      false,
    ],
    [
      "invalid output",
      () => new errors.NoObjectGeneratedError("no object"),
      "INVALID_OUTPUT",
      false,
    ],
    [
      "retries exhausted on a rate limit",
      () =>
        new errors.RetryError(
          new errors.APICallError({ message: "429", statusCode: 429, isRetryable: true }),
        ),
      "RATE_LIMITED",
      true,
    ],
    [
      "timeout",
      () => Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      "TIMEOUT",
      true,
    ],
    ["unknown error", () => new Error("weird"), "PROVIDER_ERROR", false],
  ];

  it.each(cases)("maps %s", async (_name, makeError, code, retryable) => {
    generateTextMock.mockRejectedValue(makeError());

    const failure = createLlmGateway(config).generateStructured(request);

    await expect(failure).rejects.toBeInstanceOf(LlmError);
    await expect(failure).rejects.toMatchObject({ code, retryable });
  });
});

describe("getLlmGateway", () => {
  async function load() {
    vi.resetModules();
    return import("./llm/gateway.js");
  }

  beforeEach(() => {
    mockEnv.LLM_PROVIDER = "google";
    mockEnv.LLM_API_KEY = "test-key";
    mockEnv.LLM_MODEL = "test-model";
  });

  it("returns null when AI is switched off", async () => {
    mockEnv.LLM_PROVIDER = "none";
    const { getLlmGateway } = await load();

    expect(getLlmGateway()).toBeNull();
  });

  it("builds one shared gateway from the environment", async () => {
    const { getLlmGateway } = await load();

    const first = getLlmGateway();
    expect(first).toMatchObject({ provider: "google", model: "test-model" });
    expect(getLlmGateway()).toBe(first);
  });

  it("fails clearly when the key or model is missing", async () => {
    mockEnv.LLM_API_KEY = undefined;
    const { getLlmGateway } = await load();

    expect(() => getLlmGateway()).toThrowError(expect.objectContaining({ code: "NOT_CONFIGURED" }));
  });
});
