// 주인공 4명(OPUS, SONNET, HAIKU, FABLE)의 폴리곤 모델. 전투에서는 거의 뒷모습만 보이므로 뒷모습을 기준으로 깎는다.
// 시안: 기획/주인공_OPUS.webp 등. 소녀는 -Z(앞)를 보고, 뒤(+Z)가 카메라 쪽이다.
// 관절 구조(root, body, hips, torso, legs, armL/armR, head)는 game.js 의 buildGirl 과 같게 맞춰 두었다(나중에 게임에 넣기 위해).
import * as BU from 'three/addons/utils/BufferGeometryUtils.js';

const K = window.__kit, { THREE, gradTex } = K;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

// ------------------------------------------------------------------ 재질과 외곽선
const mats = {};
function toon(hex, o = {}) {
  const key = hex + JSON.stringify(o);
  // 전투에서는 등 뒤(그늘 쪽)를 보게 되므로, 그늘이 너무 탁해지지 않게 자기 색을 조금 밝혀 둔다
  return mats[key] ||= new THREE.MeshToonMaterial({ color: hex, gradientMap: gradTex, emissive: new THREE.Color(hex).multiplyScalar(LIFT), ...o });
}
const LIFT = 0.24;
const HAIR_MAT = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradTex });
HAIR_MAT.onBeforeCompile = sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * 0.26;');
};
const glow = hex => mats['g' + hex] ||= new THREE.MeshBasicMaterial({ color: hex });
// 외곽선: 매끈한 법선 방향으로 부풀린 검은 껍데기. 멀리서도 보이도록 거리에 따라 조금 두꺼워진다.
const LINE = new THREE.MeshBasicMaterial({ color: 0x1c1626, side: THREE.BackSide });
LINE.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    { vec4 mv0 = modelViewMatrix * vec4(position, 1.0); transformed += normalize(normal) * 0.0062 * clamp(-mv0.z * 0.2, 1.0, 7.0); }`);
};
function smoothOf(geo) {
  if (geo.userData.smooth) return geo.userData.smooth;
  const p = new THREE.BufferGeometry();
  p.setAttribute('position', geo.getAttribute('position'));
  if (geo.index) p.setIndex(geo.index);
  const m = BU.mergeVertices(p, 1e-4);
  m.computeVertexNormals();
  return geo.userData.smooth = m;
}
const LINE_HAIR = LINE.clone();
LINE_HAIR.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    { vec4 mv0 = modelViewMatrix * vec4(position, 1.0); transformed += normalize(normal) * 0.0042 * clamp(-mv0.z * 0.2, 1.0, 7.0); }`);
};
function mesh(geo, mat, line = true) {
  const m = new THREE.Mesh(geo, mat);
  if (line) { const o = new THREE.Mesh(smoothOf(geo), mat === HAIR_MAT ? LINE_HAIR : LINE); o.userData.noOutline = true; m.add(o); }
  m.userData.noOutline = true;
  return m;
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };
const G = () => new THREE.Group();

// ------------------------------------------------------------------ 모양 도구
// 선반 깎기: [반지름, 높이] 목록(아래에서 위로)을 돌려 만든다. sx, sz 로 단면을 타원으로.
function lathe(prof, seg = 18, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}
function ellip(rx, ry, rz, ws = 18, hs = 12) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; }
// 판: 2D 윤곽을 두께만큼 밀어내고 모서리를 살짝 깎는다. 판의 바깥쪽은 +Z.
function plate(pts, depth, bev = 0.012) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}
// 판을 세로축(Y) 둘레로 휘어 몸에 감기게 한다 (R: 휘는 반지름)
function bendY(g, R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = x / R, rr = R + z;
    p.setXYZ(i, Math.sin(a) * rr, p.getY(i), Math.cos(a) * rr - R);
  }
  g.computeVertexNormals();
  return g;
}
// 판을 가로축(X) 둘레로 휜다 (어깨처럼 위로 둥글게)
function bendX(g, R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i), a = y / R, rr = R + z;
    p.setXYZ(i, p.getX(i), Math.sin(a) * rr, Math.cos(a) * rr - R);
  }
  g.computeVertexNormals();
  return g;
}
const rrect = (w, h, r = 0.02) => {      // 모서리가 둥근 직사각형 윤곽
  const pts = [], n = 4;
  for (const [cx, cy, a0] of [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]])
    for (let i = 0; i <= n; i++) { const a = (a0 + 90 * i / n) * D2R; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
};

