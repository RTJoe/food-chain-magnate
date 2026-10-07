/** Connection banner wording and the hot-seat end / reload guard (state/connection.ts). */
import { describe, expect, it } from 'vitest';
import { connectionBanner, hotseatAtRisk } from '../src/state/connection.js';

describe('connection banner', () => {
  it('another tab took the session: says so and offers "Use here"', () => {
    expect(connectionBanner('closed', 0, true)).toEqual({ text: 'This game is open in another tab.', action: 'Use here', tone: 'info' });
  });
  it('a plain disconnect keeps "Retry now"; connecting has no button; open has no banner', () => {
    expect(connectionBanner('closed', 0, false)?.action).toBe('Retry now');
    expect(connectionBanner('reconnecting', 3, false)?.text).toMatch(/attempt 3/);
    expect(connectionBanner('connecting', 0, false)?.action).toBeNull();
    expect(connectionBanner('open', 0, true)).toBeNull();
  });
});

describe('hot-seat guard', () => {
  it('only a running hot-seat game asks before ending or reloading', () => {
    expect(hotseatAtRisk('hotseat', true, false)).toBe(true);
    expect(hotseatAtRisk('hotseat', true, true)).toBe(false);
    expect(hotseatAtRisk('hotseat', false, false)).toBe(false);
    expect(hotseatAtRisk('online', true, false)).toBe(false);
    expect(hotseatAtRisk('tutorial', true, false)).toBe(false);
  });
});
