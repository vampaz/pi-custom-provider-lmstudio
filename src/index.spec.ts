import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registerLMStudioExtension, {
  LMSTUDIO_EP_BASE_URL,
  convertToProviderModels,
  fetchLMStudioModels,
  inferContextWindow,
  inferModelCapabilities,
  normalizeModelName,
  registerLMStudioProvider,
  sanitizeLMStudioModels,
} from "../index";

interface MockCommandContext {
  ui: {
    notify: ReturnType<typeof vi.fn>;
  };
}

interface MockExtensionRuntime {
  pi: ExtensionAPI;
  registerProvider: ReturnType<typeof vi.fn>;
  unregisterProvider: ReturnType<typeof vi.fn>;
  runRefresh: (ctx?: MockCommandContext) => Promise<MockCommandContext>;
}

function createMockCommandContext(): MockCommandContext {
  return {
    ui: {
      notify: vi.fn(),
    },
  };
}

function createMockExtensionRuntime(): MockExtensionRuntime {
  let refreshHandler: ((args: string[], ctx: MockCommandContext) => Promise<void>) | undefined;

  const registerProvider = vi.fn();
  const unregisterProvider = vi.fn();

  const pi = {
    registerCommand: vi.fn(
      (
        name: string,
        command: { handler: (args: string[], ctx: MockCommandContext) => Promise<void> },
      ) => {
        if (name === "lmstudio-refresh") {
          refreshHandler = command.handler;
        }
      },
    ),
    registerProvider,
    unregisterProvider,
  } as unknown as ExtensionAPI;

  return {
    pi,
    registerProvider,
    unregisterProvider,
    async runRefresh(ctx = createMockCommandContext()) {
      if (!refreshHandler) {
        throw new Error("Refresh handler was not registered");
      }

      await refreshHandler([], ctx);
      return ctx;
    },
  };
}

function createResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
    ...init,
  });
}

describe("normalizeModelName", () => {
  it.each([
    ["qwen/qwen3-coder-next", "Qwen 3 Coder Next"],
    ["nvidia/nemotron-3-super", "Nemotron 3 Super"],
    ["zai-org/glm-4.7-flash", "Glm 4.7 Flash"],
    ["openai/gpt-4o-mini", "Gpt 4o Mini"],
    ["anthropic/claude-3-5-sonnet", "Claude 3.5 Sonnet"],
    ["model@123456", "Model 123456"],
    ["qwen_3_coder", "Qwen 3 Coder"],
    ["model.gguf", "Model"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeModelName(input)).toBe(expected);
  });
});

describe("inferModelCapabilities", () => {
  it("detects reasoning models without overmatching model families", () => {
    expect(inferModelCapabilities("deepseek-r1-distill-qwen-32b").reasoning).toBe(true);
    expect(inferModelCapabilities("openai/o1-mini").reasoning).toBe(true);
    expect(inferModelCapabilities("gemini-2-flash-thinking").reasoning).toBe(true);
    expect(inferModelCapabilities("qwen3-coder-next").reasoning).toBe(false);
    expect(inferModelCapabilities("gemini-2-flash").reasoning).toBe(false);
  });

  it("uses LM Studio capabilities before falling back to model ID markers", () => {
    expect(
      inferModelCapabilities({
        key: "google/gemma-4-26b-a4b",
        type: "llm",
        capabilities: {
          vision: true,
          reasoning: { allowed_options: ["off", "on"] },
        },
      }),
    ).toEqual({ reasoning: true, multimodal: true });
    expect(inferModelCapabilities("qwen2-vl-7b-instruct").multimodal).toBe(true);
    expect(inferModelCapabilities("llava-1.6").multimodal).toBe(true);
    expect(inferModelCapabilities("pixtral-12b").multimodal).toBe(true);
    expect(inferModelCapabilities("gemini-2-flash").multimodal).toBe(false);
  });
});

describe("inferContextWindow", () => {
  it("prefers LM Studio REST metadata when available", () => {
    expect(
      inferContextWindow({
        key: "google/gemma-4-26b-a4b",
        type: "llm",
        max_context_length: 262144,
      }),
    ).toBe(262144);
    expect(
      inferContextWindow({
        key: "google/gemma-4-26b-a4b",
        type: "llm",
        max_context_length: 262144,
        loaded_instances: [{ config: { context_length: 131072 } }],
      }),
    ).toBe(131072);
  });

  it("uses explicit context markers from the model ID when metadata is unavailable", () => {
    expect(inferContextWindow("qwen-200k")).toBe(200000);
    expect(inferContextWindow("mistral-small-128k")).toBe(128000);
    expect(inferContextWindow("model-1m")).toBe(1000000);
  });

  it("falls back to a conservative default when no metadata or context hint exists", () => {
    expect(inferContextWindow("llama-3.1-70b-instruct")).toBe(8192);
    expect(inferContextWindow("claude-3-5-sonnet")).toBe(8192);
  });
});

