import assert from 'node:assert';
import test from 'node:test';
import {
  calculateEffectiveVolume,
  toggleTrackSolo,
  toggleTrackMute
} from '../audioMixer.js';

test('calculateEffectiveVolume - Normal mix without solo or mute', () => {
  const vol = calculateEffectiveVolume({
    volume: 0.8,
    isMuted: false,
    isSoloed: false,
    isAnySoloed: false,
    masterVolume: 1.0
  });
  assert.strictEqual(vol, 0.8);
});

test('calculateEffectiveVolume - Respects master volume multiplier', () => {
  const vol = calculateEffectiveVolume({
    volume: 0.8,
    isMuted: false,
    isSoloed: false,
    isAnySoloed: false,
    masterVolume: 0.5
  });
  assert.strictEqual(vol, 0.4);
});

test('calculateEffectiveVolume - Muted track returns 0 in normal mix', () => {
  const vol = calculateEffectiveVolume({
    volume: 0.9,
    isMuted: true,
    isSoloed: false,
    isAnySoloed: false,
    masterVolume: 1.0
  });
  assert.strictEqual(vol, 0);
});

test('calculateEffectiveVolume - When any track is soloed, non-soloed tracks return 0', () => {
  const volNonSoloed = calculateEffectiveVolume({
    volume: 0.8,
    isMuted: false,
    isSoloed: false,
    isAnySoloed: true,
    masterVolume: 1.0
  });
  assert.strictEqual(volNonSoloed, 0);

  const volSoloed = calculateEffectiveVolume({
    volume: 0.8,
    isMuted: false,
    isSoloed: true,
    isAnySoloed: true,
    masterVolume: 1.0
  });
  assert.strictEqual(volSoloed, 0.8);
});

test('calculateEffectiveVolume - Soloed track that is also muted returns 0', () => {
  const vol = calculateEffectiveVolume({
    volume: 0.8,
    isMuted: true,
    isSoloed: true,
    isAnySoloed: true,
    masterVolume: 1.0
  });
  assert.strictEqual(vol, 0);
});

test('toggleTrackSolo - activates solo and automatically cancels mute', () => {
  const solos = { drums: false, vocals: false };
  const mutes = { drums: true, vocals: false };

  const result = toggleTrackSolo(solos, mutes, 'drums');
  assert.strictEqual(result.solos.drums, true);
  assert.strictEqual(result.mutes.drums, false, 'Mute should be automatically cancelled when solo is activated');
});

test('toggleTrackSolo - deactivates solo if already soloed', () => {
  const solos = { drums: true, vocals: false };
  const mutes = { drums: false, vocals: false };

  const result = toggleTrackSolo(solos, mutes, 'drums');
  assert.strictEqual(result.solos.drums, false);
});

test('toggleTrackMute - activates mute and automatically cancels solo', () => {
  const solos = { drums: true, vocals: false };
  const mutes = { drums: false, vocals: false };

  const result = toggleTrackMute(solos, mutes, 'drums');
  assert.strictEqual(result.mutes.drums, true);
  assert.strictEqual(result.solos.drums, false, 'Solo should be automatically cancelled when mute is activated');
});

test('toggleTrackMute - deactivates mute if already muted', () => {
  const solos = { drums: false, vocals: false };
  const mutes = { drums: true, vocals: false };

  const result = toggleTrackMute(solos, mutes, 'drums');
  assert.strictEqual(result.mutes.drums, false);
});
