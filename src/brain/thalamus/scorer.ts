import { stat } from "node:fs/promises"
import type { PendingChange, ChangeSignificance } from "./types"

export async function scoreChange(
  change: PendingChange,
  _vaultRoot: string,
): Promise<ChangeSignificance> {
  if (change.type === "unlink") {
    return { score: 70, reason: "File deleted", type: "structure" }
  }

  if (change.type === "add") {
    return { score: 60, reason: "New file created", type: "structure" }
  }

  try {
    const fileStat = await stat(change.path)
    const sizeKb = fileStat.size / 1024

    if (fileStat.size < 100) {
      return { score: 15, reason: "Trivial change (very small file)", type: "content" }
    }

    if (sizeKb > 50) {
      return { score: 80, reason: "Large file modified", type: "content" }
    }

    return { score: 50, reason: "File content modified", type: "content" }
  } catch {
    return { score: 30, reason: "File modified (stat failed)", type: "content" }
  }
}
