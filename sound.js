// 소리: 효과음과 배경 음악은 파일로 넣는다 (코드로 만드는 단음은 쓰지 않는다).
//  효과음: assets/sfx/manifest.json 에 '이름': '파일명'. 이름은 game.sfx('...') 로 부르는 것들 (slash, saber, shot, crit, kill, boom ...)
//  음악:   assets/bgm/manifest.json 에 '월드 번호': '파일명' (없으면 'default')
// 파일이 없으면 조용히 넘어간다. 소리 버튼으로 켜고 끈다.
const game = window.__game, KEY = 'mecha_girl_sound';
const GAP = { shot: 0.05, flame: 0.12, kill: 0.04, crit: 0.06, slash: 0.07, saber: 0.09, boom: 0.08, move: 0.08 };      // 같은 소리가 한꺼번에 겹치지 않게 하는 최소 간격(초)
const VOL = { shot: 0.35, flame: 0.4, kill: 0.5, slash: 0.6, saber: 0.7, crit: 0.8, boom: 0.9, burst: 1, skill: 0.9, level: 0.9, clear: 0.9, warn: 0.6, move: 0.5, dash: 0.8 };
let ctx = null, on = true, sfx = {}, bgm = {}, last = {}, turn = {}, music = null, musicKey = null;
try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* 저장을 못 쓰는 환경 */ }
const buffers = {};
const json = async url => { try { const r = await fetch(url); return r.ok ? await r.json() : {}; } catch (e) { return {}; } };
async function load(file) {
  if (file in buffers) return buffers[file];
  buffers[file] = null;
  try { buffers[file] = await ctx.decodeAudioData(await (await fetch(`assets/sfx/${file}`)).arrayBuffer()); } catch (e) { console.warn('효과음을 못 읽음', file); }
  return buffers[file];
}
async function unlock() {          // 브라우저는 첫 터치 뒤에야 소리를 낼 수 있다
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  [sfx, bgm] = await Promise.all([json('assets/sfx/manifest.json'), json('assets/bgm/manifest.json')]);
  for (const [k, v] of Object.entries(sfx)) if (!k.startsWith('_')) for (const f of [].concat(v)) load(f);
}
window.addEventListener('pointerdown', unlock, { passive: true });
game.audio = name => {
  if (!on || !ctx || !sfx[name]) return;
  const now = ctx.currentTime;
  if (now - (last[name] || -9) < (GAP[name] || 0.02)) return;
  last[name] = now;
  const files = [].concat(sfx[name]), buf = buffers[files[turn[name] = ((turn[name] || 0) + 1) % files.length]];
  if (!buf) return;
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = buf; src.playbackRate.value = 0.94 + Math.random() * 0.12;      // 매번 살짝 다른 높이로
  gain.gain.value = VOL[name] ?? 0.7;
  src.connect(gain).connect(ctx.destination); src.start();
};
function tick() {                  // 월드가 바뀌면 음악도 바뀐다
  const w = String(Math.floor(game.stage / 5)), file = bgm[w] || bgm.default, want = on && ctx && file && game.state !== 'start' ? file : null;
  if (want !== musicKey) {
    if (music) { music.pause(); music = null; }
    musicKey = want;
    if (want) { music = new Audio(`assets/bgm/${want}`); music.loop = true; music.volume = 0.45; music.play().catch(() => { musicKey = null; }); }
  }
}
setInterval(tick, 700);
const btn = document.getElementById('soundBtn');
const paint = () => { if (btn) btn.classList.toggle('off', !on); };
if (btn) btn.addEventListener('click', () => { on = !on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 무시 */ } paint(); unlock(); });
paint();
