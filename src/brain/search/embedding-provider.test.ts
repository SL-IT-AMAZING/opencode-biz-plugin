import { afterEach, describe, expect, test } from "bun:test"
import type { BrainEmbeddingConfig } from "../config"
import { createEmbeddingProvider, createNullEmbeddingProvider } from "./embedding-provider"

function makeConfig(overrides: Partial<BrainEmbeddingConfig> = {}): BrainEmbeddingConfig {
  return {
    provider: "local",
    dimensions: 384,
    batch_size: 32,
    ...overrides,
  }
}

function parseRequestBody(body: RequestInit["body"]): Record<string, unknown> {
  if (typeof body !== "string") {
    throw new Error("Expected JSON string body")
  }
  const parsed = JSON.parse(body)
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Expected JSON object body")
  }
  return parsed as Record<string, unknown>
}

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

function toFetchMock(mock: (input: FetchInput, init?: FetchInit) => Promise<Response>): typeof fetch {
  return mock as unknown as typeof fetch
}

describe("brain/search/embedding-provider", () => {
  const originalFetch = globalThis.fetch
  const originalOpenAIKey = process.env.OPENAI_API_KEY
  const originalVoyageKey = process.env.VOYAGE_API_KEY

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey
    }
    if (originalVoyageKey === undefined) {
      delete process.env.VOYAGE_API_KEY
    } else {
      process.env.VOYAGE_API_KEY = originalVoyageKey
    }
  })

  test("#given null provider → embed throws with reason message", async () => {
    // #given
    const provider = createNullEmbeddingProvider("missing dep")

    // #when / #then
    await expect(provider.embed(["test"])).rejects.toThrow("Embedding provider unavailable: missing dep")
  })

  test("#given null provider → dimensions is 0", () => {
    // #given
    const provider = createNullEmbeddingProvider("anything")

    // #then
    expect(provider.dimensions).toBe(0)
  })

  test("#given null provider → modelId is 'null'", () => {
    // #given
    const provider = createNullEmbeddingProvider("anything")

    // #then
    expect(provider.modelId).toBe("null")
  })

  test("#given provider='local' without transformers installed → returns provider that throws helpful message on embed()", async () => {
    // #given
    const provider = await createEmbeddingProvider(makeConfig({ provider: "local" }))

    // #when / #then
    await expect(provider.embed(["hello world"])).rejects.toThrow("@xenova/transformers")
  })

  test("#given provider='openai' without API key → returns null provider with key instructions", async () => {
    // #given
    delete process.env.OPENAI_API_KEY

    // #when
    const provider = await createEmbeddingProvider(makeConfig({ provider: "openai" }))

    // #then
    expect(provider.modelId).toBe("null")
    await expect(provider.embed(["x"])).rejects.toThrow("Set OPENAI_API_KEY environment variable")
  })

  test("#given provider='voyage' without API key → returns null provider with key instructions", async () => {
    // #given
    delete process.env.VOYAGE_API_KEY

    // #when
    const provider = await createEmbeddingProvider(makeConfig({ provider: "voyage" }))

    // #then
    expect(provider.modelId).toBe("null")
    await expect(provider.embed(["x"])).rejects.toThrow("Set VOYAGE_API_KEY environment variable")
  })

  test("#given openai provider with mock fetch → embed sends correct request format", async () => {
    // #given
    process.env.OPENAI_API_KEY = "openai-test-key"
    let requestUrl = ""
    let requestMethod = ""
    let requestAuth = ""
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = toFetchMock(async (input: FetchInput, init?: FetchInit): Promise<Response> => {
      requestUrl = input.toString()
      requestMethod = init?.method ?? ""
      requestAuth = new Headers(init?.headers).get("Authorization") ?? ""
      requestBody = parseRequestBody(init?.body)
      return new Response(JSON.stringify({
        data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
      }))
    })
    const provider = await createEmbeddingProvider(makeConfig({
      provider: "openai",
      dimensions: 4,
      batch_size: 10,
    }))

    // #when
    await provider.embed(["hello"])

    // #then
    expect(requestUrl).toBe("https://api.openai.com/v1/embeddings")
    expect(requestMethod).toBe("POST")
    expect(requestAuth).toBe("Bearer openai-test-key")
    expect(requestBody.model).toBe("text-embedding-3-small")
    expect(requestBody.dimensions).toBe(4)
    expect(requestBody.input).toEqual(["hello"])
  })

  test("#given openai provider with mock fetch → embed returns Float32Array results", async () => {
    // #given
    process.env.OPENAI_API_KEY = "openai-test-key"
    globalThis.fetch = toFetchMock(async (_input: FetchInput, _init?: FetchInit): Promise<Response> => {
      return new Response(JSON.stringify({
        data: [
          { embedding: [0.11, 0.22, 0.33] },
          { embedding: [0.44, 0.55, 0.66] },
        ],
      }))
    })
    const provider = await createEmbeddingProvider(makeConfig({
      provider: "openai",
      dimensions: 3,
      batch_size: 8,
    }))

    // #when
    const embeddings = await provider.embed(["a", "b"])

    // #then
    expect(embeddings.length).toBe(2)
    expect(embeddings[0]).toBeInstanceOf(Float32Array)
    expect(embeddings[0][0]).toBeCloseTo(0.11, 6)
    expect(embeddings[0][1]).toBeCloseTo(0.22, 6)
    expect(embeddings[0][2]).toBeCloseTo(0.33, 6)
  })

  test("#given openai provider with mock fetch error → embed throws with status code", async () => {
    // #given
    process.env.OPENAI_API_KEY = "openai-test-key"
    globalThis.fetch = toFetchMock(async (_input: FetchInput, _init?: FetchInit): Promise<Response> => {
      return new Response("quota exceeded", { status: 429 })
    })
    const provider = await createEmbeddingProvider(makeConfig({ provider: "openai" }))

    // #when / #then
    await expect(provider.embed(["x"])).rejects.toThrow("OpenAI embedding API error (429)")
  })

  test("#given openai provider → batches requests by config.batch_size", async () => {
    // #given
    process.env.OPENAI_API_KEY = "openai-test-key"
    const seenBatchSizes: number[] = []
    globalThis.fetch = toFetchMock(async (_input: FetchInput, init?: FetchInit): Promise<Response> => {
      const payload = parseRequestBody(init?.body)
      const batch = payload.input
      if (!Array.isArray(batch)) {
        throw new Error("Expected input batch array")
      }
      seenBatchSizes.push(batch.length)
      return new Response(JSON.stringify({
        data: batch.map(() => ({ embedding: [0.1, 0.2] })),
      }))
    })
    const provider = await createEmbeddingProvider(makeConfig({
      provider: "openai",
      dimensions: 2,
      batch_size: 2,
    }))

    // #when
    const result = await provider.embed(["t1", "t2", "t3", "t4", "t5"])

    // #then
    expect(seenBatchSizes).toEqual([2, 2, 1])
    expect(result.length).toBe(5)
  })

  test("#given voyage provider → uses correct API endpoint", async () => {
    // #given
    process.env.VOYAGE_API_KEY = "voyage-test-key"
    let requestUrl = ""
    globalThis.fetch = toFetchMock(async (input: FetchInput, _init?: FetchInit): Promise<Response> => {
      requestUrl = input.toString()
      return new Response(JSON.stringify({
        data: [{ embedding: [0.1, 0.2] }],
      }))
    })
    const provider = await createEmbeddingProvider(makeConfig({
      provider: "voyage",
      dimensions: 2,
      batch_size: 8,
    }))

    // #when
    await provider.embed(["voyage test"])

    // #then
    expect(requestUrl).toBe("https://api.voyageai.com/v1/embeddings")
  })

  test("#given voyage provider → uses correct default model", async () => {
    // #given
    process.env.VOYAGE_API_KEY = "voyage-test-key"
    let requestBody: Record<string, unknown> = {}
    globalThis.fetch = toFetchMock(async (_input: FetchInput, init?: FetchInit): Promise<Response> => {
      requestBody = parseRequestBody(init?.body)
      return new Response(JSON.stringify({
        data: [{ embedding: [0.1, 0.2] }],
      }))
    })
    const provider = await createEmbeddingProvider(makeConfig({
      provider: "voyage",
      dimensions: 2,
      batch_size: 8,
    }))

    // #when
    await provider.embed(["voyage test"])

    // #then
    expect(requestBody.model).toBe("voyage-3-lite")
    expect(provider.modelId).toBe("voyage:voyage-3-lite")
  })

  test("#given default config → local provider with 384 dimensions", async () => {
    // #when
    const provider = await createEmbeddingProvider(makeConfig())

    // #then
    expect(provider.dimensions).toBe(384)
  })

  test("#given custom model config → uses specified model name", async () => {
    // #given
    const customModel = "Xenova/custom-embed-model"

    // #when
    const provider = await createEmbeddingProvider(makeConfig({
      provider: "local",
      model: customModel,
    }))

    // #then
    expect(provider.modelId).toBe(`local:${customModel}`)
  })
})
