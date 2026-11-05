// 記録1本の clientId と記録した時刻を作る。

/**
 * 端末で作る記録の id（UUID v4）。
 * crypto.randomUUID は HTTPS か localhost でしか使えないので、
 * スマホから http://192.168.x.x:5173 で試すときは getRandomValues で作る。
 */
export function newClientId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 新しい1本の clientId と記録した時刻 */
export const newIds = (): { clientId: string; recordedAt: string } => ({
  clientId: newClientId(),
  recordedAt: new Date().toISOString(),
})
