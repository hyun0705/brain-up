// core/utils.js
export const $ = (sel) => document.querySelector(sel);

export const TEST_DURATION_MS = 10000; // 테스트용 10초 (배포시 60000으로 변경)

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function nowMs() {
  return performance.now();
}

export function formatMMSS(totalMs) {
  const s = Math.max(0, Math.ceil(totalMs / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function genSeed() {
  return (Date.now() ^ (Math.random() * 1e9)) >>> 0;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function showCountdown(app) {
  for (let i = 3; i >= 1; i--) {
    app.innerHTML = `
      <section class="card">
        <div class="stimulusArea">
          <div class="countdown">${i}</div>
        </div>
      </section>
    `;
    await sleep(800);
  }
  app.innerHTML = `
    <section class="card">
      <div class="stimulusArea">
        <div class="countdown" style="font-size:48px;">시작!</div>
      </div>
    </section>
  `;
  await sleep(500);
}

export function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
