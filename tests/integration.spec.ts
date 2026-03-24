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
  const TEST_MODELS_ENDPOINT = `${TEST_ENDPOINT_URL}/v1/models`;

  it("should be able to connect to LM Studio endpoint", async () => {
    const response = await fetch(TEST_ENDPOINT_URL);

    // LM Studio EP may return 404 for root, that's OK
    expect(response.ok || response.status === 404).toBe(true);
  }, 10000);

  it("should fetch a list payload from /v1/models", async () => {
    const response = await fetch(TEST_MODELS_ENDPOINT);
    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      object: string;
      data: Array<{ id: string; object: string; owned_by: string }>;
    };

    expect(data.object).toBe("list");
    expect(Array.isArray(data.data)).toBe(true);
  }, 10000);

  it("should return models with the expected shape when present", async () => {
    const response = await fetch(TEST_MODELS_ENDPOINT);
    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      object: string;
      data: Array<{ id: string; object: string; owned_by: string }>;
    };

    expect(data.object).toBe("list");

    if (data.data.length > 0) {
      const model = data.data[0];
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.object).toBe("string");
      expect(typeof model.owned_by).toBe("string");
    }
  }, 10000);
});
