// Scenarios for the dev harness. Each one returns { now, theme?, cards: [{ caption?, config }], states }.
// Base data: real sensor attributes (fixtures/*.json, pulled from Home Assistant on 2026-09-27)
// and the ha-matchday replay of a recorded live evening (fixtures/replay-nations-20260926.json,
// exported at six points in time). Live states of the leagues are derived from the real data.
// Matchday navigation (integration >= 0.4.0): the `matchdays` attribute and the answers of the
// actions come from fixtures/matchdays.json, get_matchday.json and get_match_details.json
// (dev/tools/make_nav_fixtures.py); dev/mock-connection.js plays the integration.

export const FIXTURE_FILES = [
  'sensor.matchday_bundesliga_spieltag',
  'sensor.matchday_bundesliga_tabelle',
  'sensor.matchday_2_bundesliga_spieltag',
  'sensor.matchday_2_bundesliga_tabelle',
  'sensor.matchday_premier_league_spieltag',
  'sensor.matchday_premier_league_tabelle',
  'sensor.matchday_dfb_pokal_spieltag',
  'replay-nations-20260926',
  'matchdays',
  'get_matchday',
  'get_match_details',
];

const clone = (x) => JSON.parse(JSON.stringify(x));

function minuteValue(mn) {
  const m = String(mn || '0').match(/(\d+)'?\+?(\d+)?/);
  return m ? parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0) : 0;
}

function toState(fixture) {
  return {
    entity_id: fixture.entity_id,
    state: fixture.state,
    attributes: clone(fixture.attributes),
    last_changed: '2026-09-27T12:00:00+00:00',
    last_updated: '2026-09-27T12:00:00+00:00',
  };
}

// withMatchdays = false: sensors of an integration before 0.4.0 (no navigation).
function realStates(F, withMatchdays = true) {
  const states = {};
  FIXTURE_FILES.filter((f) => f.startsWith('sensor.')).forEach((id) => {
    const st = (states[id] = toState(F[id]));
    const list = F.matchdays[st.attributes.competition];
    if (withMatchdays && list && Array.isArray(st.attributes.matches)) st.attributes.matchdays = clone(list);
  });
  return states;
}

// A finished match turned back into a running (or half-time) one at `minute`:
// only the events up to that minute, score counted from the goals.
function rewind(m, minute, status) {
  const limit = minuteValue(minute);
  const keep = (e) => minuteValue(e.minute) <= limit;
  m.scorers = (m.scorers || []).filter(keep);
  m.cards = (m.cards || []).filter(keep);
  m.substitutions = (m.substitutions || []).filter(keep);
  let h = 0;
  let a = 0;
  m.scorers.forEach((g) => {
    const home = g.type === 'owngoal' ? g.team === 'team2' : g.team === 'team1';
    if (home) h += 1;
    else a += 1;
  });
  m.live_score = h + ':' + a;
  m.status = status;
  m.minute = minute;
  m.matchIsFinished = false;
  m.matchResults = limit > 45 * 60 + 59 ? (m.matchResults || []).filter((r) => r.resultTypeID === 1) : [];
  if (limit < 46 * 60) m.ht_score = null;
  return m;
}

function markLiveTable(table, matches) {
  const running = matches.filter((m) => m.status === 'live' || m.status === 'ht');
  table.attributes.live = running.length > 0;
  table.attributes.table.forEach((row) => {
    const m = running.find((x) => x.team1.teamName === row.teamName || x.team2.teamName === row.teamName);
    if (!m) return;
    const [h, a] = m.live_score.split(':');
    row.live = true;
    row.live_score = m.team1.teamName === row.teamName ? h + ':' + a : a + ':' + h;
  });
}

const FOUR = [
  { name: 'Bundesliga', entity: 'sensor.matchday_bundesliga_spieltag', table_entity: 'sensor.matchday_bundesliga_tabelle' },
  { name: '2. Liga', entity: 'sensor.matchday_2_bundesliga_spieltag', table_entity: 'sensor.matchday_2_bundesliga_tabelle' },
  { name: 'Premier League', entity: 'sensor.matchday_premier_league_spieltag', table_entity: 'sensor.matchday_premier_league_tabelle' },
  { name: 'DFB-Pokal', entity: 'sensor.matchday_dfb_pokal_spieltag' },
];

