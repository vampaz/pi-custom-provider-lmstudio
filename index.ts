/**
 * LM Studio Models Extension
 *
 * Fetches available models from configured LM Studio REST API endpoints on startup
 * and dynamically registers each endpoint as an available provider.
 */

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LMSTUDIO_ENDPOINT: LMStudioEndpoint = {
  provider: "lmstudio-ep",
  baseUrl: "http://localhost:1234",
};
export const LMSTUDIO_CONFIG_PATH = join(getAgentDir(), "lmstudio-models.json");
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

export interface LMStudioEndpoint {
  provider: string;
  baseUrl: string;
  apiKey?: string;
}

export interface LMStudioModel {
  key: string;
  type: string;
  display_name?: string;
  max_context_length?: number;
  loaded_instances?: Array<{
    config?: {
      context_length?: number;
    };
  }>;
  capabilities?: {
    vision?: boolean;
    reasoning?: unknown;
  };
  variants?: string[];
  selected_variant?: string;
}

interface LMStudioModelsResponse {
  models: LMStudioModel[];
}

export interface LMStudioProviderModel {
  id: string;
  name: string;
  reasoning: boolean;
  multimodal: boolean;
  contextWindow: number;
}

// =============================================================================
// Configuration
// =============================================================================

export function parseLMStudioEndpoints(value: unknown): LMStudioEndpoint[] {
  if (!Array.isArray(value)) {
    throw new Error("expected an array of endpoints");
  }

  const providers = new Set<string>();

  return value.map((endpoint, index) => {
    if (typeof endpoint !== "object" || endpoint === null) {
      throw new Error(`endpoint ${index + 1} must be an object`);
    }

    const { provider, baseUrl, apiKey } = endpoint as Record<string, unknown>;

    if (typeof provider !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(provider)) {
      throw new Error(`endpoint ${index + 1} has an invalid provider`);
    }

    if (providers.has(provider)) {
      throw new Error(`provider '${provider}' is configured more than once`);
    }

    if (typeof baseUrl !== "string") {
      throw new Error(`endpoint ${index + 1} has an invalid baseUrl`);
    }

    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error(`endpoint ${index + 1} has an invalid baseUrl`);
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`endpoint ${index + 1} baseUrl must use http or https`);
    }

    if (apiKey !== undefined && typeof apiKey !== "string") {
      throw new Error(`endpoint ${index + 1} has an invalid apiKey`);
    }

    providers.add(provider);
    return {
      provider,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      ...(apiKey ? { apiKey } : {}),
    };
  });
}

