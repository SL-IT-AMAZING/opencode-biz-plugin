type LogLevel = "debug" | "info" | "warn" | "error"

let currentLevel: LogLevel = (process.env.BRAIN_LOG_LEVEL as LogLevel) ?? "info"

const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

export function log(message: string, data?: Record<string, unknown>): void {
  if (levels[currentLevel] > levels.info) return
  const formatted = data ? `${message} ${JSON.stringify(data)}` : message
  console.log(`[brain] ${formatted}`)
}

export function logDebug(message: string, data?: Record<string, unknown>): void {
  if (levels[currentLevel] > levels.debug) return
  const formatted = data ? `${message} ${JSON.stringify(data)}` : message
  console.debug(`[brain] ${formatted}`)
}

export function logWarn(message: string, data?: Record<string, unknown>): void {
  const formatted = data ? `${message} ${JSON.stringify(data)}` : message
  console.warn(`[brain] ${formatted}`)
}

export function logError(message: string, data?: Record<string, unknown>): void {
  const formatted = data ? `${message} ${JSON.stringify(data)}` : message
  console.error(`[brain] ${formatted}`)
}
