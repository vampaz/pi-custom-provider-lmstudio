/**
 * LM Studio Models Extension
 *
 * Fetches available models from LM Studio's REST API /api/v0/models endpoint on startup
 * and dynamically registers them as available providers.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LMSTUDIO_EP_BASE_URL = "http://localhost:1234";
export const LMSTUDIO_EP_BASE_URL =
  process.env.LMSTUDIO_ENDPOINT_URL || DEFAULT_LMSTUDIO_EP_BASE_URL;
const LMSTUDIO_MODELS_ENDPOINT = `${LMSTUDIO_EP_BASE_URL}/api/v0/models`;
const LMSTUDIO_PROVIDER_BASE_URL = `${LMSTUDIO_EP_BASE_URL}/v1`;
const LMSTUDIO_PROVIDER_NAME = "lmstudio-ep";
const LMSTUDIO_REFRESH_COMMAND = "lmstudio-refresh";
const DEFAULT_CONTEXT_WINDOW = 8192;
const DEFAULT_MAX_TOKENS = 4096;
const MODEL_FILE_EXTENSION_PATTERN = /\.(gguf|bin|pt|safetensors)$/i;
const CONTEXT_WINDOW_PATTERN = /(?:^|[^a-z0-9])(\d+)(k|m)(?=$|[^a-z0-9])/i;
const REASONING_PATTERNS = [
  /reason(?:ing)?/i,
  /thinking/i,
  /deepseek-r1/i,
  /command-r/i,
  /(?:^|[-_/])o1(?:[-_/]|$)/i,
  /(?:^|[-_/])o3(?:[-_/]|$)/i,
  /(?:^|[-_/])o4-mini(?:[-_/]|$)/i,
];
const MULTIMODAL_PATTERNS = [
  /vision/i,
  /(?:^|[-_/])vl(?:[-_/]|$)/i,
  /llava/i,
  /bakllava/i,
  /minicpm-v/i,
  /pixtral/i,
  /paligemma/i,
];

// =============================================================================
// Types
// =============================================================================

export interface LMStudioModel {
  id: string;
  object: string;
  owned_by?: string;
  type?: string;
  max_context_length?: number;
  loaded_context_length?: number;
}

interface LMStudioModelsResponse {
  object: string;
  data: LMStudioModel[];
}

export interface LMStudioProviderModel {
  id: string;
  name: string;
  reasoning: boolean;
  multimodal: boolean;
  contextWindow: number;
}

// =============================================================================
// Model Processing
// =============================================================================

/**
 * Convert LM Studio model ID to a normalized name
 */
