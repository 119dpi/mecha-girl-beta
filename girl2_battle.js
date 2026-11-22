// 전투 속 소녀를 시안풍 폴리곤 모델(girl2.js)로 바꾼다. 무기·부스터·날개는 game.js 의 dressGirl2 가 단다.
// 주소 뒤에 ?poly 를 붙이면 이 파일을 읽지 않아 예전 모델로 돌아간다.
import { buildGirl2, DEFS } from './girl2.js';

window.__game.setGirlFactory(name => {
  const def = DEFS.find(d => d.name === name);
  return def ? { model: buildGirl2(def), def } : null;
});
