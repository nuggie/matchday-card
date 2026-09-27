// Dev harness: renders <matchday-card> with a mocked `hass` object (no Home Assistant needed).
import { FIXTURE_FILES, SCENARIOS } from './scenarios.js';

const params = new URLSearchParams(location.search);
const name = params.get('scenario') || 'overview';
const theme = params.get('theme') || 'dark';
const lang = params.get('lang') || 'de';
const width = params.get('w');

document.body.classList.add(theme);
if (params.has('shot')) document.body.classList.add('shot');
if (width) document.documentElement.style.setProperty('--stage-width', width === 'full' ? '100%' : width + 'px');

const nav = document.getElementById('nav');
nav.innerHTML = Object.keys(SCENARIOS)
  .map((s) => `<a href="?scenario=${s}&theme=${theme}&lang=${lang}${width ? '&w=' + width : ''}">${s}</a>`)
  .join('');

const fixtures = {};
await Promise.all(
  FIXTURE_FILES.map(async (f) => {
    const res = await fetch(`fixtures/${f}.json`);
    fixtures[f] = await res.json();
  }),
);

const scenario = SCENARIOS[name](fixtures);

// Freeze "now" to the scenario time (countdowns, "today"), the clock keeps running from there.
if (scenario.now) {
  const offset = Date.parse(scenario.now) - Date.now();
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + offset;
}

await import('../dist/matchday-card.js');

function makeHass(states) {
  return {
    states,
    language: lang,
    locale: { language: lang, number_format: 'language', time_format: 'language', time_zone: 'server' },
    config: { time_zone: 'Europe/Berlin' },
    themes: { darkMode: theme === 'dark' },
  };
}

const stage = document.getElementById('stage');
const cards = [];
for (const c of scenario.cards) {
  if (c.caption) {
    const cap = document.createElement('div');
    cap.className = 'caption';
    cap.textContent = c.caption;
    stage.appendChild(cap);
  }
  const el = document.createElement('matchday-card');
  el.setConfig(c.config);
  stage.appendChild(el);
  el.hass = makeHass(scenario.states);
  cards.push(el);
}

// For live-update experiments from the console / Playwright:
//   __update(states => { states['sensor.x'].attributes.matches[0].live_score = '1:0'; })
window.__cards = cards;
window.__update = (mutate) => {
  const next = { ...scenario.states };
  mutate(next);
  // HA hands out new state objects for changed entities only.
  Object.keys(next).forEach((k) => (next[k] = { ...next[k], attributes: { ...next[k].attributes } }));
  scenario.states = next;
  cards.forEach((el) => (el.hass = makeHass(next)));
};
window.__ready = true;
