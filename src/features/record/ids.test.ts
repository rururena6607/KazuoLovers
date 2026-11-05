import { afterEach, describe, expect, it, vi } from 'vitest'
import { newClientId } from './ids.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newClientId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UUID v4 の形', () => {
    expect(newClientId()).toMatch(UUID_V4)
  })

  it('randomUUID がない（http で開いた）ときも UUID v4 を作る', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: <T extends ArrayBufferView>(a: T) => real.getRandomValues(a),
    })
    expect(newClientId()).toMatch(UUID_V4)
  })
})
