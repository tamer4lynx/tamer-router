import { describe, expect, it } from 'vitest'
import { getOutermostStackFromPath, shouldNativePush } from './tamer-stacks.js'

describe('getOutermostStackFromPath', () => {
  it('maps known stacks', () => {
    expect(getOutermostStackFromPath('/tabs/about')).toBe('/tabs')
    expect(getOutermostStackFromPath('/native/details/1')).toBe('/native')
    expect(getOutermostStackFromPath('/m3/nav')).toBe('/m3')
  })
  it('returns null for top-level pages', () => {
    expect(getOutermostStackFromPath('/not_layout')).toBe(null)
    expect(getOutermostStackFromPath('/')).toBe(null)
  })
})

describe('shouldNativePush', () => {
  it('coordinator: same outer stack uses JS', () => {
    expect(
      shouldNativePush({
        fromPath: '/tabs',
        toPath: '/tabs/about',
        isSpoke: false,
        spokeRootStack: null,
      }),
    ).toBe(false)
  })
  it('coordinator: cross stack uses native when already inside a stack', () => {
    expect(
      shouldNativePush({
        fromPath: '/tabs',
        toPath: '/native',
        isSpoke: false,
        spokeRootStack: null,
      }),
    ).toBe(true)
  })
  it('coordinator: from root or loose routes into a stack opens a native stack spoke', () => {
    expect(
      shouldNativePush({
        fromPath: '/',
        toPath: '/native',
        isSpoke: false,
        spokeRootStack: null,
      }),
    ).toBe(true)
    expect(
      shouldNativePush({
        fromPath: '/not_layout',
        toPath: '/m3',
        isSpoke: false,
        spokeRootStack: null,
      }),
    ).toBe(true)
  })
  it('tabs always stay local: never trigger native push', () => {
    // Tab routes must always swap via JS regardless of mode
    expect(
      shouldNativePush({
        fromPath: '/',
        toPath: '/tabs',
        isSpoke: false,
        spokeRootStack: null,
      }),
    ).toBe(false)
    expect(
      shouldNativePush({
        fromPath: '/native',
        toPath: '/tabs',
        isSpoke: false,
        spokeRootStack: null,
      }),
    ).toBe(false)
  })
  it('spoke with null root: entering a non-tab stack uses native; unknown top-level uses JS', () => {
    expect(
      shouldNativePush({
        fromPath: '/not_layout',
        toPath: '/native',
        isSpoke: true,
        spokeRootStack: null,
      }),
    ).toBe(true)
    expect(
      shouldNativePush({
        fromPath: '/not_layout',
        toPath: '/other-top',
        isSpoke: true,
        spokeRootStack: null,
      }),
    ).toBe(false)
  })
  it('spoke with stack root: only cross outer stack uses native', () => {
    expect(
      shouldNativePush({
        fromPath: '/tabs/about',
        toPath: '/tabs/secure',
        isSpoke: true,
        spokeRootStack: '/tabs',
      }),
    ).toBe(false)
    expect(
      shouldNativePush({
        fromPath: '/tabs/about',
        toPath: '/native',
        isSpoke: true,
        spokeRootStack: '/tabs',
      }),
    ).toBe(true)
  })
})
