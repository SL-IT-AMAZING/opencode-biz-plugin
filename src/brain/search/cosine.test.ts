import { describe, test, expect } from "bun:test"
import { cosineSimilarity, dotProduct } from "./cosine"

describe("brain/search/cosine", () => {
  describe("cosineSimilarity", () => {
    test("#given identical vectors → returns 1.0", () => {
      // #given
      const a = new Float32Array([1, 2, 3, 4])
      const b = new Float32Array([1, 2, 3, 4])

      // #when
      const similarity = cosineSimilarity(a, b)

      // #then
      expect(similarity).toBeCloseTo(1)
    })

    test("#given orthogonal vectors → returns 0.0", () => {
      // #given
      const a = new Float32Array([1, 0, 0])
      const b = new Float32Array([0, 1, 0])

      // #when
      const similarity = cosineSimilarity(a, b)

      // #then
      expect(similarity).toBeCloseTo(0)
    })

    test("#given opposite vectors → returns -1.0", () => {
      // #given
      const a = new Float32Array([1, -2, 3])
      const b = new Float32Array([-1, 2, -3])

      // #when
      const similarity = cosineSimilarity(a, b)

      // #then
      expect(similarity).toBeCloseTo(-1)
    })

    test("#given zero vector → returns 0.0", () => {
      // #given
      const a = new Float32Array([0, 0, 0])
      const b = new Float32Array([3, 4, 5])

      // #when
      const similarity = cosineSimilarity(a, b)

      // #then
      expect(similarity).toBe(0)
    })

    test("#given length mismatch → throws", () => {
      // #given
      const a = new Float32Array([1, 2, 3])
      const b = new Float32Array([1, 2])

      // #then
      expect(() => cosineSimilarity(a, b)).toThrow(/Vector length mismatch/)
    })

    test("#given 384-dim vectors with known overlap → returns expected value", () => {
      // #given
      const a = new Float32Array(384).fill(1)
      const b = new Float32Array(384)
      for (let i = 0; i < 192; i++) {
        b[i] = 1
      }

      // #when
      const similarity = cosineSimilarity(a, b)

      // #then
      expect(similarity).toBeCloseTo(1 / Math.sqrt(2), 6)
    })
  })

  describe("dotProduct", () => {
    test("#given identical vectors → returns sum of squared magnitudes", () => {
      // #given
      const a = new Float32Array([1, 2, 3, 4])
      const b = new Float32Array([1, 2, 3, 4])

      // #when
      const result = dotProduct(a, b)

      // #then
      expect(result).toBe(30)
    })

    test("#given orthogonal vectors → returns 0.0", () => {
      // #given
      const a = new Float32Array([1, 0, 0])
      const b = new Float32Array([0, 1, 0])

      // #when
      const result = dotProduct(a, b)

      // #then
      expect(result).toBe(0)
    })

    test("#given opposite vectors → returns negative value", () => {
      // #given
      const a = new Float32Array([1, -2, 3])
      const b = new Float32Array([-1, 2, -3])

      // #when
      const result = dotProduct(a, b)

      // #then
      expect(result).toBe(-14)
    })

    test("#given zero vector → returns 0.0", () => {
      // #given
      const a = new Float32Array([0, 0, 0])
      const b = new Float32Array([3, 4, 5])

      // #when
      const result = dotProduct(a, b)

      // #then
      expect(result).toBe(0)
    })

    test("#given length mismatch → throws", () => {
      // #given
      const a = new Float32Array([1, 2, 3])
      const b = new Float32Array([1, 2])

      // #then
      expect(() => dotProduct(a, b)).toThrow(/Vector length mismatch/)
    })

    test("#given 384-dim vectors with known overlap → returns expected value", () => {
      // #given
      const a = new Float32Array(384).fill(1)
      const b = new Float32Array(384)
      for (let i = 0; i < 192; i++) {
        b[i] = 1
      }

      // #when
      const result = dotProduct(a, b)

      // #then
      expect(result).toBe(192)
    })
  })
})