// 머리 다발: 곡선을 따라 납작한 초승달 단면을 뽑고, 끝은 뾰족하게. 색은 꼭짓점마다 칠한다(천사 고리, 끝 쪽 밝게).
function clump(pts, o) {
  const n = o.n || 40, ring = o.ring || 10, ctr = o.center;
  const P = new THREE.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(n);
  const pos = [], col = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), out = new THREE.Vector3(), q = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = P[i];
    if (i < n) T.subVectors(P[i + 1], p); else T.subVectors(p, P[i - 1]);
    T.normalize();
    out.set(p.x - ctr.x, Math.max(0, p.y - ctr.y), p.z - ctr.z);
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
    N.copy(out).addScaledVector(T, -out.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    const w = o.w * (o.rootW ?? 0.6 + 0.4 * sstep(0, 0.3, u)) * Math.pow(Math.max(0, 1 - u), o.tip ?? 0.75);
    const th = o.t * (0.5 + 0.5 * sstep(0, 0.2, u)) * Math.pow(Math.max(0, 1 - u), 0.5);
    o.color(c, u, p);
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
      q.copy(p).addScaledVector(B, cx * w).addScaledVector(N, cy * th - (o.curl ?? 0.35) * cx * cx * w);
      pos.push(q.x, q.y, q.z); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < ring; k++) {
    const a = i * ring + k, b = i * ring + (k + 1) % ring, cc = a + ring, d = b + ring;
    idx.push(a, b, cc, b, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  fixWinding(g, P[Math.floor(n / 3)], ctr);
  g.computeVertexNormals();
  return g;
}
// 면이 바깥을 보도록: 가운데쯤 삼각형 하나를 골라 방향이 반대면 전부 뒤집는다
function fixWinding(g, pMid, ctr) {
  const ix = g.index.array, p = g.attributes.position, A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  let s = 0;
  for (let t = 0; t < ix.length; t += 3) {
    A.fromBufferAttribute(p, ix[t]); B.fromBufferAttribute(p, ix[t + 1]); C.fromBufferAttribute(p, ix[t + 2]);
    const cen = A.clone().add(B).add(C).multiplyScalar(1 / 3);
    const nrm = B.sub(A).cross(C.sub(A));
    s += Math.sign(nrm.dot(cen.sub(pMid.clone().lerp(cen, 0))));      // 단면 중심에서 바깥쪽인지
  }
  if (s < 0) for (let t = 0; t < ix.length; t += 3) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; }
}

// ------------------------------------------------------------------ 캐릭터 정의
// hair: base(기본) shade(안쪽 겹) hi(천사 고리) / suit: 보디슈트 / armor: 흰 장갑 / line: 장갑의 줄무늬 색 / acc: 주황 포인트
export const DEFS = [
  { name: 'OPUS', hair: { base: 0xf2cfa6, shade: 0xd6a97c, hi: 0xfff1de }, suit: 0x252838, armor: 0xefebe4, armor2: 0xcfcac2,
    line: 0x2f62d6, acc: 0xd07438, collar: 0x2a2d40, vent: 0x8fe4f2, style: 'long', sweep: 1, wave: 1, len: 0.78, pin: 'tri',
    pauldron: 'angular', skirt: 'opus', boot: 'opus', glove: null },
  { name: 'SONNET', hair: { base: 0x4c2e30, shade: 0x352022, hi: 0x7a5254 }, suit: 0x3a3644, armor: 0xebe8e4, armor2: 0x6b6a7a,
    line: 0x3ec6c4, acc: 0xf08a2c, collar: 0xf08a2c, vent: 0x5fe0e0, style: 'long', sweep: 0, wave: 0, len: 0.8, pin: 'x',
    pauldron: 'round', skirt: 'sonnet', boot: 'sonnet', glove: null, spine: true, glasses: true },
  { name: 'HAIKU', hair: { base: 0xeee9ee, shade: 0xc4bccc, hi: 0xffffff }, suit: 0x2b2a30, armor: 0xf3f3f6, armor2: 0xa9c4ee,
    line: 0xa9c4ee, acc: 0xf2a21e, collar: 0xf2a21e, vent: 0x8fd8f0, style: 'bob', pin: 'x',
    pauldron: 'round', skirt: 'haiku', boot: 'haiku', glove: null },
  { name: 'FABLE', hair: { base: 0x8e5c46, shade: 0x6c4232, hi: 0xb88068 }, suit: 0x302b31, armor: 0xf0e8dc, armor2: 0x58778f,
    line: 0x58778f, acc: 0xf08a2a, collar: 0xf08a2a, vent: 0x7aa4c4, style: 'long', sweep: 1, wave: 1.2, len: 0.84, pin: 'flower',
    pauldron: 'round', skirt: 'fable', boot: 'fable', glove: 0x26222a },
];

// ------------------------------------------------------------------ 머리카락
const HR = 0.385;                 // 머리카락 껍데기 반지름 (머리 0.34 바깥)
const HC = V(0, 0, 0.0);          // 머리 묶음 기준(머리 그룹 안의 좌표)
const sp = (az, el, r) => V(Math.sin(az * D2R) * Math.cos(el * D2R) * r, Math.sin(el * D2R) * r, Math.cos(az * D2R) * Math.cos(el * D2R) * r);

function hairPainter(def) {
  const base = new THREE.Color(def.hair.base), shade = new THREE.Color(def.hair.shade), hi = new THREE.Color(def.hair.hi);
  return (layer) => (c, u, p) => {
    c.copy(base); if (!layer) c.lerp(shade, 0.5);
    // 천사 고리: 정수리 조금 아래에 밝은 띠 (뒤쪽 위주)
    const el = Math.atan2(p.y, Math.hypot(p.x, p.z)) / D2R, r = p.length();
    if (r > HR * 0.85 && r < HR * 1.3) {
      const band = Math.pow(Math.max(0, 1 - Math.abs(el - 36) / 13), 1.5);
      if (band > 0) c.lerp(hi, band * (layer ? 0.85 : 0.35));
    }
    if (u > 0.6) c.lerp(hi, (u - 0.6) * (layer ? 0.35 : 0.2));       // 끝으로 갈수록 살짝 밝게
  };
}

