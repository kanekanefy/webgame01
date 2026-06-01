import { loadScenarioFromFile } from './core/scenario.js';
import { advanceTurn, type Decree } from './core/loop.js';

const state = loadScenarioFromFile('content/scenario.json');
const script: Array<Decree | null> = [
  { actionId: 'set_tax', params: { rate: 0.35 } },
  { actionId: 'hold_festival', params: {} },
  { actionId: 'build_irrigation', params: { provinceId: 'owari' } },
  null,
  { actionId: 'levy_troops', params: { amount: 30 } },
];

let i = 0;
let guard = 0;
while (state.status === 'playing' && guard < 60) {
  const r = advanceTurn(state, script[i] ?? null);
  i = (i + 1) % script.length;
  guard++;
  const facts = [...r.actionFacts, ...r.events].map((f) => f.text).join('；');
  console.log(
    `[${r.year}/${r.season}] koku=${state.clan.koku.toFixed(0)} ` +
      `兵=${state.clan.levy} 民心=${state.clan.contentment.toFixed(2)} ` +
      `威信=${state.clan.prestige.toFixed(2)} 议题=${r.issue} ${facts}`,
  );
}
console.log(`结局：${state.status}`);
