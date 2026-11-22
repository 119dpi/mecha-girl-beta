// 스틸 라인 (STEEL LINE) — 3D 전투 프로토타입
// 둥근 행성 위를 무한 전진하며 지평선에서 다가오는 적을 격추한다. 기본은 전부 자동 전투.
// 게임 규칙은 부대 기준 평면 좌표 (x: 좌우, z: 앞쪽 거리)로 계산하고, 그릴 때만 구면 위에 올린다.
import * as THREE from './lib/three.module.min.js';

// ------------------------------------------------------------------ 설정
const R = 300;            // 행성 반지름 (작을수록 지평선이 가깝고 둥글다)
const SCROLL = 5;         // 전진 속도 (단위/초)
const METERS = 2;         // 1 단위 = 2 m
const VISIBLE_Z = 62;     // 이보다 먼 적은 아직 조준할 수 없다
const COLS = 6, ROWS = 3, COL_W = 3.0;
const COL_X = Array.from({ length: COLS }, (_, i) => (i - (COLS - 1) / 2) * COL_W);   // 가로 6칸. 칸은 화면에 그리지 않는다(규칙으로만 존재)
const ROW_Z = [10, 6.5, 3];   // 0 = 앞줄, 1 = 가운데, 2 = 뒷줄
const SHIELD_DELAY = 3, SHIELD_REGEN = 18, MOVE_CD = 0.5;
const PUSH_SPEED = 0.5, DASH_SPEED = 1.45, WALL_N = 4;     // 밀어붙일 때·돌진할 때 속도 비율, 이만큼 붙으면 멈춰 선다
const ART_STOP_Z = 36, BURST_DMG = 70, BURST_RADIUS = 3.2, ZONE_LEN = 500;
const SHELL_RADIUS = 1.45, SHELL_FLIGHT = 2.0, MAX_WARNED = 3, MAX_ART = 3;
const ATK_STEP = 0.05;     // 공격력·무기 레벨 한 단계의 피해 증가 (둘을 더한다)
const PATTERN_MUL = 2.4;      // 바닥 예고 공격의 피해 배율: 맞으면 체력+실드의 절반 이상이 날아간다(두 번 맞으면 쓰러진다). 그래야 피할 맛이 난다

// 소녀 한 명 = 캐릭터 + 무기 계열 하나. 장갑은 모두 같다(중갑 기준 하나). 무기는 계열 레벨이 오르면 진화한다.
const BASE = { hp: 190, sh: 90, moveCd: 0.5 };
const EVOLVE_LV = 10, EVOLVE2_LV = 30, CRIT_P = 0.14, CRIT_MUL = 2;      // 무기는 계열 레벨 10과 30에서 진화한다
const FIELD_R = 6, FIELD_DEF = 0.85, FIELD_CRIT = 0.08;      // 영역 전개: 반지름, 안에 선 아군이 받는 피해 배율, 크리티컬 확률 증가
const CATS = { melee: '근접', close: '근거리', support: '지원' };
const CAT_COLOR = { melee: 0xff7a6a, close: 0xffb04a, support: 0x6ef08c };
const LINES = {
  blade:  { name: '검', cat: 'melee', forms: ['sword', 'saber', 'dualsaber'], desc: '달라붙은 적을 벤다. 주변 8칸의 적까지 닿는다.' },
  gun:    { name: '총', cat: 'close', forms: ['pistol', 'rifle', 'gatling'], desc: '다가오는 적을 한 기씩 빠르게 쏜다.' },
  spread: { name: '산탄', cat: 'close', forms: ['shotgun', 'flamer', 'plasma'], desc: '가까운 적 여럿을 한꺼번에 태운다.' },
  heal:   { name: '수리', cat: 'support', forms: ['repair', 'drone', 'field'], desc: '공격하지 않고 아군의 실드와 체력을 고친다.' },
};
// 무기는 수치보다 액션이 다르다. 처음 형태끼리, 진화한 형태끼리는 한 기에게 주는 초당 피해가 비슷하다.
const WEAPONS = {
  sword:   { name: '칼', line: 'blade', cat: 'melee', rng: 4.8, cd: 0.42, dmg: 18, hits: 3, swing: 0.2, kb: 9, desc: '붙은 적 셋까지 빠르게 벤다.' },
  saber:   { name: '빔 샤벨', line: 'blade', cat: 'melee', rng: 5.6, cd: 0.6, dmg: 34, hits: 99, swing: 0.34, kb: 14, desc: '크게 휘둘러 주변의 적을 전부 벤다.' },
  pistol:  { name: '쌍권총', line: 'gun', cat: 'close', rng: 17, cd: 0.2, dmg: 8, kick: 0.5, kb: 2.5, desc: '양손으로 번갈아 쉬지 않고 쏜다.' },
  rifle:   { name: '라이플', line: 'gun', cat: 'close', rng: 34, cd: 0.9, burst: 8, gap: 0.055, dmg: 8.5, kick: 0.4, kb: 2.5, desc: '멀리서부터 여덟 발씩 이어 쏜다.' },
  shotgun: { name: '샷건', line: 'spread', cat: 'close', rng: 15, cd: 0.85, dmg: 7, kick: 1.1, kb: 12, desc: '가까운 적 여럿을 쏜다. 가까울수록 강하다.' },
  flamer:  { name: '화염방사기', line: 'spread', cat: 'close', rng: 13, cd: 0.1, dmg: 5, cone: 0.42, kb: 1.2, desc: '부채꼴 안의 적을 계속 태운다.' },
  // 30레벨 진화
  dualsaber: { name: '빔 샤벨 쌍칼', line: 'blade', cat: 'melee', rng: 5.8, cd: 0.44, dmg: 34, hits: 99, swing: 0.24, kb: 14, desc: '양손의 빔 샤벨을 번갈아 휘둘러 쉴 새 없이 주변을 벤다.' },
  gatling: { name: '게틀링건', line: 'gun', cat: 'close', rng: 34, cd: 0.075, dmg: 5.2, kick: 0.22, kb: 2, desc: '멀리서부터 끊임없이 퍼붓는다.' },
  plasma:  { name: '더블 플라즈마 방사기', line: 'spread', cat: 'close', rng: 15, cd: 0.1, dmg: 6.8, cone: 0.55, kb: 1.4, desc: '두 줄기 플라즈마로 넓은 부채꼴을 태운다.' },
  field:   { name: '영역 전개', line: 'heal', cat: 'support', desc: '부대 전체를 고치고, 발밑에 영역을 펼친다. 영역 안의 아군은 받는 피해 -15%, 크리티컬 확률 +8%.' },
  repair:  { name: '수리 장치', line: 'heal', cat: 'support', desc: '이웃한 아군의 실드와 체력을 고친다.' },
  drone:   { name: '수리 드론', line: 'heal', cat: 'support', desc: '이웃만이 아니라 부대 전체를 고친다 (멀리 있는 아군은 60%).' },
};
const W_ICON = {
  sword:   '<path d="M6 21 25 4l2 1-1 2L9 24z" fill="#e8ecf8"/><path d="M5 18l6 6-2 2-6-6z" fill="#9aa2b8"/>',
  saber:   '<path d="M11 19 27 4" stroke="#ff7ad8" stroke-width="3.2" stroke-linecap="round"/><path d="M11 19 27 4" stroke="#ffe0f6" stroke-width="1.2" stroke-linecap="round"/><path d="M5 25l6-6 2 2-6 6z" fill="#c3cae0"/>',
  pistol:  '<path d="M3 6h15v4h-8l-1 2H8l-1 6H3l1-7z" fill="#e8ecf8"/><path d="M16 13h15v4h-8l-1 2h-1l-1 6h-4l1-7z" fill="#c3cae0"/>',
  rifle:   '<path d="M2 12h6l2-2h18v2h4v2h-6l-2 2h-6l-1 6h-3l1-6h-3l-3 4H4l2-5H2z" fill="#e8ecf8"/>',
  shotgun: '<path d="M2 11h30v4H18v2h-6l-4 5H3l3-6H2z" fill="#e8ecf8"/><rect x="20" y="15" width="8" height="3" fill="#9aa2b8"/>',
  flamer:  '<path d="M2 12h16v5h-6l-3 6H5l2-6H2z" fill="#e8ecf8"/><path d="M19 14c4-7 8 0 13-4-1 5-3 9-7 9-3 0-5-2-6-5z" fill="#ff9a3c"/><path d="M21 15c3-3 5 0 7-2-1 3-2 4-4 4-1 0-2-1-3-2z" fill="#ffe27a"/>',
  dualsaber: '<path d="M8 22 26 4" stroke="#ff7ad8" stroke-width="3" stroke-linecap="round"/><path d="M26 22 8 4" stroke="#7ad8ff" stroke-width="3" stroke-linecap="round"/><path d="M8 22 26 4M26 22 8 4" stroke="#fff" stroke-width="1" stroke-linecap="round"/><circle cx="6" cy="24" r="2.4" fill="#c3cae0"/><circle cx="28" cy="24" r="2.4" fill="#c3cae0"/>',
  gatling: '<rect x="2" y="10" width="11" height="9" rx="2" fill="#e8ecf8"/><path d="M13 11h18M13 14.5h19M13 18h18" stroke="#e8ecf8" stroke-width="2.2"/><rect x="27" y="9.5" width="2.5" height="10" fill="#9aa2b8"/><circle cx="7" cy="22" r="3.5" fill="#9aa2b8"/>',
  plasma:  '<path d="M2 9h14v4H2zM2 15h14v4H2z" fill="#e8ecf8"/><path d="M17 11c5-5 9 1 15-2-2 4-4 6-8 6-3 0-5-2-7-4z" fill="#7ad8ff"/><path d="M17 17c5 5 9-1 15 2-2-4-4-6-8-6-3 0-5 2-7 4z" fill="#c88cff"/>',
  field:   '<ellipse cx="17" cy="19" rx="14" ry="6" fill="none" stroke="#6ef08c" stroke-width="2.2"/><ellipse cx="17" cy="19" rx="8" ry="3.2" fill="#6ef08c" fill-opacity=".45"/><path d="M17 3v10M12 8h10" stroke="#e8ecf8" stroke-width="2.8"/>',
  repair:  '<rect x="7" y="2" width="20" height="24" rx="4" fill="none" stroke="#e8ecf8" stroke-width="2.4"/><path d="M17 8v12M11 14h12" stroke="#e8ecf8" stroke-width="3.2"/>',
  drone:   '<circle cx="17" cy="14" r="7" fill="none" stroke="#e8ecf8" stroke-width="2.4"/><path d="M17 10v8M13 14h8" stroke="#6ef08c" stroke-width="2.6"/><path d="M3 8h8M23 8h8M3 20h8M23 20h8" stroke="#e8ecf8" stroke-width="2.2" stroke-linecap="round"/>',
};
const UP_ICON = {
  atk: '<path d="M6 22 22 6l4 0 0 4L10 26z" fill="#ff9a8a"/><path d="M5 19l8 8-3 2-7-7z" fill="#c3cae0"/>',
  hp:  '<path d="M16 27C6 19 4 14 4 10a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 4-2 9-12 17z" fill="#6ef08c"/>',
  sh:  '<path d="M16 3 27 7v8c0 7-5 11-11 13C10 26 5 22 5 15V7z" fill="none" stroke="#60c8ff" stroke-width="3"/>',
  def: '<path d="M16 3 27 7v8c0 7-5 11-11 13C10 26 5 22 5 15V7z" fill="#c3cae0"/><path d="M16 8v15M10 14h12" stroke="#2a2f4c" stroke-width="2.4"/>',
  spd: '<path d="M4 9h13l-3-4h5l7 9-7 9h-5l3-4H4z" fill="#ffdc5a"/>',
};
// 업그레이드는 다섯 가지뿐(부대 전체에 적용) + 무기 계열 레벨. 모두 파티 레벨까지만 올릴 수 있다. 자원은 '부품' 하나.
const UPS = {
  atk: { name: '공격력', desc: lv => `모든 피해 +${lv * 5}%` },
  hp:  { name: 'HP', desc: lv => `최대 체력 +${lv * 8}%` },
  sh:  { name: '실드', desc: lv => `실드량 +${lv * 10}%, 회복 +${lv * 6}%` },
  def: { name: '방어력', desc: lv => `받는 피해 -${Math.round((1 - 1 / (1 + 0.05 * lv)) * 100)}%` },
  spd: { name: '공격 속도', desc: lv => `공격 속도 +${lv * 2}%` },
};
const upCost = lv => LEVEL.upCost(lv), wCost = lv => LEVEL.wCost(lv), xpNeed = lv => LEVEL.xpNeed(lv);     // 값은 아래 LEVEL 에 모여 있다
const lineDesc = (line, lv) => line === 'heal' ? `회복량 +${lv * 3}%` : `피해 +${lv * 5}%`;
const WEAPON_TAG = { sword: '근접 · 셋까지', saber: '근접 · 주변 전체', pistol: '쉬지 않는 연사', rifle: '멀리 · 8발 연사', shotgun: '산탄 · 가까울수록 강함',
  flamer: '부채꼴 지속 화염', repair: '이웃 아군 수리', drone: '부대 전체 수리',
  dualsaber: '쌍칼 · 쉴 새 없이 전부', gatling: '멀리 · 끊임없는 연사', plasma: '넓은 부채꼴 플라즈마', field: '수리 + 영역(피해↓ 크리↑)' };
// 캐릭터 고유 스킬 (무기를 바꿔도 그대로). 카드가 다 차면 카드를 눌러 쓴다.
const SKILLS = {
  OPUS:   { name: '오버드라이브', cd: 20, desc: '6초 동안 부대 전체의 공격 속도가 60% 오른다.' },
  SONNET: { name: '방벽', cd: 24, desc: '부대 전체의 실드를 즉시 채우고 4초 동안 받는 피해가 60% 줄어든다.' },
  HAIKU:  { name: '질풍 돌격', cd: 12, desc: '앞으로 순식간에 치고 나가며 지나간 줄의 적을 모두 벤다.' },
  FABLE:  { name: '꽃불 폭격', cd: 16, desc: '적이 가장 몰린 곳에 큰 폭발을 세 번 떨어뜨린다.' },
};
// 캐릭터는 아직 설정 전이라 이름은 임시다. 머리(색과 모양)만 서로 다르다.
const CHARS = [
  { name: 'OPUS', label: 'ARIA', tag: 'O', hair: 0xecd3b4, eye: '#c8603a', style: 'twin', color: '#5a8cff', portrait: 'A' },     // name: 내부 이름(그림 폴더·스킬 표의 열쇠), label: 화면에 보이는 이름. color: 머리 위 글자·발밑 고리·카드의 캐릭터 색
  { name: 'SONNET', label: 'LYRA', tag: 'S', hair: 0x5a3638, eye: '#8a5a3a', style: 'bob', color: '#3ed0cc', portrait: 'B' },    // 그림은 assets/concepts/이름.webp (시안 시트)
  { name: 'HAIKU', label: 'YUKI', tag: 'H', hair: 0xeee9ee, eye: '#f0901e', style: 'pony', color: '#ffb02e', portrait: 'C' },
  { name: 'FABLE', label: 'FLORA', tag: 'F', hair: 0x8e5c46, eye: '#c8682a', style: 'twin', color: '#ff7a5a', portrait: 'D' },
];
const DEFAULT_LOADOUT = [
  { char: 0, line: 'blade', col: 2, row: 0 },
  { char: 1, line: 'gun', col: 1, row: 1 },
  { char: 2, line: 'blade', col: 3, row: 0 },
  { char: 3, line: 'spread', col: 4, row: 1 },
];
const STAGE_LEN = 300;      // 스테이지 하나의 길이(m). 5번째 스테이지는 보스
const SAVE_KEY = new URLSearchParams(location.search).has('armored') ? 'mecha_girl_armored_preview_v1' : 'mecha_girl_save_v2';
const stageName = n => `${Math.floor(n / 5) + 1}-${n % 5 + 1}`;
function loadSave() {
  try {
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (sv && sv.v === 2 && Array.isArray(sv.loadout) && sv.loadout.length === 4 && sv.loadout.every(l => CHARS[l.char] && LINES[l.line])) return sv;
  } catch (e) { /* 저장을 못 쓰는 환경이면 그냥 기본값으로 */ }
  return null;
}
// 적의 원형. melee: 달라붙어 때린다 / shot: 멈춰 서서 총을 쏜다(피할 수 없는 잔피해) / ranged: 멈춰 서서 예고 공격(pat)을 한다 / fly: 떠 있다. kb: 맞았을 때 밀리는 정도.
const ENEMIES = {
  swarm:  { name: '졸개', hp: 30, walk: 5.4, color: 0xff7a6a, dmg: 10, atkCd: 0.8, aim: 0.6, melee: true, xp: 1, parts: 1, kb: 1.4, size: 0.85 },
  grunt:  { name: '기본형', hp: 85, walk: 3.4, color: 0xff5a5a, dmg: 22, atkCd: 0.9, aim: 1.0, melee: true, xp: 2, parts: 1, kb: 1, size: 1.2 },
  tank:   { name: '중장형', hp: 230, walk: 2.2, color: 0xc8506e, dmg: 50, atkCd: 1.3, aim: 1.4, melee: true, xp: 8, parts: 5, kb: 0.3, size: 1.3 },
  gunner: { name: '사격형', hp: 90, walk: 3.8, color: 0xff6aa0, dmg: 16, atkCd: 1.5, aim: 1.2, shot: true, xp: 3, parts: 2, kb: 0.8, size: 1.1 },
  rusher: { name: '돌격형', hp: 40, walk: 10, color: 0xffa83c, dmg: 70, radius: 2.4, aim: 0.8, xp: 2, parts: 1, kb: 0.5, size: 1.2 },
  art:    { name: '포격형', hp: 100, walk: 2.6, color: 0xb46eff, dmg: 45, atkCd: 4.0, aim: 0.9, ranged: true, pat: ['cell'], xp: 5, parts: 3, kb: 0.25, size: 1.0 },
  sniper: { name: '저격형', hp: 90, walk: 2.8, color: 0x5ad0ff, dmg: 54, atkCd: 4.8, aim: 1.7, ranged: true, pat: ['col'], xp: 5, parts: 3, kb: 0.3, size: 1.2 },
  bomber: { name: '폭격형', hp: 95, walk: 3.2, color: 0xffd24a, dmg: 42, atkCd: 5.6, aim: 3.0, ranged: true, fly: true, pat: ['row'], xp: 6, parts: 3, kb: 0.4, size: 1.25 },
  boss:   { name: '대형 기체', hp: 900, walk: 1.6, color: 0xff3c78, dmg: 45, atkCd: 2.4, aim: 2.4, ranged: true, pat: ['cell'], xp: 60, parts: 30, kb: 0, size: 2.2 },
};
// 월드(5스테이지)마다 배경·바닥 무늬·지형지물·적의 생김새(skin)·특수 적(sp)·보스의 공격 패턴이 다르다.
const ZONES = [
  { name: '청록 평원', skyTop: '#0c1030', fog: 0x5a6cb4, ground: 0x4a8c92, glow: 0x78e1f0, rock: 0x5a5f72, prop: 'pole', tex: 0, skin: 0, tint: 0,
    sp: ['art'], boss: '포격 전차', bossPat: ['cell', 'col'] },
  { name: '붉은 황무지', skyTop: '#1e0e22', fog: 0xc0705a, ground: 0xa86450, glow: 0xffb878, rock: 0x7a4a3c, prop: 'spire', tex: 1, skin: 1, tint: 0.04,
    sp: ['sniper', 'art'], boss: '가시 군주', bossPat: ['col', 'pair', 'cell'] },
  { name: '보랏빛 빙원', skyTop: '#080820', fog: 0x6a5cc0, ground: 0x6870c0, glow: 0xbaaaff, rock: 0x8a90c8, prop: 'crystal', tex: 2, skin: 2, tint: 0.62,
    sp: ['bomber', 'art'], boss: '빙결 요새', bossPat: ['row', 'cell', 'cross'] },
  { name: '황금 사막', skyTop: '#2a1c3a', fog: 0xd8a868, ground: 0xc8a25a, glow: 0xfff0a0, rock: 0x9a7a4a, prop: 'ruin', tex: 1, skin: 0, tint: 0.1,
    sp: ['sniper', 'bomber'], boss: '모래 폭군', bossPat: ['col', 'row', 'checker'] },
  { name: '독안개 늪', skyTop: '#06140e', fog: 0x4a8a5a, ground: 0x3e6e4a, glow: 0x9aff7a, rock: 0x35503c, prop: 'spire', tex: 2, skin: 1, tint: 0.3,
    sp: ['art', 'bomber', 'sniper'], boss: '맹독 여왕', bossPat: ['cross', 'checker', 'pair'] },
  { name: '심홍 화산', skyTop: '#140406', fog: 0x8a3030, ground: 0x4a2a2e, glow: 0xff6a3a, rock: 0x2a1a1c, prop: 'crystal', tex: 0, skin: 2, tint: 0.95,
    sp: ['sniper', 'art', 'bomber'], boss: '용암 거신', bossPat: ['cell', 'col', 'row', 'cross', 'checker', 'pair'] },
];
// ---- 레벨 디자인: 스테이지 번호 n(0부터)만으로 적의 세기와 구성이 정해진다. 난이도 수치는 전부 여기 모여 있다.
const LEVEL = {
  hp: n => (1 + 0.05 * n) ** 1.5,                    // 적 체력 배율 (계단 없이 완만하게. 피해 강화를 더하기로 바꾸면서 2 → 1.5)
  dmg: n => 1.45 * (1 + 0.045 * n) ** 1.7,                      // 적 공격력 배율
  rate: n => Math.min(3.6, 2.2 + 0.04 * n),             // 초당 출현 묶음 수
  pack: n => 5 + Math.min(3, Math.floor(n / 8)),        // 졸개 한 묶음의 수
  maxRanged: n => Math.min(5, 2 + Math.floor(n / 5)),   // 동시에 서 있는 예고 공격 적의 수 (1-2부터 둘, 5스테이지마다 하나씩 늘어 최대 다섯)
  maxAlive: 72,                                         // 화면의 적 수 상한 (기기 부담)
  bossHp: n => 2.7 * (1 + 0.05 * n) ** 1.5 * (1 + 0.08 * Math.floor(n / 5)),      // 보스 체력 배율 (보스전 40~55초 기준)
  parts: n => 1 + 0.08 * n,                             // 부품·경험치 보상 배율
  clearBonus: n => Math.round(12 + 4 * n),
  cost: (b, lv) => Math.round(b * 1.17 ** Math.min(lv, 12) * (1 + 0.09 * Math.max(0, lv - 12))),     // 가격: 12레벨까지는 17%씩, 그 뒤로는 완만하게
  upCost: lv => LEVEL.cost(50, lv),                     // 업그레이드 가격
  wCost: lv => LEVEL.cost(60, lv),                      // 무기 레벨 가격
  xpNeed: lv => Math.round(45 * lv ** 1.45),            // 파티 레벨 lv → lv+1 에 필요한 경험치
};
function stageDef(n) {
  const world = Math.floor(n / 5), k = n % 5, zone = ZONES[world % ZONES.length], sp = zone.sp, lap = Math.floor(world / ZONES.length);
  // 월드 안에서 한 스테이지마다 새 요소가 더해진다: 졸개·기본형 → 돌격형 → 두 번째 예고 적 → 중장형 → 보스
  // 예고 공격을 하는 적(포격형·저격형·폭격형)은 일반 스테이지에도 꾸준히 나온다. 발밑 예고를 보고 피하는 것이 이 게임의 퍼즐이다.
  const mix = { swarm: 5, grunt: 3.5 };
  if (n >= 1 && k >= 1) mix.rusher = 1.6;
  if (n >= 2) mix.gunner = 1.2 + 0.3 * Math.min(4, world);
  if (n >= 1) mix[sp[0]] = 1.8 + 0.4 * k;                         // 1-2부터 매 스테이지. 월드 안에서 뒤로 갈수록 는다
  if (n >= 3 && k >= 2 && sp[1]) mix[sp[1]] = 0.9 + 0.3 * k;       // 두 번째 종류가 섞이면 피하는 방향이 달라진다
  if (n >= 3 && k >= 3) mix.tank = 0.7 + 0.1 * Math.min(6, world);
  if (k === 4) { mix.rusher = 1.2; if (world >= 1) mix.tank = 0.5; mix[sp[0]] = 1.1; if (sp[1]) mix[sp[1]] = 0.7; }      // 보스전은 보스가 예고 공격을 맡으므로 줄인다
  if (lap >= 1 && sp[2] && k >= 1) mix[sp[2]] = 1.0;
  return { n, world, k, zone, boss: k === 4, mix, hp: LEVEL.hp(n), dmg: LEVEL.dmg(n), rate: LEVEL.rate(n) * (k === 4 ? 0.7 : 1),
    pack: LEVEL.pack(n), maxRanged: LEVEL.maxRanged(n) };
}
const VIEWS = [
  { name: '상공', pos: [0, 21, 9], look: [0, 0, -12], tilt: 0.85 },      // 기본: 쿼터뷰 (약 45도로 내려다본다)
  { name: '전술', pos: [0, 12.5, 10.5], look: [0, 0, -15], tilt: 0.6 },     // tilt: 세로 화면에서 카메라를 드는 정도
  { name: '추적', pos: [0, 6.2, 8.5], look: [0, 2.6, -40], tilt: 0 },
];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ 렌더러 / 장면
const glCanvas = document.getElementById('gl');
const uiCanvas = document.getElementById('ui');
const ui = uiCanvas.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(ZONES[0].fog, 42, 118);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2500);
let W = 1, H = 1, camPull = 1, camTilt = 0, baseFov = 50;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  uiCanvas.width = W * dpr; uiCanvas.height = H * dpr;
  ui.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.aspect = W / H;
  // 세로로 긴 화면(폰)에서는 가로 6칸이 화면 폭에 꽉 차도록 당겨 잡는다 (6칸 밖은 쓰지 않으므로 여백을 두지 않는다).
  // 폰 세로(375×812) 기준으로 뒷줄 양 끝 칸의 한가운데가 화면 가장자리에서 약 33px 안쪽에 온다 (끝 칸에 선 소녀와 발밑 고리가 잘리지 않는 한도).
  // 예전(시야 70도)보다 약 1.36배 크게 보인다. 값을 바꾸면 끝 칸의 소녀가 잘리지 않는지 꼭 확인할 것.
  const narrow = clamp(1.5 - camera.aspect, 0, 1);
  camera.fov = baseFov = 50 + narrow * 6;
  camPull = 1.06 + narrow * 0.55;
  camTilt = narrow * 0.19;        // 세로 화면에서는 카메라를 살짝 들어 진영을 화면 아래쪽에 둔다 (위쪽은 다가오는 적이 보이는 자리)
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const hemi = new THREE.HemisphereLight(0xcfdcff, 0x3a3a4c, 1.25);
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(-40, 60, 35);
const hangarLight = new THREE.DirectionalLight(0xffffff, 0);     // 정비 화면에서 소녀의 앞면을 비추는 조명
hangarLight.position.set(8, 12, -40);
scene.add(hemi, sun, hangarLight);

