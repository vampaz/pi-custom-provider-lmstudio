import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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
  runSessionStart: () => Promise<void>;
}

function createMockCommandContext(): MockCommandContext {
  return {
    ui: {
      notify: vi.fn(),
    },
  };
}

function createMockExtensionRuntime(): MockExtensionRuntime {
  let sessionStartHandler: ((event: unknown, ctx: unknown) => Promise<void> | void) | undefined;
  let refreshHandler: ((args: string[], ctx: MockCommandContext) => Promise<void>) | undefined;

  const registerProvider = vi.fn();
  const unregisterProvider = vi.fn();

  const pi = {
    on: vi.fn((event: string, handler: (event: unknown, ctx: unknown) => Promise<void> | void) => {
      if (event === "session_start") {
        sessionStartHandler = handler;
      }
    }),
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
    async runSessionStart() {
      if (!sessionStartHandler) {
        throw new Error("Session start handler was not registered");
      }

      await sessionStartHandler({}, {});
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

  it("detects multimodal models from LM Studio model types before falling back to ID markers", () => {
    expect(
      inferModelCapabilities({
        id: "gemma-4-26b-a4b",
        object: "model",
        type: "vlm",
      }).multimodal,
    ).toBe(true);
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
        id: "google/gemma-4-26b-a4b",
        object: "model",
        max_context_length: 262144,
      }),
    ).toBe(262144);
    expect(
      inferContextWindow({
        id: "google/gemma-4-26b-a4b",
        object: "model",
        max_context_length: 262144,
        loaded_context_length: 131072,
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
  it("filters blank and duplicate model IDs", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const models = sanitizeLMStudioModels([
      { id: "  qwen/qwen3-coder-next  ", object: "model", owned_by: "lmstudio" },
      { id: "", object: "model", owned_by: "lmstudio" },
      { id: "qwen/qwen3-coder-next", object: "model", owned_by: "lmstudio" },
    ]);

    expect(models).toEqual([
      { id: "qwen/qwen3-coder-next", object: "model", owned_by: "lmstudio" },
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

describe("convertToProviderModels", () => {
  it("maps LM Studio REST models into provider models and skips embeddings", () => {
    expect(
      convertToProviderModels([
        {
          id: "qwen/qwen3-coder-next",
          object: "model",
          owned_by: "lmstudio",
          type: "llm",
          max_context_length: 65536,
        },
        {
          id: "gemma-4-26b-a4b",
          object: "model",
          owned_by: "lmstudio",
          type: "vlm",
          max_context_length: 262144,
        },
        {
          id: "text-embedding-nomic-embed-text-v1.5",
          object: "model",
          owned_by: "lmstudio",
          type: "embeddings",
          max_context_length: 2048,
        },
      ]),
    ).toEqual([
      {
        id: "qwen/qwen3-coder-next",
        name: "Qwen 3 Coder Next",
        reasoning: false,
        multimodal: false,
        contextWindow: 65536,
      },
      {
        id: "gemma-4-26b-a4b",
        name: "Gemma 4 26b A4b",
        reasoning: false,
        multimodal: true,
        contextWindow: 262144,
      },
    ]);
  });
});

describe("fetchLMStudioModels", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
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
          object: "list",
          data: [
            {
              id: "qwen/qwen3-coder-next",
              object: "model",
              owned_by: "lmstudio",
              type: "llm",
              max_context_length: 65536,
            },
          ],
        }),
      ),
    );

    await expect(fetchLMStudioModels()).resolves.toEqual([
      {
        id: "qwen/qwen3-coder-next",
        object: "model",
        owned_by: "lmstudio",
        type: "llm",
        max_context_length: 65536,
      },
    ]);
  });

  it("returns an empty list when the response body is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(createResponse({ object: "list", data: null })),
    );

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
      apiKey: "LMSTUDIO_API_KEY",
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
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("registers models on session start", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          object: "list",
          data: [
            {
              id: "qwen/qwen2-vl-7b-32k",
              object: "model",
              owned_by: "lmstudio",
              type: "vlm",
              max_context_length: 32768,
            },
          ],
        }),
      ),
    );

    const runtime = createMockExtensionRuntime();
    registerLMStudioExtension(runtime.pi);

    await runtime.runSessionStart();

    expect(runtime.registerProvider).toHaveBeenCalledOnce();
  });

  it("refreshes the provider only when valid models are available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          object: "list",
          data: [
            {
              id: "qwen/qwen3-coder-next",
              object: "model",
              owned_by: "lmstudio",
              type: "llm",
              max_context_length: 65536,
            },
          ],
        }),
      ),
    );

    const runtime = createMockExtensionRuntime();
    registerLMStudioExtension(runtime.pi);

    const ctx = await runtime.runRefresh();

    expect(runtime.unregisterProvider).toHaveBeenCalledWith("lmstudio-ep");
    expect(ctx.ui.notify).toHaveBeenNthCalledWith(1, "Fetching LM Studio models...", "info");
    expect(ctx.ui.notify).toHaveBeenNthCalledWith(2, "Updated 1 LM Studio model(s)", "info");
  });

  it("keeps the existing provider when refresh finds no valid models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          object: "list",
          data: [
            {
              id: "text-embedding-nomic-embed-text-v1.5",
              object: "model",
              owned_by: "lmstudio",
              type: "embeddings",
              max_context_length: 2048,
            },
          ],
        }),
      ),
    );

    const runtime = createMockExtensionRuntime();
    registerLMStudioExtension(runtime.pi);

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
