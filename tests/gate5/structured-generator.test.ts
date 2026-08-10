import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  createOpenRouter: vi.fn(),
  createGoogle: vi.fn(),
  chat: vi.fn(),
  googleModel: vi.fn(),
  object: vi.fn(),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogle: mocks.createGoogle,
}));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.object },
}));

import { AiSdkStructuredGenerator } from "@/lib/ai/structured-generator";

describe("AiSdkStructuredGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("AI_MODEL", "openai/gpt-oss-120b:free");
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    mocks.createOpenRouter.mockReturnValue({ chat: mocks.chat });
    mocks.createGoogle.mockReturnValue(mocks.googleModel);
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

  it("uses Gemini with the same structured output contract when selected", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("AI_MODEL", "gemini-3.5-flash");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-google-key");
    const schema = z.object({ ok: z.boolean() });
    const geminiModel = { provider: "google.generative-ai" };
    const output = { ok: true };
    const outputFormat = { type: "object" };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.googleModel.mockReturnValue(geminiModel);
    mocks.object.mockReturnValue(outputFormat);
    mocks.generateText.mockResolvedValue({ output });

    const result = await new AiSdkStructuredGenerator().generate({
      schema,
      prompt: "Return true.",
    });

    expect(mocks.createGoogle).toHaveBeenCalledWith({ apiKey: "test-google-key" });
    expect(mocks.googleModel).toHaveBeenCalledWith("gemini-3.5-flash");
    expect(mocks.createOpenRouter).not.toHaveBeenCalled();
    expect(mocks.generateText).toHaveBeenCalledWith({
      model: geminiModel,
      maxRetries: 0,
      timeout: { totalMs: 90_000 },
      maxOutputTokens: 4096,
      output: outputFormat,
      prompt: "Return true.",
    });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({
      stage: "ai_generation_started",
      provider: "gemini",
      model: "gemini-3.5-flash",
      correction: false,
    }));
    expect(result).toEqual(output);
    logSpy.mockRestore();
  });

  it("rejects an unsupported provider without mixing providers", async () => {
    vi.stubEnv("AI_PROVIDER", "unknown");

    await expect(new AiSdkStructuredGenerator().generate({
      schema: z.object({ ok: z.boolean() }),
      prompt: "Return true.",
    })).rejects.toThrow("지원하지 않는 AI_PROVIDER");
    expect(mocks.createOpenRouter).not.toHaveBeenCalled();
    expect(mocks.createGoogle).not.toHaveBeenCalled();
  });

  it("preserves the explicit OpenRouter key error when provider is omitted", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await expect(new AiSdkStructuredGenerator().generate({
      schema: z.object({ ok: z.boolean() }),
      prompt: "Return true.",
    })).rejects.toThrow("OPENROUTER_API_KEY가 설정되지 않았습니다.");
  });
});