function skyTexture(zone) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  const fog = '#' + zone.fog.toString(16).padStart(6, '0');
  grad.addColorStop(0, zone.skyTop);
  grad.addColorStop(0.42, fog);
  grad.addColorStop(1, fog);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
ZONES.forEach(z => { z.sky = skyTexture(z); });

// 별과 달
{
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const az = rand(0, Math.PI * 2), el = rand(0.12, 1.4);
    pos[i * 3] = Math.cos(az) * Math.cos(el) * 1200;
    pos[i * 3 + 1] = Math.sin(el) * 1200;
    pos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * 1200;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2, sizeAttenuation: false, fog: false })));
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(60, 2),
    new THREE.MeshBasicMaterial({ color: 0xf2e6e0, fog: false }));
  moon.position.set(330, 300, -1000);
  scene.add(moon);
}

// ------------------------------------------------------------------ 행성 (굴러오는 지구본)
function groundTexture(style) {      // 바닥 무늬 세 가지: 0 띠, 1 갈라진 땅, 2 육각 얼음판
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, 256, 256);
  if (style === 0) {
    g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, 128, 256);          // 진행 방향으로 번갈아 나오는 띠
    g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, 256, 4); g.fillRect(0, 0, 4, 256); g.fillRect(128, 0, 3, 256);
  } else if (style === 1) {
    g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(40,30,30,.55)'; g.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) {                                  // 갈라진 금
      let x = rand(0, 256), y = rand(0, 256);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += rand(-34, 34); y += rand(-34, 34); g.lineTo(x, y); }
      g.stroke();
    }
  } else {
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3;
    for (let r = -1; r < 5; r++) for (let q = -1; q < 5; q++) {    // 육각 판
      const cx = q * 64 + (r % 2 ? 32 : 0), cy = r * 55;
      g.beginPath();
      for (let k = 0; k < 7; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * 37, cy + Math.sin(a) * 37); }
      g.stroke();
      if ((q + r * 3) % 4 === 0) { g.fillStyle = 'rgba(0,0,0,.09)'; g.fill(); }
    }
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.12)';
    const s = rand(3, 12);
    g.fillRect(rand(0, 256), rand(0, 256), s, s * rand(0.5, 1.2));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.round(2 * Math.PI * R / 10), Math.round(Math.PI * R / 10));
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GROUND_TEX = [0, 1, 2].map(groundTexture);
const planetGeo = new THREE.SphereGeometry(R, 160, 96);
planetGeo.rotateZ(Math.PI / 2);   // 극을 좌우(X축)로 눕혀서 X축 회전이 곧 전진이 되게 한다
const planet = new THREE.Mesh(planetGeo, new THREE.MeshStandardMaterial({ map: GROUND_TEX[0], roughness: 1, metalness: 0 }));
planet.position.set(0, -R, 0);
scene.add(planet);

const glowMat = new THREE.MeshBasicMaterial({ color: ZONES[0].glow });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5f72, flatShading: true, roughness: 1 });
const PROPS = {};       // 월드마다 다른 지형지물 (행성에 붙어 함께 돈다). 그 월드의 것만 보인다.
{
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  const put = (mesh, i, lat, ang, sx, sy, sz, lift = 0, tilt = 0) => {
    const th = lat / R;
    n.set(Math.sin(th), Math.cos(th) * Math.cos(ang), Math.cos(th) * Math.sin(ang));
    dummy.position.copy(n).multiplyScalar(R + lift);
    dummy.quaternion.setFromUnitVectors(up, n);
    dummy.rotateY(rand(0, 6.28));
    if (tilt) dummy.rotateZ(rand(-tilt, tilt));
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  const side = (a = 11, b = 85) => (Math.random() < 0.5 ? -1 : 1) * rand(a, b);
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, 1500);
  for (let i = 0; i < rocks.count; i++) { const s = rand(0.4, 1.5); put(rocks, i, side(9), rand(0, 6.283), s, s * rand(0.35, 0.8), s); }
  planet.add(rocks);
  const group = (name, ...meshes) => { PROPS[name] = meshes; planet.add(...meshes); };
  // 평원: 표지등 기둥
  const poleGeo = new THREE.BoxGeometry(0.16, 2.6, 0.16); poleGeo.translate(0, 1.3, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x4a5068, flatShading: true }), 240);
  const lamps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 0), glowMat, 240);
  for (let i = 0; i < poles.count; i++) { const lat = side(), ang = rand(0, 6.283); put(poles, i, lat, ang, 1, 1, 1); put(lamps, i, lat, ang, 1, 1, 1, 2.75); }
  group('pole', poles, lamps);
  // 황무지·늪: 뾰족한 바위 기둥
  const spireGeo = new THREE.ConeGeometry(1, 1, 5); spireGeo.translate(0, 0.5, 0);
  const spires = new THREE.InstancedMesh(spireGeo, rockMat, 520);
  for (let i = 0; i < spires.count; i++) { const s = rand(0.5, 1.6); put(spires, i, side(12), rand(0, 6.283), s, s * rand(2.5, 6.5), s, 0, 0.35); }
  group('spire', spires);
  // 빙원·화산: 빛나는 결정
  const cryGeo = new THREE.OctahedronGeometry(1, 0); cryGeo.translate(0, 0.8, 0);
  const crystals = new THREE.InstancedMesh(cryGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, flatShading: true, roughness: 0.3 }), 460);
  for (let i = 0; i < crystals.count; i++) { const s = rand(0.35, 1.1); put(crystals, i, side(11), rand(0, 6.283), s, s * rand(1.8, 4.2), s, 0, 0.5); }
  group('crystal', crystals);
  // 사막: 무너진 기둥과 돌판
  const ruinGeo = new THREE.BoxGeometry(1, 1, 1); ruinGeo.translate(0, 0.5, 0);
  const ruins = new THREE.InstancedMesh(ruinGeo, rockMat, 420);
  for (let i = 0; i < ruins.count; i++) {
    const tall = Math.random() < 0.6, s = rand(0.7, 1.4);
    put(ruins, i, side(12), rand(0, 6.283), tall ? s : s * rand(2, 4), tall ? s * rand(3, 7) : s * 0.5, tall ? s : s * rand(1, 2), 0, tall ? 0.12 : 0);
  }
  group('ruin', ruins);
}

// 평면 좌표 (x, z, 높이) -> 구면 위 월드 좌표
const CENTER = new THREE.Vector3(0, -R, 0);
const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function surf(x, z, h, out) {
  const th = x / R, ph = z / R;
  _n.set(Math.sin(th), Math.cos(th) * Math.cos(ph), -Math.cos(th) * Math.sin(ph));
  return out.copy(_n).multiplyScalar(R + h).add(CENTER);
}
function place(obj, x, z, h = 0) {
  surf(x, z, h, obj.position);
  obj.quaternion.setFromUnitVectors(UP, _n);
}
function toScreen(x, z, h) {
  surf(x, z, h, _v).project(camera);
  if (_v.z > 1 || _v.z < -1) return null;
  return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H];
}

// ------------------------------------------------------------------ 로우폴리 모델 (코드로 조립)
const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.05, ...extra });
const MAT = {
  armor: M(0xf4f7ff), shade: M(0xb4c0e0), dark: M(0x4c556e), skin: M(0xffe0cc), eye: M(0x24224e),
  fin: M(0xffda5c, { emissive: 0x6a5200 }), flame: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xfff0a0 }), shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.33, depthWrite: false }),
  eyeGlow: new THREE.MeshBasicMaterial({ color: 0xffe070 }), cyan: new THREE.MeshBasicMaterial({ color: 0x70e6ff }),
  tread: M(0x3a2c56), steel: M(0xdfe6f4, { metalness: 0.5, roughness: 0.3 }),
  saber: new THREE.MeshBasicMaterial({ color: 0xff7ad8 }), heal: new THREE.MeshBasicMaterial({ color: 0x6ef08c }),
  buff: new THREE.MeshBasicMaterial({ color: 0xffdc5a }),
};
const addMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const JET = { outer: addMat(0x4ac8ff, 0.7), inner: addMat(0xffffff, 0.9), feather: addMat(0x9fe8ff, 0.75) };
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ico0: new THREE.IcosahedronGeometry(1, 0), ico1: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1, 5), cone6: new THREE.ConeGeometry(1, 1, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8), skirt: new THREE.CylinderGeometry(0.2, 0.44, 0.34, 6),
  hairCap: new THREE.SphereGeometry(0.36, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
  shadow: new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
};
function part(geo, mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  return m;
}
const box = (mat, w, h, d, x, y, z) => part(GEO.box, mat, w, h, d, x, y, z);
function shadowBlob(r) { const s = part(GEO.shadow, MAT.shadow, r, 1, r, 0, 0.04, 0); s.renderOrder = 1; return s; }

// ------------------------------------------------------------------ 만화풍 표현 (단계 음영 + 외곽선)
const gradTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([165, 215, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const T = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradTex, ...extra });
const TOON = { armor: T(0xf6f8ff), shade: T(0xa9b7dc), dark: T(0x3c4460), suit: T(0x2a2e46), skin: T(0xffe2d0), steel: T(0xdde4f2),
  fin: T(0xffd84a, { emissive: 0x4a3800 }) };
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x15122a, side: THREE.BackSide });
const GEO2 = { sphere: new THREE.SphereGeometry(1, 20, 14), cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  face: new THREE.PlaneGeometry(0.5, 0.5), hairCap: new THREE.SphereGeometry(0.335, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
  ring: new THREE.TorusGeometry(0.3, 0.025, 6, 20) };
const capGeo = {};
function capsule(mat, r, len, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(capGeo[r + '_' + len] ||= new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  m.position.set(x, y, z);
  return m;
}
const ball = (mat, r, x, y, z, sx = 1, sy = 1, sz = 1) => part(GEO2.sphere, mat, r * sx, r * sy, r * sz, x, y, z);
const cylZ = (mat, r, len, x, y, z) => { const m = part(GEO2.cyl, mat, r, len, r, x, y, z); m.rotation.x = Math.PI / 2; return m; };
const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const noLine = o => { o.userData.noOutline = true; return o; };
// 모든 부품 뒤에 살짝 큰 검은 껍데기를 하나씩 붙여 외곽선을 만든다
function addOutline(root, t = 0.028) {
  const list = [];
  root.traverse(o => { if (o.isMesh && !o.userData.noOutline && !o.material.transparent) list.push(o); });
  const sz = new THREE.Vector3();
  for (const m of list) {
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    g.boundingBox.getSize(sz);
    const o = new THREE.Mesh(g, OUTLINE);
    o.scale.set(1 + 2 * t / Math.max(0.03, sz.x * Math.abs(m.scale.x)), 1 + 2 * t / Math.max(0.03, sz.y * Math.abs(m.scale.y)),
      1 + 2 * t / Math.max(0.03, sz.z * Math.abs(m.scale.z)));
    o.userData.noOutline = true;
    m.add(o);
  }
}
const faceMats = {};
function faceMat(eye) {      // 얼굴(눈, 입, 홍조)은 그림으로 그려서 머리 앞에 붙인다
  if (faceMats[eye]) return faceMats[eye];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const ell = (x, y, rx, ry, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  for (const x of [36, 92]) {
    ell(x, 62, 15, 20, '#251f44'); ell(x, 64, 12, 16, eye); ell(x, 58, 12, 10, 'rgba(20,16,50,.45)'); ell(x, 66, 6, 9, '#1a1636');
    ell(x - 5, 55, 5, 5, '#fff'); ell(x + 5, 72, 2.5, 2.5, '#fff');
    g.strokeStyle = '#251f44'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.arc(x, 66, 18, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 13, 33); g.quadraticCurveTo(x, 28, x + 13, 33); g.stroke();
    ell(x + (x < 64 ? -8 : 8), 90, 10, 5, 'rgba(255,120,140,.5)');
  }
  g.strokeStyle = '#a8455a'; g.lineWidth = 3; g.beginPath(); g.arc(64, 94, 6, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return faceMats[eye] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.2 });
}
function hairChain(mat, r, seg, n) {      // 여러 마디로 이어진 머리 다발 (마디마다 따로 흔들린다)
  const root = new THREE.Group(), segs = [];
  let parent = root, rr = r;
  for (let i = 0; i < n; i++) {
    const j = new THREE.Group();
    if (i) j.position.y = -seg;
    j.add(capsule(mat, +rr.toFixed(3), +(seg * 0.75).toFixed(3), 0, -seg / 2, 0));
    parent.add(j); segs.push(j); parent = j; rr *= 0.76;
  }
  return { root, segs, baseX: 0, baseZ: 0 };
}
// 무기는 -Z(앞)를 향하게 만든다. 반환: [그룹, 총구까지의 거리]
function buildWeapon(wid, acc) {
  const g = new THREE.Group(), D = TOON.dark, S = TOON.shade, A = TOON.armor;
  let muz = 0.4;
  if (wid === 'rifle') {
    g.add(box(D, 0.1, 0.14, 0.62, 0, 0, -0.28), box(S, 0.06, 0.07, 0.46, 0, 0.02, -0.8), box(D, 0.07, 0.22, 0.12, 0, -0.16, -0.22),
      box(S, 0.05, 0.07, 0.24, 0, 0.12, -0.28), box(D, 0.08, 0.12, 0.26, 0, -0.02, 0.14), box(acc, 0.105, 0.04, 0.3, 0, 0.03, -0.3));
    muz = 1.05;
  } else if (wid === 'shotgun') {
    g.add(box(D, 0.17, 0.15, 0.42, 0, 0, -0.14), cylZ(S, 0.045, 0.62, -0.045, 0.02, -0.58), cylZ(S, 0.045, 0.62, 0.045, 0.02, -0.58),
      box(A, 0.19, 0.09, 0.2, 0, -0.07, -0.5), part(GEO2.cyl, D, 0.12, 0.1, 0.12, 0, -0.14, -0.14), box(acc, 0.175, 0.04, 0.2, 0, 0.06, -0.14));
    muz = 0.9;
  } else if (wid === 'pistol') {
    g.add(box(D, 0.08, 0.11, 0.3, 0, 0.03, -0.16), box(D, 0.07, 0.15, 0.09, 0, -0.08, -0.03), box(acc, 0.085, 0.03, 0.14, 0, 0.07, -0.2));
    muz = 0.33;
  } else if (wid === 'flamer') {
    g.add(box(D, 0.16, 0.16, 0.5, 0, 0, -0.16), cylZ(S, 0.06, 0.7, 0, 0.02, -0.66), cylZ(D, 0.09, 0.14, 0, 0.02, -1.0), part(GEO2.cyl, acc, 0.11, 0.34, 0.11, 0, -0.2, -0.1),
      box(A, 0.17, 0.05, 0.3, 0, 0.09, -0.2), box(D, 0.07, 0.2, 0.1, 0, -0.15, 0.1), noLine(box(MAT.flame, 0.05, 0.05, 0.05, 0, 0.02, -1.08)));
    muz = 1.1;
  } else if (wid === 'gatling') {     // 여섯 총열이 도는 게틀링건
    const spin = new THREE.Group(); spin.position.set(0, 0, -0.72);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; spin.add(cylZ(S, 0.028, 0.95, Math.cos(a) * 0.072, Math.sin(a) * 0.072, 0)); }
    spin.add(cylZ(D, 0.105, 0.06, 0, 0, -0.42), cylZ(D, 0.105, 0.06, 0, 0, 0.1));
    g.add(spin, box(D, 0.22, 0.22, 0.5, 0, 0, -0.08), box(A, 0.23, 0.06, 0.32, 0, 0.1, -0.08), box(acc, 0.235, 0.04, 0.2, 0, 0.03, -0.1),
      rot(part(GEO2.cyl, D, 0.17, 0.14, 0.17, -0.2, -0.06, -0.05), 0, 0, Math.PI / 2), box(D, 0.07, 0.2, 0.1, 0, -0.18, 0.12));
    g.userData.spin = spin;
    muz = 1.25;
  } else if (wid === 'plasma') {      // 두 줄기 플라즈마 방사기
    for (const sx of [-0.085, 0.085]) {
      g.add(cylZ(S, 0.062, 0.78, sx, 0.02, -0.62), cylZ(D, 0.08, 0.12, sx, 0.02, -1.0),
        noLine(box(sx < 0 ? MAT.cyan : MAT.saber, 0.035, 0.035, 0.6, sx, 0.02, -0.62)), noLine(part(GEO.ico0, sx < 0 ? MAT.cyan : MAT.saber, 0.06, 0.06, 0.06, sx, 0.02, -1.08)));
    }
    g.add(box(D, 0.3, 0.18, 0.46, 0, 0, -0.1), box(A, 0.31, 0.05, 0.3, 0, 0.1, -0.12), part(GEO2.cyl, acc, 0.1, 0.3, 0.1, 0, -0.2, -0.06), box(D, 0.07, 0.2, 0.1, 0, -0.16, 0.14));
    muz = 1.1;
  } else if (wid === 'sword') {
    g.add(box(TOON.steel, 0.04, 0.17, 1.2, 0, 0, -0.78), box(D, 0.07, 0.34, 0.07, 0, 0, -0.15), cylZ(D, 0.04, 0.22, 0, 0, 0), box(acc, 0.045, 0.06, 0.5, 0, 0, -0.5));
  } else if (wid === 'saber' || wid === 'dualsaber') {
    g.add(cylZ(D, 0.05, 0.26, 0, 0, 0), box(TOON.shade, 0.12, 0.12, 0.06, 0, 0, -0.15), noLine(box(MAT.saber, 0.09, 0.09, 1.4, 0, 0, -0.88)),
      noLine(box(MAT.flash, 0.035, 0.035, 1.36, 0, 0, -0.88)));
  }
  return [g, muz];
}
// 무기를 손에 쥐여 준다 (수리 장비는 등 위에 띄운다). 예전 소녀와 시안풍 소녀(girl2)가 같이 쓴다.
function attachWeapon(armL, armR, pack, wid, acc, orbY = 0.92) {
  const D = TOON.dark, cat = WEAPONS[wid].cat;
  const flash = new THREE.Group(), flash2 = new THREE.Group(), fmat = wid === 'flamer' ? MAT.flame : wid === 'plasma' ? MAT.cyan : MAT.flash;      // 총구 화염: 둥근 섬광 + 앞으로 뻗는 불꽃
  for (const f of [flash, flash2]) {
    f.add(noLine(part(GEO.ico0, fmat, 0.2, 0.2, 0.2)), noLine(rot(part(GEO.cone, fmat, 0.17, 0.75, 0.17, 0, 0, -0.42), -Math.PI / 2)));
    f.visible = false;
  }
  let melee = false, gun = false, twoHand = false, dual = false, orb = null, ring = null, wg = null, reach = 2;
  if (cat === 'support') {                     // 수리 장비: 등 위에 떠 있는 장치 (드론으로 진화하면 더 크고 고리가 둘)
    const big = wid !== 'repair';
    pack.add(box(D, 0.05, orbY - 0.42, 0.05, 0, (orbY - 0.42) / 2 + 0.25, 0.1));
    orb = noLine(ball(MAT.heal, big ? 0.27 : 0.2, 0, orbY, 0.1));
    ring = noLine(new THREE.Mesh(GEO2.ring, MAT.heal)); ring.position.set(0, orbY, 0.1); ring.scale.setScalar(big ? 1.8 : 1.25);
    if (big) { const r2 = noLine(new THREE.Mesh(GEO2.ring, MAT.heal)); r2.rotation.x = Math.PI / 2; r2.scale.setScalar(0.8); ring.add(r2); }
    if (wid === 'field') { const r3 = noLine(new THREE.Mesh(GEO2.ring, MAT.heal)); r3.rotation.y = Math.PI / 2; r3.scale.setScalar(1.25); ring.add(r3); }
    pack.add(orb, ring, flash);
  } else {                                     // 오른손에 든다 (쌍권총은 양손)
    let muz; [wg, muz] = buildWeapon(wid, acc);
    wg.position.set(0, -0.33, 0); wg.rotation.x = -Math.PI / 2;
    melee = cat === 'melee'; gun = !melee;
    const sc = melee || wid === 'pistol' ? 1.7 : 2.0;
    wg.scale.setScalar(sc);
    twoHand = ['rifle', 'shotgun', 'flamer', 'gatling', 'plasma'].includes(wid);
    flash.position.set(0, 0, -muz); if (wid === 'shotgun' || wid === 'flamer' || wid === 'plasma') flash.scale.setScalar(1.5); wg.add(flash); armR.el.add(wg);
    if (wid === 'pistol' || wid === 'dualsaber') {      // 양손 무기
      dual = true;
      const [w2] = buildWeapon(wid, acc);
      w2.position.set(0, -0.33, 0); w2.rotation.x = -Math.PI / 2; w2.scale.setScalar(sc);
      flash2.position.set(0, 0, -muz); w2.add(flash2); armL.el.add(w2);
    }
    reach = 0.55 + muz * sc;
  }
  return { flash, flash2, melee, gun, twoHand, dual, orb, ring, wg, reach, orbY };
}
// 시안풍 폴리곤 소녀(web/girl2.js)에 전투 장비를 단다: 손의 무기, 등판 아래의 얇은 부스터, 파티 레벨에 따라 자라는 날개, 분사.
// 몸(bare)의 관절 구조는 예전 소녀와 같아서 Girl.sync 의 동작이 그대로 먹는다.
function dressGirl2(bare, def, wid) {
  const m = bare, cat = WEAPONS[wid].cat, G = () => new THREE.Group();
  const A = T(def.armor), S = T(def.armor2), D = TOON.dark, LN = T(def.line, { emissive: def.line, emissiveIntensity: 0.25 });
  const acc = T(CAT_COLOR[cat], { emissive: CAT_COLOR[cat], emissiveIntensity: 0.5 });
  m.root.scale.setScalar(1.58);       // 가는 몸이라 전투 화면에서 묻히지 않게 조금 키운다
  m.root.add(shadowBlob(0.6));
  const pack = at(G(), 0, 0.2, 0.17); m.torso.add(pack);
  pack.add(box(D, 0.3, 0.09, 0.1, 0, -0.1, 0.03), box(A, 0.2, 0.07, 0.08, 0, -0.03, 0.05), box(LN, 0.1, 0.03, 0.02, 0, -0.03, 0.095));
  const flames = [], wings = [], jets = [];
  for (const s of [-1, 1]) {
    pack.add(part(GEO2.cyl, D, 0.05, 0.13, 0.05, s * 0.1, -0.2, 0.05), part(GEO2.cyl, S, 0.06, 0.03, 0.06, s * 0.1, -0.15, 0.05));
    const f = noLine(part(GEO.cone, MAT.flame, 0.04, 0.3, 0.04, s * 0.1, -0.4, 0.05));
    f.rotation.x = Math.PI; pack.add(f); flames.push(f);
    // 날개: 등판 옆에서 바깥·위로 펼친 칼날 모양 깃. 넓은 면이 뒤(카메라 쪽)를 보게 해서 위에서 내려다봐도 날개로 읽힌다.
    // 파티 레벨 단계마다 커지고, 높은 단계에서는 아래쪽으로 빛 깃털이 돋는다.
    const w = at(G(), s * 0.16, 0.06, 0.07), L = 0.74;
    const blade = (mat, wid, len, th, ang, dy = 0) => { const b = G(); b.rotation.z = -s * ang; b.position.y = dy; b.add(part(GEO.cone, mat, wid, len, th, 0, len * 0.5, 0)); return b; };
    w.add(blade(A, 0.12, L, 0.03, 0), blade(LN, 0.085, L * 0.74, 0.026, 0.38, -0.02), blade(S, 0.07, L * 0.5, 0.024, 0.78, -0.03),
      box(D, 0.11, 0.11, 0.07, 0, 0.0, 0), at(box(LN, 0.03, L * 0.5, 0.012, 0, L * 0.3, 0.02), 0, L * 0.3, 0.022));
    const fe = [];
    for (let k = 0; k < 3; k++) {
      const b = noLine(blade(JET.feather, 0.07, L * (0.95 - k * 0.14), 0.01, 1.1 + k * 0.3, -0.03));
      b.position.z = 0.02; b.visible = false; w.add(b); fe.push(b);
    }
    w.userData.feathers = fe; w.userData.baseZ = -s * 0.95; w.userData.baseX = 0.08;
    w.rotation.set(0.08, 0, w.userData.baseZ);
    pack.add(w); wings.push(w);
  }
  for (const [x, y, z, sc] of [[-0.1, -0.27, 0.07, 0.5], [0.1, -0.27, 0.07, 0.5], [-0.3, 0.1, 0.12, 0.42], [0.3, 0.1, 0.12, 0.42]]) {
    const j = at(G(), x, y, z); j.rotation.x = 2.1;
    j.add(noLine(part(GEO.cone, JET.outer, 0.15 * sc, 1, 0.15 * sc, 0, 0.5, 0)), noLine(part(GEO.cone, JET.inner, 0.07 * sc, 0.8, 0.07 * sc, 0, 0.4, 0)));
    j.visible = false; pack.add(j); jets.push(j);
  }
  const W = attachWeapon(m.armL, m.armR, pack, wid, acc, 1.08);
  addOutline(m.root);          // 새로 단 부품에만 외곽선이 붙는다 (몸은 자체 외곽선이 있다)
  return { ...m, tails: [], wings, flames, jets, ...W, armOut: 0.3 };
}
const CLOTH = { navy: T(0x2d3a70), white: T(0xf7f8fc), sock: T(0x22263c), shoe: T(0x3a2e3a) };
GEO2.skirt = new THREE.CylinderGeometry(0.16, 0.42, 0.3, 14);
// 소녀는 -Z(전진 방향)를 바라본다. 머리는 캐릭터, 몸은 바디, 손에는 무기.
// 컨셉: 가냘픈 소녀 + 몸집만 한 무장. 경장갑은 교복 차림에 커다란 무기와 백팩만, 중장갑은 그 위에 장갑을 둘렀다.
function buildGirl(cfg) {
  const ch = CHARS[cfg.char], heavy = true, wid = cfg.weapon, cat = WEAPONS[wid].cat;      // 장갑은 중갑 하나로 통일
  const hair = T(ch.hair), hairD = T(new THREE.Color(ch.hair).multiplyScalar(0.74).getHex());
  const acc = T(CAT_COLOR[cat], { emissive: CAT_COLOR[cat], emissiveIntensity: 0.5 });
  const A = TOON.armor, S = TOON.shade, D = TOON.dark, SK = TOON.skin, SU = TOON.suit, C = CLOTH;
  const k = heavy ? 1.2 : 1;
  const G = () => new THREE.Group();
  const root = G(), body = G();
  root.add(shadowBlob(heavy ? 0.82 : 0.56), body);

  // 골반과 다리 (발은 작게)
  const hips = at(G(), 0, 0.8, 0); body.add(hips);
  hips.add(ball(heavy ? SU : C.navy, 0.16, 0, 0, 0, 1.0, 0.8, 0.9));
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = at(G(), s * 0.11, -0.04, 0), knee = at(G(), 0, -0.36, 0);
    hip.add(capsule(SK, 0.078, 0.2, 0, -0.17, 0));
    if (heavy) {
      hip.add(box(A, 0.1, 0.2, 0.2, s * 0.09, -0.14, 0));
      knee.add(box(A, 0.27, 0.34, 0.3, 0, -0.16, 0), box(S, 0.21, 0.17, 0.11, 0, 0.01, -0.18), box(acc, 0.28, 0.05, 0.31, 0, -0.08, 0),
        box(S, 0.2, 0.09, 0.3, 0, -0.345, -0.04), box(D, 0.17, 0.22, 0.11, 0, -0.17, 0.19), noLine(box(MAT.flame, 0.09, 0.05, 0.06, 0, -0.3, 0.22)),
        box(A, 0.07, 0.28, 0.24, s * 0.17, -0.14, 0.02));
    } else {      // 니삭스에 작은 구두, 발목에만 메카 링
      knee.add(capsule(C.sock, 0.066, 0.2, 0, -0.15, 0), part(GEO2.cyl, C.white, 0.08, 0.04, 0.08, 0, -0.01, 0),
        part(GEO2.cyl, acc, 0.085, 0.04, 0.085, 0, -0.27, 0), box(C.shoe, 0.12, 0.08, 0.22, 0, -0.345, -0.035));
    }
    hip.add(knee); hips.add(hip); legs.push({ hip, knee });
  }
  if (heavy) {
    hips.add(rot(box(A, 0.22, 0.26, 0.05, 0, -0.06, -0.19), 0.3), rot(box(A, 0.36, 0.34, 0.06, 0, -0.1, 0.22), -0.45), box(acc, 0.08, 0.08, 0.06, 0, 0.02, -0.2));
    for (const s of [-1, 1]) hips.add(rot(box(A, 0.06, 0.38, 0.34, s * 0.3, -0.1, 0), 0, 0, s * 0.28), rot(box(acc, 0.065, 0.06, 0.35, s * 0.35, -0.2, 0), 0, 0, s * 0.28));
  } else {        // 주름 치마 + 허리 옆 작은 추진기
    hips.add(part(GEO2.skirt, C.navy, 1, 1, 1, 0, -0.1, 0), part(GEO2.cyl, acc, 0.425, 0.03, 0.425, 0, -0.245, 0));
    for (const s of [-1, 1]) hips.add(box(A, 0.09, 0.15, 0.2, s * 0.25, 0.04, 0.06), box(acc, 0.095, 0.04, 0.16, s * 0.25, 0.0, 0.06));
  }

  // 몸통
  const torso = at(G(), 0, 0.86, 0); body.add(torso);
  if (heavy) {
    torso.add(capsule(SU, 0.125, 0.14, 0, 0.14, 0), box(A, 0.56, 0.3, 0.38, 0, 0.4, 0), box(S, 0.38, 0.16, 0.08, 0, 0.42, -0.2),
      box(S, 0.38, 0.07, 0.3, 0, 0.58, 0), ball(acc, 0.06, 0, 0.36, -0.23));
  } else {        // 흰 셔츠에 남색 재킷, 리본
    torso.add(capsule(C.white, 0.112, 0.12, 0, 0.14, 0), box(C.navy, 0.4, 0.3, 0.27, 0, 0.4, 0), box(C.white, 0.14, 0.27, 0.04, 0, 0.41, -0.125),
      box(C.white, 0.36, 0.06, 0.25, 0, 0.57, 0), box(acc, 0.15, 0.07, 0.05, 0, 0.5, -0.15), box(acc, 0.05, 0.13, 0.04, 0, 0.42, -0.15));
  }
  torso.add(capsule(SK, 0.055, 0.06, 0, 0.66, 0));
  // 백팩: 추진기와 날개형 바인더 (중장갑은 미사일 포드까지)
  const pack = at(G(), 0, 0.42, heavy ? 0.24 : 0.17); torso.add(pack);
  const pk = heavy ? 1.2 : 0.82;
  pack.add(box(S, 0.5 * pk, 0.48 * pk, 0.3 * pk, 0, 0, 0.07), box(A, 0.34 * pk, 0.14 * pk, 0.26 * pk, 0, 0.29 * pk, 0.07), box(acc, 0.24 * pk, 0.22 * pk, 0.04, 0, 0.02, 0.07 + 0.16 * pk),
    box(D, 0.56 * pk, 0.1 * pk, 0.2 * pk, 0, -0.16 * pk, 0.07));
  if (heavy) for (const s of [-1, 1]) {
    pack.add(box(D, 0.24, 0.26, 0.4, s * 0.43, 0.36, 0.04), box(A, 0.26, 0.07, 0.42, s * 0.43, 0.52, 0.04));
    for (const dx of [-0.055, 0.055]) for (const dy of [0.31, 0.42]) pack.add(noLine(box(MAT.flame, 0.06, 0.06, 0.03, s * 0.43 + dx, dy, -0.17)));
  }
  const flames = [];
  for (const s of [-1, 1]) {
    pack.add(part(GEO2.cyl, D, 0.11 * pk, 0.24 * pk, 0.11 * pk, s * 0.14 * pk, -0.34 * pk, 0.1), part(GEO2.cyl, S, 0.13 * pk, 0.06, 0.13 * pk, s * 0.14 * pk, -0.24 * pk, 0.1));
    const f = noLine(part(GEO.cone, MAT.flame, 0.09 * pk, 0.4, 0.09 * pk, s * 0.14 * pk, -0.34 * pk - 0.28, 0.1));
    f.rotation.x = Math.PI; pack.add(f); flames.push(f);
  }
  const wings = [];
  for (const s of [-1, 1]) {
    const w = at(G(), s * 0.22 * pk, 0.12, 0.1), L = heavy ? 0.74 : 0.9;
    w.add(box(A, 0.1, L, 0.42, 0, L * 0.38, 0.06), box(S, 0.08, L * 0.6, 0.3, 0, -L * 0.22, 0.08), box(acc, 0.105, 0.1, 0.43, 0, L * 0.7, 0.06),
      box(D, 0.13, 0.2, 0.2, 0, 0.02, 0.04), box(S, 0.11, L * 0.5, 0.11, 0, L * 0.35, 0.28), box(D, 0.12, 0.15, 0.15, 0, L * 0.08, 0.28),
      box(acc, 0.105, L * 0.35, 0.06, 0, L * 0.35, -0.13));
    w.userData.baseZ = -s * 0.62;
    w.rotation.set(0.5, 0, w.userData.baseZ);
    const fe = [];                                 // 파티 레벨이 오르면 돋아나는 빛 깃털
    for (let k = 0; k < 3; k++) {
      const b = noLine(new THREE.Mesh(GEO.box, JET.feather));
      b.scale.set(0.035, 1.0 - k * 0.2, 0.22); b.position.set(0, L * 0.45 - k * 0.32, 0.36 + k * 0.06); b.rotation.x = -0.5 - k * 0.4;
      b.visible = false; w.add(b); fe.push(b);
    }
    w.userData.feathers = fe;
    pack.add(w); wings.push(w);
  }
  const jets = [];                                 // 부스터 분사: 달릴 때, 특히 돌진할 때 뒤쪽 아래로 길게 뿜는다
  for (const [x, y, z, sc] of [[-0.17, -0.5, 0.2, 1], [0.17, -0.5, 0.2, 1], [-0.6, 0.25, 0.4, 0.75], [0.6, 0.25, 0.4, 0.75]]) {
    const j = at(G(), x, y, z); j.rotation.x = 2.1;
    j.add(noLine(part(GEO.cone, JET.outer, 0.15 * sc, 1, 0.15 * sc, 0, 0.5, 0)), noLine(part(GEO.cone, JET.inner, 0.07 * sc, 0.8, 0.07 * sc, 0, 0.4, 0)));
    j.visible = false; pack.add(j); jets.push(j);
  }
  if (heavy) for (const s of [-1, 1]) {        // 중장갑: 어깨 옆에 매달린 대형 장갑판
    torso.add(box(S, 0.09, 0.86, 0.64, s * 0.66, 0.2, -0.04), box(A, 0.1, 0.52, 0.42, s * 0.7, 0.24, -0.04), box(acc, 0.11, 0.12, 0.43, s * 0.71, 0.5, -0.04));
  }
  // 팔: 어깨 -> 팔꿈치 -> 손
  const armed = cat !== 'support';
  const mkArm = s => {
    const sh = at(G(), s * (heavy ? 0.37 : 0.25), 0.5, 0), el = at(G(), 0, -0.3, 0);
    if (heavy) {
      sh.add(box(A, 0.38, 0.3, 0.42, s * 0.08, 0.03, 0), box(S, 0.42, 0.07, 0.46, s * 0.09, 0.2, 0), box(acc, 0.05, 0.16, 0.28, s * 0.3, 0.03, 0),
        rot(box(S, 0.24, 0.06, 0.34, s * 0.26, 0.24, 0), 0, 0, -s * 0.5), capsule(SK, 0.058, 0.14, 0, -0.17, 0));
      el.add(box(A, 0.25, 0.28, 0.27, 0, -0.14, 0), box(acc, 0.26, 0.045, 0.28, 0, -0.03, 0), box(S, 0.08, 0.2, 0.22, s * 0.15, -0.14, 0), ball(D, 0.085, 0, -0.33, 0));
    } else {
      sh.add(ball(C.navy, 0.1, 0, 0, 0), capsule(C.navy, 0.062, 0.14, 0, -0.16, 0));
      el.add(capsule(SK, 0.048, 0.16, 0, -0.13, 0), part(GEO2.cyl, C.white, 0.068, 0.05, 0.068, 0, -0.01, 0), ball(SK, 0.062, 0, -0.31, 0));
      if (s > 0 && armed) el.add(box(A, 0.15, 0.18, 0.17, 0, -0.15, 0), box(acc, 0.16, 0.04, 0.18, 0, -0.08, 0));       // 무기 드는 팔에만 보호대
    }
    sh.add(el); torso.add(sh);
    return { sh, el };
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const W = attachWeapon(armL, armR, pack, wid, acc);

  // 머리 = 캐릭터
  const head = at(G(), 0, 1.84, 0); body.add(head);
  head.scale.setScalar(1.24);
  head.add(ball(SK, 0.29, 0, 0, 0, 1, 0.96, 0.98));
  const face = noLine(new THREE.Mesh(GEO2.face, faceMat(ch.eye)));
  face.position.set(0, -0.03, -0.292); face.rotation.y = Math.PI; head.add(face);
  head.add(rot(new THREE.Mesh(GEO2.hairCap, hair), 0.42));
  for (const [x, len, tilt] of [[-0.2, 0.24, 0.3], [-0.1, 0.3, 0.12], [0, 0.24, 0], [0.1, 0.3, -0.12], [0.2, 0.24, -0.3]]) {      // 앞머리
    head.add(rot(part(GEO.cone6, hair, 0.075, len, 0.05, x, 0.24 - len / 2, -0.27 + Math.abs(x) * 0.3), Math.PI, 0, tilt));
  }
  for (const s of [-1, 1]) {
    head.add(capsule(hair, 0.05, 0.22, s * 0.27, -0.12, -0.1));                                  // 옆머리
    head.add(rot(part(GEO2.cyl, S, 0.085, 0.07, 0.085, s * 0.31, 0.02, 0.02), 0, 0, Math.PI / 2));   // 헤드기어
    head.add(rot(box(TOON.fin, 0.3, 0.055, 0.05, s * 0.15, 0.33, -0.2), 0, 0, s * 0.6));             // V자 안테나
  }
  head.add(box(S, 0.09, 0.1, 0.09, 0, 0.29, -0.25), rot(part(GEO.cone6, hair, 0.03, 0.2, 0.03, 0.03, 0.4, -0.02), 0, 0, -0.5));
  const tails = [];
  if (ch.style === 'twin') {
    for (const s of [-1, 1]) {
      const c = hairChain(hairD, 0.115, 0.3, 3);
      c.root.position.set(s * 0.33, 0.1, 0.08); c.baseZ = s * 0.38; c.baseX = -0.15;
      c.root.add(part(GEO2.cyl, acc, 0.1, 0.07, 0.1, 0, 0, 0));
      head.add(c.root); tails.push(c);
    }
  } else if (ch.style === 'pony') {
    const c = hairChain(hairD, 0.135, 0.34, 3);
    c.root.position.set(0, 0.14, 0.27); c.baseX = -0.65;
    c.root.add(part(GEO2.cyl, acc, 0.11, 0.07, 0.11, 0, 0, 0));
    head.add(c.root); tails.push(c);
  } else {
    head.add(ball(hairD, 0.3, 0, -0.1, 0.08, 1.12, 0.85, 1.0));          // 단발 뒷머리
  }
  addOutline(root);
  root.scale.setScalar(heavy ? 1.42 : 1.4);
  return { root, body, hips, torso, legs, armL, armR, head, tails, wings, flames, jets, ...W };
}

// 그림(일러스트) 캐릭터: 3D 세계 안에 항상 카메라를 향해 서 있는 납작한 그림으로 세운다.
// 그림 파일이 있는 종류는 그림을, 없으면 위의 로우폴리 모델을 쓴다.
// 그림 캐릭터 사용 여부. 조립식 그림 부품이 준비될 때까지는 폴리곤 모델을 쓴다(true 로 바꾸면 통짜 그림으로 돌아간다).
const USE_SPRITES = false;
const SPRITE_FILES = { guard: 'assets/girl_guard.png', rifle: 'assets/girl_striker.png', rail: 'assets/girl_rail.png' };
const SPRITE_HEIGHT = 3.2;
const texLoader = new THREE.TextureLoader();
function buildGirlSprite(kind) {
  const root = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ alphaTest: 0.5, transparent: false });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0.03);       // 발끝을 기준점으로
  sprite.visible = false;
  texLoader.load(SPRITE_FILES[kind], tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mat.map = tex; mat.needsUpdate = true;
    sprite.userData.aspect = tex.image.width / tex.image.height;
    sprite.visible = true;
  });
  const flash = part(GEO.ico0, MAT.flash, 0.24, 0.24, 0.24, 0.6, 1.6, -1.0);
  flash.visible = false;
  root.add(shadowBlob(1.0), sprite, flash);
  return { root, sprite, mat, flash };
}

