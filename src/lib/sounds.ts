let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try { ctx = new AudioContext() } catch { return null }
  }
  return ctx
}

function playTone(freq: number, gain: number, start: number, duration: number, ac: AudioContext) {
  const osc = ac.createOscillator()
  const gainNode = ac.createGain()
  osc.connect(gainNode)
  gainNode.connect(ac.destination)
  osc.frequency.value = freq
  osc.type = 'sine'
  gainNode.gain.setValueAtTime(0, ac.currentTime + start)
  gainNode.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + duration)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + duration + 0.05)
}

// Soft chime — 3 ascending tones, gentle
export function playComplete() {
  const ac = getCtx()
  if (!ac) return
  if (ac.state === 'suspended') ac.resume()
  const notes = [523.25, 659.25, 783.99] // C5, E5, G5
  notes.forEach((freq, i) => playTone(freq, 0.12, i * 0.12, 0.5, ac))
}

// Subtle click — for smaller actions
export function playClick() {
  const ac = getCtx()
  if (!ac) return
  if (ac.state === 'suspended') ac.resume()
  playTone(880, 0.06, 0, 0.15, ac)
}