export async function loadLMStudioEndpoints(
  configPath = LMSTUDIO_CONFIG_PATH,
): Promise<LMStudioEndpoint[]> {
  try {
    return parseLMStudioEndpoints(JSON.parse(await readFile(configPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [DEFAULT_LMSTUDIO_ENDPOINT];
    }

    throw new Error(`Invalid LM Studio config at ${configPath}: ${error}`);
  }
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
 * Determine model capabilities from LM Studio metadata or model-key hints
 */
export function inferModelCapabilities(model: LMStudioModel | string): {
  reasoning: boolean;
  multimodal: boolean;
} {
  const modelId = typeof model === "string" ? model : model.key;
  const declaredReasoning = typeof model === "string" ? undefined : model.capabilities?.reasoning;
  const hasReasoning =
    declaredReasoning === undefined
      ? REASONING_PATTERNS.some((pattern) => pattern.test(modelId))
      : Boolean(declaredReasoning);
  const isMultimodal =
    typeof model === "string"
      ? MULTIMODAL_PATTERNS.some((pattern) => pattern.test(modelId))
      : (model.capabilities?.vision ??
        MULTIMODAL_PATTERNS.some((pattern) => pattern.test(modelId)));

  return {
    reasoning: hasReasoning,
    multimodal: isMultimodal,
  };
}

/**
 * Infer a model's context window from LM Studio metadata, falling back to key hints.
 */
export function inferContextWindow(model: LMStudioModel | string): number {
  if (typeof model !== "string") {
    const loadedContextLength = model.loaded_instances?.find(
      (instance) => typeof instance.config?.context_length === "number",
    )?.config?.context_length;

    if (typeof loadedContextLength === "number") {
      return loadedContextLength;
    }

    if (typeof model.max_context_length === "number") {
      return model.max_context_length;
    }
  }

  const modelId = typeof model === "string" ? model : model.key;
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
  const seenKeys = new Set<string>();

  return lmStudioModels.flatMap((model) => {
    const key = model.key.trim();

    if (key.length === 0) {
      console.warn("[lmstudio-models] Skipping model without a key");
      return [];
    }

    if (seenKeys.has(key)) {
      console.warn(`[lmstudio-models] Skipping duplicate model '${key}'`);
      return [];
    }

    seenKeys.add(key);
    return [{ ...model, key }];
  });
}

/**
 * Convert LM Studio models to pi provider model format.
 */
export function convertToProviderModels(lmStudioModels: LMStudioModel[]): LMStudioProviderModel[] {
  return sanitizeLMStudioModels(lmStudioModels).flatMap((model) => {
    if (model.type === "embedding") {
      return [];
    }

    const { reasoning, multimodal } = inferModelCapabilities(model);
    return {
      id: model.key,
      name: model.key,
      reasoning,
      multimodal,
      contextWindow: inferContextWindow(model),
    };
  });
}

// =============================================================================
// Provider Registration
// =============================================================================

export async function fetchLMStudioModels(
  endpoint: LMStudioEndpoint = DEFAULT_LMSTUDIO_ENDPOINT,
): Promise<LMStudioModel[]> {
  const modelsUrl = `${endpoint.baseUrl}/api/v1/models`;

  try {
    console.error(`[lmstudio-models] Fetching models from ${modelsUrl}`);
    const response = await fetch(modelsUrl, {
      headers: endpoint.apiKey
        ? {
            Authorization: `Bearer ${endpoint.apiKey}`,
          }
        : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as LMStudioModelsResponse;

    if (!Array.isArray(data.models)) {
      throw new Error("Invalid response format: expected data.models array");
    }

    console.error(
      `[lmstudio-models] Received ${data.models.length} models from ${endpoint.provider}`,
    );
    data.models.forEach((model) => console.error(`  - ${model.key}`));

    return data.models;
  } catch (error) {
    console.warn(`[lmstudio-models] Failed to fetch models from ${endpoint.provider}: ${error}`);
    return [];
  }
}

export function registerLMStudioProvider(
  pi: ExtensionAPI,
  providerModels: LMStudioProviderModel[],
  endpoint: LMStudioEndpoint = DEFAULT_LMSTUDIO_ENDPOINT,
): number {
  if (providerModels.length === 0) {
    console.warn("[lmstudio-models] No valid models found to register");
    return 0;
  }

  console.error(`[lmstudio-models] Converting ${providerModels.length} models for pi:`);
  providerModels.forEach((m) => {
    console.error(`  - ${m.name} (${m.id}): reasoning=${m.reasoning}, multimodal=${m.multimodal}`);
  });

  pi.registerProvider(endpoint.provider, {
    baseUrl: `${endpoint.baseUrl}/v1`,
    apiKey: endpoint.apiKey ?? "lm-studio",
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

  console.error(
    `[lmstudio-models] Registered provider '${endpoint.provider}' with ${providerModels.length} models`,
  );

  return providerModels.length;
}

// =============================================================================
// Extension Entry Point
// =============================================================================

async function refreshLMStudioProvider(
  pi: ExtensionAPI,
  endpoint: LMStudioEndpoint,
): Promise<number> {
  const providerModels = convertToProviderModels(await fetchLMStudioModels(endpoint));

  if (providerModels.length === 0) {
    return 0;
  }

  pi.unregisterProvider(endpoint.provider);
  return registerLMStudioProvider(pi, providerModels, endpoint);
}

export default async function registerLMStudioExtension(
  pi: ExtensionAPI,
  configuredEndpoints?: LMStudioEndpoint[],
) {
  const endpoints = configuredEndpoints ?? (await loadLMStudioEndpoints());

  pi.registerCommand(LMSTUDIO_REFRESH_COMMAND, {
    description: "Refresh models from every configured LM Studio endpoint",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`Fetching models from ${endpoints.length} LM Studio endpoint(s)...`, "info");

      const counts = await Promise.all(
        endpoints.map((endpoint) => refreshLMStudioProvider(pi, endpoint)),
      );
      const registeredCount = counts.reduce((total, count) => total + count, 0);

      if (registeredCount === 0) {
        ctx.ui.notify("No valid models found or LM Studio is not running", "error");
        return;
      }

      ctx.ui.notify(`Updated ${registeredCount} LM Studio model(s)`, "info");
    },
  });

  await Promise.all(endpoints.map((endpoint) => refreshLMStudioProvider(pi, endpoint)));
}
