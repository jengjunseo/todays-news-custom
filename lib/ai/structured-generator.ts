import {
  createOpenRouter,
  type OpenRouterProviderOptions,
} from "@openrouter/ai-sdk-provider";
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
    const model = process.env.AI_MODEL;
    if (!model) throw new Error("AI_MODEL이 설정되지 않았습니다.");
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY가 설정되지 않았습니다.");

    const openrouter = createOpenRouter({ apiKey });

    const { output } = await generateText({
      model: openrouter.chat(model, {
        provider: { require_parameters: true },
      }),
      maxRetries: 0,
      timeout: { totalMs: 90_000 },
      maxOutputTokens: 4096,
      providerOptions: {
        openrouter: {
          reasoning: { effort: "low", exclude: true },
        } satisfies OpenRouterProviderOptions,
      },
      output: Output.object({ schema: input.schema }),
      prompt: input.correction
        ? `${input.prompt}\n\n이전 응답 수정 지시:\n${input.correction}`
        : input.prompt,
    });
    return output;
  }
}