// 적은 +Z(부대 쪽)를 바라본다. 같은 원형이라도 월드마다 색(tint)과 장식(skin: 0 민무늬, 1 가시, 2 결정)이 다르다.
function buildEnemy(kind, zone = ZONES[0]) {
  const spec = ENEMIES[kind], skin = zone.skin;
  const col = new THREE.Color(spec.color); if (zone.tint) col.offsetHSL(zone.tint, 0, 0);
  const bodyMat = M(col.getHex(), { emissive: 0x000000 });
  const root = new THREE.Group(), body = new THREE.Group();
  const legs = [];
  const D = MAT.dark;
  const spike = (x, y, z, s, rx = 0, rz = 0) => rot(part(GEO.cone, skin === 2 ? glowMat : D, 0.14 * s, 0.6 * s, 0.14 * s, x, y, z), rx, 0, rz);   // 월드 장식 하나
  const deco = (...list) => { if (skin) for (const a of list) body.add(noLine(spike(...a))); };
  if (kind === 'swarm') {            // 작고 빠른 떼. 부품 수를 아껴서 많이 나와도 가볍다
    root.add(shadowBlob(0.5), body);
    body.add(part(GEO.ico0, bodyMat, 0.46, 0.34, 0.56, 0, 0.62, 0), noLine(part(GEO.ico0, MAT.eyeGlow, 0.13, 0.1, 0.08, 0, 0.66, 0.5)));
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.3, 0.5, 0);
      leg.add(box(D, 0.12, 0.5, 0.14, s * 0.08, -0.25, 0.04));
      body.add(leg); legs.push(leg);
    }
    deco([0, 0.98, -0.1, 0.8]);
  } else if (kind === 'grunt') {
    root.add(shadowBlob(0.75), body);
    body.add(part(GEO.ico0, bodyMat, 0.62, 0.7, 0.62, 0, 1.15, 0));
    body.add(part(GEO.ico0, MAT.eyeGlow, 0.2, 0.2, 0.12, 0, 1.2, 0.52));
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.3, 0.7, 0);
      leg.add(box(D, 0.16, 0.7, 0.16, 0, -0.35, 0), box(D, 0.22, 0.1, 0.34, 0, -0.66, 0.06));
      body.add(leg); legs.push(leg);
      const claw = part(GEO.cone, D, 0.12, 0.6, 0.12, s * 0.72, 1.0, 0.25); claw.rotation.x = Math.PI / 2; body.add(claw);
    }
    deco([0, 1.95, 0, 1], [-0.4, 1.7, -0.1, 0.7, 0, 0.5], [0.4, 1.7, -0.1, 0.7, 0, -0.5]);
  } else if (kind === 'gunner') {    // 중거리에서 멈춰 서서 총을 쏜다
    root.add(shadowBlob(0.7), body);
    body.add(box(bodyMat, 0.7, 0.8, 0.6, 0, 1.2, 0), part(GEO.ico0, MAT.eyeGlow, 0.16, 0.1, 0.08, 0, 1.72, 0.3), box(D, 0.44, 0.3, 0.44, 0, 1.75, 0));
    const gun = part(GEO.cyl, D, 0.09, 1.3, 0.09, 0.42, 1.25, 0.6); gun.rotation.x = Math.PI / 2; body.add(gun, box(D, 0.2, 0.26, 0.5, 0.42, 1.25, 0.1));
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.22, 0.8, 0);
      leg.add(box(D, 0.16, 0.8, 0.18, 0, -0.4, 0), box(D, 0.2, 0.1, 0.32, 0, -0.76, 0.06));
      body.add(leg); legs.push(leg);
    }
    deco([-0.3, 2.0, 0, 0.7], [0.3, 2.0, 0, 0.7]);
  } else if (kind === 'tank') {      // 느리고 단단하다. 큰 방패를 앞세운다
    root.add(shadowBlob(1.0), body);
    body.add(box(bodyMat, 1.25, 1.05, 0.95, 0, 1.45, 0), box(D, 1.7, 1.55, 0.16, 0, 1.25, 0.72), box(bodyMat, 1.3, 0.16, 0.18, 0, 1.6, 0.74),
      part(GEO.ico0, MAT.eyeGlow, 0.2, 0.14, 0.1, 0, 2.15, 0.45), box(D, 0.6, 0.36, 0.6, 0, 2.12, 0));
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.42, 0.95, 0);
      leg.add(box(D, 0.36, 0.95, 0.4, 0, -0.47, 0), box(bodyMat, 0.42, 0.2, 0.56, 0, -0.86, 0.06));
      body.add(leg); legs.push(leg);
      body.add(box(D, 0.36, 0.5, 0.7, s * 0.82, 1.65, 0));
    }
    deco([-0.82, 2.1, 0, 1.1], [0.82, 2.1, 0, 1.1], [0, 2.5, 0, 0.9]);
  } else if (kind === 'rusher') {
    root.add(shadowBlob(0.55), body);
    const nose = part(GEO.cone, bodyMat, 0.42, 1.5, 0.42, 0, 0.85, 0.1); nose.rotation.x = Math.PI / 2; body.add(nose);
    for (let i = 0; i < 3; i++) {
      const fin = box(D, 0.06, 0.7, 0.5, 0, 0.85, -0.5);
      const g = new THREE.Group(); g.position.set(0, 0.85, 0); fin.position.set(0, 0.42, -0.5); g.add(fin);
      g.rotation.z = i * Math.PI * 2 / 3; body.add(g);
    }
    body.add(part(GEO.ico0, MAT.flame, 0.2, 0.2, 0.3, 0, 0.85, -0.75));
  } else if (kind === 'sniper') {    // 세 다리로 선 긴 포신. 세로 한 줄을 꿰뚫는다
    root.add(shadowBlob(0.9), body);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5; body.add(rot(box(D, 0.1, 1.7, 0.1, Math.sin(a) * 0.5, 0.8, Math.cos(a) * 0.5), Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55)); }
    body.add(part(GEO.ico0, bodyMat, 0.45, 0.4, 0.5, 0, 1.75, 0));
    const barrel = part(GEO.cyl, D, 0.1, 2.6, 0.1, 0, 1.8, 1.2); barrel.rotation.x = Math.PI / 2; body.add(barrel);
    body.add(noLine(part(GEO.ico0, MAT.cyan, 0.16, 0.16, 0.16, 0, 1.8, 2.5)), box(bodyMat, 0.2, 0.2, 0.5, 0, 1.8, 1.6));
    deco([0, 2.35, 0, 0.9], [0, 2.0, -0.5, 0.7, -1.2]);
  } else if (kind === 'bomber') {    // 떠서 다가와 가로 한 줄을 폭격한다
    root.add(shadowBlob(1.0), body);
    body.add(part(GEO.ico0, bodyMat, 0.95, 0.32, 0.8, 0, 0, 0), box(D, 2.6, 0.08, 0.6, 0, 0.02, -0.1), part(GEO.ico0, MAT.eyeGlow, 0.16, 0.12, 0.1, 0, -0.02, 0.74));
    for (const s of [-1, 1]) body.add(part(GEO.ico0, D, 0.22, 0.22, 0.34, s * 0.75, -0.3, 0), noLine(part(GEO.ico0, MAT.flame, 0.14, 0.14, 0.2, s * 1.25, 0.04, -0.45)));
    deco([-1.25, 0.25, -0.1, 0.8], [1.25, 0.25, -0.1, 0.8]);
    body.position.y = 2.4;
  } else if (kind === 'boss') {
    root.add(shadowBlob(1.9), body);
    body.add(box(MAT.tread, 2.6, 0.6, 2.8, 0, 0.35, 0), part(GEO.ico1, bodyMat, 1.1, 1.0, 1.1, 0, 1.5, 0));
    body.add(part(GEO.ico0, MAT.eyeGlow, 0.3, 0.3, 0.16, 0, 1.6, 0.98));
    for (const s of [-1, 1]) {
      const barrel = part(GEO.cyl, D, 0.17, 2.0, 0.17, s * 0.95, 2.1, 0.5); barrel.rotation.x = 0.85; body.add(barrel);
      body.add(box(D, 0.5, 0.5, 0.7, s * 0.95, 1.5, 0));
    }
    deco([0, 2.7, 0, 1.6], [-0.7, 2.4, -0.3, 1.2, 0, 0.5], [0.7, 2.4, -0.3, 1.2, 0, -0.5], [-1.3, 0.9, 0.6, 1.1, 0, 1.2], [1.3, 0.9, 0.6, 1.1, 0, -1.2]);
  } else {                           // 포격형
    root.add(shadowBlob(1.5), body);
    body.add(box(MAT.tread, 2.0, 0.5, 2.3, 0, 0.3, 0), box(bodyMat, 1.3, 0.55, 1.4, 0, 0.82, -0.1));
    const barrel = part(GEO.cyl, D, 0.16, 1.9, 0.16, 0, 1.55, 0.55); barrel.rotation.x = 0.85; body.add(barrel);
    body.add(part(GEO.ico0, MAT.eyeGlow, 0.16, 0.16, 0.1, 0, 0.9, 0.62));
    deco([-0.5, 1.3, -0.5, 0.8], [0.5, 1.3, -0.5, 0.8]);
  }
  addOutline(root, 0.035);
  root.scale.setScalar(spec.size);
  return { root, body, legs, bodyMat };
}

// ------------------------------------------------------------------ 이펙트
const tracerMats = {};
function tracerMat(color) {
  return tracerMats[color] ||= new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}
const PART_N = 900;
const partGeo = new THREE.BufferGeometry();
const partPos = new Float32Array(PART_N * 3).fill(-9999), partCol = new Float32Array(PART_N * 3);
partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
partGeo.setAttribute('color', new THREE.BufferAttribute(partCol, 3));
const partMesh = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 0.34, vertexColors: true, depthWrite: false }));
partMesh.frustumCulled = false;
scene.add(partMesh);
const discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2);
const arcGeo = new THREE.RingGeometry(0.5, 1, 30, 1, Math.PI / 2 - 1.3, 2.6).rotateX(-Math.PI / 2);     // 앞쪽으로 벌어진 초승달(베는 궤적)
const _c = new THREE.Color();
const PAT_COLOR = { cell: 0xff3040, pair: 0xff3040, col: 0xff3ad0, row: 0xff8a2a, cross: 0xff3040, checker: 0xff8a2a };     // 예고 공격의 종류별 색
const starTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  for (const a of [0, Math.PI / 2]) { g.save(); g.translate(32, 32); g.rotate(a); g.beginPath(); g.moveTo(-31, 0); g.lineTo(0, -4.5); g.lineTo(31, 0); g.lineTo(0, 4.5); g.fill(); g.restore(); }
  return new THREE.CanvasTexture(c);
})();
const MARKS = Array.from({ length: 28 }, () => {      // 타격 섬광은 미리 만들어 두고 돌려 쓴다
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false }));
  sp.visible = false; sp.renderOrder = 5; scene.add(sp);
  return { sp, t: 1, dur: 1, size: 1 };
});

