import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  createOpenRouter: vi.fn(),
  chat: vi.fn(),
  object: vi.fn(),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.object },
}));

import { AiSdkStructuredGenerator } from "@/lib/ai/structured-generator";

describe("AiSdkStructuredGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AI_MODEL", "openai/gpt-oss-120b:free");
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    mocks.createOpenRouter.mockReturnValue({ chat: mocks.chat });
  });

  it("uses the direct OpenRouter provider with structured output", async () => {
    const schema = z.object({ ok: z.boolean() });
    const openrouterModel = { provider: "openrouter.chat" };
    const output = { ok: true };
    const outputFormat = { type: "object" };
    mocks.chat.mockReturnValue(openrouterModel);
    mocks.object.mockReturnValue(outputFormat);
    mocks.generateText.mockResolvedValue({ output });

    const result = await new AiSdkStructuredGenerator().generate({
      schema,
      prompt: "Return true.",
    });

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({
      apiKey: "test-openrouter-key",
    });
    expect(mocks.chat).toHaveBeenCalledWith("openai/gpt-oss-120b:free", {
      provider: { require_parameters: true },
    });
    expect(mocks.object).toHaveBeenCalledWith({ schema });
    expect(mocks.generateText).toHaveBeenCalledWith({
      model: openrouterModel,
      maxRetries: 0,
      timeout: { totalMs: 90_000 },
      maxOutputTokens: 4096,
      providerOptions: {
        openrouter: {
          reasoning: { effort: "low", exclude: true },
        },
      },
      output: outputFormat,
      prompt: "Return true.",
    });
    expect(result).toEqual(output);
  });
});
