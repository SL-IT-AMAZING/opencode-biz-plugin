export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`)

  let dot = 0
  let magA = 0
  let magB = 0
  const len = a.length
  let i = 0

  for (; i + 3 < len; i += 4) {
    dot += a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3]
    magA += a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2] + a[i + 3] * a[i + 3]
    magB += b[i] * b[i] + b[i + 1] * b[i + 1] + b[i + 2] * b[i + 2] + b[i + 3] * b[i + 3]
  }

  for (; i < len; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom < 1e-10 ? 0 : dot / denom
}

export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`)

  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }

  return sum
}
