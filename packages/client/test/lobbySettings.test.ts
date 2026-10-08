/** Lobby settings helpers: KX p2 scenarios (Upmarket Area: only park tile Z, Q-K26) and Lobbyists at 5+ (KX p15). */
import { describe, expect, it } from 'vitest';
import type { RoomConfig } from '@fcm/protocol';
import { listModules } from '@fcm/engine';
import { applyScenario, scenarioOf, toggleModule, withRequiredModules } from '../src/state/lobbySettings.js';

const mods = listModules().filter((m) => m.id !== 'base');
const cfg = (extra: Partial<RoomConfig> = {}): RoomConfig => ({ seatCount: 4, modules: [], options: {}, intro: false, introMilestones: false, ...extra });

describe('lobby settings', () => {
  it('Upmarket Area: New Milestones, Gourmet, Sushi and only the park tile from New Districts', () => {
    const c = applyScenario(cfg({ intro: true }), mods, 'upmarket');
    expect(c.intro).toBe(false);
    expect([...c.modules].sort()).toEqual(['ketchup:gourmetCritics', 'ketchup:newDistricts', 'ketchup:newMilestones', 'ketchup:sushi']);
    expect(c.options).toEqual({ 'ketchup:newDistricts': { tiles: 'park' } });
    expect(scenarioOf(c)).toBe('upmarket');
    // Korean City resets the tile option.
    const k = applyScenario(c, mods, 'koreanCity');
    expect(k.options).toEqual({ 'ketchup:newDistricts': {} });
    expect(scenarioOf(k)).toBe('koreanCity');
    expect(scenarioOf(toggleModule(k, mods, 'ketchup:coffee', true))).toBe('');
  });

  it('Lobbyists at 5+ players brings New Districts (KX p15)', () => {
    const four = toggleModule(cfg(), mods, 'ketchup:lobbyists', true);
    expect(four.modules).toEqual(['ketchup:lobbyists']);
    expect(withRequiredModules({ ...four, seatCount: 5 }, mods).modules).toEqual(['ketchup:newDistricts', 'ketchup:lobbyists']);
    expect(toggleModule(cfg({ seatCount: 5 }), mods, 'ketchup:lobbyists', true).modules).toEqual(['ketchup:newDistricts', 'ketchup:lobbyists']);
    expect(scenarioOf(applyScenario(cfg({ seatCount: 5 }), mods, 'firstMover'))).toBe('firstMover');
  });
});
