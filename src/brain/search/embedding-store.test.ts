import { describe, test, expect } from "bun:test"
import { deserializeEmbedding, normalizeEmbedding, serializeEmbedding } from "./embedding-store"

describe("brain/search/embedding-store", () => {
  test("#given Float32Array -> returns Buffer with correct byte length", () => {
    // #given
    const embedding = new Float32Array([1, 2, 3, 4])

    // #when
    const serialized = serializeEmbedding(embedding)

    // #then
    expect(serialized.byteLength).toBe(16)
  })

  test("#given Float32Array -> serialized bytes match original values", () => {
    // #given
    const embedding = new Float32Array([1.25, -2.5, 3.75, -4.125])

    // #when
    const serialized = serializeEmbedding(embedding)
    const roundTrip = new Float32Array(serialized.buffer, serialized.byteOffset, serialized.byteLength / 4)

    // #then
    expect(roundTrip.length).toBe(4)
    expect(roundTrip[0]).toBeCloseTo(1.25)
    expect(roundTrip[1]).toBeCloseTo(-2.5)
    expect(roundTrip[2]).toBeCloseTo(3.75)
    expect(roundTrip[3]).toBeCloseTo(-4.125)
  })

  test("#given valid Uint8Array BLOB -> returns correct Float32Array", () => {
    // #given
    const original = new Float32Array([0.1, 0.2, 0.3, 0.4])
    const blob = new Uint8Array(original.buffer.slice(0))

    // #when
    const deserialized = deserializeEmbedding(blob)

    // #then
    expect(deserialized.length).toBe(4)
    expect(deserialized[0]).toBeCloseTo(0.1)
    expect(deserialized[1]).toBeCloseTo(0.2)
    expect(deserialized[2]).toBeCloseTo(0.3)
    expect(deserialized[3]).toBeCloseTo(0.4)
  })

  test("#given Uint8Array with byteLength not divisible by 4 -> throws", () => {
    // #given
    const invalidBlob = new Uint8Array(7)

    // #then
    expect(() => deserializeEmbedding(invalidBlob)).toThrow(/not divisible by 4/)
  })

  test("#given wrong expectedDimensions -> throws dimension mismatch", () => {
    // #given
    const embedding = new Float32Array([1, 2, 3, 4])
    const blob = new Uint8Array(embedding.buffer.slice(0))

    // #then
    expect(() => deserializeEmbedding(blob, 8)).toThrow(/dimension mismatch/)
  })

  test("#given correct expectedDimensions -> returns without error", () => {
    // #given
    const embedding = new Float32Array([1, 2, 3, 4])
    const blob = new Uint8Array(embedding.buffer.slice(0))

    // #when
    const deserialized = deserializeEmbedding(blob, 4)

    // #then
    expect(deserialized.length).toBe(4)
  })

  test("#when serialize then deserialize -> values are identical", () => {
    // #given
    const embedding = new Float32Array([0.25, -0.5, 1.5, -2.75])

    // #when
    const serialized = serializeEmbedding(embedding)
    const deserialized = deserializeEmbedding(serialized)

    // #then
    expect(deserialized.length).toBe(embedding.length)
    for (let i = 0; i < embedding.length; i++) {
      expect(deserialized[i]).toBe(embedding[i])
    }
  })

  test("#when serialize then deserialize 384-dim embedding -> values preserved", () => {
    // #given
    const values = Array.from({ length: 384 }, (_, i) => Math.fround(Math.sin(i / 10)))
    const embedding = new Float32Array(values)

    // #when
    const serialized = serializeEmbedding(embedding)
    const deserialized = deserializeEmbedding(serialized, 384)

    // #then
    expect(deserialized.length).toBe(384)
    for (let i = 0; i < embedding.length; i++) {
      expect(deserialized[i]).toBe(embedding[i])
    }
  })

  test("#given serialized Buffer -> modifying original Float32Array does not affect Buffer", () => {
    // #given
    const embedding = new Float32Array([10, 20, 30, 40])
    const serialized = serializeEmbedding(embedding)
    const before = serialized[0]

    // #when
    embedding[0] = 999

    // #then
    expect(serialized[0]).toBe(before)
  })

  test("#given deserialized Float32Array -> modifying source BLOB does not affect result", () => {
    // #given
    const original = new Float32Array([5, 6, 7, 8])
    const blob = new Uint8Array(original.buffer.slice(0))
    const deserialized = deserializeEmbedding(blob)
    const firstValue = deserialized[0]

    // #when
    blob.fill(0)

    // #then
    expect(deserialized[0]).toBe(firstValue)
    expect(deserialized[1]).toBe(6)
    expect(deserialized[2]).toBe(7)
    expect(deserialized[3]).toBe(8)
  })

  test("#given non-unit vector -> returns vector with L2 norm ~= 1.0", () => {
    // #given
    const embedding = new Float32Array([3, 4])

    // #when
    const normalized = normalizeEmbedding(embedding)

    // #then
    const norm = Math.sqrt((normalized[0] ** 2) + (normalized[1] ** 2))
    expect(normalized[0]).toBeCloseTo(0.6)
    expect(normalized[1]).toBeCloseTo(0.8)
    expect(norm).toBeCloseTo(1.0)
  })

  test("#given zero vector -> returns zero vector", () => {
    // #given
    const embedding = new Float32Array([0, 0, 0, 0])

    // #when
    const normalized = normalizeEmbedding(embedding)

    // #then
    expect(Array.from(normalized)).toEqual([0, 0, 0, 0])
  })

  test("#given already-unit vector -> returns vector with norm ~= 1.0", () => {
    // #given
    const invSqrt2 = Math.fround(1 / Math.sqrt(2))
    const embedding = new Float32Array([invSqrt2, invSqrt2])

    // #when
    const normalized = normalizeEmbedding(embedding)

    // #then
    const norm = Math.sqrt((normalized[0] ** 2) + (normalized[1] ** 2))
    expect(norm).toBeCloseTo(1.0)
  })

  test("#given input vector -> does not mutate original", () => {
    // #given
    const embedding = new Float32Array([3, 4])
    const before = Array.from(embedding)

    // #when
    normalizeEmbedding(embedding)

    // #then
    expect(Array.from(embedding)).toEqual(before)
  })
})
