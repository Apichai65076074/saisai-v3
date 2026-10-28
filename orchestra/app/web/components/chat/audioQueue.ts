export type AudioClip = { seq: number; audioId: string; lang: string };

/** Buffer out-of-order replies. A missing sequence never plays its successor early. */
export class ChatAudioQueue {
  private pending = new Map<number, AudioClip>();
  private next = 1;
  private playing = false;
  private started = false;
  private blocked: AudioClip | null = null;
  private generation = 0;
  constructor(private play: (clip: AudioClip) => Promise<void>, private failed: () => void) {}
  reset() {
    this.generation++;
    this.pending.clear();
    this.next = 1;
    this.playing = false;
    this.started = false;
    this.blocked = null;
  }
  announce(seq: number) {
    // Both zero-based workers and the public 1,2,3 sequence are supported.
    if (seq === 0 && !this.started) this.next = 0;
  }
  add(clip: AudioClip) {
    this.announce(clip.seq);
    if (clip.seq < this.next || this.pending.has(clip.seq) || this.blocked?.seq === clip.seq) return;
    this.pending.set(clip.seq, clip);
    this.pump();
  }
  ended() { this.playing = false; this.pump(); }
  retry() {
    if (this.blocked) {
      this.next = this.blocked.seq;
      this.pending.set(this.blocked.seq, this.blocked);
      this.blocked = null;
      this.playing = false;
    }
    this.pump();
  }
  private pump() {
    if (this.playing || this.blocked) return;
    const clip = this.pending.get(this.next);
    if (!clip) return;
    this.pending.delete(this.next);
    this.next++;
    this.playing = true;
    this.started = true;
    const generation = this.generation;
    void this.play(clip).catch(() => {
      if (generation !== this.generation) return;
      this.blocked = clip;
      this.failed();
    });
  }
}
