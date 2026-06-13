import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyApiProvider, verifyAzureOpenAiProvider } from "./openaiProvider";

const { createProxyFetchMock } = vi.hoisted(() => ({
  createProxyFetchMock: vi.fn(),
}));

vi.mock("./proxyFetch", () => ({
  createProxyFetch: createProxyFetchMock,
}));

describe("verifyApiProvider", () => {
  beforeEach(() => {
    createProxyFetchMock.mockReset();
  });

  it("treats proxied non-2xx responses as verification failures", async () => {
    createProxyFetchMock.mockReturnValue(async () =>
      new Response(JSON.stringify({ error: "invalid api key" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await verifyApiProvider(
      "https://api.openai.com",
      "bad-key",
      "http://proxy.internal:8080",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 401 Unauthorized");
  });

  it("verifies Azure deployments through the deployment chat endpoint", async () => {
    let calledUrl = "";
    let calledHeaders: HeadersInit | undefined;
    createProxyFetchMock.mockImplementation(() => async (url, init) => {
      calledUrl = String(url);
      calledHeaders = init?.headers;
      return new Response(JSON.stringify({ id: "chatcmpl-test" }), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await verifyAzureOpenAiProvider(
      "https://example.openai.azure.com/",
      "azure-key",
      "2024-10-21",
      ["gpt-4.1", "gpt-4.1", "text-embedding-3-large"],
      "http://proxy.internal:8080",
    );

    expect(result.success).toBe(true);
    expect(result.models).toEqual(["gpt-4.1", "text-embedding-3-large"]);
    expect(calledUrl).toBe(
      "https://example.openai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2024-10-21"
    );
    expect(calledHeaders).toMatchObject({ "api-key": "azure-key" });
  });

  it("surfaces Azure deployment verification failures", async () => {
    createProxyFetchMock.mockReturnValue(async () =>
      new Response(JSON.stringify({ error: { message: "deployment not found" } }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await verifyAzureOpenAiProvider(
      "https://example.openai.azure.com",
      "azure-key",
      "2024-10-21",
      ["missing-deployment"],
      "http://proxy.internal:8080",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 404 Not Found");
    expect(result.error).toContain("deployment not found");
  });
});
