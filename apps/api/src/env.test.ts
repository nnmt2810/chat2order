import { describe, expect, it } from "vitest";
import { envSchema } from "./config/env.js";

const base = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/chat2order",
  JWT_SECRET: "a".repeat(32),
  REDIS_URL: "redis://localhost:6379",
};

function failedPaths(input: Record<string, unknown>): string[] {
  const result = envSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("LLM settings", () => {
  it("keeps AI off by default and applies sensible limits", () => {
    const result = envSchema.safeParse(base);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.LLM_PROVIDER).toBe("none");
      expect(result.data.LLM_TIMEOUT_MS).toBe(30_000);
      expect(result.data.LLM_MAX_OUTPUT_TOKENS).toBe(1024);
    }
  });

  it("refuses a provider without an API key or a model name", () => {
    expect(failedPaths({ ...base, LLM_PROVIDER: "google" })).toEqual(
      expect.arrayContaining(["LLM_API_KEY", "LLM_MODEL"]),
    );
  });

  it("treats a blank key or model as missing", () => {
    expect(
      failedPaths({ ...base, LLM_PROVIDER: "google", LLM_API_KEY: "  ", LLM_MODEL: "" }),
    ).toEqual(expect.arrayContaining(["LLM_API_KEY", "LLM_MODEL"]));
  });

  it("accepts a fully configured provider", () => {
    const result = envSchema.safeParse({
      ...base,
      LLM_PROVIDER: "google",
      LLM_API_KEY: "test-key",
      LLM_MODEL: "some-model",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unsupported provider", () => {
    expect(failedPaths({ ...base, LLM_PROVIDER: "something-else" })).toContain("LLM_PROVIDER");
  });

  it("rejects an unreasonable timeout", () => {
    expect(failedPaths({ ...base, LLM_TIMEOUT_MS: "10" })).toContain("LLM_TIMEOUT_MS");
  });
});
