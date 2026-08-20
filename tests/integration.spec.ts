/**
 * Integration Tests for LM Studio Models Extension
 *
 * These tests verify the extension works with a real LM Studio endpoint.
 * Run these tests against a local LM Studio instance running on port 1234.
 *
 * To run integration tests:
 *   npm run test:integration
 */

import { describe, expect, it } from "vitest";

describe("Integration: Real LM Studio Endpoint", () => {
  const TEST_ENDPOINT_URL = process.env.LMSTUDIO_ENDPOINT_URL || "http://localhost:1234";
  const TEST_MODELS_ENDPOINT = `${TEST_ENDPOINT_URL}/api/v1/models`;

  it("should be able to connect to LM Studio endpoint", async () => {
    const response = await fetch(TEST_ENDPOINT_URL);

    // LM Studio EP may return 404 for root, that's OK
    expect(response.ok || response.status === 404).toBe(true);
  }, 10000);

  it("should fetch a model inventory from /api/v1/models", async () => {
    const response = await fetch(TEST_MODELS_ENDPOINT);
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
    const response = await fetch(TEST_MODELS_ENDPOINT);
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
