import { relative, join } from "node:path"
import { stat } from "node:fs/promises"
import type { IndexState } from "../types"
import type { BrainPaths } from "../vault"
import type { BrainDatabase, MarkdownIndexer, IndexFileResult, FullScanResult, EmbeddingProvider } from "./types"
import { splitMarkdownChunks } from "./chunker"
import { serializeEmbedding } from "./embedding-store"

function computeFileHash(content: string): string {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(content)
  return hasher.digest("hex")
}

function toRelative(vaultRoot: string, absPath: string): string {
  return relative(vaultRoot, absPath)
}

export function createMarkdownIndexer(
  db: BrainDatabase,
  paths: BrainPaths,
  embeddingProvider?: EmbeddingProvider | null,
): MarkdownIndexer {
  return {
    async indexFile(absolutePath: string): Promise<IndexFileResult> {
      const relPath = toRelative(paths.vault, absolutePath)

      const file = Bun.file(absolutePath)
      if (!(await file.exists())) {
        return { path: relPath, chunks: 0, skipped: true, reason: "file not found" }
      }

      const content = await file.text()
      const hash = computeFileHash(content)
      const fileStat = await stat(absolutePath)

      const existing = db.getFileState(relPath)
      if (existing && existing.hash === hash) {
        return { path: relPath, chunks: existing.chunk_count, skipped: true, reason: "unchanged" }
      }

      const chunks = splitMarkdownChunks(content)
      db.upsertChunks(relPath, chunks)
      db.setFileState(relPath, {
        hash,
        mtime: fileStat.mtimeMs,
        chunk_count: chunks.length,
        last_indexed: new Date().toISOString(),
      })

      if (embeddingProvider) {
        try {
          const storedChunks = db.getChunks(relPath)
          const contents = storedChunks.map(c => c.content)
          if (contents.length > 0) {
            const embeddings = await embeddingProvider.embed(contents)
            for (let i = 0; i < storedChunks.length; i++) {
              if (embeddings[i]) {
                db.setEmbedding(
                  Number(storedChunks[i].id),
                  serializeEmbedding(embeddings[i]),
                  embeddingProvider.modelId,
                )
              }
            }
          }
        } catch {
          // Embeddings are best-effort only; FTS indexing must still succeed.
        }
      }

      return { path: relPath, chunks: chunks.length, skipped: false }
    },

    removeFile(absolutePath: string) {
      const relPath = toRelative(paths.vault, absolutePath)
      db.removeFile(relPath)
    },

    async fullScan(vaultPath: string, patterns: string[]): Promise<FullScanResult> {
      const result: FullScanResult = { indexed: 0, skipped: 0, removed: 0, errors: [] }
      const scannedPaths = new Set<string>()

      for (const pattern of patterns) {
        const glob = new Bun.Glob(pattern)
        for await (const entry of glob.scan({ cwd: vaultPath, absolute: true })) {
          const relPath = toRelative(paths.vault, entry)
          if (scannedPaths.has(relPath)) continue
          scannedPaths.add(relPath)

          try {
            const fileResult = await this.indexFile(entry)
            if (fileResult.skipped) {
              result.skipped++
            } else {
              result.indexed++
            }
          } catch (err) {
            result.errors.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }

      const existingStates = db.getAllFileStates()
      for (const existingPath of Object.keys(existingStates)) {
        if (!scannedPaths.has(existingPath)) {
          const absPath = join(paths.vault, existingPath)
          const file = Bun.file(absPath)
          if (!(await file.exists())) {
            db.removeFile(existingPath)
            result.removed++
          }
        }
      }

      if (embeddingProvider) {
        try {
          const needsEmbedding = db.getChunksNeedingEmbedding(embeddingProvider.modelId)
          const batchSize = 32
          for (let i = 0; i < needsEmbedding.length; i += batchSize) {
            const batch = needsEmbedding.slice(i, i + batchSize)
            const embeddings = await embeddingProvider.embed(batch.map(c => c.content))
            for (let j = 0; j < batch.length; j++) {
              if (embeddings[j]) {
                db.setEmbedding(batch[j].id, serializeEmbedding(embeddings[j]), embeddingProvider.modelId)
              }
            }
          }
        } catch {
          // Backfill is best-effort; partial embeddings still allow graceful fallback.
        }
      }

      return result
    },

    getState(): IndexState {
      const fileStates = db.getAllFileStates()
      const files: IndexState["files"] = {}
      for (const [path, state] of Object.entries(fileStates)) {
        files[path] = {
          hash: state.hash,
          mtime: state.mtime,
          chunk_count: state.chunk_count,
          last_indexed: state.last_indexed,
        }
      }
      return {
        files,
        last_full_scan: new Date().toISOString(),
        schema_version: 1,
      }
    },
  }
}
