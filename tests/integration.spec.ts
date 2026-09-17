/**
 * Integration Tests for LM Studio Models Extension
 *
 * These tests verify the extension works with the configured LM Studio endpoints.
 * Without a config file, they use a local LM Studio instance on port 1234.
 *
 * To run integration tests:
 *   npm run test:integration
 */

import { describe, expect, it } from "vitest";

import { loadLMStudioEndpoints } from "../index";

const endpoints = await loadLMStudioEndpoints();

describe.each(endpoints)("Integration: $provider", ({ baseUrl, apiKey }) => {
  const modelsUrl = `${baseUrl}/api/v1/models`;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;

  it("should be able to connect to LM Studio endpoint", async () => {
    const response = await fetch(baseUrl, { headers });

    // LM Studio may return 404 for root, that's OK
    expect(response.ok || response.status === 404).toBe(true);
  }, 10000);

  it("should fetch a model inventory from /api/v1/models", async () => {
    const response = await fetch(modelsUrl, { headers });
    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      models: Array<{
        key: string;
        type: string;
        max_context_length?: number;
      }>;
    };

    expect(Array.isArray(data.models)).toBe(true);
  }, 10000);

  it("should return logical models with max context metadata when present", async () => {
    const response = await fetch(modelsUrl, { headers });
    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      models: Array<{
        key: string;
        type: string;
        max_context_length?: number;
      }>;
    };

    if (data.models.length > 0) {
      const model = data.models[0];
      expect(typeof model.key).toBe("string");
      expect(model.key.length).toBeGreaterThan(0);
      expect(typeof model.type).toBe("string");
      expect(typeof model.max_context_length).toBe("number");
    }
  }, 10000);
});