// 몸 둘레(머리 그룹 좌표, 머리 중심 기준 아래로 dy): 머리카락이 몸을 뚫지 않게 띄울 거리
function clear(dy) {      // dy: 머리 중심에서 아래로 (양수 = 아래)
  const rx = dy < 0.45 ? lerp(0.44, 0.56, sstep(0.28, 0.45, dy)) : lerp(0.56, 0.42, sstep(0.5, 1.0, dy));
  const rz = dy < 0.45 ? lerp(0.4, 0.34, sstep(0.28, 0.45, dy)) : lerp(0.34, 0.33, sstep(0.5, 1.0, dy));
  return [rx, rz];
}

// 등 뒤로 늘어지는 긴 다발 하나의 경로
function hangPath(c) {
  const pts = [sp(c.top, 74, HR * 0.8), sp(c.top, 42, HR * 1.0), sp(lerp(c.top, c.bot, 0.12), 8, HR * 1.05), sp(lerp(c.top, c.bot, 0.25), -28, HR * 1.07)];
  const y0 = -HR * 0.92, steps = 6;
  for (let j = 1; j <= steps; j++) {
    const f = j / steps, y = lerp(y0, -c.len, f), [rx, rz] = clear(-y);
    const th = lerp(c.top, c.bot, 0.25 + 0.75 * Math.sqrt(f)) * D2R;
    const R1 = 1 + (c.out || 0) * f;
    let x = Math.sin(th) * rx * R1 + (c.sweep || 0) * f * f, z = Math.cos(th) * rz * R1 + (c.lift || 0) * f;
    if (c.wave) { const wv = c.wave * Math.sin(f * 2.6 * Math.PI + (c.ph || 0)) * sstep(0.1, 0.5, f); x += wv * Math.cos(th); z -= wv * Math.sin(th) * 0.4; }
    pts.push(V(x, y, z));
  }
  return pts;
}

