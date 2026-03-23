/**
 * LM Studio Models Extension
 *
 * Fetches available models from LM Studio's EP /v1/models endpoint on startup
 * and dynamically registers them as available providers.
 *
 * Installation:
 *   The extension is auto-discovered from ~/.pi/agent/extensions/lmstudio-models/
 *
 * Usage:
 *   - Models are automatically fetched on startup (session_start event)
 *   - Run /lmstudio-refresh to manually update models from LM Studio
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// =============================================================================
// Constants
// =============================================================================

const LMSTUDIO_EP_BASE_URL = "http://localhost:1234";
const LMSTUDIO_MODELS_ENDPOINT = `${LMSTUDIO_EP_BASE_URL}/v1/models`;

// =============================================================================
// Types
// =============================================================================

interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

interface LMStudioModelsResponse {
  object: string;
  data: LMStudioModel[];
}

// =============================================================================
// Model Processing
// =============================================================================

/**
 * Convert LM Studio model ID to a normalized name
 */
function normalizeModelName(id: string): string {
  // Remove common prefixes and suffixes for cleaner display
  let name = id;

  // Remove path-like prefixes (e.g., "model@")
  if (name.includes("@")) {
    name = name.split("@").pop() ?? name;
  }

  // Remove file extensions
  name = name.replace(/\.(gguf|bin|pt|safetensors)$/i, "");

  // Replace common separators with spaces
  name = name.replace(/[-_]/g, " ");

  // Capitalize words
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Determine model capabilities based on ID
 */
function inferModelCapabilities(modelId: string): {
  reasoning: boolean;
  multimodal: boolean;
} {
  const lowerId = modelId.toLowerCase();

  // Reasoning models (common patterns)
  const reasoningPatterns = [
    "reasoning",
    "deepseek-r1",
    "qwen3",
    "command-r",
    "openai-o",
    "gemini-2",
  ];
  const hasReasoning = reasoningPatterns.some((p) => lowerId.includes(p));

  // Multimodal models (common patterns)
  const multimodalPatterns = ["vision", "vl", "llava", "qwen2-vl", "gemini-2"];
  const isMultimodal = multimodalPatterns.some((p) => lowerId.includes(p));

  return {
    reasoning: hasReasoning,
    multimodal: isMultimodal,
  };
}

/**
 * Convert LM Studio models to pi provider model format
 */
function convertToProviderModels(
  lmStudioModels: LMStudioModel[],
): Array<{
  id: string;
  name: string;
  reasoning: boolean;
  multimodal: boolean;
}> {
  return lmStudioModels.map((model) => {
    const { reasoning, multimodal } = inferModelCapabilities(model.id);
    return {
      id: model.id,
      name: normalizeModelName(model.id),
      reasoning,
      multimodal,
    };
  });
}

// =============================================================================
// Provider Registration
// =============================================================================

async function fetchLMStudioModels(): Promise<LMStudioModel[]> {
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
    console.warn(
      `[lmstudio-models] Failed to fetch models from LM Studio EP: ${error}`,
    );
    return [];
  }
}

function registerLMStudioProvider(pi: ExtensionAPI, models: LMStudioModel[]) {
  const providerModels = convertToProviderModels(models);

  if (providerModels.length === 0) {
    console.warn("[lmstudio-models] No valid models found to register");
    return;
  }

  console.log(`[lmstudio-models] Converting ${providerModels.length} models for pi:`);
  providerModels.forEach((m) => {
    console.log(
      `  - ${m.name} (${m.id}): reasoning=${m.reasoning}, multimodal=${m.multimodal}`,
    );
  });

  // Map common model IDs to context windows
  function getContextWindow(id: string): number {
    const lowerId = id.toLowerCase();
    
    // Large context models
    if (lowerId.includes("128k") || lowerId.includes("200k")) {
      return 128000;
    }
    
    // Common context windows
    if (lowerId.includes("70b") || lowerId.includes("405b")) {
      return 128000;
    }
    
    if (lowerId.includes("32b") || lowerId.includes("34b")) {
      return 32768;
    }
    
    // Default
    return 128000;
  }

  // Register the provider with all fetched models
  pi.registerProvider("lmstudio-ep", {
    baseUrl: LMSTUDIO_EP_BASE_URL,
    apiKey: "LMSTUDIO_API_KEY", // Optional API key
    api: "openai-completions",
    models: providerModels.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      multimodal: m.multimodal,
      input: m.multimodal ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: getContextWindow(m.id),
      maxTokens: 4096,
    })),
  });

  console.log(
    `[lmstudio-models] Registered provider 'lmstudio-ep' with ${providerModels.length} models`,
  );
}

// =============================================================================
// Extension Entry Point
// =============================================================================

export default function (pi: ExtensionAPI) {
  // Fetch models on session start
  pi.on("session_start", async (_event, _ctx) => {
    const models = await fetchLMStudioModels();
    registerLMStudioProvider(pi, models);
  });

  // Optional: Add a command to manually refresh models
  pi.registerCommand("lmstudio-refresh", {
    description: "Refresh LM Studio models from EP /v1/models",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Fetching LM Studio models...", "info");
      
      const models = await fetchLMStudioModels();
      
      if (models.length > 0) {
        // Unregister existing provider first
        pi.unregisterProvider("lmstudio-ep");
        
        // Register new models
        registerLMStudioProvider(pi, models);
        
        ctx.ui.notify(
          `Updated ${models.length} LM Studio model(s)`,
          "success",
        );
      } else {
        ctx.ui.notify("No models found or LM Studio not running", "error");
      }
    },
  });
}