// ------------------------------------------------------------------ 엔티티
// 발밑 게이지용 고리 조각: 카메라 쪽(화면 아래)을 가운데로 두고 양쪽에서 줄어든다. 단계별로 한 번만 만들어 돌려 쓴다.
const ARC_N = 40, ARC_R = { hp: [0.64, 0.9], sh: [0.96, 1.04] }, ARCS = {};
function gaugeGeo(kind, step) {
  const key = kind + step, len = Math.PI * 2 * Math.max(step, 0.01) / ARC_N;
  return ARCS[key] ||= new THREE.RingGeometry(ARC_R[kind][0], ARC_R[kind][1], 56, 1, Math.PI * 1.5 - len / 2, len);
}
const FIELD_GEO = { disc: new THREE.CircleGeometry(1, 48), edge: new THREE.RingGeometry(0.98, 1, 64), hex: new THREE.RingGeometry(0.7, 0.725, 6), hex2: new THREE.RingGeometry(0.4, 0.42, 6) };
const GLOW_GEO = new THREE.CircleGeometry(0.64, 32), WHITE = new THREE.Color(0xffffff);
const HP_GREEN = new THREE.Color(0xa8f06a), HP_LOW = new THREE.Color(0xfff27a);      // 체력 고리는 누구나 연두색. 위험할 때는 옅은 노랑으로 깜빡인다(붉은색은 바닥 예고만 쓴다)
const ICON_IMG = {};
function iconImg(wid) {      // 무기 아이콘(SVG)을 화면 위에 그릴 수 있는 그림으로
  if (!ICON_IMG[wid]) {
    const im = new Image();
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 28" width="68" height="56">${W_ICON[wid]}</svg>`);
    ICON_IMG[wid] = im;
  }
  return ICON_IMG[wid];
}
Object.keys(W_ICON).forEach(iconImg);      // 미리 읽어 둔다
// 날개 진화: 파티 레벨 10·20·30. 0 부스터만 → 1 작은 날개 → 2 큰 날개(빛 깃털 하나) → 3 비행 날개(더 크고, 펄럭이며, 땅에서 떠서 난다)
const WING_SCALE = [0.45, 0.8, 1.1, 1.5], FLY_TIER = 3, WING_FEATHERS = [0, 0, 1, 3];
class Girl {
  constructor(game, slot, cfg) {
    const ch = CHARS[cfg.char], wid = game.weaponId(cfg.line), w = WEAPONS[wid], sk = SKILLS[ch.name];
    const ox = rand(-0.35, 0.35), oz = rand(-0.4, 0.4);     // 줄을 딱 맞추지 않아 자연스럽게 보이게 한다
    const hp = game.maxHp(), sh = game.maxSh();
    Object.assign(this, { game, slot, ch, w, line: cfg.line, weaponId: wid, skill: sk, name: ch.label || ch.name,
      col: cfg.col, row: cfg.row, home: [cfg.col, cfg.row], ox, oz, x: COL_X[cfg.col] + ox, z: ROW_Z[cfg.row] + oz, lean: 0,
      maxHp: hp, hp, maxSh: sh, sh,
      timer: rand(0, w.cd || 0.5), swing: 0, swingDur: 0.25, swingDir: 1, burstLeft: 0, burstT: 0,
      aim: 0, aimTo: 0, aimHold: 0, kick: 0, moveCd: 0, sinceHit: 99, flash: 0, fireFlash: 0, fireFlash2: 0, hand: 0, hold: 0, autoT: 0,
      skT: sk.cd * 0.5, skAuto: 0, inv: 0, dashT: 0, lunge: 0, lungeA: 0, boost: 0, flaming: 0, alive: true });
    this.cfg = cfg;
    this.makeModel();
  }
  // 겉모습: 시안풍 폴리곤 소녀(girl2)가 준비되어 있으면 그것을, 아니면 예전 모델을 쓴다
  makeModel() {
    if (this.model) scene.remove(this.model.root);
    const g2 = this.game.girl2 && this.game.girl2(this.ch.name);
    this.model = g2 ? dressGirl2(g2.model, g2.def, this.weaponId) : buildGirl({ char: this.cfg.char, weapon: this.weaponId });
    // 발밑 고리가 곧 체력 게이지다 (머리 위에는 아무것도 띄우지 않아서 공격이 가려지지 않는다).
    // 캐릭터 색 고리 = 체력(줄어들면 그만큼 짧아진다), 바깥의 얇은 고리 = 실드, 안쪽의 은은한 빛 = 스킬 준비됨.
    const flat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false });
    const foot = new THREE.Group();
    foot.rotation.x = -Math.PI / 2; foot.position.y = 0.05; foot.scale.setScalar(1.42 / this.model.root.scale.x);
    this.hpRing = new THREE.Mesh(gaugeGeo('hp', ARC_N), flat(0xa8f06a, 0.55));
    this.shRing = new THREE.Mesh(gaugeGeo('sh', ARC_N), flat(0xd8f4ff, 0.45));
    this.glow = new THREE.Mesh(GLOW_GEO, addMat(0xeaffd8, 0));
    foot.add(new THREE.Mesh(gaugeGeo('hp', ARC_N), flat(0x080a18, 0.5)), this.glow, this.hpRing, this.shRing);
    for (const c of foot.children) c.renderOrder = 1;
    this.hpStep = this.shStep = ARC_N; this.colMain = new THREE.Color(this.ch.color);
    this.model.root.add(foot);
    this.field = null;
    if (this.weaponId === 'field') {      // 영역 전개: 발밑에 펼쳐진 둥근 영역. 안에 선 아군은 덜 아프고 크리티컬이 잘 터진다
      const f = this.field = new THREE.Group();
      f.rotation.x = -Math.PI / 2; f.position.y = 0.04; f.scale.setScalar(FIELD_R / this.model.root.scale.x);
      f.add(new THREE.Mesh(FIELD_GEO.disc, addMat(0x6ef08c, 0.03)), new THREE.Mesh(FIELD_GEO.edge, addMat(0x6ef08c, 0.2)),
        new THREE.Mesh(FIELD_GEO.hex, addMat(0xbfffd0, 0.09)), new THREE.Mesh(FIELD_GEO.hex2, addMat(0x6ef08c, 0.06)));
      this.model.root.add(f);
    }
    this.model.root.visible = this.alive;
    scene.add(this.model.root);
  }
  standX() { return COL_X[this.col] + this.ox; }
  standZ() { return ROW_Z[this.row] + this.oz; }
  muzzle(side = 0) {      // 총구의 대략적인 위치 (조준 방향을 따라간다). side: 쌍권총의 왼손(-1)·오른손(1)
    const a = this.aim, f = this.model.reach, o = 0.5 * (side || 1);
    return [this.x + Math.sin(a) * f + Math.cos(a) * o, this.z + Math.cos(a) * f - Math.sin(a) * o, 1.6];
  }
  face(t) { const lim = this.model.melee ? 1.7 : 1.15; this.aimTo = clamp(Math.atan2(t.x - this.x, t.z - this.z), -lim, lim); this.aimHold = 1.3; }
  take(dmg) {
    if (!this.alive || this.inv > 0 || this.game.tut) return;      // 튜토리얼 중에는 피해가 없다
    const g = this.game;
    dmg *= g.defMul() * (g.barrierT > 0 ? 0.4 : 1) * (this.inField ? FIELD_DEF : 1);
    this.sinceHit = 0; this.flash = 0.12;
    if (this.sh > 0) { const a = Math.min(this.sh, dmg); this.sh -= a; dmg -= a; }
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; g.girlDown(this); }
  }
  enemiesWithin(rng) {
    const out = [];
    for (const e of this.game.enemies) {
      const d = (e.x - this.x) ** 2 + (e.z - this.z) ** 2;
      if (e.alive && d <= rng * rng && e.z < VISIBLE_Z) out.push([d, e]);
    }
    return out.sort((a, b) => a[0] - b[0]).map(p => p[1]);
  }
  // 근접 무기가 닿는 범위: 코앞까지 온 적, 그리고 자기 칸을 둘러싼 8칸의 아군에게 달라붙은 적 (대각선 칸의 아군을 때리는 적도 벤다).
  // 멀리서 다가오는 적까지 미리 베어 버리면 적이 한 대도 못 때리므로, 달라붙기 전의 적은 코앞에서만 닿는다.
  inReach(e) {
    // 보스는 몸집이 커서 중심까지의 거리로 재면 칼이 닿지 않는다(그래서 근접이 보스를 못 치던 버그가 있었다). 몸 둘레만큼 빼고 잰다.
    const r = this.w.rng, pad = e.kind === 'boss' ? 3.2 : 0, dz0 = e.z - this.z;
    const dx = Math.max(0, Math.abs(e.x - this.x) - pad), dz = dz0 > 0 ? Math.max(0, dz0 - pad) : dz0;
    if (dx * dx + dz * dz <= (r * 0.72) ** 2) return true;
    return e.engaged && dx <= r * 0.96 && dz <= r * 1.36 && dz >= -r * 0.8;
  }
  meleeTargets() {
    const out = [];
    for (const e of this.game.enemies) if (e.alive && this.inReach(e)) out.push([(e.x - this.x) ** 2 + (e.z - this.z) ** 2, e]);
    return out.sort((a, b) => a[0] - b[0]).map(p => p[1]);
  }
  pickTarget() {
    const f = this.game.focus, rng = this.w.rng;
    if (this.model.melee) return f && f.alive && this.inReach(f) ? f : this.meleeTargets()[0] || null;
    if (f && f.alive && f.z < VISIBLE_Z && (f.x - this.x) ** 2 + (f.z - this.z) ** 2 <= rng * rng) return f;
    // 총을 든 소녀의 우선순위: 코앞까지 온 돌격형 → 멀리서 쏘는 적(근접으로는 못 잡는다) → 가장 가까운 적
    const list = this.enemiesWithin(rng);
    return list.find(e => e.kind === 'rusher' && (e.x - this.x) ** 2 + (e.z - this.z) ** 2 < 81) || list.find(e => e.spec.shot || (e.spec.ranged && e.kind !== 'boss')) || list[0] || null;
  }
  settle(dt) {      // 튜토리얼로 시간이 멈춘 동안: 끌어서 옮긴 자리로 미끄러져 가는 것만 한다
    const dx = this.standX() - this.x, dz = this.standZ() - this.z, k = Math.min(1, dt * 15);
    this.x += dx * k; this.z += dz * k;
    this.moveCd = Math.max(0, this.moveCd - dt); this.boost = Math.max(0, this.boost - dt * 2.5);
  }
  update(dt) {
    const dx = this.standX() - this.x, dz = this.standZ() - this.z, k = Math.min(1, dt * 15);   // 빠르게 튀어나가 부드럽게 멈춘다
    this.x += dx * k; this.z += dz * k; this.lean += (clamp(dx, -1.5, 1.5) - this.lean) * Math.min(1, dt * 12);
    for (const key of ['moveCd', 'hold', 'flash', 'fireFlash', 'fireFlash2', 'swing', 'skT', 'inv', 'dashT', 'lunge', 'flaming']) this[key] = Math.max(0, this[key] - dt);
    this.boost = Math.max(0, this.boost - dt * 2.5);
    this.sinceHit += dt;
    const g = this.game, w = this.w;
    if (this.sinceHit > SHIELD_DELAY) this.sh = Math.min(this.maxSh, this.sh + SHIELD_REGEN * (1 + 0.06 * g.up.sh) * dt);
    const rate = g.rateMul();
    this.inField = g.girls.some(o => o.alive && o.weaponId === 'field' && (o.x - this.x) ** 2 + (o.z - this.z) ** 2 <= FIELD_R * FIELD_R);      // 영역 전개 안에 서 있는가
    this.kick = Math.max(0, this.kick - dt * 8);
    this.aimHold = Math.max(0, this.aimHold - dt);
    if (this.aimHold <= 0) this.aimTo = 0;
    this.aim += (this.aimTo - this.aim) * Math.min(1, dt * 14);
    if (w.cat === 'support') {
      this.timer -= dt;                       // 수리 주기는 0.5초로 고정 (공격 속도 강화나 오버드라이브로 빨라지지 않는다)
      if (this.timer <= 0) { this.timer = 0.5; this.support(); }
      return;
    }
    if (w.cone) {                             // 화염방사기: 겨눈 쪽으로 계속 뿜는다
      this.timer -= dt * rate;
      const t = this.pickTarget();
      if (!t) { this.timer = Math.max(this.timer, 0.05); return; }
      this.face(t); this.flaming = 0.15;
      if (this.timer <= 0) { this.timer = w.cd; this.flame(t); }
      return;
    }
    if (this.burstLeft > 0) {                 // 연사: 두두두두 쏘고 잠깐 쉰다
      this.burstT -= dt * rate;
      if (this.burstT <= 0) {
        const t = this.pickTarget();
        if (t) { this.shoot(t); this.burstLeft--; this.burstT = w.gap; } else this.burstLeft = 0;
        if (!this.burstLeft) this.timer = w.cd;
      }
      return;
    }
    this.timer -= dt * rate;
    if (this.timer <= 0) {
      const t = this.pickTarget();
      if (!t) this.timer = 0.1;
      else if (w.burst) { this.burstLeft = w.burst; this.burstT = 0; this.face(t); }
      else { this.timer = w.cd; this.shoot(t); }
    }
  }
  shoot(t) { this.face(t); this.kick = this.w.kick || 0; this.fire(t); }
  dmgMul() { return this.game.dmgMul(this.line); }      // 공격력 업그레이드 + 이 무기 계열의 레벨 (더하기)
  isNeighbor(o) { return Math.abs(o.col - this.col) <= 1 && Math.abs(o.row - this.row) <= 1; }
  // 수리: 실드부터, 실드가 차 있으면 체력을. 회복량은 대상의 최대치에 비례해서 HP·실드 업그레이드와 함께 커진다.
  support() {
    const g = this.game, from = [this.x, this.z, 2.9], k = g.healMul(), all = this.weaponId !== 'repair';
    for (const o of g.girls) {
      if (!o.alive || (o === this ? !all : !all && !this.isNeighbor(o))) continue;
      const far = o !== this && !this.isNeighbor(o) ? 0.6 : 1;       // 이웃 칸이 아닌 아군은 60%만 (드론·영역 전개의 부대 전체 수리)
      if (o.sh < o.maxSh) o.sh = Math.min(o.maxSh, o.sh + o.maxSh * 0.04 * k * far);
      else if (o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.01 * k * far);
      else continue;
      if (o !== this) g.tracer(from, [o.x, o.z, 1.8], 0x6ef08c, 0.07, 0.3);
    }
  }
  slash() {
    const w = this.w, hit = this.meleeTargets().slice(0, w.hits);
    if (!hit.length) return false;
    const g = this.game, big = w.hits > 3, mul = this.dmgMul(), color = !big ? 0xdfe8ff : this.model.dual && this.swingDir > 0 ? 0x7ad8ff : 0xff7ad8;
    this.face(hit[0]);
    const a = Math.atan2(hit[0].x - this.x, hit[0].z - this.z);
    for (const e of hit) g.hitEnemy(e, w.dmg * mul, { kb: w.kb, color, melee: true, by: this });
    this.swing = this.swingDur = w.swing;
    this.swingDir = -this.swingDir;          // 번갈아 가며 반대 방향으로 벤다
    this.lunge = 0.16; this.lungeA = a;      // 베는 쪽으로 한 발 내딛는다 (대각선의 적도 그쪽으로 몸을 던져 벤다)
    const ax = this.x + Math.sin(a) * 0.7, az = this.z + Math.cos(a) * 0.7;
    g.arc(ax, az, big ? w.rng * 1.05 : w.rng * 0.72, color, this.swingDir, big ? 0.3 : 0.2, a);
    g.arc(ax, az, big ? w.rng * 0.85 : w.rng * 0.55, 0xffffff, this.swingDir, big ? 0.22 : 0.14, a);
    g.shake = Math.max(g.shake, big ? 0.22 : hit.length >= 2 ? 0.12 : 0.06);
    g.sfx(big ? 'saber' : 'slash');
    return true;
  }
  flame(t) {
    const g = this.game, w = this.w, mul = this.dmgMul(), m = this.muzzle();
    const a = Math.atan2(t.x - this.x, t.z - this.z);
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz);
      if (d > w.rng) continue;
      let da = Math.atan2(dx, dz) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) <= w.cone || d < 2.2) g.hitEnemy(e, w.dmg * mul, { kb: w.kb, tick: true, color: 0xffa040, by: this });
    }
    this.fireFlash = 0.12;
    const pl = this.weaponId === 'plasma';
    for (let i = 0; i < (pl ? 8 : 5); i++) {            // 불길: 총구에서 부채꼴로 뻗어 나가는 불씨 (플라즈마는 푸른·보랏빛 두 줄기)
      const b = a + rand(-w.cone, w.cone) * 0.9, sp = rand(16, 26) * (pl ? 1.15 : 1), life = rand(0.3, 0.52), side = pl ? (i % 2 ? 0.28 : -0.28) : 0;
      g.fxParts.push({ x: m[0] + Math.cos(a) * side, z: m[1] - Math.sin(a) * side, h: m[2], vx: Math.sin(b) * sp, vz: Math.cos(b) * sp + g.adv, vh: rand(-1, 2.5), g: 3, life, max: life,
        color: pl ? (i % 2 ? 0xc88cff : 0x7ad8ff) : Math.random() < 0.35 ? 0xffe27a : 0xff8a2a });
    }
    if (Math.random() < 0.3) g.sfx('flame');
  }
  fire(t) {
    const g = this.game, w = this.w, mul = this.dmgMul();
    const to = [t.x, t.z, t.aim];
    switch (this.weaponId) {
      case 'rifle': {
        const m = this.muzzle();
        this.fireFlash = 0.05;
        g.tracer(m, to, 0xffe070, 0.11, 0.08); g.tracer(m, to, 0xffffff, 0.04, 0.08);
        g.sparks(t.x, t.z, t.aim, 0xffe070, 2); g.sparks(m[0], m[1], m[2], 0xffc850, 1);     // 명중 불꽃과 탄피
        g.hitEnemy(t, w.dmg * mul, { kb: w.kb, by: this }); g.sfx('shot'); break;
      }
      case 'pistol': {                       // 양손으로 번갈아
        this.hand = this.hand ? 0 : 1;
        const m = this.muzzle(this.hand ? -1 : 1);
        if (this.hand) this.fireFlash2 = 0.05; else this.fireFlash = 0.05;
        g.tracer(m, to, 0xfff0c0, 0.08, 0.07); g.sparks(t.x, t.z, t.aim, 0xfff0c0, 2);
        g.hitEnemy(t, w.dmg * mul, { kb: w.kb, by: this }); g.sfx('shot'); break;
      }
      case 'shotgun': {     // 가까울수록 강하다
        const m = this.muzzle();
        const near = g.enemies.filter(e => e !== t && e.alive && (e.x - t.x) ** 2 + (e.z - t.z) ** 2 < 10).slice(0, 4);
        const kk = (1.7 - Math.hypot(t.x - this.x, t.z - this.z) / w.rng) * mul;
        this.fireFlash = 0.1;
        g.tracer(m, to, 0xffbe6e, 0.2, 0.09); g.sparks(t.x, t.z, t.aim, 0xffbe6e, 6); g.sparks(m[0], m[1], m[2], 0xffc850, 4);
        for (let i = 0; i < 4; i++) g.tracer(m, [t.x + rand(-2.2, 2.2), t.z + rand(-1.5, 2.5), t.aim + rand(-0.6, 0.6)], 0xffd9a0, 0.05, 0.08);
        g.hitEnemy(t, w.dmg * 3 * kk, { kb: w.kb * (kk / mul), by: this });
        for (const e of near) g.hitEnemy(e, w.dmg * kk, { kb: w.kb * 0.6, by: this });
        g.shake = Math.max(g.shake, 0.14); g.sfx('shotgun');
        break;
      }
      case 'gatling': {                      // 끊임없이 퍼붓는다. 총열이 돈다
        const m = this.muzzle();
        this.fireFlash = 0.05;
        g.tracer(m, [t.x + rand(-0.3, 0.3), t.z + rand(-0.3, 0.3), t.aim], 0xffe070, 0.1, 0.06);
        if (Math.random() < 0.5) g.sparks(t.x, t.z, t.aim, 0xffe070, 1);
        g.sparks(m[0], m[1], m[2], 0xffc850, 1);
        g.hitEnemy(t, w.dmg * mul, { kb: w.kb, by: this }); g.sfx('shot'); break;
      }
      case 'sword': case 'saber': case 'dualsaber': this.slash(); break;
    }
  }
  sync(t) {
    const m = this.model, g = this.game, wk = this.idle ? 0 : Math.min(1, g.walk), ph = g.walkPh + this.slot * 2.1, idle = !!this.idle;
    const tier = g.wingTier(), fly = !idle && tier >= FLY_TIER;       // 비행 날개: 걷지 않고 떠서 난다
    const run = idle || fly ? 0 : Math.sin(ph) * wk, hov = fly ? 0.4 + Math.sin(t * 2.4 + this.slot * 1.3) * 0.07 : 0;
    const aim = this.aim, kick = this.kick, aiming = this.aimHold > 0 ? 1 : 0;
    // 벨 때는 그쪽으로 한 발 내딛고, 질풍 돌격 중에는 앞으로 튀어 나갔다 돌아온다
    const lg = this.lunge * 5, dash = this.dashT > 0 ? Math.sin(Math.PI * (1 - this.dashT / 0.42)) * 13 : 0;
    place(m.root, this.x + Math.sin(this.lungeA) * lg, this.z + Math.cos(this.lungeA) * lg + dash, 0);
    m.root.visible = !(this.inv > 0 && Math.floor(t * 16) % 2);      // 막 돌아왔을 때는 깜빡인다 (잠깐 무적)
    // 몸: 통통 튀고, 움직이는 쪽으로 기울고, 쏠 때는 반동으로 밀린다
    m.body.position.set(0, fly ? hov : idle ? Math.sin(t * 2.2) * 0.012 : Math.abs(Math.cos(ph)) * 0.07 * wk - 0.03 * (1 - wk) + Math.sin(t * 3 + this.slot) * 0.01 * (1 - wk), kick * 0.1);
    m.body.rotation.set(idle ? 0 : -0.16 * wk - 0.06 * (1 - wk) - 0.2 * g.boostFx - (dash ? 0.5 : 0) - (fly ? 0.1 : 0), -this.lean * 0.15 + (this.faceYaw || 0), -this.lean * 0.3);
    m.body.scale.setScalar(this.flash > 0 ? 1.06 : 1);
    m.hips.rotation.y = -run * 0.1;
    let yaw = run * 0.14 * (aiming ? 0.3 : 1) - aim;       // 상체는 겨눈 적 쪽으로 돈다
    m.head.rotation.set(idle ? Math.sin(t * 1.3) * 0.03 : 0.1 + Math.sin(ph * 2) * 0.02, -this.lean * 0.25 - aim * 0.35 + (idle ? Math.sin(t * 0.9) * 0.08 : 0), 0);
    // 다리: 앞으로 뻗고, 뒤로 갈 때 무릎을 접는다
    m.legs.forEach((L, i) => {
      const a = i ? -run : run;
      if (fly) {      // 떠 있을 때: 다리를 뒤로 늘어뜨리고 한쪽 무릎을 살짝 접는다
        const sw = Math.sin(t * 2.4 + this.slot * 1.3 + i * 1.6) * 0.05;
        L.hip.rotation.set((i ? -0.34 : -0.12) - 0.25 * g.boostFx + sw, 0, i ? -0.05 : 0.05);
        L.knee.rotation.x = -((i ? 0.7 : 0.3) + sw);
        return;
      }
      L.hip.rotation.set(a * 0.95 + (idle ? 0 : (i ? -0.12 : 0.18) * (1 - wk)), 0, idle ? (i ? -0.05 : 0.05) : (i ? -0.09 : 0.09) * (1 - wk));      // 멈추면 한 발 앞으로 디딘 자세
      L.knee.rotation.x = idle ? 0 : -(Math.max(0, -a) * 1.25 + 0.12 + 0.12 * (1 - wk));
    });
    const L = m.armL, R = m.armR;
    if (idle) {
      L.sh.rotation.set(0.05, 0, -0.16 - (m.armOut || 0)); L.el.rotation.x = 0.25;
      R.sh.rotation.set(0.05, 0, 0.16 + (m.armOut || 0)); R.el.rotation.x = 0.25;
    } else {
      const ao = m.armOut || 0;      // 어깨·허리 장갑이 넓은 모델은 팔을 조금 벌리고 달린다
      L.sh.rotation.set(-run * 0.75, 0, -ao); L.el.rotation.x = 0.55 + Math.max(0, -run) * 0.4;
      R.sh.rotation.set(run * 0.75, 0, ao); R.el.rotation.x = 0.55 + Math.max(0, run) * 0.4;
      if (m.gun) {                                 // 총: 앞으로 겨누고, 쏠 때마다 팔이 밀린다
        const kr = m.dual && this.hand ? 0 : kick, kl = m.dual && !this.hand ? 0 : kick;
        R.sh.rotation.set(1.45 - kr * 0.32, 0, -0.08); R.el.rotation.x = 0.08 + kr * 0.28;
        if (m.dual) { L.sh.rotation.set(1.45 - kl * 0.32, 0, 0.08); L.el.rotation.x = 0.08 + kl * 0.28; }
        else if (m.twoHand) { L.sh.rotation.set(1.25 - kick * 0.2, 0, 0.62); L.el.rotation.x = 0.35 + kick * 0.2; yaw -= 0.22; }   // 왼손으로 받친다
      } else if (m.melee) {
        if (this.swing > 0) {                      // 대각선으로 크게 휘두른다: 위에서 반대쪽 아래로
          const pr = 1 - this.swing / this.swingDur, e = pr * pr * (3 - 2 * pr), d = this.swingDir;
          const A = m.dual && d < 0 ? L : R, B = A === R ? L : R;      // 쌍칼은 양손을 번갈아 휘두른다
          A.sh.rotation.set(2.5 - e * 2.0, 0, d * (1.0 - e * 2.1)); A.el.rotation.x = 0.12;
          yaw -= d * (0.75 - e * 1.6);
          m.body.rotation.z += d * (0.12 - e * 0.3);
          if (m.dual) { B.sh.rotation.set(1.1, 0, B === R ? 0.5 : -0.5); B.el.rotation.x = 0.7; }
          else { L.sh.rotation.set(0.4, 0, -0.5); L.el.rotation.x = 0.9; }
        } else {
          R.sh.rotation.set(0.95 + run * 0.1, 0, 0.3); R.el.rotation.x = 0.6;
          if (m.dual) { L.sh.rotation.set(0.95 - run * 0.1, 0, -0.3); L.el.rotation.x = 0.6; }
        }
      }
    }
    m.torso.rotation.set(kick * 0.13, yaw, 0);
    // 머리 다발은 마디마다 늦게 따라오며 흔들린다
    const hs = idle ? 0.35 : 1, hp = idle ? t * 2.4 : ph * 0.5;
    m.tails.forEach((c, i) => c.segs.forEach((sg, j) => {
      sg.rotation.x = (j ? (idle ? 0 : -0.14) : (idle ? c.baseX * 0.3 : c.baseX)) + Math.sin(hp - j * 0.9 + i * 1.7) * 0.16 * hs;
      sg.rotation.z = (j ? 0 : c.baseZ) - this.lean * 0.2;
    }));
    // 날개는 파티 레벨에 따라 자라고(깃털이 돋는다), 달릴수록 뒤로 젖혀지며 분사가 길어진다
    const bz = idle ? 0 : Math.min(1.3, Math.max(g.boostFx, fly ? 0.38 : 0) + this.boost + (dash ? 1 : 0));
    // 비행 날개는 천천히 크게 펄럭인다 (내려칠 때 빠르고 올릴 때 느리게). 그 아래 단계는 살짝 떨리기만 한다.
    const fp = t * 5.2 + this.slot * 0.9, flap = fly ? 0.3 * Math.sin(fp) + 0.08 * Math.sin(fp * 2) : 0;
    m.wings.forEach((w, i) => {
      w.scale.setScalar(WING_SCALE[tier]);
      w.rotation.z = w.userData.baseZ * (1 + (fly ? flap : 0.07 * Math.sin(hp + i * 2)) + kick * 0.12 + 0.25 * bz);
      w.rotation.x = (w.userData.baseX ?? 0.5) + Math.abs(run) * 0.06 + 0.35 * bz + (fly ? 0.12 * Math.cos(fp) : 0);
      w.userData.feathers.forEach((f, k) => { f.visible = k < WING_FEATHERS[tier]; if (fly) f.rotation.x = (f.userData.bx ??= f.rotation.x) + 0.25 * Math.sin(fp - 0.7 - k * 0.5); });
    });
    if (fly && Math.random() < 0.1) g.sparks(this.x + rand(-0.5, 0.5), this.z + rand(-0.2, 0.6), 0.1, 0x9fe8ff, 1, 0.6);      // 발밑으로 흩어지는 분사 가루
    for (const f of m.flames) f.scale.y = idle ? rand(0.08, 0.14) : rand(0.25, 0.5) * (0.5 + wk);
    m.jets.forEach((j, i) => {
      j.visible = bz > 0.06 && (i < 2 || (tier >= 1 && bz > 0.5));      // 날개 분사는 돌진할 때만
      if (j.visible) { j.scale.set(1 + bz * 0.5, (0.22 + 2.0 * bz ** 1.6) * rand(0.82, 1.18), 1 + bz * 0.5); }
    });
    if (m.orb) { const y = (m.orbY || 0.92) + Math.sin(t * 3 + this.slot) * 0.06; m.orb.position.y = y; m.ring.position.y = y; m.ring.rotation.set(t * 2, t * 1.3, 0); }
    if (m.wg && m.wg.userData.spin) m.wg.userData.spin.rotation.z += this.fireFlash > 0 ? 0.85 : 0.04;      // 게틀링 총열
    if (this.field) {      // 영역 전개: 테두리가 숨 쉬듯 밝아지고 육각 무늬가 천천히 돈다
      const c = this.field.children;
      c[0].material.opacity = 0.028 + 0.008 * Math.sin(t * 2.2); c[1].material.opacity = 0.17 + 0.05 * Math.sin(t * 3);      // 거슬리지 않게 아주 옅게
      c[2].rotation.z = t * 0.5; c[3].rotation.z = -t * 0.8;
      if (Math.random() < 0.05) { const a = rand(0, 6.283), r = rand(0, FIELD_R); g.fxParts.push({ x: this.x + Math.cos(a) * r, z: this.z + Math.sin(a) * r, h: 0.1, vx: 0, vz: g.adv, vh: rand(1.5, 3), g: 0, life: 0.7, max: 0.7, color: 0x6ef08c }); }
    }
    // 총구 화염: 쏘는 순간 번쩍인다. 화염방사기는 뿜는 동안 계속 켜져 있다.
    for (const [f, on] of [[m.flash, this.fireFlash > 0 || this.flaming > 0], [m.flash2, this.fireFlash2 > 0]]) {
      f.visible = on;
      if (on) { f.children[0].scale.setScalar(0.2 * rand(0.8, 1.3)); f.rotation.z = rand(0, 6.28); }
    }
    // 발밑 게이지: 체력 고리(맞으면 하얗게, 35% 아래면 붉게 깜빡임), 실드 고리, 스킬 준비 빛
    const hf = clamp(this.hp / this.maxHp, 0, 1), hpN = Math.ceil(hf * ARC_N), shN = Math.ceil(clamp(this.sh / this.maxSh, 0, 1) * ARC_N);
    if (hpN !== this.hpStep) { this.hpStep = hpN; this.hpRing.geometry = gaugeGeo('hp', hpN); this.hpRing.visible = hpN > 0; }
    if (shN !== this.shStep) { this.shStep = shN; this.shRing.geometry = gaugeGeo('sh', shN); this.shRing.visible = shN > 0; }
    this.hpRing.material.color.copy(this.flash > 0 ? WHITE : hf < 0.35 && Math.floor(t * 6) % 2 ? HP_LOW : HP_GREEN);
    this.hpRing.material.opacity = this.flash > 0 || hf < 0.35 ? 0.85 : 0.55;
    this.shRing.material.opacity = g.barrierT > 0 ? 0.9 : 0.45;
    this.glow.material.opacity = this.skT <= 0 && !idle ? 0.16 + 0.1 * Math.sin(t * 6 + this.slot) : 0;
  }
  dispose() { scene.remove(this.model.root); }
}

