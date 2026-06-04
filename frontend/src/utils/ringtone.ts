/**
 * Ringtone utility using Web Audio API
 * Generates outgoing and incoming call ringtones without external audio files
 */

class Ringtone {
  private audioContext: AudioContext | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private activeOscillators: OscillatorNode[] = [];

  private getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private playTone(frequency: number, duration: number, volume: number = 0.15, delay: number = 0) {
    try {
      const ctx = this.getContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      const startTime = ctx.currentTime + delay;
      const endTime = startTime + duration;

      // Smooth fade in/out to avoid clicks
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
      gainNode.gain.setValueAtTime(volume, endTime - 0.02);
      gainNode.gain.linearRampToValueAtTime(0, endTime);

      oscillator.start(startTime);
      oscillator.stop(endTime);

      this.activeOscillators.push(oscillator);
      oscillator.onended = () => {
        this.activeOscillators = this.activeOscillators.filter(o => o !== oscillator);
      };
    } catch (e) {
      // Silently fail if audio context is not available
    }
  }

  /**
   * Outgoing call ringtone — gentle "ring... ring..." 
   * Plays two short tones with a pause, repeating every 3 seconds
   */
  startOutgoing() {
    this.stop();

    const playPattern = () => {
      // Two-tone ring pattern (like a phone ringing on caller's end)
      this.playTone(440, 0.3, 0.12, 0);      // A4 tone
      this.playTone(480, 0.3, 0.12, 0.4);    // Slightly higher
      this.playTone(440, 0.3, 0.12, 1.0);    // A4 again
      this.playTone(480, 0.3, 0.12, 1.4);    // Higher again
    };

    playPattern();
    this.intervalId = setInterval(playPattern, 3500);
  }

  /**
   * Incoming call ringtone — urgent, attention-grabbing ring
   * Classic phone ring pattern with alternating frequencies
   */
  startIncoming() {
    this.stop();

    const playPattern = () => {
      // Urgent alternating ring pattern
      this.playTone(523, 0.12, 0.25, 0);     // C5
      this.playTone(659, 0.12, 0.25, 0.15);  // E5
      this.playTone(784, 0.12, 0.25, 0.30);  // G5
      this.playTone(659, 0.12, 0.25, 0.45);  // E5

      // Second burst after a short gap
      this.playTone(523, 0.12, 0.25, 0.75);  // C5
      this.playTone(659, 0.12, 0.25, 0.90);  // E5
      this.playTone(784, 0.12, 0.25, 1.05);  // G5
      this.playTone(659, 0.12, 0.25, 1.20);  // E5
    };

    playPattern();
    this.intervalId = setInterval(playPattern, 2000);
  }

  /**
   * Stop all ringtones
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Stop any active oscillators immediately
    this.activeOscillators.forEach(osc => {
      try { osc.stop(); } catch { /* already stopped */ }
    });
    this.activeOscillators = [];
  }
}

export const ringtone = new Ringtone();
