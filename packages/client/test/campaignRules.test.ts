/** Campaign flow rules (state/campaignRules.ts) on engine fixtures: eternal launches, 2-good airplanes, held picks. */
import { describe, expect, it } from 'vitest';
import { engine, type GameState, type MilestoneId, type ModuleId, type PlayerId } from '@fcm/engine';
import { FIXTURES, stateBuilder } from '@fcm/engine/testing';
import { buildCatalog } from '../src/state/catalog.js';
import { eternalClaimLine, eternalLaunch, launchesEternal, maxCampaignGoods, milestoneOpen, onPick, pickStep, toggleGood } from '../src/state/campaignRules.js';

const manifest = engine.listModules();
const cat = (s: GameState) => buildCatalog(manifest, s.config.modules);
const view = (s: GameState, me: PlayerId) => engine.redactFor(s, me);
const FB = 'first_billboard' as MilestoneId;
const BM = 'ketchup:first_brand_manager_used' as MilestoneId;
const BD = 'ketchup:first_brand_director_used' as MilestoneId;

/** Working fixture with First Billboard unclaimed by anyone. */
function openBillboard(): GameState {
  const s = FIXTURES.working();
  delete s.players.p1!.milestones[FB];
  s.milestones[FB] = { ...s.milestones[FB]!, claimedBy: [], claimedRound: null, removed: false };
  return s;
}

/** Two players with the Ketchup New Milestones in play (instead of the base ones). */
function ketchup(): GameState {
  const mods: ModuleId[] = ['ketchup:newMilestones' as ModuleId];
  return stateBuilder({ players: 2 })
    .modules(mods)
    .mutate((s) => {
      s.milestones = {};
      for (const id of Object.keys(buildCatalog(manifest, mods).milestones)) {
        if (id.startsWith('ketchup:')) s.milestones[id as MilestoneId] = { claimedBy: [], claimedRound: null, removed: false, removeAfterRound: null };
      }
    })
    .build();
}

describe('eternal launches (DLX p20)', () => {
  it('the billboard that claims First Billboard is eternal itself', () => {
    const s = openBillboard();
    const c = cat(s);
    const r = eternalLaunch(c, view(s, 'p3'), 'p3', 'billboard');
    expect(r.eternal).toBe(true);
    expect(r.claims?.id).toBe(FB);
    // A mailbox does not claim it, so it keeps a duration.
    expect(launchesEternal(c, view(s, 'p3'), 'p3', 'mailbox')).toBe(false);
    expect(eternalClaimLine(r.claims!, 'billboard', 'Marketing trainee')).toBe(
      'Claims First Billboard Campaign: this and all your later campaigns are eternal; your marketing trainee stays busy for the rest of the game.',
    );
  });

  it('owning the milestone makes every kind eternal, with no claim line', () => {
    const s = FIXTURES.working();
    expect(eternalLaunch(cat(s), view(s, 'p1'), 'p1', 'mailbox')).toEqual({ eternal: true, claims: null });
  });

  it('same-round sharing: still claimable this round, crossed out after', () => {
    const s = openBillboard();
    s.milestones[FB] = { ...s.milestones[FB]!, claimedBy: ['p2'], claimedRound: s.round };
    expect(launchesEternal(cat(s), view(s, 'p3'), 'p3', 'billboard')).toBe(true);
    s.milestones[FB] = { ...s.milestones[FB]!, claimedRound: s.round - 1 };
    expect(launchesEternal(cat(s), view(s, 'p3'), 'p3', 'billboard')).toBe(false);
    s.milestones[FB] = { ...s.milestones[FB]!, claimedBy: [], claimedRound: null, removed: true };
    expect(milestoneOpen(view(s, 'p3'), 'p3', FB)).toBe(false);
    expect(launchesEternal(cat(s), view(s, 'p3'), 'p3', 'billboard')).toBe(false);
  });

  it('the brand director radio that claims First brand director used is eternal; its airplane is not', () => {
    const s = ketchup();
    const c = cat(s);
    const v = view(s, 'p1');
    expect(eternalLaunch(c, v, 'p1', 'radio', { employeeId: 'brand_director' }).claims?.id).toBe(BD);
    expect(launchesEternal(c, v, 'p1', 'airplane', { employeeId: 'brand_director' })).toBe(false);
    expect(launchesEternal(c, v, 'p1', 'radio', { employeeId: 'brand_manager' })).toBe(false);
  });
});

describe('two-good airplane (KX p18)', () => {
  it('a brand manager airplane may carry 2 goods while First brand manager used is available', () => {
    const s = ketchup();
    expect(maxCampaignGoods(view(s, 'p1'), 'p1', 'brand_manager', 'airplane')).toBe(2);
    expect(maxCampaignGoods(view(s, 'p1'), 'p1', 'brand_manager', 'mailbox')).toBe(1);
    expect(maxCampaignGoods(view(s, 'p1'), 'p1', 'brand_director', 'airplane')).toBe(1);
    s.players.p1!.milestones[BM] = { round: 1, phase: 'working' };
    s.milestones[BM]!.claimedBy.push('p1');
    expect(maxCampaignGoods(view(s, 'p1'), 'p1', 'brand_manager', 'airplane')).toBe(1);
    // Without the module: always one good.
    const base = FIXTURES.working();
    expect(maxCampaignGoods(view(base, 'p2'), 'p2', 'brand_manager', 'airplane')).toBe(1);
  });

  it('good chips: A then B, toggle off, B replaced when full, single choice otherwise', () => {
    expect(toggleGood([], 'burger', 2)).toEqual(['burger']);
    expect(toggleGood(['burger'], 'beer', 2)).toEqual(['burger', 'beer']);
    expect(toggleGood(['burger', 'beer'], 'pizza', 2)).toEqual(['burger', 'pizza']);
    expect(toggleGood(['burger', 'beer'], 'burger', 2)).toEqual(['beer']);
    expect(toggleGood(['burger'], 'beer', 1)).toEqual(['beer']);
  });
});

describe('held pick (gourmet guide, KX p27)', () => {
  const spot = { kind: 'campaign', campaignKind: 'gourmetGuide', tileNumber: 17, placement: { kind: 'offBoard' } } as never;
  it('a pick before the good is held; choosing the good then asks for a confirm instead of launching', () => {
    expect(onPick(false)).toBe('hold');
    expect(pickStep(false, null)).toBe('chooseGood');
    expect(pickStep(false, spot)).toBe('confirmHeld');
    expect(pickStep(true, spot)).toBe('confirmHeld');
    expect(pickStep(true, null)).toBe('pickSpot');
    expect(onPick(true)).toBe('commit');
  });
});