class Enemy {
  constructor(game, kind, x, z) {
    const s = ENEMIES[kind], d = game.def, boss = kind === 'boss';
    const hp = s.hp * (boss ? LEVEL.bossHp(game.stage) : d.hp);
    Object.assign(this, { game, kind, spec: s, x, z, maxHp: hp, hp, walk: s.walk * rand(0.9, 1.1), wp: rand(0, 6.28), moved: 0,
      dmg: s.dmg * d.dmg, aim: s.aim, off: rand(-1.2, 1.2), atk: s.melee ? rand(0.3, 0.8) : rand(1, 2.5),
      pats: boss ? d.zone.bossPat : s.pat, patI: 0, flash: 0, punch: 0, kb: 0, kbImm: 0, acc: 0, accT: 0, alive: true, phase: rand(0, 6.28) });
    this.model = buildEnemy(kind, d.zone);
    scene.add(this.model.root);
  }
  // 움직임은 '땅' 기준이다. 소대가 전진하는 만큼(g.adv) 땅이 다가오므로, 서 있는 적도 땅과 함께 다가온다.
  // 그래서 적이 제자리걸음을 하며 뒤로 밀려 보이는 일이 없다. 걷는 적은 자기 걸음 + 땅의 흐름만큼 다가온다.
  update(dt) {
    const g = this.game, S = this.spec, carry = g.adv * dt;
    this.flash = Math.max(0, this.flash - dt); this.punch = Math.max(0, this.punch - dt * 7);
    if (this.acc > 0 && (this.accT -= dt) <= 0) { g.popNum(this, this.acc, false); this.acc = 0; }      // 지속 피해는 모아서 한 번씩 띄운다
    this.moved = 0; this.engaged = false;
    if (this.kb > 0.5) {               // 맞고 밀려나는 중: 걷지도 때리지도 못한다
      this.z += this.kb * dt - carry; this.kb -= (26 + this.kb * 5) * dt;
      if (this.kb <= 0.5) this.kbImm = 0.8;      // 버티기: 계속 밀려나기만 해서 한 대도 못 때리는 일이 없게
      return;
    }
    this.kb = 0; this.kbImm = Math.max(0, this.kbImm - dt);
    const tgt = g.nearestGirl(this.x, this.z);
    if (S.ranged || S.shot) {
      // 사거리에 들어오면 멈춰 서서 쏜다. 그 뒤로는 소대가 달려 들어가며 거리를 좁힌다 (근접 무기로도 잡을 수 있게).
      const boss = this.kind === 'boss', stopZ = boss ? 26 : (S.shot ? 20 : S.fly ? 31 : ART_STOP_Z) + this.off * 2, gap = boss ? 4 : 1.6;
      if (this.z > stopZ) {
        this.z -= this.walk * dt; this.moved = this.walk;
        this.x += ((this.laneX ?? clamp(this.x, -14, 14)) - this.x) * Math.min(1, dt * 0.6);      // 자기 줄(소대 정면)로 모인다
      } else {
        this.atk -= dt;
        if (this.atk <= 0 && tgt && !this.tutor) {
          if (S.shot) {               // 사격형: 가장 가까운 소녀에게 바로 맞는 총알 (작지만 꾸준한 피해)
            this.atk = S.atkCd * rand(0.85, 1.15); tgt.take(this.dmg); this.lunge = 0.1;
            g.tracer([this.x + 0.4, this.z + 1, 1.4], [tgt.x, tgt.z, 1.5], 0xff5a6a, 0.09, 0.1); g.sparks(tgt.x, tgt.z + 0.4, 1.4, 0xff7878, 3);
          } else this.atk = g.firePattern(this, tgt) ? S.atkCd * rand(0.9, 1.1) : 0.6;
        }
        if (boss && tgt && (this.gunT = (this.gunT ?? 1) - dt) <= 0) {      // 보스의 기관포: 예고 공격 사이사이에 꾸준히 쏜다 (피할 수 없는 잔피해)
          this.gunT = 0.8; tgt.take(this.dmg * 0.18);
          g.tracer([this.x + rand(-1.5, 1.5), this.z + 1.5, 3], [tgt.x, tgt.z, 1.5], 0xff5a6a, 0.1, 0.1); g.sparks(tgt.x, tgt.z + 0.4, 1.4, 0xff7878, 2);
        }
      }
      this.z -= carry;
      if (tgt && this.z < tgt.z + gap) { this.z = tgt.z + gap; this.engaged = true; }     // 소녀에 밀린다
      else if (boss && tgt && this.z < tgt.z + 7.5) this.engaged = true;                   // 보스는 소대가 멈춰 선 거리에서도 맞붙은 것으로 친다
      return;
    }
    if (!tgt) { this.z -= this.walk * dt + carry; this.moved = this.walk; if (this.z < -4) this.alive = false; return; }
    const mel = S.melee;
    const tx = tgt.x + this.off * (mel ? 1 : 0.3), tz = tgt.z + (mel ? (this.kind === 'tank' ? 1.9 : 1.4) : 0);
    let dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const reach = mel ? 0.25 : 1.3;
    if (mel && d < 4.5) this.atk = Math.max(0.05, this.atk - dt);      // 다가오면서 미리 벼른다: 닿는 순간 한 대는 때린다
    if (d > reach) {
      const step = Math.min(d, this.walk * dt);
      this.x += dx / d * step; this.z += dz / d * step - carry; this.moved = this.walk;
      dz = tz - this.z;
      if (dz > 0 && dz <= carry + this.walk * dt + 0.01) { this.z = tz; this.moved = 0; }      // 땅에 실려 와도 목표 자리를 넘어서지는 않는다
      d = Math.hypot(tx - this.x, tz - this.z);
    }
    if (!mel) {                   // 돌격형: 닿으면 터진다
      if (d < 1.3) {
        this.alive = false;
        const rad = S.radius;
        g.explosion(this.x, this.z, rad, 0xffa83c);
        for (const gi of g.girls) if (gi.alive && (gi.x - this.x) ** 2 + (gi.z - this.z) ** 2 < rad * rad) gi.take(this.dmg);
        g.shake = Math.max(g.shake, 0.5); g.sfx('boom');
      }
      return;
    }
    if (d <= 0.4) {               // 맞붙었다: 치면서 버틴다. 소대가 밀어붙이면 그만큼 밀려난다(뒤로 걷지 않는다)
      this.x = tx; this.z = tz; this.engaged = true; this.moved = 0;
      this.atk -= dt;
      if (this.atk <= 0) { this.atk = S.atkCd; tgt.take(this.dmg); g.sparks(tgt.x, tgt.z + 0.5, 1.1, 0xff7878, this.kind === 'swarm' ? 2 : 5); this.lunge = 0.15; }
    }
  }
  sync(t, dt) {
    const m = this.model, S = this.spec;
    place(m.root, this.x, this.z, 0);
    m.root.scale.setScalar(S.size * (1 + 0.2 * this.punch));       // 맞는 순간 움찔 커진다
    const back = clamp(this.kb / 9, 0, 1);
    if (m.legs.length) {
      this.wp += dt * this.moved * (this.kind === 'swarm' ? 3.6 : 2.6);     // 걸음 위상은 실제로 걸은 만큼만 나아간다
      this.stride = (this.stride || 0) + ((this.moved ? 1 : 0) - (this.stride || 0)) * Math.min(1, dt * 8);
      // 밀려날 때: 한 발을 뒤로 버티고 상체를 젖힌다 (발밑에 먼지)
      const shove = this.engaged ? clamp(this.game.adv / SCROLL, 0, 1) : 0;
      this.brace = (this.brace || 0) + (shove - (this.brace || 0)) * Math.min(1, dt * 10);
      const ph = this.wp, a = Math.sin(ph) * 0.7 * this.stride, b = this.brace;
      m.legs[0].rotation.x = a - 0.45 * b; m.legs[1].rotation.x = -a + 0.5 * b;
      this.lunge = Math.max(0, (this.lunge || 0) - dt);
      m.body.position.set(0, Math.abs(Math.sin(ph)) * 0.08 * this.stride + back * 0.25, this.lunge * 4);
      m.body.rotation.x = 0.28 * b - 0.6 * back;
      if (b > 0.5 && Math.random() < dt * 9) this.game.sparks(this.x + rand(-0.3, 0.3), this.z + 0.3, 0.1, 0xb8a080, 1);
    } else if (this.kind === 'rusher') {
      m.body.position.y = 0.25 + Math.sin(t * 9 + this.phase) * 0.1;
      m.body.rotation.z = t * 6 + this.phase;
    } else if (S.fly) {
      m.body.position.y = 2.4 + Math.sin(t * 2.2 + this.phase) * 0.25;
      m.body.rotation.z = Math.sin(t * 1.4 + this.phase) * 0.12; m.body.rotation.x = -0.5 * back;
    } else m.body.rotation.x = -0.25 * back;
    const blink = this.kind === 'rusher' && Math.floor(t * 12 + this.phase) % 2 === 0;
    m.bodyMat.emissive.setHex(this.flash > 0 ? 0xffffff : blink ? 0x803000 : 0x000000);
  }
  dispose() { scene.remove(this.model.root); this.model.bodyMat.dispose(); }
}

// ------------------------------------------------------------------ 게임
const $ = id => document.getElementById(id);
const el = { dist: $('dist'), zone: $('zone'), kills: $('kills'), autoDodge: $('autoDodge'), autoSkill: $('autoSkill'), focus: $('focus'), banner: $('banner'),
  skill: $('skill'), skillText: $('skillText'), overlay: $('overlay'), body: $('overlayBody'),
  viewBtn: $('viewBtn'), cards: $('cards'), topbar: $('topbar'), progLabel: $('progLabel'), progFill: $('progFill'), progText: $('progText'), plv: $('plv'), xpFill: $('xpFill'),
  lvBadge: $('lvBadge'), cutin: $('cutin'), lvup: $('lvup'), flash: $('flash'), hurt: $('hurt') };
// 튜토리얼 화면 요소: 말풍선, 버튼을 감싸는 빛 테두리, 끄는 방향을 보여 주는 손가락(흰 점)
const tutUI = (() => {
  const css = document.createElement('style');
  css.textContent = `
#tut { position: fixed; inset: 0; pointer-events: none; z-index: 60; display: none; }
#tut.on { display: block; }
#tut .tbub { position: absolute; left: 50%; transform: translateX(-50%); top: 47%; width: min(80vw, 320px);
  background: rgba(14, 18, 34, .93); border: 1.5px solid #ffdc5aaa; border-radius: 14px; padding: 11px 14px 6px; color: #f0f4ff;
  font: 700 15px/1.5 system-ui, sans-serif; text-align: center; box-shadow: 0 8px 30px #0009; }
#tut.low .tbub { top: auto; bottom: calc(96px + env(safe-area-inset-bottom)); }
#tut .tbub p { margin: 0; } #tut .tbub p small { display: block; font-weight: 500; font-size: 12.5px; color: #b8c0dc; margin-top: 2px; }
#tut .tbtns { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 6px; }
#tut button { pointer-events: auto; border: 0; border-radius: 9px; font: 700 13px system-ui, sans-serif; padding: 7px 14px; cursor: pointer; }
#tut .tok { background: #ffdc5a; color: #2a2008; display: none; } #tut.ask .tok { display: inline-block; }
#tut .tskip { all: unset; pointer-events: auto; cursor: pointer; color: #8a94b4; padding: 4px 8px; font: 500 12px system-ui, sans-serif; text-decoration: underline; }
#tut .tring { position: absolute; border: 3px solid #ffdc5a; border-radius: 14px; box-shadow: 0 0 0 4px #ffdc5a40, 0 0 20px #ffdc5a; display: none; animation: tutPulse 1s ease-in-out infinite; }
@keyframes tutPulse { 50% { transform: scale(1.07); opacity: .55; } }
#tut .tdot { position: absolute; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%; background: rgba(255, 255, 255, .92);
  box-shadow: 0 0 0 7px rgba(255, 255, 255, .3), 0 4px 14px #0009; display: none; }
#tut .tline { position: absolute; height: 8px; margin-top: -4px; border-radius: 4px; transform-origin: 0 50%; display: none;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, .6)); }`;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'tut';
  root.innerHTML = `<div class="tbub"><p></p><div class="tbtns"><button class="tok">알겠어요</button><button class="tskip">튜토리얼 건너뛰기</button></div></div>`
    + '<i class="tring"></i>'.repeat(2) + '<i class="tline"></i><i class="tdot"></i>'.repeat(2);
  document.body.appendChild(root);
  return { root, msg: root.querySelector('.tbub p'), ok: root.querySelector('.tok'), skip: root.querySelector('.tskip'),
    rings: [...root.querySelectorAll('.tring')], dots: [...root.querySelectorAll('.tdot')], lines: [...root.querySelectorAll('.tline')] };
})();
const replay = e => { e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); };      // CSS 연출을 처음부터 다시 튼다

