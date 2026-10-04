/**
 * Training cues: short beeps (Web Audio) and spoken cues (the browser's built-in speech
 * synthesis, fully local). The user is away from the screen during a round, so sound matters.
 */
const MUTE_KEY = 'footwork.muted';
let ctx: AudioContext | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // ignore
  }
  if (muted) window.speechSynthesis?.cancel();
}

/** Call from a user gesture (e.g. "I'm ready") so the browser allows audio later. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
  // iOS Safari only allows speech after one utterance started inside a tap.
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  } catch {
    // ignore
  }
}

export function beep(freq = 880, ms = 140, volume = 0.18) {
  if (isMuted() || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + ms / 1000 + 0.02);
}

/** Round start: a strong double beep. */
export const bell = () => {
  beep(1046, 220, 0.25);
  setTimeout(() => beep(1318, 320, 0.25), 180);
};

/**
 * Always an English voice. On a non-English system (e.g. Turkish Windows) the browser default
 * would read English text with the system voice, so pick one explicitly, preferring natural ones.
 */
let englishVoice: SpeechSynthesisVoice | null = null;
const PREFERRED = [/Aria.*Natural/i, /Jenny.*Natural/i, /Guy.*Natural/i, /Natural.*English/i, /Google US English/i, /Google UK English/i, /Zira/i, /David/i];

function pickEnglishVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  englishVoice =
    PREFERRED.map((re) => english.find((v) => re.test(v.name))).find(Boolean) ??
    english.find((v) => v.lang.toLowerCase() === 'en-us') ??
    english[0] ??
    null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickEnglishVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickEnglishVoice);
}

export function say(text: string) {
  if (isMuted() || !('speechSynthesis' in window)) return;
  if (!englishVoice) pickEnglishVoice();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = englishVoice?.lang ?? 'en-US';
  if (englishVoice) u.voice = englishVoice;
  u.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