function buildHair(def, head) {
  const paint = hairPainter(def);
  const add = (pts, o, layer) => head.add(mesh(clump(pts, { center: HC, color: paint(layer), ...o }), HAIR_MAT));
  // 머리 껍데기 (정수리와 뒤통수). 얼굴 쪽은 잘라 낸다.
  {
    const g = new THREE.SphereGeometry(HR, 36, 22);
    g.scale(1.12, 1.02, 1.08);
    const p = g.attributes.position, col = [], c = new THREE.Color(), cp = paint(1);
    for (let i = 0; i < p.count; i++) { cp(c, 0.2, V(p.getX(i), p.getY(i), p.getZ(i))); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const ix = g.index.array, keep = [];
    for (let t = 0; t < ix.length; t += 3) {
      let face = 0, low = 0;
      for (let k = 0; k < 3; k++) { const y = p.getY(ix[t + k]), z = p.getZ(ix[t + k]); if (z < -HR * 0.35 && y < HR * 0.42) face++; if (y < -HR * 0.55) low++; }
      if (face < 2 && low < 2) keep.push(ix[t], ix[t + 1], ix[t + 2]);
    }
    g.setIndex(keep); g.computeVertexNormals();
    head.add(mesh(g, HAIR_MAT));
  }
  // 앞머리 (앞모습 확인용으로 간단히)
  for (let i = -4; i <= 4; i++) {
    const az = 180 + i * 17, L = 0.36 - Math.abs(i) * 0.012;
    add([sp(az, 70, HR * 0.8), sp(az, 40, HR * 1.04), sp(az + i * 1.5, 10, HR * 1.07), V(Math.sin(az * D2R) * HR * 1.0, HR * 0.5 - L, Math.cos(az * D2R) * HR * 0.98)],
      { w: 0.085, t: 0.03, n: 12, tip: 0.9 }, 1);
  }
  // 시안의 머리는 가닥이 아니라 큰 덩어리다: 매끈한 종 모양 덩어리 하나 + 한쪽으로 길게 늘어진 다발 몇 개.
  const H = HAIR_SPEC[def.name];
  head.add(mesh(hairMass(H, paint), HAIR_MAT));
  for (const L of H.locks || []) {
    const [top, bot, len, w, ph] = L;
    add(hangPath({ top, bot, len, out: 0.1, wave: H.wave, ph, lift: 0.03, sweep: (H.sweep || 0) * Math.sign(bot) }), { w: w * 1.35, t: 0.085, curl: 0.22, tip: H.tip, n: 44 }, 1);
  }
  // 옆머리 (얼굴 옆으로 내려오는 다발)
  for (const s of [-1, 1]) for (const [az, l] of [[132, 0.42], [150, 0.36]]) {
    const a = s * az;
    add([sp(a, 60, HR * 0.85), sp(a, 20, HR * 1.08), sp(a, -20, HR * 1.12), V(Math.sin(a * D2R) * 0.46, -0.36, Math.cos(a * D2R) * 0.38), V(Math.sin(a * D2R) * 0.47, -l - 0.12, Math.cos(a * D2R) * 0.32)],
      { w: 0.12, t: 0.04, tip: H.tip }, 1);
  }
  if (H.flicks) for (const [az, y, dx] of H.flicks) {       // 단발 끝의 삐친 다발
    const a = az * D2R, r0 = HR * 1.2;
    add([V(Math.sin(a) * r0 * 0.95, y + 0.16, Math.cos(a) * r0 * 0.9), V(Math.sin(a) * r0 * 1.05, y + 0.04, Math.cos(a) * r0), V(Math.sin(a) * r0 * 1.2 + dx, y - 0.04, Math.cos(a) * r0 * 1.1)],
      { w: 0.09, t: 0.035, n: 14, tip: 0.8 }, 1);
  }
  // 바보털
  add([V(0, HR * 0.95, 0.02), V(0.03, HR * 1.22, -0.02), V(0.11, HR * 1.3, 0.04), V(0.15, HR * 1.2, 0.12)], { w: 0.04, t: 0.02, n: 10, center: V(0, 0, 0) }, 1);
  add([V(-0.02, HR * 0.95, 0.03), V(-0.06, HR * 1.17, 0.02), V(-0.13, HR * 1.2, 0.08)], { w: 0.034, t: 0.017, n: 10 }, 1);
}

// 머리 덩어리: 정수리에서 아래로 종 모양으로 퍼지는 두꺼운 껍데기. 아랫단은 방향(az)마다 길이가 다르고 끝이 뾰족뾰족하다.
// 가닥 사이 외곽선이 없어서 줄무늬처럼 보이지 않고, 툰 음영과 은은한 결(홈)로 머리카락 느낌을 낸다.
function hairMass(H, paint) {
  const A0 = -152, A1 = 152, nA = 76, nV = 30;
  const R = HR * 1.08, SX = 1.03, SZ = 1.05, yTop = R * 0.999, yEq = -0.03;
  const bottomAt = az => {           // 아랫단 높이: 표의 점들을 부드럽게 잇고 뾰족한 끝을 더한다
    const B = H.bottom;
    let y = B[0][1];
    for (let k = 0; k < B.length - 1; k++) if (az >= B[k][0] && az <= B[k + 1][0]) y = lerp(B[k][1], B[k + 1][1], sstep(B[k][0], B[k + 1][0], az));
    if (az > B[B.length - 1][0]) y = B[B.length - 1][1];
    const per = H.spike || 15, fr = (((az - A0) / per) % 1 + 1) % 1, tri = 1 - Math.abs(fr * 2 - 1);
    const chunk = Math.floor((az - A0) / per), jit = (Math.sin(chunk * 12.9898) * 43758.5453 % 1 + 1) % 1;      // 덩어리마다 길이를 조금씩 다르게
    return y - (H.spikeAmp ?? 0.05) * Math.pow(tri, 1.6) * (0.6 + 0.8 * jit);
  };
  const outer = [], inner = [], colO = [], colI = [];
  const c = new THREE.Color(), cpO = paint(1), cpI = paint(0), q = new THREE.Vector3();
  const rEq = Math.sqrt(R * R - yEq * yEq);
  for (let i = 0; i <= nA; i++) {
    const az = lerp(A0, A1, i / nA), a = az * D2R, yb = bottomAt(az);
    for (let j = 0; j <= nV; j++) {
      const v = j / nV;
      // 위쪽은 촘촘히 (정수리 둥근 곳), 아래쪽은 성기게
      const y = v < 0.55 ? lerp(yTop, yEq, Math.sin(v / 0.55 * Math.PI / 2)) : lerp(yEq, yb, (v - 0.55) / 0.45);
      const t = y >= yEq ? 0 : (yEq - y) / Math.max(0.01, yEq - yb);
      let r = y >= yEq ? Math.sqrt(Math.max(0, R * R - y * y)) : rEq * (1 + (H.flare ?? -0.18) * t * t + (H.belly ?? 0.06) * Math.sin(t * Math.PI));
      r *= 1 + 0.018 * Math.sin(a * 14 + y * 4) * sstep(yTop * 0.9, yTop * 0.4, y);     // 결: 세로로 흐르는 얕은 홈
      const th = (H.thick || 0.05) * lerp(1, 0.35, t);
      for (const [arr, col, rr, cp] of [[outer, colO, r, cpO], [inner, colI, Math.max(0.001, r - th), cpI]]) {
        q.set(Math.sin(a) * rr * SX, y, Math.cos(a) * rr * SZ);
        arr.push(q.x, q.y, q.z);
        cp(c, 0.3, q); c.multiplyScalar(1 - 0.22 * t * t);       // 아래로 갈수록 그늘
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const NV = nV + 1, NO = (nA + 1) * NV, pos = [...outer, ...inner], col = [...colO, ...colI], idx = [];
  const o = (i, j) => i * NV + j, n = (i, j) => NO + i * NV + j;
  for (let i = 0; i < nA; i++) for (let j = 0; j < nV; j++) {
    idx.push(o(i, j), o(i + 1, j), o(i, j + 1), o(i + 1, j), o(i + 1, j + 1), o(i, j + 1));          // 바깥
    idx.push(n(i, j), n(i, j + 1), n(i + 1, j), n(i + 1, j), n(i, j + 1), n(i + 1, j + 1));          // 안쪽 (반대로)
  }
  for (let i = 0; i < nA; i++) { const j = nV; idx.push(o(i, j), o(i + 1, j), n(i, j), o(i + 1, j), n(i + 1, j), n(i, j)); }   // 아랫단
  for (const [i, f] of [[0, 1], [nA, -1]]) for (let j = 0; j < nV; j++) {                              // 양옆 끝
    if (f > 0) idx.push(o(i, j), o(i, j + 1), n(i, j), o(i, j + 1), n(i, j + 1), n(i, j));
    else idx.push(o(i, j), n(i, j), o(i, j + 1), o(i, j + 1), n(i, j), n(i, j + 1));
  }
  // 바깥면이 밖(머리 중심 반대쪽)을 보는지 확인하고 아니면 전부 뒤집는다
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), at3 = (v3, k) => v3.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  let sgn = 0;
  for (let t = 0; t < nA * nV * 12; t += 12) {
    at3(A, idx[t]); at3(B, idx[t + 1]); at3(C, idx[t + 2]);
    const cen = A.clone().add(B).add(C);
    sgn += Math.sign(B.clone().sub(A).cross(C.clone().sub(A)).dot(cen));
  }
  if (sgn < 0) for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 시안 뒷모습을 보고 정한 머리 모양 (머리 그룹 좌표: 머리 중심 0, 턱 ≈ -0.33, 목깃 ≈ -0.4, 엉덩이 ≈ -0.85)
//  bottom: [방향, 아랫단 높이] (방향 0 = 등 한가운데, + = 뒤에서 보아 화면 오른쪽)
//  locks: 길게 늘어진 다발 [위쪽 방향, 아래쪽 방향, 길이, 너비, 물결 위상]
const HAIR_SPEC = {
  // 베이지 웨이브: 가운데는 목깃에서 끝나고, 오른쪽으로 쓸린 큰 다발이 엉덩이까지
  OPUS: { wave: 0.05, tip: 0.8, sweep: 0.06, spike: 24, spikeAmp: 0.09,
    bottom: [[-152, -0.28], [-100, -0.3], [-40, -0.31], [10, -0.33], [50, -0.4], [100, -0.42], [152, -0.36]],
    locks: [[48, 78, 0.92, 0.26, 0], [72, 98, 1.0, 0.26, 1.4], [96, 116, 0.94, 0.22, 2.6], [120, 128, 0.78, 0.18, 0.8]] },
  // 흑갈색 생머리: 가운데는 목깃까지, 왼쪽 다발이 엉덩이까지 곧게
  SONNET: { wave: 0.012, tip: 0.55, sweep: 0.03, spike: 20, spikeAmp: 0.06,
    bottom: [[-152, -0.38], [-100, -0.42], [-40, -0.33], [20, -0.31], [80, -0.36], [152, -0.34]],
    locks: [[-50, -80, 0.96, 0.25, 0], [-76, -100, 1.02, 0.25, 1.2], [-100, -118, 0.96, 0.22, 2.2], [-124, -130, 0.8, 0.16, 0.5], [70, 96, 0.62, 0.2, 1]] },
  // 은발 단발: 목덜미에서 끝나고 바깥으로 살짝 뻗친다
  HAIKU: { wave: 0, tip: 0.7, spike: 21, spikeAmp: 0.09, flare: -0.02, belly: 0.1,
    bottom: [[-152, -0.26], [-100, -0.32], [0, -0.31], [100, -0.32], [152, -0.26]],
    flicks: [[-120, -0.3, -0.05], [-80, -0.34, -0.04], [85, -0.34, 0.04], [125, -0.3, 0.05]] },
  // 갈색 웨이브: 왼쪽은 꽃 장식 아래 어깨까지, 오른쪽으로 크게 굽이치는 다발이 엉덩이까지
  FABLE: { wave: 0.075, tip: 0.75, sweep: 0.08, spike: 24, spikeAmp: 0.09,
    bottom: [[-152, -0.3], [-100, -0.33], [-30, -0.32], [30, -0.34], [70, -0.42], [152, -0.38]],
    locks: [[40, 70, 0.9, 0.27, 0.3], [62, 92, 1.0, 0.28, 1.6], [86, 112, 1.02, 0.25, 2.8], [110, 124, 0.86, 0.2, 0.9], [128, 134, 0.7, 0.16, 2]] },
};

function buildBob(def, add) {
  // 부스스한 단발: 목덜미에서 바깥으로 살짝 말려 끝나는 다발을 둥글게 두른다
  const rnd = mulberry(77);
  for (let a = -150; a <= 150; a += 18) {
    const front = Math.abs(a) > 120;
    const yEnd = -HR * (front ? 1.15 : 1.35) - rnd() * 0.05, R2 = HR * (1.2 + rnd() * 0.08);
    const pts = [sp(a * 0.7, 72, HR * 0.8), sp(a * 0.85, 35, HR * 1.04), sp(a, -5, HR * 1.12), sp(a, -35, HR * 1.16),
      V(Math.sin(a * D2R) * R2, yEnd + 0.06, Math.cos(a * D2R) * R2 * 0.95), V(Math.sin((a + 8) * D2R) * (R2 + 0.06), yEnd, Math.cos((a + 8) * D2R) * (R2 + 0.06))];
    add(pts, { w: 0.16, t: 0.05, curl: 0.3, tip: 0.6 }, 0);
  }
  for (let a = -140; a <= 140; a += 20) {
    const yEnd = -HR * (1.05 + rnd() * 0.22), R2 = HR * (1.26 + rnd() * 0.1), da = (rnd() - 0.5) * 16;
    const pts = [sp(a * 0.6, 70, HR * 0.85), sp(a * 0.8, 38, HR * 1.07), sp(a + da * 0.5, 0, HR * 1.17), sp(a + da, -30, HR * 1.22),
      V(Math.sin((a + da) * D2R) * R2, yEnd + 0.05, Math.cos((a + da) * D2R) * R2), V(Math.sin((a + da * 2) * D2R) * (R2 + 0.07), yEnd + 0.02, Math.cos((a + da * 2) * D2R) * (R2 + 0.07))];
    add(pts, { w: 0.13 + rnd() * 0.04, t: 0.045, curl: 0.35, tip: 0.6 }, 1);
  }
  // 바보털 두 가닥
  add([V(0, HR * 0.95, 0.02), V(0.02, HR * 1.25, 0), V(0.12, HR * 1.32, 0.05), V(0.16, HR * 1.2, 0.12)], { w: 0.04, t: 0.02, n: 10 }, 1);
  add([V(-0.01, HR * 0.95, 0.02), V(-0.05, HR * 1.2, 0.0), V(-0.13, HR * 1.25, 0.06)], { w: 0.035, t: 0.018, n: 10 }, 1);
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 머리 장식 (뒤에서 보이는 왼쪽 위)
function buildPin(def, head) {
  const pos = sp(-62, 32, HR * 1.12), grp = at(G(), pos.x, pos.y, pos.z);
  grp.lookAt(pos.clone().multiplyScalar(2));
  head.add(grp);
  if (def.pin === 'tri') {
    const tri = [[0, 0.07], [-0.065, -0.045], [0.065, -0.045]];
    grp.add(mesh(plate(tri, 0.02, 0.006), toon(0x22202a)));
    const inner = [[0, 0.04], [-0.036, -0.025], [0.036, -0.025]];
    grp.add(at(mesh(plate(inner, 0.01, 0.003), glow(def.acc), false), 0, 0, 0.016));
    grp.add(at(mesh(plate([[0, 0.022], [-0.018, -0.012], [0.018, -0.012]], 0.01, 0.002), toon(0x22202a), false), 0, 0, 0.022));
  } else if (def.pin === 'x') {
    for (const a of [0.78, -0.78]) grp.add(rot(mesh(plate(rrect(0.13, 0.03, 0.012), 0.02, 0.005), toon(def.acc)), 0, 0, a));
  } else if (def.pin === 'flower') {
    const petal = [];
    for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2, r = 0.05 + 0.03 * Math.abs(Math.cos(a * 2.5)); petal.push([Math.cos(a) * r, Math.sin(a) * r]); }
    grp.add(mesh(plate(petal, 0.02, 0.006), toon(def.acc)));
    grp.add(at(mesh(new THREE.SphereGeometry(0.02, 10, 8), toon(0xffd25a), false), 0, 0, 0.02));
    const small = petal.map(([x, y]) => [x * 0.6, y * 0.6]);
    grp.add(at(mesh(plate(small, 0.016, 0.005), toon(0xfbe6d4)), 0.07, 0.05, -0.01));
    for (let i = 0; i < 3; i++) grp.add(at(mesh(new THREE.SphereGeometry(0.018, 8, 6), toon(def.acc)), -0.02 + i * 0.012, -0.08 - i * 0.045, -0.01));       // 늘어진 장식
  }
}

// ------------------------------------------------------------------ 몸과 장갑
export function buildGirl2(def) {
  const SU = toon(def.suit), AR = toon(def.armor), AR2 = toon(def.armor2), LN = toon(def.line), AC = toon(def.acc), SK = toon(0xffe2d0);
  const DK = toon(0x1e1c26), VENT = glow(def.vent);
  const root = G(), body = G();
  root.add(body);

  // 골반과 다리
  const hips = at(G(), 0, 0.9, 0); body.add(hips);
  hips.add(mesh(lathe([[0.02, -0.15], [0.14, -0.13], [0.19, -0.05], [0.19, 0.03], [0.155, 0.1], [0.13, 0.16]], 20, 1.32, 1.0), SU));
  for (const s of [-1, 1]) hips.add(at(mesh(ellip(0.115, 0.115, 0.09), SU, false), s * 0.085, -0.06, 0.08));       // 엉덩이 둥글게
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = at(G(), s * 0.13, -0.07, 0), knee = at(G(), 0, -0.3, 0);
    hip.add(mesh(lathe([[0.085, -0.31], [0.1, -0.24], [0.122, -0.1], [0.128, 0.0], [0.11, 0.06]], 16), SU));
    if (def.skirt === 'sonnet') hip.add(at(mesh(lathe([[0.088, -0.05], [0.094, 0.05]], 16), AR2, false), 0, -0.17, 0));     // 허벅지 회색 띠
    // 무릎과 부츠 (정강이 장갑이 크다)
    knee.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), def.boot === 'opus' ? AC : DK));
    const bootProf = [[0.075, -0.52], [0.12, -0.5], [0.125, -0.4], [0.112, -0.24], [0.11, -0.1], [0.12, -0.02], [0.1, 0.04]];
    knee.add(mesh(lathe(bootProf, 10, 1.05, 1.1), toon(def.armor, { flatShading: true })));
    // 부츠 뒤쪽 줄무늬
    const stripe = def.boot === 'haiku' ? AR2 : LN;
    knee.add(at(rot(mesh(plate(rrect(0.03, 0.2, 0.012), 0.012, 0.004), stripe, false), -0.05), 0, -0.22, 0.112));
    if (def.boot === 'fable') knee.add(at(rot(mesh(plate(rrect(0.035, 0.1, 0.012), 0.012, 0.004), AC, false), -0.05), 0, -0.4, 0.118));
    // 발: 흰 등판 + 어두운 밑창 (뒤꿈치가 보인다)
    const foot = at(G(), 0, -0.5, -0.03); knee.add(foot);
    foot.add(mesh(ellip(0.1, 0.055, 0.16, 14, 8), AR), at(mesh(ellip(0.105, 0.03, 0.165, 14, 6), def.boot === 'haiku' ? toon(0x7f9fd8) : DK), 0, -0.035, 0));
    if (def.boot === 'haiku') foot.add(at(mesh(ellip(0.07, 0.045, 0.05), AC), 0, 0.0, 0.12));            // 주황 뒤꿈치
    hip.add(knee); hips.add(hip); legs.push({ hip, knee });
  }
  // 허리 장갑 (캐릭터마다 다름)
  buildSkirt(def, hips, { AR, AR2, LN, AC, DK });

  // 몸통
  const torso = at(G(), 0, 0.94, 0); body.add(torso);
  torso.add(mesh(lathe([[0.125, -0.02], [0.118, 0.07], [0.145, 0.2], [0.158, 0.3], [0.138, 0.4], [0.08, 0.46], [0.05, 0.53]], 20, 1.28, 0.88), SU));
  torso.add(at(mesh(lathe([[0.055, 0], [0.062, 0.05], [0.058, 0.08]], 14), toon(def.collar)), 0, 0.47, 0));        // 목깃
  torso.add(at(mesh(lathe([[0.04, 0], [0.04, 0.12]], 10), SK, false), 0, 0.52, 0));                                // 목
  // 허리띠
  torso.add(at(mesh(lathe([[0.134, 0], [0.138, 0.025], [0.134, 0.05]], 20, 1.2, 0.9), def.skirt === 'sonnet' ? toon(0x55546a) : AR), 0, -0.02, 0));
  // 등판: 육각형 판 + 통풍구 두 개
  {
    const w = def.name === 'HAIKU' ? 0.17 : 0.19, h = 0.15;
    const hex = [[-w, h], [w, h], [w + 0.02, 0.0], [w * 0.55, -h - 0.02], [-w * 0.55, -h - 0.02], [-w - 0.02, 0.0]];
    const bp = at(mesh(bendY(plate(hex, 0.04, 0.014), 0.24), AR), 0, 0.29, 0.162);
    torso.add(bp);
    for (const s of [-1, 1]) {
      bp.add(at(rot(mesh(bendY(plate(rrect(0.1, 0.06, 0.014), 0.012, 0.003), 0.24), VENT, false), 0, s * 0.2), s * 0.072, 0.04, 0.026));
      bp.add(at(rot(mesh(bendY(plate(rrect(0.078, 0.04, 0.009), 0.012, 0.002), 0.24), DK, false), 0, s * 0.2), s * 0.072, 0.04, 0.032));
    }
    if (def.spine) for (let i = 0; i < 3; i++) torso.add(at(mesh(bendY(plate(rrect(0.13 - i * 0.015, 0.045, 0.01), 0.02, 0.006), 0.2), AR2), 0, 0.13 - i * 0.055, 0.145 - i * 0.006));
    if (def.name === 'OPUS') torso.add(at(mesh(bendY(plate(rrect(0.2, 0.03, 0.01), 0.02, 0.005), 0.22), toon(0xd07438)), 0, 0.46, 0.09));
  }
  // 팔: 어깨 → 팔꿈치 → 손
  const mkArm = s => {
    const sh = at(G(), s * 0.215, 0.41, 0), el = at(G(), 0, -0.26, 0);
    sh.add(mesh(lathe([[0.046, -0.26], [0.05, -0.18], [0.056, -0.04], [0.05, 0.03]], 12), SU));
    // 어깨 장갑
    if (def.pauldron === 'angular') {
      const pa = at(G(), s * 0.27, 0.44, 0); torso.add(pa);
      pa.add(mesh(ellip(0.21, 0.14, 0.17, 8, 6), toon(def.armor, { flatShading: true })));
      pa.add(at(rot(mesh(plate(rrect(0.2, 0.025, 0.01), 0.02, 0.005), LN, false), 0, 0, -s * 0.5), s * 0.06, 0.05, 0.08));
      pa.add(at(rot(mesh(plate(rrect(0.2, 0.025, 0.01), 0.02, 0.005), LN, false), 0, 0, -s * 0.5), s * 0.06, 0.05, -0.08));
      pa.add(at(mesh(ellip(0.12, 0.05, 0.1, 8, 4), toon(def.armor2, { flatShading: true })), s * 0.04, -0.08, 0));
    } else {
      const pa = at(G(), s * 0.26, 0.43, 0); torso.add(pa);
      const r = def.name === 'SONNET' ? 0.15 : 0.16;
      pa.add(mesh(ellip(r, r * 0.85, r * 0.95, 16, 10), def.name === 'HAIKU' ? AR : AR));
      pa.add(at(rot(mesh(new THREE.TorusGeometry(r * 0.92, 0.012, 6, 24), def.name === 'HAIKU' ? AR2 : LN, false), Math.PI / 2, 0, 0), 0, -r * 0.3, 0));
    }
    // 팔뚝 장갑 + 주황 소매 끝
    el.add(mesh(lathe([[0.055, -0.25], [0.068, -0.2], [0.07, -0.08], [0.058, 0.0]], 10), toon(def.armor, { flatShading: true })));
    el.add(at(rot(mesh(plate(rrect(0.024, 0.13, 0.01), 0.01, 0.003), LN, false), 0, 0, 0), 0, -0.13, 0.068));
    el.add(at(mesh(lathe([[0.06, 0], [0.062, 0.035]], 12), AC), 0, -0.27, 0));
    el.add(at(mesh(ellip(0.052, 0.06, 0.045), def.glove ? toon(def.glove) : SK), 0, -0.33, 0));
    sh.add(el); torso.add(sh);
    return { sh, el };
  };
  const armL = mkArm(-1), armR = mkArm(1);
  for (const a of [armL, armR]) { a.sh.rotation.z = (a === armR ? 1 : -1) * 0.5; a.el.rotation.z = (a === armR ? 1 : -1) * 0.15; }

  // 머리
  const head = at(G(), 0, 1.8, 0); body.add(head);
  head.scale.setScalar(1.0);
  head.add(mesh(ellip(0.34, 0.33, 0.33, 24, 18), SK));
  for (const s of [-1, 1]) head.add(at(mesh(ellip(0.03, 0.055, 0.035), SK), s * 0.335, -0.04, 0.02));   // 귀
  buildHair(def, head);
  buildPin(def, head);
  if (def.glasses) for (const s of [-1, 1]) head.add(at(rot(mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 18), DK, false), 0, Math.PI / 2, 0), s * 0.345, 0.0, -0.06));

  root.scale.setScalar(1.4);
  return { root, body, hips, torso, legs, armL, armR, head, tails: [], wings: [], flames: [], flash: G() };
}

