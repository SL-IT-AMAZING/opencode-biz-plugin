/**
 * Serialize Float32Array to Buffer for SQLite BLOB storage.
 * Creates a NEW buffer (copy-safe, no aliasing).
 */
export function serializeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer.slice(
    embedding.byteOffset,
    embedding.byteOffset + embedding.byteLength,
  ))
}

/**
 * Deserialize SQLite BLOB (Uint8Array) back to Float32Array.
 * Creates a NEW ArrayBuffer (copy-safe, avoids Node buffer pool aliasing).
 * Validates alignment and dimension count.
 */
export function deserializeEmbedding(blob: Uint8Array, expectedDimensions?: number): Float32Array {
  if (blob.byteLength % 4 !== 0) {
    throw new Error(`Invalid embedding BLOB: byteLength ${blob.byteLength} not divisible by 4`)
  }
  const ab = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
  const f32 = new Float32Array(ab)
  if (expectedDimensions !== undefined && f32.length !== expectedDimensions) {
    throw new Error(`Embedding dimension mismatch: got ${f32.length}, expected ${expectedDimensions}`)
  }
  return f32
}

/**
 * Normalize a Float32Array to unit length (L2 norm = 1).
 * Returns a NEW Float32Array (does not mutate input).
 */
export function normalizeEmbedding(embedding: Float32Array): Float32Array {
  let sumSq = 0
  for (let i = 0; i < embedding.length; i++) {
    sumSq += embedding[i] * embedding[i]
  }
  const norm = Math.sqrt(sumSq)
  if (norm < 1e-10) return new Float32Array(embedding.length)
  const result = new Float32Array(embedding.length)
  for (let i = 0; i < embedding.length; i++) {
    result[i] = embedding[i] / norm
  }
  return result
}