class Game {
  constructor() {
    this.state = 'start'; this.clock = 0; this.viewIdx = 0;
    this.camPos = new THREE.Vector3(...VIEWS[0].pos); this.camLook = new THREE.Vector3(...VIEWS[0].look);
    this.girls = []; this.enemies = []; this.shells = []; this.tracers = []; this.booms = []; this.fxParts = []; this.pops = [];
    this.mouse = [-1, -1]; this.drags = new Map(); this.hint = null; this.blocked = null; this.arcs = [];
    this.ghost = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0x6ef08c, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
    this.ghost.visible = false; this.ghost.renderOrder = 1;
    scene.add(this.ghost);
    const sv = loadSave(), num = (o, k) => Math.max(0, (o && o[k]) | 0);
    this.loadout = sv ? sv.loadout : JSON.parse(JSON.stringify(DEFAULT_LOADOUT));
    this.cleared = sv ? Math.max(0, sv.cleared | 0) : 0;      // 도전할 수 있는 가장 높은 스테이지
    this.stage = sv ? clamp(sv.stage | 0, 0, this.cleared) : 0;
    this.parts = sv && sv.parts > 0 ? +sv.parts : 0;
    this.plv = sv ? Math.max(1, sv.plv | 0) : 1;              // 파티 레벨: 적을 잡으면 경험치가 쌓여 오른다. 모든 업그레이드의 상한
    this.xp = sv && sv.xp > 0 ? +sv.xp : 0;
    this.up = Object.fromEntries(Object.keys(UPS).map(k => [k, Math.min(this.plv, num(sv && sv.up, k))]));
    this.wlv = Object.fromEntries(Object.keys(LINES).map(k => [k, Math.min(this.plv, num(sv && sv.wlv, k))]));
    this.scroll = 0; this.kills = 0; this.autoDodge = !!(sv && sv.autoDodge); this.autoSkill = !!(sv && sv.autoSkill); this.playerShells = []; this.tutDone = !!(sv && sv.tutDone); this.tut = null; this.tutFreeze = false;      // 자동 회피·자동 스킬은 따로 켜고 끈다. 둘 다 꺼진 채로 시작하고, 켜 두면 기억한다
    this.adv = SCROLL; this.walk = 1; this.walkPh = 0; this.fightT = 0; this.dashT = 0; this.mode = 'run';     // 소대의 전진 속도와 걸음
    this.boostFx = 0; this.hitstop = 0; this.stopCd = 0; this.odT = 0; this.barrierT = 0;
    this.restartStage(this.stage);
    this.showOverlay();
  }
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, loadout: this.loadout, cleared: this.cleared, stage: this.stage,
      parts: this.parts, plv: this.plv, xp: this.xp, up: this.up, wlv: this.wlv, autoDodge: this.autoDodge, autoSkill: this.autoSkill, tutDone: !!this.tutDone })); } catch (e) { /* 무시 */ }
  }
  // ---- 성장 수치 (전부 여기서 계산한다)
  weaponId(line) { const lv = this.wlv[line]; return LINES[line].forms[lv >= EVOLVE2_LV ? 2 : lv >= EVOLVE_LV ? 1 : 0]; }     // 계열 레벨 10, 30에서 진화한 형태
  // 공격력 업그레이드와 무기 레벨은 곱하지 않고 더한다. 곱하면 레벨이 오를수록 화력이 세제곱으로 커져서 적 성장을 훌쩍 앞질렀다 (v0.34 베타 전 조정).
  atkMul() { return 1 + ATK_STEP * this.up.atk; }
  dmgMul(line) { return 1 + ATK_STEP * (this.up.atk + this.wlv[line]); }
  healMul() { return 1 + 0.03 * this.wlv.heal; }      // 수리 계열 레벨당 회복량 +3% (예전 +8%는 높은 레벨에서 실드가 순식간에 찼다)
  rateMul() { return (1 + 0.02 * this.up.spd) * (this.odT > 0 ? 1.6 : 1); }
  defMul() { return 1 / (1 + 0.05 * this.up.def); }
  maxHp() { return BASE.hp * (1 + 0.08 * this.up.hp); }
  maxSh() { return BASE.sh * (1 + 0.1 * this.up.sh); }
  wingTier() { return Math.min(FLY_TIER, Math.floor(this.plv / 10)); }
  skillMul() { return this.atkMul() + 0.04 * (this.plv - 1); }                          // 캐릭터 스킬: 공격력 업그레이드 + 파티 레벨 (더하기)
  burstDmg() { return BURST_DMG * (1 + 0.06 * (this.plv - 1)); }                       // 풀버스트: 파티 레벨에만 비례 (따로 강화 없음)
  gainXp(n) {
    this.xp += n;
    let up = 0;
    const tier0 = this.wingTier();
    while (this.xp >= xpNeed(this.plv)) { this.xp -= xpNeed(this.plv); this.plv++; up++; }
    if (up) this.levelUpFx(this.wingTier() > tier0);
  }
  // 레벨업: 소녀마다 빛기둥과 고리·불꽃·"LEVEL UP" 글자, 화면 가운데 큰 글씨, 금빛 번쩍, 상단 레벨 배지 튕김
  levelUpFx(wingGrew) {
    for (const g of this.aliveGirls()) {
      this.tracer([g.x, g.z, 0], [g.x, g.z, 11], 0xffdc5a, 1.5, 0.75); this.tracer([g.x, g.z, 0], [g.x, g.z, 11], 0xffffff, 0.6, 0.6);
      this.ring(g.x, g.z, 2.2, 0xffffff, 0.3); this.ring(g.x, g.z, 3.6, 0xffdc5a, 0.55); this.ring(g.x, g.z, 5, 0xffb020, 0.8);
      this.sparks(g.x, g.z, 0.6, 0xffdc5a, 16, 1.6); this.sparks(g.x, g.z, 2, 0xffffff, 8, 1.2);
      this.popText(g.x, g.z, 3.6, 'LEVEL UP', '#ffe27a', 17, 1.3);
      g.boost = 1; g.flash = 0.25;
      g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.15); g.sh = g.maxSh;       // 레벨업 보너스: 실드를 채우고 체력을 조금 회복
    }
    this.shake = Math.max(this.shake, 0.3); this.sfx('level');
    if (this.state !== 'play' || this.quiet) return;
    el.lvup.children[1].textContent = `파티 Lv ${this.plv}`;
    el.lvup.children[2].textContent = !wingGrew ? '강화 상한이 올랐습니다' : this.wingTier() >= FLY_TIER ? '비행 날개! 이제 날아서 전진합니다' : '날개가 자랐습니다!';
    replay(el.lvup); replay(el.flash);
    el.lvBadge.classList.remove('up'); void el.lvBadge.offsetWidth; el.lvBadge.classList.add('up');
  }
  // 스킬 컷인: 그 소녀의 그림이 화면 왼쪽 아래에서 튀어나온다
  cutIn(g) {
    if (this.quiet) return;
    const c = el.cutin;
    c.style.setProperty('--c', g.ch.color); c.style.setProperty('--img', `url(${this.cardArt(g.ch, g.weaponId)})`);
    c.querySelector('small').textContent = g.name; c.querySelector('b').textContent = g.skill.name;
    replay(c);
  }
  // 시안풍 폴리곤 소녀를 만드는 함수를 등록한다 (web/girl2_battle.js 가 부른다). 이미 서 있는 소녀들도 바로 갈아입힌다.
  setGirlFactory(fn) { this.girl2 = fn; for (const g of this.girls) g.makeModel(); }
  reset() { this.restartStage(this.stage); }
  // 스테이지를 처음부터 다시 시작한다 (재도전, 정비 후 출격, 스테이지 선택)
  restartStage(stage) {
    for (const o of [...this.girls, ...this.enemies]) o.dispose();
    for (const s of this.shells) this.dropShell(s);
    for (const t of this.tracers) scene.remove(t.mesh);
    for (const b of this.booms) { scene.remove(b.mesh); b.mesh.material.dispose(); }
    for (const a of this.arcs) { scene.remove(a.mesh); a.mesh.material.dispose(); }
    this.arcs = []; this.pops = [];
    this.stage = stage;
    this.girls = this.loadout.map((cfg, i) => new Girl(this, i, cfg));
    this.buildCards();
    this.drags.clear();
    this.enemies = []; this.shells = []; this.tracers = []; this.booms = []; this.fxParts = []; this.playerShells = [];
    partPos.fill(-9999); partGeo.attributes.position.needsUpdate = true;
    this.focus = null; this.time = 0; this.stageScroll = 0; this.gauge = 40;
    this.burstQueue = []; this.spawnT = 1.5; this.shake = 0; this.bannerT = 0;
    this.boss = null; this.bossSpawned = false;
    this.adv = SCROLL; this.fightT = 0; this.dashT = 0; this.odT = 0; this.barrierT = 0; this.hitstop = 0;
    this.applyZone();
    this.say(`스테이지 ${stageName(stage)}  ${this.def.zone.name}`, 2.5);
    this.save();
  }
  clearStage() {
    const bonus = LEVEL.clearBonus(this.stage);       // 방금 깬 스테이지의 클리어 보상
    this.stage++;
    this.cleared = Math.max(this.cleared, this.stage);
    this.stageScroll = 0; this.boss = null; this.bossSpawned = false; this.spawnT = 2.5;
    for (const g of this.girls) {
      if (g.alive) { g.sh = g.maxSh; g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.15); }
      else this.revive(g);                            // 쓰러져 있던 소녀는 스테이지를 넘기면 바로 돌아온다
    }
    this.parts += bonus;
    this.applyZone();
    this.say(`스테이지 ${stageName(this.stage)}  ·  부품 +${bonus}`, 2.4);
    this.sfx('clear');
    this.save();
  }
  get distM() { return this.stageScroll * METERS; }
  aliveGirls() { return this.girls.filter(g => g.alive); }
  nearestGirl(x, z) {
    let best = null, bd = Infinity;
    for (const g of this.girls) if (g.alive) { const d = (g.x - x) ** 2 + (g.z - z) ** 2; if (d < bd) { best = g; bd = d; } }
    return best;
  }
  applyZone() {
    const z = ZONES[Math.floor(this.stage / 5) % ZONES.length];
    scene.background = z.sky; scene.fog.color.setHex(z.fog); planet.material.color.setHex(z.ground); glowMat.color.setHex(z.glow);
    if (planet.material.map !== GROUND_TEX[z.tex]) { planet.material.map = GROUND_TEX[z.tex]; planet.material.needsUpdate = true; }
    rockMat.color.setHex(z.rock);
    for (const [name, meshes] of Object.entries(PROPS)) for (const m of meshes) m.visible = name === z.prop;
    PROPS.crystal[0].material.color.setHex(z.glow); PROPS.crystal[0].material.emissive.setHex(z.glow);
    this.def = stageDef(this.stage);
    return z;
  }
  say(text, sec) { el.banner.textContent = text; el.banner.style.opacity = 1; this.bannerT = sec; }

  // ---- 이펙트
  sfx(name) { if (this.audio) this.audio(name); }       // 효과음은 따로 붙인다 (web/sound.js). 없으면 조용히 넘어간다
  stop(sec) { if (this.stopCd <= 0) { this.hitstop = Math.max(this.hitstop, sec); this.stopCd = 0.2; } }     // 타격 순간의 아주 짧은 멈춤
  tracer(a, b, color, width, dur) {
    const mesh = new THREE.Mesh(GEO.box, tracerMat(color));
    surf(a[0], a[1], a[2], _v); surf(b[0], b[1], b[2], _v2);
    mesh.position.copy(_v).add(_v2).multiplyScalar(0.5);
    mesh.lookAt(_v2);
    const len = _v.distanceTo(_v2);
    mesh.scale.set(width, width, len);
    scene.add(mesh);
    this.tracers.push({ mesh, ttl: dur, dur, width, len });
  }
  explosion(x, z, radius, color) {
    const mesh = new THREE.Mesh(GEO.ico1, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    place(mesh, x, z, 0.4);
    scene.add(mesh);
    this.booms.push({ mesh, x, z, radius, t: 0, dur: 0.38 });
    this.sparks(x, z, 0.6, color, 12);
  }
  ring(x, z, radius, color, dur = 0.3) {      // 바닥에 퍼지는 충격 고리
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    place(mesh, x, z, 0.4);
    scene.add(mesh);
    this.booms.push({ mesh, x, z, radius, t: 0, dur });
  }
  arc(x, z, radius, color, dir, dur, yaw = 0) {      // 베는 궤적 (yaw: 벤 방향)
    const mesh = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false }));
    place(mesh, x, z, 1.9);
    mesh.rotateY(-yaw); mesh.rotateZ(dir * 0.55); mesh.rotateY(dir * 0.7);
    scene.add(mesh);
    this.arcs.push({ mesh, radius, dir, t: 0, dur });
  }
  hitMark(x, z, h, color, size) {              // 맞은 자리에 번쩍이는 별 모양 섬광
    const m = MARKS[this.markI = ((this.markI || 0) + 1) % MARKS.length];
    surf(x + rand(-0.3, 0.3), z, h + rand(-0.2, 0.3), m.sp.position);
    m.sp.material.color.setHex(color); m.sp.material.rotation = rand(0, 6.28);
    m.t = 0; m.dur = 0.13; m.size = size; m.sp.visible = true;
  }
  popNum(e, dmg, crit) {                       // 피해 숫자
    const n = Math.max(1, Math.round(dmg));
    this.pops.push({ x: e.x + rand(-0.6, 0.6), z: e.z, h: e.aim + 0.9, text: crit ? n + '!' : '' + n, color: crit ? '#ffd23c' : '#ffffff',
      size: crit ? 25 : 14, t: 0, dur: crit ? 0.8 : 0.55, vx: rand(-22, 22), crit });
    if (this.pops.length > 80) this.pops.splice(0, this.pops.length - 80);
  }
  popText(x, z, h, text, color, size, dur, big = false) { this.pops.push({ x, z, h, text, color, size, t: 0, dur, vx: 0, crit: big }); }
  bomb(x, z, delay, dmg, radius, color) {      // 하늘에서 떨어지는 아군 폭격
    this.playerShells.push({ x, z, t: delay, dmg, radius, color, fall: true });
  }
  sparks(x, z, h, color, n, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), sp = rand(1.5, 6) * speed, life = rand(0.25, 0.55);
      this.fxParts.push({ x, z, h, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: rand(1, 6) * speed, life, max: life, color });
    }
    if (this.fxParts.length > PART_N) this.fxParts.splice(0, this.fxParts.length - PART_N);
  }
  girlInCell(c, r) { return this.girls.find(g => g.alive && g.col === c && g.row === r) || null; }
  isWarned(c, r) { return this.shells.some(s => s.col === c && s.row === r); }
  freeNeighbors(c, r) {   // 비어 있고 예고도 없는 이웃 칸
    const out = [];
    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (!this.girlInCell(nc, nr) && !this.isWarned(nc, nr)) out.push([dc, dr]);
    }
    return out;
  }
  // 위험한 칸(warned)에 선 소녀가 안전한 칸까지 가는 길의 첫 걸음. depth 걸음 안에 길이 없으면 null.
  escapeStep(g, warned, depth) {
    const key = (c, r) => c + ',' + r, seen = new Set([key(g.col, g.row)]);
    let frontier = [[g.col, g.row, null]];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const [c, r, first] of frontier) for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nc = c + dc, nr = r + dr, k = key(nc, nr);
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || seen.has(k)) continue;
        const o = this.girlInCell(nc, nr);
        if (o && o !== g) continue;
        seen.add(k);
        const f = first || [dc, dr];
        if (!warned.has(k)) return f;
        next.push([nc, nr, f]);
      }
      frontier = next;
    }
    return null;
  }
  warnedSet() { return new Set(this.shells.map(s => s.col + ',' + s.row)); }
  // 예고 공격. 종류마다 위험한 칸의 모양이 달라서 피하는 방향이 다르다. 피할 길이 없는 소녀가 생기면 쏘지 않는다.
  //  cell 한 칸 / pair 한 칸 + 피할 자리 하나 / col 세로 한 줄(옆으로) / row 가로 한 줄(앞뒤로) / cross 십자(대각선으로 두 걸음) / checker 한 줄 건너 세로줄
  firePattern(enemy, nearest) {
    if (new Set(this.shells.map(s => s.gid)).size >= MAX_WARNED) return false;
    const alive = this.aliveGirls();
    if (!alive.length) return false;
    const tgt = Math.random() < 0.7 ? nearest : alive[Math.floor(Math.random() * alive.length)];
    const type = enemy.pats[enemy.patI % enemy.pats.length], c = tgt.col, r = tgt.row;
    if (this.isWarned(c, r)) return false;
    let cells = [[c, r]], dur = SHELL_FLIGHT, depth = 1;
    if (type === 'col') { cells = Array.from({ length: ROWS }, (_, i) => [c, i]); dur = 1.8; }
    else if (type === 'row') { cells = Array.from({ length: COLS }, (_, i) => [i, r]); dur = 2.3; }
    else if (type === 'cross') { cells = [[c, r], [c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]; dur = 2.8; depth = 2; }
    else if (type === 'checker') { cells = []; for (let i = c % 2; i < COLS; i += 2) for (let j = 0; j < ROWS; j++) cells.push([i, j]); dur = 2.5; }
    else if (type === 'pair') { const n = this.freeNeighbors(c, r); if (n.length > 1) { const [dc, dr] = n[Math.floor(Math.random() * n.length)]; cells.push([c + dc, r + dr]); } dur = 2.2; }
    cells = cells.filter(([a, b]) => a >= 0 && a < COLS && b >= 0 && b < ROWS && !this.isWarned(a, b));
    const warned = this.warnedSet();
    for (const [a, b] of cells) warned.add(a + ',' + b);
    for (const g of alive) if (warned.has(g.col + ',' + g.row) && !this.escapeStep(g, warned, depth)) return false;
    this.spawnShells(enemy, cells, type, dur);
    enemy.patI++;
    this.sfx('warn');
    return true;
  }
  // 예고 원(과 한 칸짜리면 날아오는 포탄)을 깐다. 판정은 칸 단위, 화면의 원은 그 칸에 선 소녀를 겨눈다.
  spawnShells(enemy, cells, type, dur) {
    const gid = this.gidN = (this.gidN || 0) + 1, single = type === 'cell' || type === 'pair', color = PAT_COLOR[type], out = [];
    cells.forEach(([a, b], i) => {
      const who = this.girlInCell(a, b);
      const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
      const rad = single ? SHELL_RADIUS : 1.42;
      disc.renderOrder = ring.renderOrder = 2; ring.scale.setScalar(rad);
      const ball = single ? part(GEO.ico0, MAT.flame, 0.3, 0.3, 0.3) : null;     // 한 칸짜리는 포탄이 날아오는 것이 보인다
      scene.add(disc, ring); if (ball) scene.add(ball);
      // 판정은 칸 단위지만, 화면에는 그 자리를 겨눈 원으로 보인다
      const sh = { type, gid, first: i === 0, x0: enemy.x, z0: enemy.z, col: a, row: b, tx: who ? who.standX() : COL_X[a], tz: who ? who.standZ() : ROW_Z[b],
        dmg: (enemy.dmg || 0) * PATTERN_MUL, had: who, t: 0, dur, rad, ball, disc, ring };
      this.shells.push(sh); out.push(sh);
    });
    return out;
  }
  dropShell(s) { scene.remove(s.disc, s.ring); if (s.ball) scene.remove(s.ball); s.disc.material.dispose(); s.ring.material.dispose(); }

  // ---- 전투 처리
  // o: { kb 밀어내는 힘, melee 근접 타격(섬광·짧은 멈춤), tick 지속 피해(숫자를 모아서 띄움), color, noCrit }
  hitEnemy(e, dmg, o = {}) {
    if (!e.alive) return;
    const crit = !o.noCrit && Math.random() < CRIT_P + (o.by && o.by.inField ? FIELD_CRIT : 0);      // 영역 전개 안에서 친 공격은 크리티컬이 더 잘 터진다
    if (crit) dmg *= CRIT_MUL;
    e.hp -= dmg; e.flash = crit ? 0.14 : 0.08; e.punch = crit ? 1.5 : 1;
    if (o.kb && e.kbImm <= 0) e.kb = Math.max(e.kb, o.kb * e.spec.kb * (crit ? 1.5 : 1));      // 한 번 밀려난 적은 잠깐 동안 다시 밀리지 않는다
    if (o.tick && !crit) { if (e.acc <= 0) e.accT = 0.22; e.acc += dmg; }
    else this.popNum(e, dmg, crit);
    if (crit) {                      // 크리티컬: 큰 숫자, 금빛 섬광과 불꽃, 근접이면 아주 짧게 멈춘다
      this.hitMark(e.x, e.z, e.aim, 0xffe27a, 1.7); this.sparks(e.x, e.z, e.aim, 0xffe27a, 7, 1.4);
      this.shake = Math.max(this.shake, 0.16);
      if (o.melee) this.stop(0.04);
      this.sfx('crit');
    } else if (o.melee) { this.hitMark(e.x, e.z, e.aim, o.color || 0xffffff, 1.1); this.sparks(e.x, e.z, e.aim, o.color || 0xffffff, 3); }
    else if (!o.tick) this.hitMark(e.x, e.z, e.aim, 0xfff0c0, 0.6);
    if (e.hp <= 0) this.kill(e);
  }
  kill(e) {
    e.alive = false; this.kills++;
    const S = e.spec, k = LEVEL.parts(this.stage), gain = Math.max(1, Math.round(S.parts * k)), big = e.kind === 'tank' || e.kind === 'boss';
    this.parts += gain;
    this.gainXp(Math.max(1, Math.round(S.xp * k)));
    this.gauge = Math.min(100, this.gauge + 0.35 * S.xp);
    this.popText(e.x, e.z, e.aim + 0.3, `+${gain}`, '#ffdc5a', 12, 0.75);         // 얻은 부품은 작게
    // 터지는 연출: 몸 색 파편 + 하얀 섬광 + 바닥 고리
    const col = e.model.bodyMat.color.getHex();
    this.sparks(e.x, e.z, e.aim, col, big ? 26 : e.kind === 'swarm' ? 7 : 12, big ? 1.8 : 1.2);
    this.sparks(e.x, e.z, e.aim, 0xffffff, big ? 10 : 3, 1.6);
    this.ring(e.x, e.z, S.size * (big ? 3.2 : 1.7), 0xffffff, big ? 0.4 : 0.22);
    if (big) { this.explosion(e.x, e.z, S.size * 2.2, 0xffdc5a); this.shake = Math.max(this.shake, e.kind === 'boss' ? 1 : 0.4); this.stop(0.07); }
    this.sfx(big ? 'boom' : 'kill');
    if (e === this.focus) this.focus = null;
  }
  // 바닥 예고 공격에 맞았다: 크게 깎이고, 맞았다는 것이 화면 전체로 느껴지게 한다
  patternHit(g, s) {
    const before = g.hp + g.sh;
    g.take(s.dmg);
    const lost = Math.round(before - (g.hp + g.sh));
    if (lost <= 0) return;      // 무적 중이었다
    this.popText(g.x, g.z, 3.3, `-${lost}`, '#ff5a6a', 27, 1.1, true);
    this.ring(g.x, g.z, 3.4, 0xff3040, 0.4); this.sparks(g.x, g.z, 1.4, 0xff5a6a, 16, 1.5);
    this.shake = Math.max(this.shake, 1); this.stop(0.07); this.sfx('down');
    if (!this.quiet) replay(el.hurt);
  }
  girlDown(g) {
    this.explosion(g.x, g.z, 2.2, 0xffffff);
    this.shake = 1; this.say(`${g.name} 쓰러짐 — 다음 스테이지에서 복귀`, 2);
    g.model.root.visible = false;
    this.sfx('down');
  }
  // 쓰러진 소녀는 스테이지 안에서는 돌아오지 않는다(부활 없음). 스테이지를 넘기면 돌아온다: 제자리(막혀 있으면 가까운 빈 칸)에 체력 절반, 실드 가득, 잠깐 무적
  revive(g) {
    const ok = (c, r) => !this.girlInCell(c, r) && !this.isWarned(c, r);
    let cell = ok(g.home[0], g.home[1]) ? g.home : null;
    for (let r = ROWS - 1; r >= 0 && !cell; r--) for (let c = 0; c < COLS && !cell; c++) if (ok(c, r)) cell = [c, r];
    if (!cell) cell = g.home;
    g.col = cell[0]; g.row = cell[1]; g.x = g.standX(); g.z = g.standZ();
    g.alive = true; g.hp = g.maxHp * 0.5; g.sh = g.maxSh; g.inv = 2; g.model.root.visible = true;
    this.ring(g.x, g.z, 3.2, 0x9fffd0, 0.5); this.sparks(g.x, g.z, 1.4, 0x9fffd0, 14);
    this.sfx('revive');
  }
  // 상하좌우 한 칸 이동. 다른 소녀가 있는 칸이나 칸 밖으로는 못 간다.
  tryMove(g, dc, dr, manual) {
    if (!g.alive) return 'blocked';
    if (g.moveCd > 0) return 'cooldown';
    const nc = g.col + dc, nr = g.row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || this.girlInCell(nc, nr)) {
      if (manual) this.blocked = { col: clamp(nc, 0, COLS - 1), row: clamp(nr, 0, ROWS - 1), t: 0.25 };
      return 'blocked';
    }
    this.sparks(g.x, g.z, 0.5, 0x9fe8ff, 8); this.ring(g.x, g.z, 1.5, 0x9fe8ff, 0.2);
    g.col = nc; g.row = nr; g.moveCd = BASE.moveCd; g.autoT = 0; g.boost = 1;      // 부스터를 확 뿜으며 옮겨 간다
    this.sfx('move');
    if (manual) { g.hold = 6; g.home = [nc, nr]; }
    return 'ok';
  }
  // 풀버스트: 게이지가 차면 눌러서 쓴다(자동으로는 쓰지 않는다). 위력은 파티 레벨에 비례한다.
  useSkill() {
    if (this.gauge < 100 || this.state !== 'play') return false;
    const targets = this.enemies.filter(e => e.z < VISIBLE_Z).sort((a, b) => a.z - b.z).slice(0, 16);
    if (!targets.length) return false;
    this.gauge = 0;
    this.burstQueue = targets.map((e, i) => ({ t: 0.06 * i, e }));
    this.say('풀버스트!', 1); this.sfx('burst');
    for (const g of this.aliveGirls()) { g.fireFlash = 0.3; g.boost = 1; this.ring(g.x, g.z, 3, 0xffdc5a, 0.35); }
    return true;
  }
  // 캐릭터 스킬. manual: 카드를 눌러서 쓴 경우 (자동 보조는 쓸모가 있을 때만 쓴다)
  castSkill(i, manual) {
    const g = this.girls[i];
    if (!g || !g.alive || g.skT > 0 || this.state !== 'play') return false;
    const n = g.ch.name, mul = this.skillMul(), alive = this.aliveGirls();
    if (n === 'OPUS') {                    // 오버드라이브: 부대 전체 공격 속도
      this.odT = 6;
      for (const o of alive) { this.ring(o.x, o.z, 2.6, 0xffdc5a, 0.4); this.sparks(o.x, o.z, 1.6, 0xffdc5a, 10); }
    } else if (n === 'SONNET') {           // 방벽: 실드를 채우고 피해 감소
      this.barrierT = 4;
      for (const o of alive) { o.sh = o.maxSh; this.ring(o.x, o.z, 2.8, 0x60c8ff, 0.5); this.sparks(o.x, o.z, 1.6, 0x60c8ff, 10); }
    } else if (n === 'HAIKU') {            // 질풍 돌격: 자기 줄을 앞으로 가른다
      const hits = this.enemies.filter(e => e.alive && Math.abs(e.x - g.x) < 3.2 && e.z > g.z - 1 && e.z < g.z + 36);
      if (!hits.length && !manual) return false;
      g.dashT = 0.42; g.boost = 1.3; g.inv = Math.max(g.inv, 0.5);
      for (const e of hits) this.hitEnemy(e, 70 * mul, { kb: 18, melee: true, color: 0xffb02e, by: g });
      this.tracer([g.x, g.z, 1.4], [g.x, g.z + 36, 1.4], 0xffb02e, 1.5, 0.3); this.tracer([g.x, g.z, 1.4], [g.x, g.z + 36, 1.4], 0xffffff, 0.5, 0.26);
      for (let k = 1; k <= 4; k++) this.arc(g.x, g.z + k * 7, 4.6, k % 2 ? 0xffb02e : 0xffffff, k % 2 ? 1 : -1, 0.3, 0);
      this.shake = Math.max(this.shake, 0.5); this.stop(0.05);
    } else {                               // 꽃불 폭격: 적이 가장 몰린 곳에 세 번
      const vis = this.enemies.filter(e => e.alive && e.z < VISIBLE_Z);
      let best = null, bn = 0;
      for (const e of vis.slice(0, 40)) {
        let c = 0;
        for (const o of vis) if ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 36) c += o.kind === 'swarm' ? 0.5 : 1;
        if (c > bn) { bn = c; best = e; }
      }
      if (!best || (!manual && bn < 3)) return false;
      [[0, 0, 0xff7a5a], [-2.6, 1.8, 0xffd27a], [2.6, -1.6, 0xff9ad0]].forEach(([dx, dz, col], k) => this.bomb(best.x + dx, best.z + dz, 0.25 + 0.16 * k, 62 * mul, 6.2 - k * 0.6, col));
    }
    g.skT = g.skill.cd;
    this.cutIn(g); this.sfx('skill');
    return true;
  }
  girlRect(g) {
    const a = toScreen(g.x, g.z, 0), b = toScreen(g.x, g.z, USE_SPRITES ? 3.2 : 2.75);
    if (!a || !b) return null;
    const h = a[1] - b[1];
    // 위에서 내려다볼수록 발과 머리가 화면에서 겹쳐 키(h)가 0에 가까워진다. 그래도 잡을 수 있게 몸 둘레만큼은 항상 확보한다.
    const c = toScreen(g.x, g.z, 1.4), s = toScreen(g.x + 1, g.z, 1.4);
    const u = Math.max(24, c && s ? Math.abs(s[0] - c[0]) * 1.2 : 0), cy = c ? c[1] : (a[1] + b[1]) / 2;
    const x0 = Math.min(a[0] - h * 0.42, a[0] - u), x1 = Math.max(a[0] + h * 0.42, a[0] + u);
    const y0 = Math.min(b[1] - h * 0.05, cy - u), y1 = Math.max(b[1] + h * 1.1, cy + u);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: a[0], top: Math.min(b[1], y0 + (y1 - y0) * 0.05), bottom: a[1] };
  }
  girlAt(px, py, skip) {
    let best = null, bd = Infinity;          // 영역이 겹치면 누른 곳에 가장 가까운 소녀를 고른다
    for (const g of this.aliveGirls()) {
      if (skip && skip.includes(g)) continue;
      const r = this.girlRect(g);
      if (!r || px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
      const d = (px - r.x - r.w / 2) ** 2 + (py - r.y - r.h / 2) ** 2;
      if (d < bd) { best = g; bd = d; }
    }
    return best;
  }
  enemyAt(px, py) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.z >= VISIBLE_Z) continue;
      const p = toScreen(e.x, e.z, e.aim), q = toScreen(e.x, e.z, e.aim + 1);
      if (!p || !q) continue;
      const r = Math.max(30, (p[1] - q[1]) * 1.4), d = (p[0] - px) ** 2 + (p[1] - py) ** 2;
      if (d < r * r && d < bd) { best = e; bd = d; }
    }
    return best;
  }
  // 멀티터치: 손가락(포인터)마다 따로 소녀 하나를 끈다. 두 명을 동시에 피하게 할 수 있다. id = 포인터 번호
  pointerDown(px, py, id = 0) {
    if (this.state === 'start') { this.start(); return; }
    if (this.state !== 'play') return;      // 일시정지·전멸·정비 화면은 버튼으로만 조작한다
    this.mouse = [px, py];
    const g = this.girlAt(px, py, [...this.drags.values()].map(d => d.g));      // 다른 손가락이 이미 잡은 소녀는 건너뛴다
    if (g) { this.drags.set(id, { g, ox: px, oy: py, x: px, y: py, sx: px, sy: py, t: this.clock, moved: false, hint: null }); return; }
    if (this.drags.size) return;            // 한 손으로 끄는 중에 다른 손가락이 빈 곳을 스쳐도 집중 사격이 바뀌지 않게
    const e = this.enemyAt(px, py);
    this.focus = e && e !== this.focus ? e : null;   // 적을 누르면 집중 사격, 빈 곳이나 같은 적을 누르면 해제
  }
  pointerMove(px, py, id = 0) {
    this.mouse = [px, py];
    const d = this.drags.get(id);
    if (d) { d.x = px; d.y = py; this.processDrag(d, id); }
  }
  pointerUp(id = 0) {      // 끌지 않고 짧게 눌렀다 떼면 그 소녀의 스킬
    const d = this.drags.get(id);
    if (d && !d.moved && Math.hypot(d.x - d.sx, d.y - d.sy) < 12 && this.clock - d.t < 0.45) this.castSkill(d.g.slot, true);
    this.drags.delete(id);
    this.hint = [...this.drags.values()].map(o => o.hint).find(Boolean) || null;
  }
  dragDir(d) {
    const dx = d.x - d.ox, dy = d.y - d.oy;
    return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, dy < 0 ? -1 : 1];   // 위로 끌면 앞줄 쪽
  }
  // 손가락을 떼지 않고 계속 끌면 쿨타임마다 한 칸씩 이어서 움직인다 (뒤로 갔다가 옆으로 등)
  processDrags() {
    for (const [id, d] of [...this.drags]) this.processDrag(d, id);
    if (!this.drags.size) this.hint = null;
  }
  processDrag(d, id) {
    if (this.state !== 'play') { this.hint = null; return; }
    if (!d.g.alive) { this.drags.delete(id); return; }
    const len = Math.hypot(d.x - d.ox, d.y - d.oy), th = Math.max(26, Math.min(W, H) * 0.05);
    d.hint = null;
    if (len >= th * 0.4) {
      const [dc, dr] = this.dragDir(d), nc = d.g.col + dc, nr = d.g.row + dr;
      const inside = nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS;
      d.hint = inside ? { col: nc, row: nr, ok: !this.girlInCell(nc, nr) } : null;
      if (len >= th && this.tryMove(d.g, dc, dr, true) !== 'cooldown') { d.ox = d.x; d.oy = d.y; d.moved = true; d.hint = null; }
    }
    this.hint = [...this.drags.values()].map(o => o.hint).find(Boolean) || null;
  }
  // ---- 튜토리얼 (처음 출격할 때 한 번. 일시정지 화면에서 다시 볼 수 있다)
  //  ① 지켜보기 → ② 포격 적: 아래로 끌어 피하기 → ③ 세로줄: 옆으로 → ④ 두 명 동시에 → ⑤ 정비(무기·힐러·강화) → ⑥ 자동 버튼 안내
  //  피할 차례가 오면 시간이 멈추고 손가락이 끄는 방향을 보여 준다. 진행 중에는 맞아도 피해가 없다.
  tutBegin() {
    this.tutClear();
    this.tut = { step: 'intro', t: 0, msg: '', targets: [], drill: null, n: 0 };
    this.tutFreeze = false;
    tutUI.root.classList.add('on');
  }
  tutClear() {      // 튜토리얼이 깔아 둔 것(포격 적, 예고)을 치운다
    for (const e of this.enemies) if (e.tutor) { e.tutor = false; e.alive = false; }
    for (const s of this.shells) if (s.tut) this.dropShell(s);
    this.shells = this.shells.filter(s => !s.tut);
  }
  tutEnd(done) {
    this.tutClear();
    this.tut = null; this.tutFreeze = false;
    tutUI.root.className = '';
    this.tutDone = true; this.save();
    if (done) { this.say('튜토리얼 완료!', 2.6); this.sfx('clear'); }
  }
  tutGo(step) { this.tut.step = step; this.tut.t = 0; this.tut.started = false; }
  // 피하기 연습 하나를 시작한다. n: 0 아래로, 1 옆으로, 2 두 명 동시에. 지금 자리에서 할 수 없으면 false
  tutDrill(n) {
    const al = this.aliveGirls(), inb = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS, free = (c, r) => inb(c, r) && !this.girlInCell(c, r);
    let girls = [], dests = [], cells = [], type = 'cell', msg = '';
    if (n === 0) {
      const g = al.find(o => free(o.col, o.row + 1));
      if (!g) return false;
      girls = [g]; dests = [[g.col, g.row + 1]]; type = 'cross';
      cells = [[g.col, g.row], [g.col - 1, g.row], [g.col + 1, g.row], [g.col, g.row - 1]].filter(([c, r]) => inb(c, r) && !this.girlInCell(c, r) || (c === g.col && r === g.row));
      msg = '소녀를 <b>아래로</b> 끌어서 피하세요!<small>손가락으로 소녀를 누른 채 아래로 쓱</small>';
    } else if (n === 1) {
      for (const g of al) {
        if (al.some(o => o !== g && o.col === g.col)) continue;
        const side = [1, -1].find(sd => free(g.col + sd, g.row));
        if (side == null) continue;
        girls = [g]; dests = [[g.col + side, g.row]]; break;
      }
      if (!girls.length) return false;
      type = 'col'; cells = Array.from({ length: ROWS }, (_, r) => [girls[0].col, r]);
      msg = '세로 한 줄이 위험해요! <b>옆으로</b> 끌어서 피하세요';
    } else {
      const taken = new Set();
      for (const g of al) {
        if (girls.length >= 2) break;
        const d = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dc, dr]) => [g.col + dc, g.row + dr]).find(([c, r]) => free(c, r) && !taken.has(c + ',' + r));
        if (!d) continue;
        taken.add(d[0] + ',' + d[1]); girls.push(g); dests.push(d);
      }
      if (girls.length < 2) return false;
      cells = girls.map(g => [g.col, g.row]);
      msg = '두 명이 동시에 위험해요! <b>두 손가락</b>으로 함께 끌어 보세요<small>하나씩 끌어도 괜찮아요</small>';
    }
    const art = this.enemies.find(e => e.tutor && e.alive) || { x: 0, z: 40, dmg: 0 };
    const id = (this.tutN = (this.tutN || 0) + 1);
    for (const s of this.spawnShells(art, cells, type, 2.4)) s.tut = id;
    this.sfx('warn');
    this.tut.drill = { n, id, girls, dests, msg, frozen: false, after: 0 };
    return true;
  }
  tutSafe(D) { return D.girls.every(g => !g.alive || !this.shells.some(s => s.tut === D.id && s.col === g.col && s.row === g.row)); }
  tutTick(dt) {
    const T = this.tut, play = this.state === 'play', shop = this.state === 'shop';
    T.t += dt; T.targets = []; T.ask = false; T.low = false;
    const q = sel => document.querySelector(sel);
    switch (T.step) {
      case 'intro':
        T.msg = '소녀들은 <b>알아서</b> 싸워요<small>잠깐 지켜보세요</small>';
        if (T.t > 4.5) {
          const e = new Enemy(this, 'art', 0, 46); e.tutor = true; e.laneX = 0; this.enemies.push(e);
          this.tutGo('art');
        }
        break;
      case 'art':
        T.msg = '<b>포격 적</b>이 나타났어요!<small>포탄이 떨어질 자리는 바닥에 표시돼요</small>';
        if (T.t > 2.6) { T.n = 0; this.tutGo('drill'); }
        break;
      case 'drill': {
        if (!T.drill) {
          while (T.n < 3 && !this.tutDrill(T.n)) T.n++;     // 지금 자리로는 할 수 없는 연습은 건너뛴다
          if (T.n >= 3) { this.tutGo('praise'); break; }
          T.t = 0;
        }
        const D = T.drill, safe = this.tutSafe(D);
        if (!D.frozen && !safe && T.t > 0.45) { D.frozen = true; this.tutFreeze = true; }
        if (this.tutFreeze && safe) this.tutFreeze = false;
        T.msg = safe ? '<b>회피 성공!</b>' : D.msg;
        if (!this.shells.some(s => s.tut === D.id)) {          // 포탄이 떨어졌다
          D.after += dt;
          if (D.after > 1.1) { T.drill = null; T.n++; if (T.n >= 3) this.tutGo('praise'); }
        }
        break;
      }
      case 'praise':
        T.msg = '잘했어요! 이번엔 <b>정비</b>를 해 볼게요';
        if (T.t > 1.8) { this.tutClear(); this.parts = Math.max(this.parts, upCost(0) + 20); this.tutGo('shopBtn'); }
        break;
      case 'shopBtn':
        if (shop) { T.orig = this.loadout.map(x => x.line).join(); this.tutGo('sel'); break; }
        this.tutFreeze = play;
        T.msg = '오른쪽 위 <b>정비</b> 버튼을 눌러 보세요'; T.targets = ['#shopBtn'];
        break;
      case 'sel': case 'line': case 'heal': case 'up': case 'go': {
        if (!shop) { if (play) { this.tutGo('auto'); this.tutFreeze = true; } break; }
        const d = this.draft;
        if (T.step === 'sel' && this.shopSel != null) this.tutGo('line');
        if (T.step === 'line' && d.map(x => x.line).join() !== T.orig) this.tutGo(d.some(x => x.line === 'heal') ? 'up' : 'heal');
        if (T.step === 'heal' && d.some(x => x.line === 'heal')) this.tutGo('up');
        if (T.step === 'up' && this.shopBought) this.tutGo('go');
        T.low = true;
        if (T.step === 'sel') { T.msg = '소녀 <b>카드</b>를 눌러 보세요'; T.targets = ['.scard']; }
        else if (T.step === 'line') { T.msg = '<b>무기</b>를 바꿔 보세요<small>무기마다 싸우는 방식이 달라요</small>'; T.targets = ['.lines']; }
        else if (T.step === 'heal') {
          T.msg = '<b>힐러</b>도 한 명 두면 든든해요<small>\'수리 장치\'를 고르면 이웃한 아군을 고쳐요</small>';
          T.targets = [this.shopSel != null ? '.lopt[data-val="heal"]' : '.squad'];
        } else if (T.step === 'up') {
          T.msg = '모은 부품으로 <b>강화</b>도 해 봐요<small>부대 전체가 세져요</small>'; T.targets = ['.buy[data-act="up"]:not([disabled])'];
          if (!T.started) { T.started = true; const b = q(T.targets[0]); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        } else { T.msg = '준비 끝! <b>출격</b>을 눌러요'; T.targets = ['[data-act="go"]']; }
        break;
      }
      case 'auto':
        if (shop) break;
        this.tutFreeze = play;
        T.msg = '어렵다면 <b>자동 회피</b>와 <b>자동 스킬</b>을 켜 보세요<small>언제든 다시 끌 수 있어요</small>';
        T.targets = ['#autoDodge', '#autoSkill']; T.ask = true;
        break;
    }
  }
  tutDraw() {
    const T = this.tut, U = tutUI;
    const show = T && (this.state === 'play' || this.state === 'shop');
    U.root.classList.toggle('on', !!show);
    if (!show) return;
    U.root.classList.toggle('low', !!T.low); U.root.classList.toggle('ask', !!T.ask);
    if (U.msg.dataset.m !== T.msg) { U.msg.innerHTML = T.msg; U.msg.dataset.m = T.msg; }
    U.rings.forEach((r, i) => {
      const e = T.targets[i] && document.querySelector(T.targets[i]), b = e && e.getBoundingClientRect();
      if (!b || !b.width) { r.style.display = 'none'; return; }
      Object.assign(r.style, { display: 'block', left: b.left - 6 + 'px', top: b.top - 6 + 'px', width: b.width + 12 + 'px', height: b.height + 12 + 'px' });
    });
    // 손가락: 위험한 소녀에서 피할 칸까지 반복해서 끌어 보인다
    const D = T.step === 'drill' && T.drill, ph = (this.clock % 1.35) / 1.35;
    U.dots.forEach((dot, i) => {
      const line = U.lines[i], g = D && D.frozen && D.girls[i], dest = g && D.dests[i];
      const danger = g && g.alive && this.shells.some(s => s.tut === D.id && s.col === g.col && s.row === g.row);
      const a = danger && toScreen(g.x, g.z, 0.9), b0 = danger && toScreen(COL_X[dest[0]] + g.ox, ROW_Z[dest[1]] + g.oz, 0.9);
      const b = b0 && [a[0] + (b0[0] - a[0]) * 1.5, a[1] + (b0[1] - a[1]) * 1.5];      // 화면에서 칸 사이가 짧아서 조금 더 길게 끌어 보인다
      if (!a || !b) { dot.style.display = line.style.display = 'none'; return; }
      const p = clamp((ph - 0.12) / 0.55, 0, 1), e = p * p * (3 - 2 * p), x = a[0] + (b[0] - a[0]) * e, y = a[1] + (b[1] - a[1]) * e;
      const op = ph < 0.1 ? ph / 0.1 : ph > 0.82 ? Math.max(0, 1 - (ph - 0.82) / 0.15) : 1;
      Object.assign(dot.style, { display: 'block', left: x + 'px', top: y + 'px', opacity: op, transform: `scale(${ph < 0.12 ? 0.8 : 1})` });
      const len = Math.hypot(x - a[0], y - a[1]);
      Object.assign(line.style, { display: len > 4 ? 'block' : 'none', left: a[0] + 'px', top: a[1] + 'px', width: len + 'px', opacity: op * 0.9,
        transform: `rotate(${Math.atan2(y - a[1], x - a[0])}rad)` });
    });
  }
  start() { this.state = 'play'; this.showOverlay(); if (!this.tutDone) this.tutBegin(); }
  nextView() {
    this.viewIdx = (this.viewIdx + 1) % VIEWS.length;
    el.viewBtn.lastElementChild.textContent = VIEWS[this.viewIdx].name;
  }

  // ---- 진행
  // 출현: 스테이지 정의(this.def)의 비율대로 한 묶음씩 나온다. 졸개는 떼로, 원거리 적은 소대 정면의 빈 줄에.
  spawn() {
    const d = this.def;
    if (this.enemies.length >= LEVEL.maxAlive) return;
    const ranged = this.enemies.filter(e => e.spec.ranged && e.kind !== 'boss');
    const opts = Object.entries(d.mix).filter(([k]) => !(ENEMIES[k].ranged && ranged.length >= d.maxRanged));
    let r = Math.random() * opts.reduce((a, o) => a + o[1], 0), kind = opts[0][0];
    for (const [k, w] of opts) { if ((r -= w) <= 0) { kind = k; break; } }
    if (kind === 'tank' && this.enemies.filter(e => e.kind === 'tank').length >= 2) kind = 'grunt';      // 덩치 큰 중장형이 화면을 가리지 않게 동시에 둘까지만
    if (ENEMIES[kind].ranged) {
      // 원거리 적은 소대 정면의 빈 줄에 자리 잡는다 (옆으로 비켜 서 있으면 다가가 벨 수가 없다)
      const used = new Set(ranged.map(e => e.lane));
      const free = COL_X.map((_, i) => i).filter(i => !used.has(i));
      const lane = free[Math.floor(Math.random() * free.length)] ?? Math.floor(rand(0, COLS));
      const e = new Enemy(this, kind, COL_X[lane] * 1.6 + rand(-3, 3), rand(84, 96));
      e.lane = lane; e.laneX = COL_X[lane] + rand(-0.8, 0.8);
      this.enemies.push(e);
      return;
    }
    if (ENEMIES[kind].shot) {      // 사격형도 소대 폭 안에 선다 (옆으로 빠져 화면 밖에서 쏘면 잡을 방법이 없다)
      const lx = rand(-COL_X[COLS - 1] - 1, COL_X[COLS - 1] + 1);
      const e = new Enemy(this, kind, lx * 1.5 + rand(-2, 2), rand(84, 96));
      e.laneX = lx;
      this.enemies.push(e);
      return;
    }
    const n = kind === 'swarm' ? d.pack + Math.floor(rand(0, 3)) : kind === 'grunt' && Math.random() < 0.35 ? 2 : 1;
    const cx = rand(-22, 22), cz = rand(84, 96);
    for (let i = 0; i < n; i++) this.enemies.push(new Enemy(this, kind, cx + (n > 1 ? rand(-4, 4) : 0), cz + (n > 1 ? rand(-3.5, 3.5) : 0)));
  }
  // ---- 정비: 무기 계열과 자리를 바꾸고 강화한다. 바꾸면 그 스테이지를 처음부터 다시 한다.
  openShop() {
    this.shopFrom = this.state;
    this.draft = JSON.parse(JSON.stringify(this.loadout));
    this.draftStage = this.stage;
    this.shopBought = false;
    this.shopSel = null;
    this.state = 'shop';
    this.showOverlay();
  }
  setBattleVisible(v) {
    for (const g of this.girls) g.model.root.visible = v && g.alive;
    for (const e of this.enemies) e.model.root.visible = v;
    for (const sh of this.shells) { sh.disc.visible = sh.ring.visible = v; if (sh.ball) sh.ball.visible = v; }
    for (const o of [...this.tracers, ...this.booms, ...this.arcs]) o.mesh.visible = v;
    partMesh.visible = v;
    this.ghost.visible = false;
  }
  shopChanged() {
    return this.shopFrom === 'over' || this.shopBought || this.draftStage !== this.stage || JSON.stringify(this.draft) !== JSON.stringify(this.loadout);
  }
  act(d) {
    const a = d.act;
    if (a === 'resume') { this.state = 'play'; }
    else if (a === 'tut') { this.state = 'play'; this.tutBegin(); }
    else if (a === 'retry') { this.restartStage(this.stage); this.state = 'play'; }
    else if (a === 'shop') { this.openShop(); return; }
    else if (a === 'sel') { this.shopSel = this.shopSel === +d.slot ? null : +d.slot; }
    else if (a === 'line') { this.draft[+d.slot].line = d.val; }
    else if (a === 'cell') {                        // 고른 소녀를 그 칸으로 (다른 소녀가 있으면 서로 자리를 바꾼다)
      const me = this.draft[this.shopSel], c = +d.col, r = +d.row, other = this.draft.find(x => x.col === c && x.row === r);
      if (me) { if (other) { other.col = me.col; other.row = me.row; } me.col = c; me.row = r; }
    }
    else if (a === 'up' || a === 'wup') {           // 강화는 사는 즉시 적용되고 되돌릴 수 없다. 상한은 파티 레벨
      const lv = a === 'up' ? this.up : this.wlv, cost = (a === 'up' ? upCost : wCost)(lv[d.val]);
      if (lv[d.val] < this.plv && this.parts >= cost) { this.parts -= cost; lv[d.val]++; this.shopBought = true; this.save(); this.sfx('buy'); }
    }
    else if (a === 'stage') { this.draftStage = clamp(this.draftStage + (+d.d), 0, this.cleared); }
    else if (a === 'cancel') { this.state = this.shopFrom === 'over' ? 'over' : 'play'; }
    else if (a === 'go') {
      if (this.shopChanged()) { this.loadout = this.draft; this.restartStage(this.draftStage); }
      this.state = 'play';
    }
    this.showOverlay();
  }
  skillWanted(g) {
    const n = g.ch.name, es = this.enemies;
    if (n === 'OPUS') return es.filter(e => e.z < 28).length >= 6 || !!(this.boss && this.boss.alive && this.boss.z < 34);
    if (n === 'SONNET') {
      const al = this.aliveGirls();
      return al.some(o => o.hp < o.maxHp * 0.45 && o.sh < o.maxSh * 0.2) || al.reduce((a, o) => a + o.sh / o.maxSh, 0) / al.length < 0.25;
    }
    if (n === 'HAIKU') {
      let c = 0;
      for (const e of es) if (Math.abs(e.x - g.x) < 3.2 && e.z > g.z && e.z < g.z + 34) c += e.kind === 'swarm' ? 0.5 : e.spec.ranged || e.kind === 'tank' ? 2 : 1;
      return c >= 2.5;
    }
    return es.filter(e => e.z < VISIBLE_Z).length >= 6;
  }
  autoAssist(dt) {   // 일부러 반 박자 늦게 반응한다 (직접 조작이 유리하도록). 풀버스트는 자동으로 쓰지 않는다.
    const alive = this.aliveGirls();
    if (this.autoSkill) for (const g of alive) {      // 자동 스킬: 쓸모가 있을 때 알아서 쓴다
      if (g.skT > 0) { g.skAuto = 0; continue; }
      g.skAuto = this.skillWanted(g) ? g.skAuto + dt : 0;
      if (g.skAuto > 0.7) { g.skAuto = 0; this.castSkill(g.slot, false); }
    }
    if (!this.autoDodge) return;                      // 자동 회피: 바닥 예고를 피하고, 위험하면 뒤로 물러난다
    const warned = this.warnedSet();
    for (const g of alive) {
      if (g.moveCd > 0) continue;
      // 회피: 예고가 뜨고 조금 지난 뒤에야 움직인다. 안전한 칸까지 가는 길(최대 세 걸음)의 첫 걸음을 딛는다.
      let sh = null;
      for (const s of this.shells) if (s.col === g.col && s.row === g.row && (!sh || s.t * s.dur > sh.t * sh.dur)) sh = s;
      if (sh) {
        if (sh.t * sh.dur > 0.6) { const st = this.escapeStep(g, warned, 3); if (st) this.tryMove(g, st[0], st[1], false); }
        continue;
      }
      if (g.hold > 0) { g.autoT = 0; continue; }
      let step = null;
      if (g.sh <= 0 && g.hp < g.maxHp * 0.35 && g.row < ROWS - 1 && alive.length > 1) step = [0, 1];       // 위험하면 뒤로
      else if (g.sh >= g.maxSh * 0.95 && (g.col !== g.home[0] || g.row !== g.home[1]))                      // 회복되면 제자리로
        step = g.row !== g.home[1] ? [0, Math.sign(g.home[1] - g.row)] : [Math.sign(g.home[0] - g.col), 0];
      if (step && !this.girlInCell(g.col + step[0], g.row + step[1]) && !warned.has((g.col + step[0]) + ',' + (g.row + step[1]))) {
        g.autoT += dt;
        if (g.autoT > 1) this.tryMove(g, step[0], step[1], false);
      } else g.autoT = 0;
    }
  }
  // 전진의 리듬: 평소에는 제 속도로 달리고, 적과 맞붙으면 멈추지 않고 '밀어붙이며' 느리게 나아간다.
  // 맞붙은 적은 뒤로 걷는 게 아니라 버티다가 밀려난다(Enemy.sync 의 버티는 자세). 적이 벽처럼 몰리거나 보스와 붙으면 그때만 선다.
  // 싸움이 끝나면 잠깐 빠르게 돌진해서 늦어진 만큼 되찾는다.
  updateAdvance(dt) {
    let front = -Infinity;
    for (const g of this.girls) if (g.alive) front = Math.max(front, g.z);
    let contact = 0, wall = false;
    for (const e of this.enemies) {
      if (!e.alive || e.kind === 'rusher') continue;
      if (e.kind === 'boss') { if (e.z < front + 6) wall = true; continue; }
      if (e.engaged || e.z < front + (e.spec.ranged ? 2.5 : 1.0)) contact += e.kind === 'swarm' ? 0.3 : e.kind === 'tank' ? 2 : 1;      // 졸개는 가볍게 밀린다
    }
    if (contact >= WALL_N) wall = true;
    const push = contact >= 0.6;
    if (push || wall) { this.fightT += dt; this.dashT = 0; }
    else if (this.fightT > 0) {      // 정리 직후 돌진: 부스터를 확 뿜는다
      this.dashT = clamp(0.8 + this.fightT * 0.6, 0.8, 2.6); this.fightT = 0;
      for (const g of this.aliveGirls()) { g.boost = 1; this.ring(g.x, g.z - 0.6, 2.4, 0x7fdcff, 0.3); this.sparks(g.x, g.z - 0.8, 1.2, 0x9fe8ff, 8, 1.5); }
      this.sfx('dash');
    }
    if (this.dashT > 0) this.dashT -= dt;
    this.mode = wall ? 'hold' : push ? 'push' : this.dashT > 0 ? 'dash' : 'run';
    const want = SCROLL * (wall ? 0 : push ? PUSH_SPEED : this.dashT > 0 ? DASH_SPEED : 1);
    this.adv = this.adv > want ? Math.max(want, this.adv - 12 * dt) : Math.min(want, this.adv + 6 * dt);
  }
  update(dt) {
    if (this.tutFreeze) {      // 튜토리얼: 시간을 멈추고 끌기만 받는다
      this.adv = 0;
      for (const g of this.girls) if (g.alive) g.settle(dt);
      this.processDrags();
      return;
    }
    this.time += dt;
    this.odT = Math.max(0, this.odT - dt); this.barrierT = Math.max(0, this.barrierT - dt); this.stopCd = Math.max(0, this.stopCd - dt);
    this.updateAdvance(dt);
    this.scroll += this.adv * dt;
    this.stageScroll += this.adv * dt;
    this.gauge = Math.min(100, this.gauge + 2.4 * dt);
    const d = this.def;
    this.spawnT -= dt * (this.mode === 'hold' ? 0.5 : 1);       // 완전히 멈춰 있는 동안은 새 적이 덜 나온다
    while (this.spawnT <= 0) { this.spawn(); this.spawnT += rand(0.6, 1.4) / d.rate; }
    if (d.boss && !this.bossSpawned && this.distM >= 80) {
      this.bossSpawned = true;
      this.boss = new Enemy(this, 'boss', 0, 92);
      this.enemies.push(this.boss);
      this.say(`${d.zone.boss} 접근!`, 2.5); this.sfx('warn');
    }
    for (const g of this.girls) {
      if (g.alive) g.update(dt);          // 쓰러진 소녀는 이번 스테이지가 끝날 때까지 빠진다
    }
    for (const e of this.enemies) if (e.alive) e.update(dt);

    const landed = new Set(), dodged = new Set();
    for (const s of this.shells) {
      s.t += dt / s.dur;
      if (s.t < 1) continue;
      const col = PAT_COLOR[s.type];
      this.explosion(s.tx, s.tz, s.rad + 0.2, s.type === 'cell' || s.type === 'pair' ? 0xdc8cff : col);
      if (s.type === 'col' && s.first) this.tracer([s.tx, 58, 4], [s.tx, -1, 0.6], col, 1.1, 0.3);       // 세로줄 저격: 굵은 광선
      const g = this.girlInCell(s.col, s.row);
      if (g) this.patternHit(g, s);
      else if (s.had && s.had.alive && !dodged.has(s.had)) {      // 서 있던 자리를 비웠다: 회피 성공. 풀버스트 게이지가 조금 찬다
        dodged.add(s.had);
        this.popText(s.had.x, s.had.z, 3.4, '회피!', '#7fe8ff', 15, 0.8); this.gauge = Math.min(100, this.gauge + 3);
      }
      if (!landed.has(s.gid)) { landed.add(s.gid); this.shake = Math.max(this.shake, 0.4); this.sfx('boom'); }
      this.dropShell(s);
    }
    this.shells = this.shells.filter(s => s.t < 1);

    if (this.burstQueue.length) {
      const rest = [], dmg = this.burstDmg();
      for (const b of this.burstQueue) {
        b.t -= dt;
        if (b.t > 0) { rest.push(b); continue; }
        this.explosion(b.e.x, b.e.z, BURST_RADIUS, 0xffdc5a); this.ring(b.e.x, b.e.z, BURST_RADIUS * 1.5, 0xffdc5a, 0.3);
        this.shake = Math.max(this.shake, 0.35);
        for (const o of this.enemies) if (o.alive && (o.x - b.e.x) ** 2 + (o.z - b.e.z) ** 2 < BURST_RADIUS ** 2) this.hitEnemy(o, dmg, { kb: 10 });
      }
      this.burstQueue = rest;
    }
    for (const s of this.playerShells) {
      s.t -= dt;
      if (s.t > 0) continue;
      if (s.fall) this.tracer([s.x + 3, s.z + 6, 30], [s.x, s.z, 0.5], s.color, 0.7, 0.2);
      this.explosion(s.x, s.z, s.radius, s.color); this.ring(s.x, s.z, s.radius * 1.3, 0xffffff, 0.35);
      this.shake = Math.max(this.shake, 0.5); this.sfx('boom');
      for (const o of this.enemies) if (o.alive && (o.x - s.x) ** 2 + (o.z - s.z) ** 2 < s.radius ** 2) this.hitEnemy(o, s.dmg, { kb: 12 });
    }
    this.playerShells = this.playerShells.filter(s => s.t > 0);
    if (this.odT > 0 && Math.random() < dt * 14) { const g = this.aliveGirls()[Math.floor(Math.random() * 4)]; if (g) this.sparks(g.x, g.z, 2, 0xffdc5a, 1); }
    for (const e of this.enemies) if (!e.alive) e.dispose();
    this.enemies = this.enemies.filter(e => e.alive);
    if (this.focus && !this.focus.alive) this.focus = null;
    if ((this.autoDodge || this.autoSkill) && !this.tut) this.autoAssist(dt);      // 튜토리얼 중에는 직접 해 보게 자동 보조를 쉰다
    this.processDrags();
    if (!this.aliveGirls().length) { this.state = 'over'; this.sfx('over'); this.showOverlay(); return; }      // 네 명이 동시에 쓰러져 있으면 패배
    // 스테이지 클리어: 보통은 정해진 거리를 전진하면, 보스 스테이지는 보스를 쓰러뜨리면. 멈추지 않고 다음으로 이어진다.
    if (d.boss ? (this.bossSpawned && !this.boss.alive) : this.distM >= STAGE_LEN) this.clearStage();
  }
  updateFx(dt, moving) {
    const flow = moving ? this.adv : 0;
    // 부스터 분사의 세기: 돌진할 때 가장 세고, 밀어붙일 때는 약하다
    const bt = !moving ? 0.3 : this.mode === 'dash' ? 1 : this.mode === 'run' ? 0.3 : this.mode === 'push' ? 0.12 : 0;
    this.boostFx += (bt - this.boostFx) * Math.min(1, dt * (bt > this.boostFx ? 9 : 3));
    if (moving && this.mode === 'dash' && Math.random() < dt * 34) {      // 돌진 중의 속도선
      const x = rand(-17, 17), z = rand(-2, 46), h = rand(0.2, 3.6);
      this.tracer([x, z, h], [x, z + rand(4, 9), h], 0xbfe8ff, 0.05, 0.16);
    }
    for (const m of MARKS) {
      if (!m.sp.visible) continue;
      m.t += dt;
      const k = m.t / m.dur;
      if (k >= 1) { m.sp.visible = false; continue; }
      m.sp.scale.setScalar(m.size * (1.2 + 2.8 * k)); m.sp.material.opacity = 1 - k * k;
    }
    for (const p of this.pops) { p.t += dt; p.z -= flow * dt; }
    this.pops = this.pops.filter(p => p.t < p.dur);
    this.walk += (this.adv / SCROLL - this.walk) * Math.min(1, dt * 6);
    this.walkPh += dt * 12 * Math.max(0.15, this.walk);
    this.shake = Math.max(0, this.shake - 3 * dt);
    if (this.blocked && (this.blocked.t -= dt) <= 0) this.blocked = null;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) el.banner.style.opacity = 0; }
    for (const t of this.tracers) {
      t.ttl -= dt;
      const k = Math.max(0, t.ttl / t.dur);
      t.mesh.scale.set(t.width * k, t.width * k, t.len);
      if (t.ttl <= 0) scene.remove(t.mesh);
    }
    this.tracers = this.tracers.filter(t => t.ttl > 0);
    for (const b of this.booms) {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.z -= flow * dt;
      place(b.mesh, b.x, b.z, 0.4);
      b.mesh.scale.setScalar(b.radius * (0.3 + 0.7 * k));
      b.mesh.material.opacity = 0.8 * (1 - k);
      if (b.t >= b.dur) { scene.remove(b.mesh); b.mesh.material.dispose(); }
    }
    this.booms = this.booms.filter(b => b.t < b.dur);
    for (const a of this.arcs) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.mesh.rotateY(-a.dir * dt * (1.4 / a.dur));            // 휘두르는 방향으로 쓸려 간다
      a.mesh.scale.setScalar(a.radius * (0.8 + 0.3 * k));
      a.mesh.material.opacity = 0.9 * (1 - k * k);
      if (a.t >= a.dur) { scene.remove(a.mesh); a.mesh.material.dispose(); }
    }
    this.arcs = this.arcs.filter(a => a.t < a.dur);
    for (const p of this.fxParts) {
      p.x += p.vx * dt; p.z += p.vz * dt - flow * dt;
      p.h = Math.max(0, p.h + p.vh * dt); p.vh -= (p.g ?? 14) * dt; p.life -= dt;
    }
    this.fxParts = this.fxParts.filter(p => p.life > 0);
    for (let i = 0; i < PART_N; i++) {
      const p = this.fxParts[i];
      if (!p) { partPos[i * 3 + 1] = -9999; continue; }
      surf(p.x, p.z, p.h, _v);
      partPos[i * 3] = _v.x; partPos[i * 3 + 1] = _v.y; partPos[i * 3 + 2] = _v.z;
      _c.setHex(p.color).multiplyScalar(0.4 + 0.6 * p.life / p.max);
      partCol[i * 3] = _c.r; partCol[i * 3 + 1] = _c.g; partCol[i * 3 + 2] = _c.b;
    }
    partGeo.attributes.position.needsUpdate = true; partGeo.attributes.color.needsUpdate = true;
  }

  // ---- 그리기
  render(dt) {
    const t = this.clock;
    if (this.preSync) this.preSync(dt);           // 시험용 모델이 끼어드는 자리
    planet.rotation.x = (this.scroll / R) % (Math.PI * 2);
    for (const g of this.girls) if (g.alive) g.sync(t);
    for (const e of this.enemies) e.sync(t, dt);
    if (this.pv) { this.pv.faceYaw = this.previewYaw; this.pv.sync(t); }
    for (const s of this.shells) {
      if (s.ball) place(s.ball, s.x0 + (s.tx - s.x0) * s.t, s.z0 + (s.tz - s.z0) * s.t, 1 + 13 * Math.sin(Math.PI * s.t));
      place(s.ring, s.tx, s.tz, 0.08); place(s.disc, s.tx, s.tz, 0.07);
      s.disc.scale.setScalar(Math.max(0.01, s.rad * s.t));       // 안쪽 원이 테두리까지 차면 착탄
      s.ring.material.opacity = 0.5 + 0.45 * Math.abs(Math.sin(t * (5 + 14 * s.t)));
    }
    const mark = this.hint || this.blocked;       // 끌 때만 잠깐 보이는 이동 목적지 표시
    if (mark && this.state === 'play') {
      place(this.ghost, COL_X[mark.col], ROW_Z[mark.row], 0.06);
      this.ghost.scale.setScalar(1.25);
      this.ghost.material.color.setHex(this.blocked || !mark.ok ? 0xff8a3c : 0x6ef08c);
      this.ghost.visible = true;
    } else this.ghost.visible = false;
    {
      const v = this.debugView || VIEWS[this.viewIdx], k = Math.min(1, dt * 5);
      _v.set(...v.pos).sub(_v2.set(0, 0, -6.5)).multiplyScalar(camPull).add(_v2);    // 부대 중심에서 멀어지는 방향으로 당긴다
      this.camPos.lerp(_v, k); this.camLook.lerp(_v.set(...v.look), k);
      this.tilt = (this.tilt || 0) + (camTilt * (v.tilt ?? 0) - (this.tilt || 0)) * k;
      const fov = baseFov + 7 * Math.max(0, this.boostFx - 0.3);                     // 돌진할 때 시야가 살짝 넓어진다
      if (Math.abs(camera.fov - fov) > 0.03) { camera.fov = fov; camera.updateProjectionMatrix(); }
    }
    camera.position.copy(this.camPos);
    if (this.shake > 0) camera.position.add(_v.set(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(this.shake * 0.35));
    camera.lookAt(this.camLook);
    camera.rotateX(this.tilt || 0);
    camera.updateMatrixWorld();
    if (this.preRender) this.preRender(dt);
    renderer.render(scene, camera);
    this.drawUi();
    this.drawHud();
  }
  drawUi() {
    ui.clearRect(0, 0, W, H);
    if (this.state === 'start' || this.state === 'shop') return;
    ui.textAlign = 'center';
    const FONT = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const held = [...this.drags.values()].map(d => d.g);
    const hover = held.length ? null : (this.state === 'play' ? this.girlAt(this.mouse[0], this.mouse[1]) : null);
    for (const e of this.enemies) {
      if (e.hp >= e.maxHp && e !== this.focus) continue;
      const p = toScreen(e.x, e.z, e.aim + 1.5), q = toScreen(e.x, e.z, e.aim);
      if (!p || !q) continue;
      const u = q[1] - p[1];
      if (e.hp < e.maxHp && u > 9 && e.kind !== 'swarm') {
        const bw = Math.max(20, u * 1.1);
        ui.fillStyle = '#28141a'; ui.fillRect(p[0] - bw / 2, p[1], bw, 4);
        ui.fillStyle = '#ff505a'; ui.fillRect(p[0] - bw / 2, p[1], bw * Math.max(0, e.hp) / e.maxHp, 4);
      }
      if (e === this.focus) {
        const r = Math.max(18, u * 0.95), a0 = this.clock * 3;
        ui.strokeStyle = '#ff4656'; ui.lineWidth = 2.5;
        ui.beginPath(); ui.arc(q[0], q[1], r, 0, Math.PI * 2); ui.stroke();
        ui.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = a0 + i * Math.PI / 2;
          ui.moveTo(q[0] + Math.cos(a) * r * 0.7, q[1] + Math.sin(a) * r * 0.7);
          ui.lineTo(q[0] + Math.cos(a) * r * 1.35, q[1] + Math.sin(a) * r * 1.35);
        }
        ui.stroke();
      }
    }
    // 소녀 표시: 머리 위에는 아무것도 없다. 체력은 발밑 고리가 보여 주고, 발 왼쪽 아래에 든 무기의 아이콘만 작게 붙인다.
    for (const g of this.aliveGirls()) {
      const a = toScreen(g.x, g.z, 0), e = toScreen(g.x + 1.28, g.z, 0);
      if (!a || !e) continue;
      const rp = Math.abs(e[0] - a[0]), bx = a[0] - rp * 1.02, by = a[1] + rp * 0.34, im = iconImg(g.weaponId);
      ui.fillStyle = 'rgba(8,10,24,.7)'; ui.strokeStyle = g.ch.color; ui.lineWidth = 1.2;
      ui.beginPath(); ui.roundRect(bx - 12, by - 9, 24, 18, 5); ui.fill(); ui.stroke();
      if (im.complete && im.naturalWidth) ui.drawImage(im, bx - 9.5, by - 7.5, 19, 15.6);
      if (g === hover || held.includes(g)) { const r = this.girlRect(g); if (r) { ui.strokeStyle = '#ffdc5a'; ui.lineWidth = 2; ui.strokeRect(r.x, r.y, r.w, r.h); } }
    }
    // 피해 숫자와 얻은 부품: 맞은 자리에서 튀어나와 위로 떠오르며 사라진다. 크리티컬은 크고 금빛.
    ui.textBaseline = 'middle';
    for (const p of this.pops) {
      const s = toScreen(p.x, p.z, p.h);
      if (!s) continue;
      const k = p.t / p.dur, fs = p.size * (1 + 0.9 * Math.max(0, 1 - p.t / 0.09));
      ui.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ui.font = `900 ${fs}px ${FONT}`;
      const x = s[0] + p.vx * p.t, y = s[1] - (p.crit ? 48 : 30) * (1 - (1 - k) ** 2);
      ui.lineWidth = p.crit ? 5 : 3; ui.strokeStyle = p.crit ? '#7a1c00' : 'rgba(10,12,30,.9)'; ui.strokeText(p.text, x, y);
      ui.fillStyle = p.color; ui.fillText(p.text, x, y);
    }
    ui.globalAlpha = 1;
    for (const d of this.drags.values()) {     // 끄는 방향 화살표 (손가락마다)
      const r = d.g.alive && this.girlRect(d.g);
      if (r && Math.hypot(d.x - d.ox, d.y - d.oy) > 8) {
        const sx = r.cx, sy = (r.top + r.bottom) / 2, [dc, dr] = this.dragDir(d), L = Math.max(46, r.h * 0.7);
        const ex = sx + dc * L, ey = sy + dr * L * 0.75, a = Math.atan2(ey - sy, ex - sx);
        ui.strokeStyle = ui.fillStyle = '#ffdc5a'; ui.lineWidth = 5; ui.lineCap = 'round';
        ui.beginPath(); ui.moveTo(sx, sy); ui.lineTo(ex, ey); ui.stroke();
        ui.beginPath(); ui.moveTo(ex + Math.cos(a) * 14, ey + Math.sin(a) * 14);
        ui.lineTo(ex + Math.cos(a + 2.5) * 14, ey + Math.sin(a + 2.5) * 14);
        ui.lineTo(ex + Math.cos(a - 2.5) * 14, ey + Math.sin(a - 2.5) * 14); ui.fill();
      }
    }
  }
  // 캐릭터 그림(사용자가 GPT로 만든 제복 카드): 얼굴 초상화, 그리고 든 무기에 따라 바뀌는 전신 카드 (수리 장치·드론은 힐러 그림, 30레벨 무기 네 가지는 전용 그림)
  portraitOf(ch) { return ch.portraitUrl || `assets/cards/${ch.name}/portrait.jpg`; }
  cardArt(ch, wid) { return `assets/cards/${ch.name}/${wid === 'repair' || wid === 'drone' ? 'healer' : wid}.jpg`; }
  // 캐릭터 카드: 화면 왼쪽 위에 세로로 작게. 초상화 위로 색이 차오르면 스킬 준비 완료(카드나 소녀를 눌러 쓴다).
  // 쓰러지면 카드가 흑백이 되고, 다음 스테이지에서 돌아온다.
  buildCards() {
    el.cards.innerHTML = this.girls.map((g, i) => `<div class="card" data-i="${i}" title="${g.name} · ${g.skill.name}" style="--c:${g.ch.color};--b:${g.ch.color}88;--img:url(${this.portraitOf(g.ch)})">
      <div class="pt"><i class="cd"></i><span class="cdt"></span></div>
      <div class="info"><div class="wi"><svg viewBox="0 0 34 28">${W_ICON[g.weaponId] || ''}</svg></div>
      <div class="bar"><u class="hp"></u></div><div class="bar"><u class="sh"></u></div></div></div>`).join('');
    this.cardEls = [...el.cards.children].map(root => ({ root, hp: root.querySelector('.hp'), sh: root.querySelector('.sh'),
      cd: root.querySelector('.cd'), cdt: root.querySelector('.cdt'), key: '' }));
  }
  drawCards() {
    if (!this.cardEls) return;
    this.cardEls.forEach((c, i) => {
      const g = this.girls[i];
      if (!g) return;
      const hp = Math.round(clamp(g.hp / g.maxHp, 0, 1) * 100), sh = Math.round(clamp(g.sh / g.maxSh, 0, 1) * 100);
      const warn = g.alive && this.state === 'play' && this.isWarned(g.col, g.row);
      const dead = !g.alive, ready = !dead && g.skT <= 0;
      const frac = dead ? 0 : 1 - g.skT / g.skill.cd, sec = dead ? 0 : Math.ceil(g.skT);
      const key = `${hp}|${sh}|${dead}|${warn}|${ready}|${Math.round(frac * 60)}|${sec}`;
      if (key === c.key) return;            // 바뀐 것이 있을 때만 화면을 고친다
      c.key = key;
      c.hp.style.width = hp + '%'; c.hp.style.background = hp > 35 ? '#6ef08c' : '#ff505a';
      c.sh.style.width = sh + '%';
      c.cd.style.height = clamp(frac, 0, 1) * 100 + '%';
      c.cdt.textContent = dead || ready ? '' : sec;
      c.root.classList.toggle('down', dead);
      c.root.classList.toggle('warn', warn);
      c.root.classList.toggle('ready', ready);
    });
  }
  drawHud() {
    this.drawCards();
    const n = this.stage, d = this.def;
    el.dist.textContent = stageName(n);
    el.zone.textContent = d.zone.name;
    el.kills.textContent = Math.floor(this.parts).toLocaleString();
    const xk = `${this.plv}|${Math.round(this.xp / xpNeed(this.plv) * 100)}`;
    if (xk !== this.xpKey) { this.xpKey = xk; el.plv.textContent = this.plv; el.xpFill.style.width = `${clamp(this.xp / xpNeed(this.plv), 0, 1) * 100}%`; }
    const b = this.boss;
    const frac = d.boss ? (b ? clamp(b.hp / b.maxHp, 0, 1) : 1) : clamp(this.distM / STAGE_LEN, 0, 1);
    const fight = this.state === 'play' && this.mode === 'hold';      // 멈춰서 싸우는 중
    const pkey = `${d.boss}|${fight}|${Math.round(frac * 200)}|${Math.floor(this.distM)}`;
    if (pkey !== this.progKey) {          // 바뀐 것이 있을 때만 화면을 고친다
      this.progKey = pkey;
      el.topbar.classList.toggle('boss', d.boss);
      el.progLabel.textContent = d.boss ? '보스' : fight ? '교전' : '진행';
      el.progFill.style.width = `${frac * 100}%`;
      el.progText.textContent = d.boss ? `${Math.ceil(frac * 100)}%` : `${Math.floor(this.distM)} / ${STAGE_LEN} m`;
    }
    const ak = `${this.autoDodge}|${this.autoSkill}`;
    if (ak !== this.autoShown) { this.autoShown = ak; el.autoDodge.classList.toggle('on', this.autoDodge); el.autoSkill.classList.toggle('on', this.autoSkill); }
    el.focus.textContent = this.focus ? `집중 사격: ${this.focus.spec.name} (다시 누르면 해제)` : '';
    const ready = this.gauge >= 100;
    const gp = Math.floor(this.gauge);
    if (gp !== this.gaugeShown) {         // 바뀐 것이 있을 때만 화면을 고친다
      this.gaugeShown = gp;
      el.skill.classList.toggle('ready', ready);
      el.skill.style.setProperty('--p', gp);
      el.skillText.textContent = ready ? '발사!' : `${gp}%`;
    }
  }
  // 정비 화면: 한 화면에 편성(카드) · 강화 다섯 가지 · 무기 레벨. 카드를 누르면 그 아래에 무기와 자리 고르기가 펼쳐진다.
  shopHtml() {
    const d = this.draft, have = Math.floor(this.parts), changed = this.shopChanged(), sel = this.shopSel, cap = this.plv;
    const icon = svg => `<svg viewBox="0 0 34 28">${svg}</svg>`, need = xpNeed(this.plv);
    const buy = (act, id, lv, cost) => lv >= cap ? `<button class="buy cap" disabled>파티 Lv ${cap + 1} 필요</button>`
      : `<button class="buy" data-act="${act}" data-val="${id}" ${have >= cost ? '' : 'disabled'}><i>⬢</i>${cost.toLocaleString()}</button>`;
    let h = `<div class="shop"><header><b>정비</b>
      <div class="plv"><span>파티 Lv ${this.plv}</span><div class="xpb"><u style="width:${clamp(this.xp / need, 0, 1) * 100}%"></u></div><small>${Math.floor(this.xp)} / ${need}</small></div>
      <span class="coin"><i>⬢</i>${have.toLocaleString()}</span></header><div class="sbody">
      <h4>편성 <small>카드를 눌러 무기와 자리를 바꿉니다</small></h4><div class="squad">`;
    d.forEach((x, i) => {
      const ch = CHARS[x.char], wid = this.weaponId(x.line), w = WEAPONS[wid];
      h += `<button class="scard${sel === i ? ' sel' : ''}" data-act="sel" data-slot="${i}" style="--c:${ch.color};--img:url(${this.cardArt(ch, wid)})">
        <div class="pt"></div><b>${ch.label || ch.name}</b><div class="wl">${icon(W_ICON[wid])}</div><span>${w.name}</span><small>${CATS[w.cat]} · Lv ${this.wlv[x.line]}</small></button>`;
    });
    h += `</div>`;
    if (sel != null) {
      const x = d[sel], ch = CHARS[x.char], sk = SKILLS[ch.name];
      h += `<div class="detail" style="--c:${ch.color}"><div class="dtop"><div class="dart" style="background-image:url(${this.cardArt(ch, this.weaponId(x.line))})"></div>
        <div><div class="dhead"><b>${ch.label || ch.name}</b><span>${WEAPONS[this.weaponId(x.line)].name}</span></div><h5>스킬 · ${sk.name} <small>쿨타임 ${sk.cd}초</small></h5><p>${sk.desc}</p>
        <p class="wd">${WEAPONS[this.weaponId(x.line)].desc}</p></div></div>
        <h5>무기</h5><div class="lines">` + Object.keys(LINES).map(id => {
          const wid = this.weaponId(id), w = WEAPONS[wid];
          return `<button class="lopt${x.line === id ? ' sel' : ''}" data-act="line" data-slot="${sel}" data-val="${id}">${icon(W_ICON[wid])}<b>${w.name}</b><small>${WEAPON_TAG[wid]}</small></button>`;
        }).join('') + `</div><h5>자리 <small>칸을 누르면 그 자리로 옮깁니다 · 위쪽이 앞줄</small></h5><div class="grid">`;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const o = d.findIndex(y => y.col === c && y.row === r), oc = o >= 0 ? CHARS[d[o].char] : null;
        h += `<button class="cell${o === sel ? ' me' : ''}" data-act="cell" data-col="${c}" data-row="${r}" ${oc ? `style="--c:${oc.color}"` : ''}>${oc ? `<i style="background-image:url(${this.portraitOf(oc)})"></i>` : ''}</button>`;
      }
      h += `</div></div>`;
    }
    h += `<h4>강화 <small>부대 전체에 적용 · 파티 레벨까지 올릴 수 있습니다</small></h4><div class="ups5">`;
    for (const [id, u] of Object.entries(UPS)) {
      const lv = this.up[id];
      h += `<div class="up"><div class="ic">${icon(UP_ICON[id]).replace('0 0 34 28', '0 0 32 30')}</div><div class="tx"><b>${u.name} <em>Lv ${lv}</em></b><small>${u.desc(lv)} → ${u.desc(lv + 1)}</small></div>${buy('up', id, lv, upCost(lv))}</div>`;
    }
    h += `</div><h4>무기 레벨 <small>Lv ${EVOLVE_LV}, Lv ${EVOLVE2_LV}에 진화합니다</small></h4><div class="ups5">`;
    const used = new Set(d.map(x => x.line));
    for (const [id, L] of Object.entries(LINES)) {
      const lv = this.wlv[id], wid = this.weaponId(id), evo = lv >= EVOLVE2_LV, at = lv >= EVOLVE_LV ? EVOLVE2_LV : EVOLVE_LV, from = lv >= EVOLVE_LV ? EVOLVE_LV : 0;
      const next = WEAPONS[L.forms[lv >= EVOLVE_LV ? 2 : 1]].name;
      h += `<div class="up${used.has(id) ? ' hl' : ''}"><div class="ic">${icon(W_ICON[wid])}</div><div class="tx"><b>${WEAPONS[wid].name} <em>Lv ${lv}</em></b>
        <small>${lineDesc(id, lv)} → ${lineDesc(id, lv + 1)}${evo ? ' · 진화 완료' : ` · Lv ${at}에 ${next}(으)로 진화`}</small>
        ${evo ? '' : `<div class="evo"><u style="width:${(lv - from) / (at - from) * 100}%"></u></div>`}</div>${buy('wup', id, lv, wCost(lv))}</div>`;
    }
    h += `</div></div><footer><div class="stagesel"><button data-act="stage" data-d="-1">◀</button><b>스테이지 ${stageName(this.draftStage)}</b><button data-act="stage" data-d="1">▶</button></div>
      <div class="go"><button class="primary" data-act="go">${changed ? '출격 · 스테이지 처음부터' : '계속 진행'}</button>`;
    if (changed && !this.shopBought) h += `<button data-act="cancel">${this.shopFrom === 'over' ? '돌아가기' : '바꾸지 않고 계속'}</button>`;
    return h + '</div></footer></div>';
  }
  showOverlay() {
    const o = el.overlay;
    if (this.state === 'play') { o.classList.add('hidden'); document.body.classList.remove('inshop'); return; }
    o.classList.remove('hidden');
    o.classList.toggle('shop', this.state === 'shop');
    document.body.classList.toggle('inshop', this.state === 'shop');
    if (this.state === 'start') {
      el.body.innerHTML = `<h1>스틸 라인</h1><h2>오픈 베타 v0.34-b4</h2>
        <p>몰려드는 적을 쓸어버리며 달립니다. 공격은 자동, 스테이지는 멈추지 않고 이어집니다.</p><p>&nbsp;</p>
        <p><b>소녀를 끌기</b> — 끄는 방향으로 한 칸 이동. 발밑의 예고는 꼭 피하세요 (맞으면 체력이 절반 넘게 날아갑니다)</p>
        <p><b>소녀 누르기</b> — 발밑이 빛나면 그 소녀의 스킬 (왼쪽 위 카드를 눌러도 됩니다)</p>
        <p><b>발밑 고리</b> — 체력입니다. 바깥의 얇은 고리는 실드</p>
        <p><b>풀버스트</b> — 게이지가 차면 필요할 때 눌러서 발사</p>
        <p><b>정비</b> — 무기와 자리를 바꾸고, 모은 부품으로 강화합니다</p>
        <p class="go">화면을 눌러 출격</p>`;
    } else if (this.state === 'paused') {
      el.body.innerHTML = `<h1 class="white">일시정지</h1>
        <div class="ovbtns"><button class="primary" data-act="resume">계속 진행</button><button data-act="shop">정비</button></div>
        <div class="ovbtns"><button data-act="tut">튜토리얼 다시 보기</button></div>`;
    } else if (this.state === 'shop') {
      const old = el.body.querySelector('.sbody'), keep = old ? old.scrollTop : 0;      // 다시 그려도 스크롤 위치는 유지
      el.body.innerHTML = this.shopHtml();
      el.body.querySelector('.sbody').scrollTop = keep;
    } else {
      el.body.innerHTML = `<h1 class="red">전멸</h1>
        <p>스테이지 ${stageName(this.stage)}에서 쓰러졌습니다 &nbsp;·&nbsp; 파티 Lv ${this.plv} &nbsp;·&nbsp; 부품 ${Math.floor(this.parts).toLocaleString()}</p>
        <p class="note">정비에서 강화하거나, 이미 깬 스테이지를 다시 해서 부품과 경험치를 모아 보세요.</p>
        <div class="ovbtns"><button class="primary" data-act="retry">재도전</button><button data-act="shop">정비</button></div>`;
    }
  }
  frame(dt) {
    this.clock += dt;
    let sim = dt;
    if (this.hitstop > 0) { this.hitstop -= dt; sim = dt * 0.06; }      // 타격 순간의 짧은 멈춤
    if (this.state === 'play') this.update(sim);
    else if (this.state === 'start') { this.adv = SCROLL; this.scroll += SCROLL * dt; }
    this.updateFx(this.state === 'play' ? sim : dt, this.state === 'play');
    if (this.tut) this.tutTick(this.state === 'play' && !this.tutFreeze ? sim : 0);
    this.render(dt);
    this.tutDraw();
  }
}

