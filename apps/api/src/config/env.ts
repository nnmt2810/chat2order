import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(import.meta.dirname, "../../../../.env") });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "JWT_SECRET phải có ít nhất 32 ký tự"),
    REDIS_URL: z.string().min(1),
    WORKER_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    BATCH_QUIET_MS: z.coerce.number().int().min(100).max(60_000).default(4000),
    LLM_PROVIDER: z.enum(["none", "google"]).default("none"),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().optional(),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(8192).default(1024),
  })
  .superRefine((value, ctx) => {
    if (value.LLM_PROVIDER === "none") return;
    if (!value.LLM_API_KEY?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_API_KEY"],
        message: "LLM_API_KEY là bắt buộc khi LLM_PROVIDER khác none",
      });
    }
    if (!value.LLM_MODEL?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_MODEL"],
        message: "LLM_MODEL là bắt buộc khi LLM_PROVIDER khác none",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
