import { describe, expect, it } from 'vitest'
import type { RecordRepository } from '../../contracts/index.ts'
import { startAutoRetry, type RetrySignals, type Timer } from './autoRetry.ts'

/** 未送信の件数を外から変えられ、retry の回数を数える repo */
function createRepo() {
  let listener: (n: number) => void = () => {}
  const state = { retries: 0 }
  const repo: Pick<RecordRepository, 'retry' | 'subscribePending'> = {
    async retry() {
      state.retries++
    },
    subscribePending(onChange) {
      listener = onChange
      onChange(0)
      return () => {
        listener = () => {}
      }
    },
  }
  return { repo, state, setPending: (n: number) => listener(n) }
}

function createTimer() {
  const timers = new Map<number, () => void>()
  let next = 1
  const timer: Timer = {
    setInterval(fn) {
      timers.set(next, fn)
      return next++
    },
    clearInterval(id) {
      timers.delete(id)
    },
  }
  return { timer, timers, fire: () => timers.forEach((fn) => fn()) }
}

function createSignals() {
  const listeners = new Set<() => void>()
  const signals: RetrySignals = {
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  return { signals, listeners, emit: () => listeners.forEach((fn) => fn()) }
}

describe('startAutoRetry', () => {
  it('未送信があるあいだだけ、間隔をあけて送り直す', () => {
    const r = createRepo()
    const t = createTimer()
    startAutoRetry(r.repo, createSignals().signals, t.timer, 1000)
    expect(t.timers.size).toBe(0)

    r.setPending(2)
    expect(t.timers.size).toBe(1)
    r.setPending(1)
    // 件数が変わっても、タイマーは1つだけ
    expect(t.timers.size).toBe(1)
    t.fire()
    t.fire()
    expect(r.state.retries).toBe(2)

    r.setPending(0)
    expect(t.timers.size).toBe(0)
  })

  it('電波が戻ったら、未送信があればすぐ送る。なければ何もしない', () => {
    const r = createRepo()
    const s = createSignals()
    startAutoRetry(r.repo, s.signals, createTimer().timer, 1000)
    s.emit()
    expect(r.state.retries).toBe(0)
    r.setPending(1)
    s.emit()
    expect(r.state.retries).toBe(1)
  })

  it('止めると、タイマーもきっかけも外す', () => {
    const r = createRepo()
    const t = createTimer()
    const s = createSignals()
    const stop = startAutoRetry(r.repo, s.signals, t.timer, 1000)
    r.setPending(1)
    stop()
    expect(t.timers.size).toBe(0)
    expect(s.listeners.size).toBe(0)
  })
})
