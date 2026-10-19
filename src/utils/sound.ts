/**
 * Audio cue utility for order execution and terminal alerts.
 * Uses the native HTML5 Audio API referencing the bundled audio file:
 * public/Order Filled - Sound Effect.mp3
 */

export function playOrderFilledSound(): void {
  if (typeof Audio === 'undefined') return
  try {
    const audio = new Audio('/Order Filled - Sound Effect.mp3')
    audio.volume = 0.75
    audio.play().catch((err) => {
      // Audio play may fail if the user hasn't interacted with the page yet (browser autoplay policy)
      console.debug('[Audio] Could not play order filled sound:', err)
    })
  } catch (err) {
    console.debug('[Audio] Error initializing audio player:', err)
  }
}
