// 保存などの操作を1つ走らせ、実行中かどうかと、失敗したときの理由を持つ。
import { useCallback, useState } from 'react'

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 成功したら true を返す。失敗したら理由を error に入れる */
  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { busy, error, run, clearError }
}
