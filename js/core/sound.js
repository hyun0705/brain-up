// core/sound.js
// Web Audio API 기반 사운드 시스템

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// 비프음 생성
function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.log('Sound not supported');
  }
}

// 정답 사운드 (상승하는 두 음)
export function playCorrect() {
  playTone(523, 0.1, 'sine', 0.2); // C5
  setTimeout(() => playTone(659, 0.15, 'sine', 0.2), 100); // E5
}

// 오답 사운드 (낮은 단일 음)
export function playWrong() {
  playTone(220, 0.2, 'square', 0.15); // A3
}

// 카운트다운 틱 사운드
export function playTick() {
  playTone(800, 0.05, 'sine', 0.1);
}

// 시작 사운드
export function playStart() {
  playTone(440, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(554, 0.1, 'sine', 0.2), 100);
  setTimeout(() => playTone(659, 0.15, 'sine', 0.2), 200);
}

// 완료 사운드
export function playComplete() {
  playTone(523, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(659, 0.1, 'sine', 0.2), 100);
  setTimeout(() => playTone(784, 0.1, 'sine', 0.2), 200);
  setTimeout(() => playTone(1047, 0.2, 'sine', 0.2), 300);
}

// 클릭 사운드
export function playClick() {
  playTone(600, 0.03, 'sine', 0.1);
}
