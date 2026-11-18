/**
 * E2N Studio Audio Mixer & Track State Logic
 * Professional DAW-grade Solo / Mute / Volume Matrix
 */

/**
 * Calculates effective volume for a track based on mixer matrix
 * @param {Object} params
 * @param {number} params.volume - Track base volume (0 to 1)
 * @param {boolean} params.isMuted - Whether track is muted
 * @param {boolean} params.isSoloed - Whether track is soloed
 * @param {boolean} params.isAnySoloed - Whether any track in the session is soloed
 * @param {number} [params.masterVolume=1] - Master volume multiplier (0 to 1)
 * @returns {number} Effective volume (0 to 1)
 */
export function calculateEffectiveVolume({
  volume = 0.8,
  isMuted = false,
  isSoloed = false,
  isAnySoloed = false,
  masterVolume = 1
}) {
  const master = Math.max(0, Math.min(1, masterVolume));
  const base = Math.max(0, Math.min(1, volume));

  if (isAnySoloed) {
    // If any track is soloed, only soloed (and unmuted) tracks emit sound
    if (isSoloed && !isMuted) {
      return base * master;
    }
    return 0;
  }

  // Normal mix: mute silences the track
  if (isMuted) {
    return 0;
  }

  return base * master;
}

/**
 * Handles toggling solo on a track and un-mutes automatically if activating solo
 * @param {Record<string, boolean>} currentSolos
 * @param {Record<string, boolean>} currentMutes
 * @param {string} trackKey
 * @returns {{ solos: Record<string, boolean>, mutes: Record<string, boolean> }}
 */
export function toggleTrackSolo(currentSolos, currentMutes, trackKey) {
  const willBeSoloed = !currentSolos[trackKey];
  const newSolos = { ...currentSolos, [trackKey]: willBeSoloed };
  const newMutes = { ...currentMutes };

  // If activating solo, automatically cancel mute for this track
  if (willBeSoloed) {
    newMutes[trackKey] = false;
  }

  return { solos: newSolos, mutes: newMutes };
}

/**
 * Handles toggling mute on a track and cancels solo automatically if activating mute
 * @param {Record<string, boolean>} currentSolos
 * @param {Record<string, boolean>} currentMutes
 * @param {string} trackKey
 * @returns {{ solos: Record<string, boolean>, mutes: Record<string, boolean> }}
 */
export function toggleTrackMute(currentSolos, currentMutes, trackKey) {
  const willBeMuted = !currentMutes[trackKey];
  const newMutes = { ...currentMutes, [trackKey]: willBeMuted };
  const newSolos = { ...currentSolos };

  // If activating mute, automatically cancel solo for this track
  if (willBeMuted) {
    newSolos[trackKey] = false;
  }

  return { solos: newSolos, mutes: newMutes };
}