export function normalizeModelName(id: string): string {
  let name = id.trim();

  if (name.includes("/")) {
    name = name.split("/").pop() ?? name;
  }

  name = name.replace(/@/g, " ");
  name = name.replace(MODEL_FILE_EXTENSION_PATTERN, "");

  name = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

  name = name.replace(/\b(\d)\s+(\d)\b/g, "$1.$2").replace(/([a-z]{2,})(\d+)/gi, "$1 $2");

  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Determine model capabilities based on ID
 */
export function inferModelCapabilities(model: LMStudioModel | string): {
  reasoning: boolean;
  multimodal: boolean;
} {
  const modelId = typeof model === "string" ? model : model.id;
  const hasReasoning = REASONING_PATTERNS.some((pattern) => pattern.test(modelId));
  const isMultimodal =
    (typeof model !== "string" && model.type === "vlm") ||
    MULTIMODAL_PATTERNS.some((pattern) => pattern.test(modelId));

  return {
    reasoning: hasReasoning,
    multimodal: isMultimodal,
  };
}

/**
 * Infer a model's context window from LM Studio metadata, falling back to ID hints.
 */
export function inferContextWindow(model: LMStudioModel | string): number {
  if (typeof model !== "string") {
    if (typeof model.loaded_context_length === "number") {
      return model.loaded_context_length;
    }

    if (typeof model.max_context_length === "number") {
      return model.max_context_length;
    }
  }

  const modelId = typeof model === "string" ? model : model.id;
  const match = modelId.match(CONTEXT_WINDOW_PATTERN);

  if (!match) {
    return DEFAULT_CONTEXT_WINDOW;
  }

  const value = match[1];
  const unit = match[2];

  if (!value || !unit) {
    return DEFAULT_CONTEXT_WINDOW;
  }

  const multiplier = unit.toLowerCase() === "m" ? 1000000 : 1000;
  return Number(value) * multiplier;
}

/**
 * Filter invalid or duplicate models before registration.
 */
export function sanitizeLMStudioModels(lmStudioModels: LMStudioModel[]): LMStudioModel[] {
  const seenIds = new Set<string>();

  return lmStudioModels.flatMap((model) => {
    const id = model.id.trim();

    if (id.length === 0) {
      console.warn("[lmstudio-models] Skipping model without an ID");
      return [];
    }

    if (seenIds.has(id)) {
      console.warn(`[lmstudio-models] Skipping duplicate model '${id}'`);
      return [];
    }

    seenIds.add(id);
    return [{ ...model, id }];
  });
}

/**
 * Convert LM Studio models to pi provider model format.
 */
export function convertToProviderModels(lmStudioModels: LMStudioModel[]): LMStudioProviderModel[] {
  return sanitizeLMStudioModels(lmStudioModels).flatMap((model) => {
    if (model.type === "embeddings") {
      return [];
    }

    const { reasoning, multimodal } = inferModelCapabilities(model);
    return {
      id: model.id,
      name: normalizeModelName(model.id),
      reasoning,
      multimodal,
      contextWindow: inferContextWindow(model),
    };
  });
}

// =============================================================================
// Provider Registration
// =============================================================================

export async function fetchLMStudioModels(): Promise<LMStudioModel[]> {
  try {
    console.log(`[lmstudio-models] Fetching models from ${LMSTUDIO_MODELS_ENDPOINT}`);
    const response = await fetch(LMSTUDIO_MODELS_ENDPOINT);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as LMStudioModelsResponse;

    if (!Array.isArray(data.data)) {
      throw new Error("Invalid response format: expected data.data array");
    }

    console.log(`[lmstudio-models] Received ${data.data.length} models from LM Studio`);
    data.data.forEach((m) => console.log(`  - ${m.id}`));

    return data.data;
  } catch (error) {
    console.warn(`[lmstudio-models] Failed to fetch models from LM Studio EP: ${error}`);
    return [];
  }
}

export function registerLMStudioProvider(
  pi: ExtensionAPI,
  providerModels: LMStudioProviderModel[],
): number {
  if (providerModels.length === 0) {
    console.warn("[lmstudio-models] No valid models found to register");
    return 0;
  }

  console.log(`[lmstudio-models] Converting ${providerModels.length} models for pi:`);
  providerModels.forEach((m) => {
    console.log(`  - ${m.name} (${m.id}): reasoning=${m.reasoning}, multimodal=${m.multimodal}`);
  });

  pi.registerProvider(LMSTUDIO_PROVIDER_NAME, {
    baseUrl: LMSTUDIO_PROVIDER_BASE_URL,
    apiKey: "LMSTUDIO_API_KEY",
    authHeader: true,
    api: "openai-completions",
    models: providerModels.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: m.multimodal ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow,
      maxTokens: DEFAULT_MAX_TOKENS,
    })),
  });

  console.log(
    `[lmstudio-models] Registered provider '${LMSTUDIO_PROVIDER_NAME}' with ${providerModels.length} models`,
  );

  return providerModels.length;
}

// =============================================================================
// Extension Entry Point
// =============================================================================

export default function registerLMStudioExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, _ctx) => {
    const providerModels = convertToProviderModels(await fetchLMStudioModels());
    registerLMStudioProvider(pi, providerModels);
  });

  pi.registerCommand(LMSTUDIO_REFRESH_COMMAND, {
    description: "Refresh LM Studio models from REST API /api/v0/models",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Fetching LM Studio models...", "info");

      const providerModels = convertToProviderModels(await fetchLMStudioModels());

      if (providerModels.length === 0) {
        ctx.ui.notify("No valid models found or LM Studio is not running", "error");
        return;
      }

      pi.unregisterProvider(LMSTUDIO_PROVIDER_NAME);
      const registeredCount = registerLMStudioProvider(pi, providerModels);

      ctx.ui.notify(`Updated ${registeredCount} LM Studio model(s)`, "info");
    },
  });
}
