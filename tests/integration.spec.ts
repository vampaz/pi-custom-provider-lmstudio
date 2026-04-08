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
  const TEST_MODELS_ENDPOINT = `${TEST_ENDPOINT_URL}/api/v0/models`;

  it("should be able to connect to LM Studio endpoint", async () => {
    const response = await fetch(TEST_ENDPOINT_URL);

    // LM Studio EP may return 404 for root, that's OK
    expect(response.ok || response.status === 404).toBe(true);
  }, 10000);

  it("should fetch a list payload from /api/v0/models", async () => {
    const response = await fetch(TEST_MODELS_ENDPOINT);
    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      object: string;
      data: Array<{
        id: string;
        object: string;
        type?: string;
        max_context_length?: number;
        loaded_context_length?: number;
      }>;
    };

    expect(data.object).toBe("list");
    expect(Array.isArray(data.data)).toBe(true);
  }, 10000);

  it("should return models with max context metadata when present", async () => {
    const response = await fetch(TEST_MODELS_ENDPOINT);
    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      object: string;
      data: Array<{
        id: string;
        object: string;
        type?: string;
        max_context_length?: number;
        loaded_context_length?: number;
      }>;
    };

    expect(data.object).toBe("list");

    if (data.data.length > 0) {
      const model = data.data[0];
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.object).toBe("string");
      expect(typeof model.max_context_length).toBe("number");

      if (typeof model.loaded_context_length !== "undefined") {
        expect(typeof model.loaded_context_length).toBe("number");
      }
    }
  }, 10000);
});