describe("sanitizeLMStudioModels", () => {
  it("filters blank and duplicate model keys", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const models = sanitizeLMStudioModels([
      { key: "  qwen/qwen3-coder-next  ", type: "llm" },
      { key: "", type: "llm" },
      { key: "qwen/qwen3-coder-next", type: "llm" },
    ]);

    expect(models).toEqual([{ key: "qwen/qwen3-coder-next", type: "llm" }]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

describe("convertToProviderModels", () => {
  it("maps logical LM Studio models once and skips embeddings", () => {
    expect(
      convertToProviderModels([
        {
          key: "qwen3.8-27b-uncensored-mlx",
          type: "llm",
          display_name: "Qwen3.8 27B Uncensored",
          max_context_length: 262144,
          capabilities: { vision: true },
        },
        {
          key: "qwen/qwen3.8-27b",
          type: "llm",
          display_name: "Qwen3.8 27B",
          max_context_length: 262144,
          variants: ["qwen/qwen3.8-27b@6bit", "qwen/qwen3.8-27b@8bit"],
          selected_variant: "qwen/qwen3.8-27b@6bit",
          capabilities: { vision: true },
        },
        {
          key: "google/gemma-4-26b-a4b",
          type: "llm",
          display_name: "Gemma 4 26B A4B",
          max_context_length: 262144,
          capabilities: { vision: true, reasoning: { allowed_options: ["off", "on"] } },
        },
        {
          key: "text-embedding-nomic-embed-text-v1.5",
          type: "embedding",
          max_context_length: 2048,
        },
      ]),
    ).toEqual([
      {
        id: "qwen3.8-27b-uncensored-mlx",
        name: "qwen3.8-27b-uncensored-mlx",
        reasoning: false,
        multimodal: true,
        contextWindow: 262144,
      },
      {
        id: "qwen/qwen3.8-27b",
        name: "qwen/qwen3.8-27b",
        reasoning: false,
        multimodal: true,
        contextWindow: 262144,
      },
      {
        id: "google/gemma-4-26b-a4b",
        name: "google/gemma-4-26b-a4b",
        reasoning: true,
        multimodal: true,
        contextWindow: 262144,
      },
    ]);
  });
});

describe("fetchLMStudioModels", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns the model list when LM Studio responds successfully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          models: [
            {
              key: "qwen/qwen3-coder-next",
              type: "llm",
              max_context_length: 65536,
            },
          ],
        }),
      ),
    );

    await expect(fetchLMStudioModels()).resolves.toEqual([
      {
        key: "qwen/qwen3-coder-next",
        type: "llm",
        max_context_length: 65536,
      },
    ]);
  });

  it("returns logical models from the v1 model inventory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          models: [
            {
              type: "llm",
              key: "qwen/qwen3.8-27b",
              display_name: "Qwen3.8 27B",
              max_context_length: 262144,
              variants: ["qwen/qwen3.8-27b@6bit", "qwen/qwen3.8-27b@8bit"],
              selected_variant: "qwen/qwen3.8-27b@6bit",
              capabilities: { vision: true },
            },
          ],
        }),
      ),
    );

    await expect(fetchLMStudioModels()).resolves.toHaveLength(1);
  });

  it("returns an empty list when the response body is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createResponse({ models: null })));

    await expect(fetchLMStudioModels()).resolves.toEqual([]);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe("registerLMStudioProvider", () => {
  it("registers the provider with pi-compatible model definitions", () => {
    const runtime = createMockExtensionRuntime();

    const registeredCount = registerLMStudioProvider(runtime.pi, [
      {
        id: "qwen/qwen2-vl-7b-32k",
        name: "Qwen 2 Vl 7b 32k",
        reasoning: false,
        multimodal: true,
        contextWindow: 32768,
      },
    ]);

    expect(registeredCount).toBe(1);
    expect(runtime.registerProvider).toHaveBeenCalledWith("lmstudio-ep", {
      baseUrl: `${LMSTUDIO_EP_BASE_URL}/v1`,
      apiKey: process.env.LMSTUDIO_API_KEY ?? "lm-studio",
      authHeader: true,
      api: "openai-completions",
      models: [
        {
          id: "qwen/qwen2-vl-7b-32k",
          name: "Qwen 2 Vl 7b 32k",
          reasoning: false,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 32768,
          maxTokens: 4096,
        },
      ],
    });
  });
});

describe("registerLMStudioExtension", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("registers models during extension initialization", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          models: [
            {
              key: "qwen/qwen2-vl-7b-32k",
              type: "llm",
              max_context_length: 32768,
              capabilities: { vision: true },
            },
          ],
        }),
      ),
    );

    const runtime = createMockExtensionRuntime();
    await registerLMStudioExtension(runtime.pi);

    expect(runtime.registerProvider).toHaveBeenCalledOnce();
  });

  it("refreshes the provider only when valid models are available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          createResponse({
            models: [
              {
                key: "qwen/qwen3-coder-next",
                type: "llm",
                max_context_length: 65536,
              },
            ],
          }),
        ),
      ),
    );

    const runtime = createMockExtensionRuntime();
    await registerLMStudioExtension(runtime.pi);

    const ctx = await runtime.runRefresh();

    expect(runtime.unregisterProvider).toHaveBeenCalledWith("lmstudio-ep");
    expect(ctx.ui.notify).toHaveBeenNthCalledWith(1, "Fetching LM Studio models...", "info");
    expect(ctx.ui.notify).toHaveBeenNthCalledWith(2, "Updated 1 LM Studio model(s)", "info");
  });

  it("keeps the existing provider when refresh finds no valid models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          createResponse({
            models: [
              {
                key: "text-embedding-nomic-embed-text-v1.5",
                type: "embedding",
                max_context_length: 2048,
              },
            ],
          }),
        ),
      ),
    );

    const runtime = createMockExtensionRuntime();
    await registerLMStudioExtension(runtime.pi);

    const ctx = await runtime.runRefresh();

    expect(runtime.unregisterProvider).not.toHaveBeenCalled();
    expect(runtime.registerProvider).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenNthCalledWith(
      2,
      "No valid models found or LM Studio is not running",
      "error",
    );
  });
});