function liveBundesliga(F) {
  const states = realStates(F);
  const st = states['sensor.matchday_bundesliga_spieltag'];
  const byId = (id) => st.attributes.matches.find((m) => m.matchID === id);
  rewind(byId(83186), "90'+3'", 'live'); // Frankfurt - Freiburg
  rewind(byId(83187), "88'", 'live'); // Gladbach - Mainz
  rewind(byId(83188), "45'+2'", 'ht'); // HSV - Köln
  rewind(byId(83189), "90'+5'", 'live'); // Bremen - Augsburg
  ['83184', '83185', '83190', '83191'].forEach((id) => {
    const m = byId(Number(id));
    Object.assign(m, { status: 'pre', minute: null, live_score: null, ht_score: null, scorers: [], cards: [], substitutions: [], stats: null, lineups: null, matchResults: [], matchIsFinished: false });
  });
  markLiveTable(states['sensor.matchday_bundesliga_tabelle'], st.attributes.matches);
  // The 2. Bundesliga is "live" too, for the chip dot.
  const bl2 = states['sensor.matchday_2_bundesliga_spieltag'];
  rewind(bl2.attributes.matches[2], "61'", 'live');
  return states;
}

export const SCENARIOS = {
  overview(F) {
    return { now: '2026-09-27T12:00:00Z', states: realStates(F), cards: [{ config: { competitions: FOUR } }] };
  },
  'overview-pl'(F) {
    return {
      now: '2026-09-27T12:00:00Z',
      states: realStates(F),
      cards: [{ config: { competitions: FOUR, default_competition: 'Premier League' } }],
    };
  },
  'overview-bl2'(F) {
    return {
      now: '2026-09-27T12:00:00Z',
      states: realStates(F),
      cards: [{ config: { competitions: FOUR, default_competition: '2. Liga' } }],
    };
  },
  live(F) {
    return { now: '2026-09-19T15:22:00Z', states: liveBundesliga(F), cards: [{ config: { competitions: FOUR } }] };
  },
  'live-compact'(F) {
    return { now: '2026-09-19T15:22:00Z', states: liveBundesliga(F), cards: [{ config: { competitions: FOUR, compact: true } }] };
  },
  replay(F) {
    const R = F['replay-nations-20260926'];
    const states = {};
    const cards = [];
    const labels = {
      pre: 'Before kick-off',
      live_first_half: 'Live, first half',
      halftime: 'Half-time',
      live_second_half: 'Live, second half',
      stoppage: 'Stoppage time',
      post: 'Full time',
    };
    Object.keys(labels).forEach((key) => {
      const id = 'sensor.replay_' + key;
      states[id] = { entity_id: id, state: R[key].state, attributes: clone(R[key].attributes) };
      cards.push({ caption: labels[key] + ' · ' + R[key].time.slice(11, 16) + ' UTC', config: { entity: id, name: 'Nations League' } });
    });
    return { now: R.pre.time, states, cards };
  },
  pokal(F) {
    return {
      now: '2026-09-27T12:00:00Z',
      states: realStates(F),
      cards: [{ config: { entity: 'sensor.matchday_dfb_pokal_spieltag', name: 'DFB-Pokal' } }],
    };
  },
  'pokal-shootout-live'(F) {
    const states = realStates(F);
    const st = states['sensor.matchday_dfb_pokal_spieltag'];
    st.attributes.matches = st.attributes.matches.filter((m) => m.matchDateTimeUTC.startsWith('2026-08-22T13:30'));
    const m = st.attributes.matches.find((x) => x.matchID === 81849); // Saarbrücken - Hertha, 2:4 on penalties
    const kicks = m.scorers.filter((s) => parseInt(s.minute, 10) > 120);
    m.scorers = m.scorers.filter((s) => parseInt(s.minute, 10) <= 120).concat(kicks.slice(0, 4));
    Object.assign(m, { status: 'live', minute: "120'+4'", pso: null, matchIsFinished: false });
    m.matchResults = m.matchResults.filter((r) => r.resultTypeID === 1);
    // Another match of the afternoon still in extra time.
    const other = st.attributes.matches.find((x) => x.matchID === 81850);
    Object.assign(other, { status: 'live', minute: "113'", pso: null, matchIsFinished: false });
    other.scorers = other.scorers.filter((s) => parseInt(s.minute, 10) <= 113);
    other.matchResults = other.matchResults.filter((r) => r.resultTypeID === 1);
    return {
      now: '2026-08-22T15:58:00Z',
      states,
      cards: [{ config: { competitions: FOUR, default_competition: 'DFB-Pokal' } }],
    };
  },
  team(F) {
    return {
      now: '2026-09-27T12:00:00Z',
      states: realStates(F),
      cards: [{ config: { team: 'SC Freiburg', limit: 4, competitions: FOUR } }],
    };
  },
  // --- matchday navigation (integration >= 0.4.0) --------------------------------------
  // Combine with the actions in snap.mjs (click ‹ / › / the title) or click through by hand.
  'nav-live'(F) {
    // Bundesliga live on matchday 4: browsing back must not mix up the live table.
    return { now: '2026-09-19T15:22:00Z', states: liveBundesliga(F), cards: [{ config: { competitions: FOUR } }] };
  },
  'nav-single'(F) {
    return {
      now: '2026-09-27T12:00:00Z',
      states: realStates(F),
      cards: [{ config: { entity: 'sensor.matchday_bundesliga_spieltag', table_entity: 'sensor.matchday_bundesliga_tabelle', name: 'Bundesliga' } }],
    };
  },
  'nav-error'(F) {
    // The first call for the 3rd matchday fails ("Erneut versuchen" then works).
    return { now: '2026-09-27T12:00:00Z', states: realStates(F), mock: { failOnce: ['bl1|3'] }, cards: [{ config: { competitions: FOUR } }] };
  },
  'nav-details-error'(F) {
    return {
      now: '2026-09-27T12:00:00Z',
      states: realStates(F),
      mock: { failOnce: ['details:83177'] },
      cards: [{ config: { competitions: FOUR } }],
    };
  },
  'nav-off'(F) {
    return { now: '2026-09-27T12:00:00Z', states: realStates(F), cards: [{ config: { competitions: FOUR, navigation: false } }] };
  },
  'nav-empty-list'(F) {
    // Integration 0.4.0 before the season list is known: `matchdays: []` -> no navigation.
    const states = realStates(F);
    Object.values(states).forEach((st) => {
      if (st.attributes.matchdays) st.attributes.matchdays = [];
    });
    return { now: '2026-09-27T12:00:00Z', states, cards: [{ config: { competitions: FOUR } }] };
  },
  'nav-pokal-past'(F) {
    // DFB-Pokal in October: the 2nd round is current, the 1st round is browsed. As the
    // integration sends it: summary fields empty, but `pso` from the scoreboard (floats in
    // Python, 2.0 -> 2 in JSON.parse); the details bring substitutions, stats and line-ups.
    const states = realStates(F);
    const st = states['sensor.matchday_dfb_pokal_spieltag'];
    const round1 = st.attributes.matches;
    const round2 = F.get_matchday['dfb|2'];
    Object.assign(st.attributes, { matchday: 2, matches: clone(round2.matches) });
    st.state = round2.name;
    const responses = {
      'dfb|1': {
        matches: round1.map((m) => Object.assign(clone(m), { substitutions: [], stats: null, lineups: null, ht_score: null })),
      },
    };
    const details = {};
    round1.forEach((m) => {
      details[m.matchID] = { match_id: m.matchID, substitutions: m.substitutions, stats: m.stats, lineups: m.lineups, ht_score: m.ht_score, pso: m.pso };
    });
    return {
      now: '2026-10-20T12:00:00Z',
      states,
      mock: { responses, details },
      cards: [{ config: { competitions: FOUR, default_competition: 'DFB-Pokal' } }],
    };
  },
  legacy(F) {
    // Integration 0.3.0: no `matchdays` attribute, no actions -> no navigation, no error.
    return { now: '2026-09-27T12:00:00Z', states: realStates(F, false), cards: [{ config: { competitions: FOUR } }] };
  },
  unavailable(F) {
    const states = realStates(F);
    states['sensor.matchday_bundesliga_spieltag'].state = 'unavailable';
    delete states['sensor.matchday_bundesliga_tabelle'];
    return { now: '2026-09-27T12:00:00Z', states, cards: [{ config: { competitions: FOUR } }] };
  },
};
