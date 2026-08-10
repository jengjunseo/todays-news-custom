import {
  createOpenRouter,
  type OpenRouterProviderOptions,
} from "@openrouter/ai-sdk-provider";
import { createGoogle } from "@ai-sdk/google";
import { APICallError, generateText, Output } from "ai";
import type { z } from "zod";

export interface StructuredGenerator {
  generate<T>(input: {
    schema: z.ZodType<T>;
    prompt: string;
    correction?: string;
  }): Promise<unknown>;
}

const EXTERNAL_ERROR_NAMES = new Set(["AbortError", "ResponseAborted", "TimeoutError"]);
const TRANSPORT_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

export type AiProvider = "openrouter" | "gemini";

function selectedAiProvider(): AiProvider {
  const value = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (!value || value === "openrouter") return "openrouter";
  if (value === "gemini") return "gemini";
  throw new Error(`지원하지 않는 AI_PROVIDER입니다: ${value}`);
}

export function getAiRuntimeMetadata() {
  const provider = selectedAiProvider();
  const model = process.env.AI_MODEL?.trim();
  if (!model) throw new Error("AI_MODEL이 설정되지 않았습니다.");
  return { provider, model };
}

export function isAiRuntimeConfigured() {
  try {
    const { provider } = getAiRuntimeMetadata();
    return provider === "gemini"
      ? Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)
      : Boolean(process.env.OPENROUTER_API_KEY);
  } catch {
    return false;
  }
}

function requiredApiKey(provider: AiProvider) {
  const name = provider === "gemini"
    ? "GOOGLE_GENERATIVE_AI_API_KEY"
    : "OPENROUTER_API_KEY";
  const value = process.env[name];
  if (!value) throw new Error(`${name}가 설정되지 않았습니다.`);
  return value;
}

export function isExternalAiCallError(error: unknown): boolean {
  let current = error;

  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (APICallError.isInstance(current)) return true;
    if (!(current instanceof Error)) return false;
    if (EXTERNAL_ERROR_NAMES.has(current.name)) return true;
    if (/operation (?:was )?aborted|fetch failed|failed to fetch/i.test(current.message)) {
      return true;
    }
    if (
      "code" in current &&
      typeof current.code === "string" &&
      TRANSPORT_ERROR_CODES.has(current.code)
    ) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

export class AiSdkStructuredGenerator implements StructuredGenerator {
  async generate<T>(input: {
    schema: z.ZodType<T>;
    prompt: string;
    correction?: string;
  }) {
    const { provider, model } = getAiRuntimeMetadata();
    const apiKey = requiredApiKey(provider);
    console.log(JSON.stringify({
      stage: "ai_generation_started",
      provider,
      model,
      correction: Boolean(input.correction),
    }));
    const common = {
      maxRetries: 0,
      timeout: { totalMs: 90_000 },
      maxOutputTokens: 4096,
      output: Output.object({ schema: input.schema }),
      prompt: input.correction
        ? `${input.prompt}\n\n이전 응답 수정 지시:\n${input.correction}`
        : input.prompt,
    };

    const result = provider === "gemini"
      ? await generateText({
          ...common,
          model: createGoogle({ apiKey })(model),
        })
      : await generateText({
          ...common,
          model: createOpenRouter({ apiKey }).chat(model, {
            provider: { require_parameters: true },
          }),
          providerOptions: {
            openrouter: {
              reasoning: { effort: "low", exclude: true },
            } satisfies OpenRouterProviderOptions,
          },
        });
    return result.output;
  }
}
