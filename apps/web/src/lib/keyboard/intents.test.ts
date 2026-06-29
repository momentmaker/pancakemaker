import { describe, it, expect } from 'vitest'
import { resolveIntent, isMutating } from './intents.js'

describe('resolveIntent — single keys', () => {
  it('maps j/k to cursor movement', () => {
    expect(resolveIntent('j').action).toBe('cursor-down')
    expect(resolveIntent('k').action).toBe('cursor-up')
  })

  it('maps G to cursor-bottom', () => {
    expect(resolveIntent('G').action).toBe('cursor-bottom')
  })

  it('maps o and Enter to open', () => {
    expect(resolveIntent('o').action).toBe('open')
    expect(resolveIntent('Enter').action).toBe('open')
  })

  it('maps d to delete', () => {
    expect(resolveIntent('d').action).toBe('delete')
  })

  it('maps a to open-quick-add', () => {
    expect(resolveIntent('a').action).toBe('open-quick-add')
  })

  it('maps : to open-capture', () => {
    expect(resolveIntent(':').action).toBe('open-capture')
  })

  it('maps ? to cheatsheet and Escape to escape', () => {
    expect(resolveIntent('?').action).toBe('cheatsheet')
    expect(resolveIntent('Escape').action).toBe('escape')
  })

  it('returns none for unmapped keys, including the deferred /', () => {
    expect(resolveIntent('/').action).toBe('none')
    expect(resolveIntent('x').action).toBe('none')
  })
})

describe('resolveIntent — chords', () => {
  it('sets pending on g and resolves gg to cursor-top', () => {
    const first = resolveIntent('g')
    expect(first.action).toBe('none')
    expect(first.pending).toBe('g')

    const second = resolveIntent('g', { pending: 'g' })
    expect(second.action).toBe('cursor-top')
    expect(second.pending).toBeNull()
  })

  it('resolves g + d/p/b/s to route jumps', () => {
    expect(resolveIntent('d', { pending: 'g' }).action).toBe('go-dashboard')
    expect(resolveIntent('p', { pending: 'g' }).action).toBe('go-personal')
    expect(resolveIntent('b', { pending: 'g' }).action).toBe('go-business')
    expect(resolveIntent('s', { pending: 'g' }).action).toBe('go-settings')
  })

  it('clears pending on a non-sequence key after g', () => {
    const r = resolveIntent('z', { pending: 'g' })
    expect(r.action).toBe('none')
    expect(r.pending).toBeNull()
  })

  it('sets pending on y and resolves yy to duplicate', () => {
    const first = resolveIntent('y')
    expect(first.action).toBe('none')
    expect(first.pending).toBe('y')

    const second = resolveIntent('y', { pending: 'y' })
    expect(second.action).toBe('duplicate')
    expect(second.pending).toBeNull()
  })
})

describe('resolveIntent — field focus (R3 / AE1)', () => {
  it('suppresses all non-Escape actions while a field is focused', () => {
    expect(resolveIntent('j', { fieldFocused: true }).action).toBe('none')
    expect(resolveIntent('d', { fieldFocused: true }).action).toBe('none')
    expect(resolveIntent('g', { fieldFocused: true }).action).toBe('none')
  })

  it('still honors Escape while a field is focused', () => {
    expect(resolveIntent('Escape', { fieldFocused: true }).action).toBe('escape')
  })

  it('clears any pending prefix while a field is focused', () => {
    expect(resolveIntent('g', { fieldFocused: true }).pending).toBeNull()
  })
})

describe('mutating metadata', () => {
  it('flags delete and duplicate as mutating', () => {
    expect(resolveIntent('d').mutating).toBe(true)
    expect(resolveIntent('y', { pending: 'y' }).mutating).toBe(true)
    expect(isMutating('delete')).toBe(true)
    expect(isMutating('duplicate')).toBe(true)
  })

  it('flags navigation as non-mutating', () => {
    expect(resolveIntent('j').mutating).toBe(false)
    expect(isMutating('cursor-down')).toBe(false)
    expect(isMutating('go-personal')).toBe(false)
  })
})
