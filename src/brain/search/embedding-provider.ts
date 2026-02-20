import type { BrainEmbeddingConfig } from "../config"
import type { EmbeddingProvider } from "./types"

type EmbeddingApiResponse = {
  data: Array<{
    embedding: number[]
  }>
}

type TransformerEmbedding = {
  data: ArrayLike<number>
}

type TransformerPipeline = (
  input: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<TransformerEmbedding[] | TransformerEmbedding>

type TransformerModule = {
  pipeline: (task: "feature-extraction", model: string) => Promise<TransformerPipeline>
}

const LOCAL_MISSING_DEP_MESSAGE = "Local embedding provider requires @xenova/transformers. Install with: bun add @xenova/transformers"

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isEmbeddingApiResponse(value: unknown): value is EmbeddingApiResponse {
  if (!isObjectRecord(value) || !Array.isArray(value.data)) return false
  return value.data.every((item) => {
    if (!isObjectRecord(item) || !Array.isArray(item.embedding)) return false
    return item.embedding.every((entry) => typeof entry === "number")
  })
}

async function importTransformersModule(): Promise<TransformerModule> {
  const moduleId = "@xenova/transformers"
  const loaded = await import(moduleId)
  if (!isObjectRecord(loaded) || typeof loaded.pipeline !== "function") {
    throw new Error("@xenova/transformers module shape is invalid")
  }
  return loaded as TransformerModule
}

function toTransformerEmbeddings(output: TransformerEmbedding[] | TransformerEmbedding): TransformerEmbedding[] {
  if (Array.isArray(output)) return output
  return [output]
}

async function createLocalProvider(config: BrainEmbeddingConfig): Promise<EmbeddingProvider> {
  const modelName = config.model ?? "Xenova/all-MiniLM-L6-v2"
  const batchSize = Math.max(1, config.batch_size)
  let pipeline: TransformerPipeline | null = null

  async function getPipeline(): Promise<TransformerPipeline> {
    if (pipeline) return pipeline
    try {
      const transformers = await importTransformersModule()
      pipeline = await transformers.pipeline("feature-extraction", modelName)
      return pipeline
    } catch {
      throw new Error(LOCAL_MISSING_DEP_MESSAGE)
    }
  }

  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      const pipe = await getPipeline()
      const results: Float32Array[] = []
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize)
        const output = await pipe(batch, { pooling: "mean", normalize: true })
        const embeddings = toTransformerEmbeddings(output)
        for (const item of embeddings) {
          results.push(new Float32Array(item.data))
        }
      }
      return results
    },
    get dimensions() {
      return config.dimensions
    },
    get modelId() {
      return `local:${modelName}`
    },
  }
}

function createRemoteEmbeddingProvider(params: {
  apiKey: string
  endpoint: string
  model: string
  dimensions: number
  batchSize: number
  providerLabel: string
}): EmbeddingProvider {
  const { apiKey, endpoint, model, dimensions, batchSize, providerLabel } = params
  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      const results: Float32Array[] = []
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize)
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: batch,
            dimensions,
          }),
        })
        if (!response.ok) {
          const errorBody = await response.text()
          throw new Error(`${providerLabel} embedding API error (${response.status}): ${errorBody}`)
        }
        const parsed = await response.json()
        if (!isEmbeddingApiResponse(parsed)) {
          throw new Error(`${providerLabel} embedding API returned invalid payload shape`)
        }
        for (const item of parsed.data) {
          results.push(new Float32Array(item.embedding))
        }
      }
      return results
    },
    get dimensions() {
      return dimensions
    },
    get modelId() {
      return `${providerLabel.toLowerCase()}:${model}`
    },
  }
}

function createOpenAIProvider(config: BrainEmbeddingConfig): EmbeddingProvider {
  const envName = config.api_key_env ?? "OPENAI_API_KEY"
  const apiKey = process.env[envName]
  if (!apiKey) {
    return createNullEmbeddingProvider(
      `OpenAI embedding provider requires API key. Set ${envName} environment variable.`,
    )
  }
  const model = config.model ?? "text-embedding-3-small"
  return createRemoteEmbeddingProvider({
    apiKey,
    endpoint: "https://api.openai.com/v1/embeddings",
    model,
    dimensions: config.dimensions,
    batchSize: Math.max(1, config.batch_size),
    providerLabel: "OpenAI",
  })
}

function createVoyageProvider(config: BrainEmbeddingConfig): EmbeddingProvider {
  const envName = config.api_key_env ?? "VOYAGE_API_KEY"
  const apiKey = process.env[envName]
  if (!apiKey) {
    return createNullEmbeddingProvider(
      `Voyage embedding provider requires API key. Set ${envName} environment variable.`,
    )
  }
  const model = config.model ?? "voyage-3-lite"
  return createRemoteEmbeddingProvider({
    apiKey,
    endpoint: "https://api.voyageai.com/v1/embeddings",
    model,
    dimensions: config.dimensions,
    batchSize: Math.max(1, config.batch_size),
    providerLabel: "Voyage",
  })
}

export function createNullEmbeddingProvider(reason: string): EmbeddingProvider {
  return {
    async embed(): Promise<Float32Array[]> {
      throw new Error(`Embedding provider unavailable: ${reason}`)
    },
    get dimensions() {
      return 0
    },
    get modelId() {
      return "null"
    },
  }
}

export async function createEmbeddingProvider(config: BrainEmbeddingConfig): Promise<EmbeddingProvider> {
  switch (config.provider) {
    case "local":
      return createLocalProvider(config)
    case "openai":
      return createOpenAIProvider(config)
    case "voyage":
      return createVoyageProvider(config)
    default:
      return createNullEmbeddingProvider(`Unknown provider: ${String(config.provider)}`)
  }
}
