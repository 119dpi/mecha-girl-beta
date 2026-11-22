// 오픈 베타 묶음에만 들어가는 파일 (build_itch.py 가 index.html 에 붙인다. 개발 화면에는 없음).
//  - 왼쪽 아래 구석에 작은 버전 표시
//  - 처음 들어온 사람에게 한 번만 안내창 (닫을 때까지 게임을 멈춘다)
const VERSION = 'v0.34-b2';            // build_itch.py 가 바꿔 넣는다
const SEEN = 'mecha_girl_beta_seen';
const game = window.__game;

const css = document.createElement('style');
css.textContent = `
#betaTag { position: fixed; right: calc(6px + env(safe-area-inset-right)); bottom: calc(4px + env(safe-area-inset-bottom));
  font: 600 10px/1 system-ui, sans-serif; color: #fff; opacity: .35; pointer-events: none; z-index: 30; letter-spacing: .03em; }
#betaNote { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  background: rgba(6, 9, 20, .82); padding: 16px; }
#betaNote .box { max-width: 340px; width: 100%; background: #151b2e; border: 1px solid #3a4670; border-radius: 16px;
  padding: 22px 20px 18px; color: #dfe5f5; font: 14px/1.6 system-ui, sans-serif; box-shadow: 0 12px 40px #0008; }
#betaNote h3 { margin: 0 0 4px; font-size: 20px; color: #ff82c3; }
#betaNote .v { color: #8a94b4; font-size: 12px; margin-bottom: 12px; }
#betaNote ul { margin: 0; padding-left: 18px; } #betaNote li { margin: 5px 0; }
#betaNote button { margin-top: 16px; width: 100%; padding: 12px; border: 0; border-radius: 10px;
  background: #ffdc5a; color: #2a2008; font: 700 16px system-ui, sans-serif; }
`;
document.head.appendChild(css);

const tag = document.createElement('div');
tag.id = 'betaTag'; tag.textContent = `BETA ${VERSION}`;
document.body.appendChild(tag);

let seen = false;
try { seen = localStorage.getItem(SEEN) === VERSION; } catch (e) { /* 저장이 막힌 브라우저: 매번 보여 준다 */ }
if (!seen) {
  const box = document.createElement('div');
  box.id = 'betaNote';
  box.innerHTML = `<div class="box"><h3>오픈 베타 테스트</h3><div class="v">버전 ${VERSION}</div><ul>
    <li>아직 만드는 중인 게임입니다. 밸런스를 고치면서 <b>저장이 초기화될 수 있어요.</b></li>
    <li>효과음과 음악은 아직 없습니다.</li>
    <li>소녀를 끌어서 한 칸씩 옮기고, 바닥에 뜨는 붉은 예고를 피하세요.</li>
    <li>어려웠던 곳, 답답했던 점, 버그는 <b>이 게임을 알려 준 사람</b>에게 전해 주세요. 스테이지 번호(예: 3-2)와 기기(아이폰·안드로이드·PC)를 함께 알려 주시면 큰 도움이 됩니다.</li>
  </ul><button>시작하기</button></div>`;
  document.body.appendChild(box);
  const hold = setInterval(() => { if (game && game.state === 'play') game.state = 'paused'; }, 100);   // 안내를 읽는 동안 멈춤
  box.querySelector('button').addEventListener('click', () => {
    clearInterval(hold);
    if (game && game.state === 'paused') game.state = 'play';
    try { localStorage.setItem(SEEN, VERSION); } catch (e) { /* 무시 */ }
    box.remove();
  });
}