function buildSkirt(def, hips, M) {
  const { AR, AR2, LN, AC, DK } = M;
  if (def.skirt === 'opus') {
    // 뒤로 넓게 퍼진 큰 판 두 장 + 아래 테두리 파란 줄, 옆에도 판
    for (const s of [-1, 1]) {
      const shape = [[0, 0.07], [0.24, 0.07], [0.29, -0.12], [0.15, -0.21], [0.0, -0.18]];
      const p = at(rot(mesh(bendY(plate(shape.map(([x, y]) => [x * s, y]), 0.03, 0.01), 0.27), AR), -0.25, 0, 0), 0, -0.02, 0.205);
      hips.add(p);
      p.add(at(rot(mesh(plate(rrect(0.24, 0.026, 0.01), 0.012, 0.004), LN, false), 0, 0, s * 0.45), s * 0.21, -0.15, 0.014));
      const side = at(rot(mesh(plate([[-0.09, 0.06], [0.09, 0.06], [0.1, -0.12], [-0.06, -0.16]], 0.03, 0.01), AR), 0, s * Math.PI / 2, s * 0.25), s * 0.262, -0.03, 0.0);
      hips.add(side);
      hips.add(at(mesh(ellip(0.035, 0.05, 0.03), AC), s * 0.2, 0.06, 0.15));      // 허리 주황 장치
    }
  } else if (def.skirt === 'sonnet') {
    // 허벅지 바깥쪽 흰 판 (청록 선)
    for (const s of [-1, 1]) {
      const p = at(rot(mesh(plate([[-0.08, 0.08], [0.08, 0.06], [0.07, -0.16], [-0.06, -0.2]], 0.03, 0.01), AR), 0, s * Math.PI / 2, s * 0.12), s * 0.255, -0.12, 0.0);
      p.add(at(mesh(plate([[-0.05, 0.05], [-0.035, 0.05], [-0.03, -0.15], [-0.045, -0.16]], 0.01, 0.003), LN, false), 0, 0, 0.022));
      hips.add(p);
      hips.add(at(rot(mesh(bendY(plate(rrect(0.12, 0.05, 0.01), 0.025, 0.008), 0.2), AR), -0.2, s * 0.5, 0), s * 0.11, 0.05, 0.195));   // 허리 뒤 작은 판
    }
  } else if (def.skirt === 'haiku') {
    for (const s of [-1, 1]) {
      const p = at(rot(mesh(plate([[-0.06, 0.06], [0.06, 0.06], [0.07, -0.1], [-0.05, -0.14]], 0.03, 0.01), AR), 0, s * Math.PI / 2, s * 0.15), s * 0.258, -0.08, 0.0);
      p.add(at(mesh(plate([[-0.035, 0.03], [0.04, 0.03], [0.04, -0.08], [-0.03, -0.1]], 0.012, 0.004), AR2, false), 0, 0, 0.022));
      hips.add(p);
      hips.add(at(rot(mesh(plate(rrect(0.09, 0.045, 0.01), 0.025, 0.008), AR), 0, s * 0.6, 0), s * 0.12, 0.06, 0.19));
      hips.add(at(mesh(plate(rrect(0.03, 0.04, 0.008), 0.02, 0.005), AC), s * 0.05, 0.06, 0.205));
    }
  } else if (def.skirt === 'fable') {
    // 꽃잎처럼 겹친 허리 판 (뒤와 옆)
    const petal = [[0, 0.07], [0.07, 0.05], [0.085, -0.06], [0.0, -0.15], [-0.085, -0.06], [-0.07, 0.05]];
    for (const [az, y, sc] of [[-75, 0.0, 1.05], [75, 0.0, 1.05], [-40, -0.02, 1.0], [40, -0.02, 1.0], [-110, 0.0, 0.95], [110, 0.0, 0.95]]) {
      const a = az * D2R, r = 0.25;
      const p = at(mesh(plate(petal.map(([x, yy]) => [x * sc, yy * sc]), 0.028, 0.01), AR), Math.sin(a) * r, y - 0.03, Math.cos(a) * r * 0.85);
      p.rotation.set(-0.25, a, 0, 'YXZ');
      p.add(at(mesh(plate([[0.0, 0.03], [0.035, 0.0], [0.0, -0.09], [-0.02, -0.02]], 0.01, 0.003), Math.abs(az) > 60 ? AC : LN, false), 0.01, -0.02, 0.02));
      hips.add(p);
    }
  }
}