// ------------------------------------------------------------------ 입력 / 루프
resize();
const game = new Game();

// 조작은 누르기와 끌기로 통일한다 (마우스·터치 공통). 키보드는 보조 단축키.
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('pointerdown', e => {
  if (e.target.closest('button') || e.target.closest('#cards .card')) return;
  if (game.state === 'shop') return;
  e.preventDefault();
  game.pointerDown(e.clientX, e.clientY, e.pointerId);
});
window.addEventListener('pointermove', e => {
  game.pointerMove(e.clientX, e.clientY, e.pointerId);
});
window.addEventListener('pointerup', e => game.pointerUp(e.pointerId));
window.addEventListener('pointercancel', e => game.pointerUp(e.pointerId));
el.cards.addEventListener('click', e => { const c = e.target.closest('.card'); if (c) game.castSkill(+c.dataset.i, true); });      // 카드를 누르면 그 소녀의 스킬
el.skill.addEventListener('click', () => game.useSkill());
el.viewBtn.addEventListener('click', () => game.nextView());
el.autoDodge.addEventListener('click', () => { game.autoDodge = !game.autoDodge; game.save(); });
el.autoSkill.addEventListener('click', () => { game.autoSkill = !game.autoSkill; game.save(); });
$('pauseBtn').addEventListener('click', () => { if (game.state === 'play') { game.state = 'paused'; game.showOverlay(); } });
$('shopBtn').addEventListener('click', () => { if (game.state === 'play') game.openShop(); });
tutUI.skip.addEventListener('click', () => { if (game.tut) game.tutEnd(false); });
tutUI.ok.addEventListener('click', () => { if (game.tut) game.tutEnd(true); });
el.body.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) game.act(b.dataset); });
window.addEventListener('keydown', e => {
  const k = e.code;
  if (k === 'Tab' || k === 'Space') e.preventDefault();
  if (k === 'KeyV') { game.nextView(); return; }
  if (game.state === 'start') { if (k === 'Space' || k === 'Enter') game.start(); }
  else if (game.state === 'play') {
    if (k === 'Space') game.useSkill();
    else if (k.startsWith('Digit') && +k[5] >= 1 && +k[5] <= 4) game.castSkill(+k[5] - 1, true);
    else if (k === 'Tab') { game.autoDodge = game.autoSkill = !game.autoDodge; game.save(); }
    else if (k === 'KeyP' || k === 'Escape') { game.state = 'paused'; game.showOverlay(); }
    else if (k === 'KeyR') game.reset();
  } else if (game.state === 'paused') {
    if (k === 'KeyP' || k === 'Escape' || k === 'Space') { game.state = 'play'; game.showOverlay(); }
  } else if (game.state === 'over') {
    if (k === 'KeyR') game.act({ act: 'retry' });
  }
});

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  if (!window.__manual) game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 검증용: 화면이 가려져 있어도 정해진 시간만큼 빠르게 진행시킨다
window.__game = game;
window.__kit = { THREE, scene, camera, renderer, place, buildGirl, shadowBlob, CHARS, PREVIEW_Z: 16, hemi, sun, hangarLight, addOutline, gradTex, LEVEL, stageDef, ENEMIES, UPS, LINES, WEAPONS, upCost, wCost, xpNeed };   // 시험용 모듈(vrm_test.js)이 쓰는 부품
window.__view = (pos, look) => { game.debugView = pos ? { pos, look } : null; };
window.__cam = v => { if (v.pull != null) camPull = v.pull; if (v.tilt != null) camTilt = v.tilt; if (v.fov) { camera.fov = baseFov = v.fov; camera.updateProjectionMatrix(); } return { camPull, camTilt, baseFov }; };     // 검증용: 확대 정도 조절     // 검증용 카메라
window.__step = (seconds, dt = 1 / 60) => {
  window.__manual = true;
  for (let t = 0; t < seconds && game.state === 'play'; t += dt) { game.clock += dt; game.update(dt); game.updateFx(dt, true); }
  game.render(dt);
  return { stage: stageName(game.stage), parts: Math.floor(game.parts), time: +game.time.toFixed(1), dist: Math.floor(game.distM), kills: game.kills, state: game.state,
    enemies: game.enemies.length, girls: game.girls.map(g => `${g.name}:${Math.round(g.hp)}/${Math.round(g.sh)}@${g.col},${g.row}`) };
};
