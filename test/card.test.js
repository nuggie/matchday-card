// Unit tests for the pure functions of the card: node --test
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const card = require('../dist/matchday-card.js');

const FIXTURES = path.join(__dirname, '..', 'dev', 'fixtures');
const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name + '.json'), 'utf8'));
const pokal = load('sensor.matchday_dfb_pokal_spieltag').attributes.matches;
const bl = load('sensor.matchday_bundesliga_spieltag').attributes.matches;
const blTable = load('sensor.matchday_bundesliga_tabelle').attributes.table;
const replay = load('replay-nations-20260926');
const byId = (list, id) => list.find((m) => m.matchID === id);

const t = card.translator('de');
const ctx = (extra) =>
  Object.assign({ t, locale: 'de-DE', tz: 'Europe/Berlin', now: Date.parse('2026-09-27T12:00:00Z'), namePref: 'short', badge: '', showLink: true }, extra);

// --- minutes and ordering ------------------------------------------------------

test('parseMinute resolves stoppage time behind the regular minute', () => {
  assert.equal(card.parseMinute("90'"), 5400);
  assert.equal(card.parseMinute("90'+5'"), 5405);
  assert.ok(card.parseMinute("45'+2'") < card.parseMinute("46'"));
  assert.equal(card.parseMinute(null), 0);
  assert.equal(card.minuteBase("120'+3'"), 120);
});

test('compareEvents orders stoppage time chronologically although ESPN caps sortKey', () => {
  const events = [
    { minute: "90'+5'", sortKey: 5400 },
    { minute: "90'+3'", sortKey: 5400 },
    { minute: "55'", sortKey: 3276 },
    { minute: "55'", sortKey: 3268 },
    { minute: "90'+1'", sortKey: 5400 },
  ];
  const sorted = events.slice().sort(card.compareEvents).map((e) => e.minute + '/' + e.sortKey);
  assert.deepEqual(sorted, ["55'/3268", "55'/3276", "90'+1'/5400", "90'+3'/5400", "90'+5'/5400"]);
});

test('sortMatches sorts by kick-off and keeps the order of simultaneous matches', () => {
  const ms = [
    { matchID: 3, matchDateTimeUTC: '2026-09-19T13:30:00Z' },
    { matchID: 1, matchDateTimeUTC: '2026-09-18T18:30:00Z' },
    { matchID: 4, matchDateTimeUTC: '2026-09-19T13:30:00Z' },
    { matchID: 2, matchDateTimeUTC: '2026-09-19T13:30:00Z' },
  ];
  assert.deepEqual(card.sortMatches(ms).map((m) => m.matchID), [1, 3, 4, 2]);
});

test('groupByDay groups by the local day (Europe/Berlin)', () => {
  const ms = card.sortMatches([
    { matchID: 1, matchDateTimeUTC: '2026-09-18T22:30:00Z' }, // 00:30 local on the 19th
    { matchID: 2, matchDateTimeUTC: '2026-09-18T18:30:00Z' },
    { matchID: 3, matchDateTimeUTC: '2026-09-19T13:30:00Z' },
  ]);
  const groups = card.groupByDay(ms, 'Europe/Berlin');
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((m) => m.matchID)]),
    [
      ['2026-09-18', [2]],
      ['2026-09-19', [1, 3]],
    ],
  );
  assert.equal(groups.length, 2);
  const real = card.groupByDay(card.sortMatches(bl), 'Europe/Berlin');
  assert.deepEqual(real.map((g) => g.items.length), [1, 5, 3]);
});

test('dayHeaderText marks today', () => {
  const c = ctx();
  assert.equal(card.dayHeaderText('2026-09-19T13:30:00Z', '2026-09-19', '2026-09-19', c), 'HEUTE · SA 19.09.');
  assert.equal(card.dayHeaderText('2026-09-18T18:30:00Z', '2026-09-18', '2026-09-19', c), 'FR 18.09.');
});

test('countdownText only within two hours before kick-off', () => {
  const ko = '2026-09-19T16:30:00Z';
  const at = (iso) => card.countdownText(ko, Date.parse(iso));
  assert.equal(at('2026-09-19T15:22:00Z'), 'in 1 h 8 min');
  assert.equal(at('2026-09-19T15:30:00Z'), 'in 1 h');
  assert.equal(at('2026-09-19T16:20:00Z'), 'in 10 min');
  assert.equal(at('2026-09-19T16:29:50Z'), 'in 1 min');
  assert.equal(at('2026-09-19T14:00:00Z'), null);
  assert.equal(at('2026-09-19T16:31:00Z'), null);
});

// --- names -------------------------------------------------------------------------

test('teamDisplayName falls back to the full name when the short name is unusable', () => {
  assert.equal(card.teamDisplayName({ teamName: 'FC Bayern München', shortName: 'Bayern' }, 'short'), 'Bayern');
  assert.equal(card.teamDisplayName({ teamName: 'SC St. Tönis', shortName: 'scst' }, 'short'), 'SC St. Tönis');
  assert.equal(card.teamDisplayName({ teamName: 'Eintracht Trier', shortName: '' }, 'short'), 'Eintracht Trier');
  assert.equal(card.teamDisplayName({ teamName: 'Manchester United FC', shortName: 'ManU' }, 'full'), 'Manchester United FC');
  assert.equal(card.teamDisplayName({}, 'short'), '?');
});

test('namePreference: full names for Premier League and UEFA, unless configured', () => {
  assert.equal(card.namePreference('auto', 'bl1'), 'short');
  assert.equal(card.namePreference('auto', 'pl'), 'full');
  assert.equal(card.namePreference('auto', 'ucl'), 'full');
  assert.equal(card.namePreference('short', 'pl'), 'short');
  assert.equal(card.namePreference('auto', undefined), 'short');
});

// --- penalty shoot-out / extra time --------------------------------------------------

test('shoot-out kicks are separated from the regular goals (Saarbrücken - Hertha, 2:4 pens)', () => {
  const m = byId(pokal, 81849);
  const { regular, shootout } = card.splitScorers(m.scorers);
  assert.equal(regular.length, 2);
  assert.equal(shootout.length, 6);
  assert.ok(shootout.every((k) => k.type === 'penalty'));
  const result = card.shootoutResult(m);
  assert.deepEqual([result.team1, result.team2, result.winner], [2, 4, 'team2']);
  assert.deepEqual(card.shootoutTally(shootout, result), ['0:1', '1:1', '1:2', '1:3', '2:3', '2:4']);
});

test('all four shoot-outs of the first round add up to the pso field', () => {
  const withPso = pokal.filter((m) => m.pso);
  assert.equal(withPso.length, 4);
  withPso.forEach((m) => {
    const kicks = card.splitScorers(m.scorers).shootout;
    const result = card.shootoutResult(m);
    assert.notEqual(card.shootoutTally(kicks, result), null, m.matchID);
    // The regular goals match the score after extra time, so the ticker keeps its running score.
    assert.notEqual(card.runningScores(card.splitScorers(m.scorers).regular, m.live_score), null, m.matchID);
  });
});

test('a penalty in extra time (120\'+x) is not a shoot-out kick', () => {
  assert.equal(card.isShootoutKick({ minute: "120'+2'", type: 'penalty' }), false);
  assert.equal(card.isShootoutKick({ minute: "121'", type: 'penalty' }), true);
});

test('shootoutTally rejects a tally that does not match the official result', () => {
  const kicks = [{ team: 'team1' }, { team: 'team2' }];
  assert.equal(card.shootoutTally(kicks, { team1: 4, team2: 3 }), null);
  assert.deepEqual(card.shootoutTally(kicks, null), ['1:0', '1:1']);
});

test('shootoutResult counts the kicks while the pso field is still missing', () => {
  const m = { status: 'live', pso: null, scorers: [{ minute: "121'", team: 'team1' }, { minute: "122'", team: 'team2' }, { minute: "123'", team: 'team2' }] };
  assert.deepEqual(card.shootoutResult(m), { team1: 1, team2: 2, winner: null, counted: true });
  assert.equal(card.shootoutResult({ scorers: [] }), null);
});

test('centerHtml shows "n.E." after a shoot-out and "n.V." after extra time', () => {
  const pens = card.centerHtml(byId(pokal, 81849), ctx());
  assert.match(pens, /1:1/);
  assert.match(pens, /n\.E\. 2:4/);
  const aet = card.centerHtml(byId(pokal, 81859), ctx()); // Mannheim - Kaiserslautern 0:1 a.e.t.
  assert.match(aet, /0:1/);
  assert.match(aet, /n\.V\./);
  const normal = card.centerHtml(byId(bl, 83183), ctx());
  assert.doesNotMatch(normal, /n\.V\.|n\.E\./);
  assert.match(normal, /7:0/);
});

test('centerHtml during a running shoot-out shows the counted kicks', () => {
  const m = JSON.parse(JSON.stringify(byId(pokal, 81849)));
  const kicks = m.scorers.filter((s) => card.isShootoutKick(s));
  m.scorers = m.scorers.filter((s) => !card.isShootoutKick(s)).concat(kicks.slice(0, 4));
  Object.assign(m, { status: 'live', minute: "120'+4'", pso: null });
  assert.match(card.centerHtml(m, ctx()), /i\.E\. 1:3/);
});

test('the ticker lists shoot-out kicks in their own block, not as goals', () => {
  const html = card.zoneContentHtml(byId(pokal, 81849), ctx());
  const [ticker, shootout] = html.split('Elfmeterschießen');
  assert.ok(shootout, 'shoot-out block present');
  assert.doesNotMatch(ticker, /Josip Brekalo/);
  assert.match(shootout, /Josip Brekalo/);
  assert.match(shootout, /<b>2:4<\/b>/);
  assert.match(ticker, /Philip Fahrner/);
  const events = card.buildTickerEvents(byId(pokal, 81849), t).filter((e) => e.cls === 'tick-goal');
  assert.deepEqual(events.map((e) => e.score), ['0:1', '1:1']);
});

// --- scores -----------------------------------------------------------------------

test('runningScores counts own goals for the other team and checks the final score', () => {
  const goals = [
    { minute: "10'", team: 'team1', type: 'regular' },
    { minute: "20'", team: 'team1', type: 'owngoal' },
    { minute: "30'", team: 'team2', type: 'penalty' },
  ];
  const r = card.runningScores(goals, '1:2');
  assert.deepEqual(goals.map((g) => r.get(g)), ['1:0', '1:1', '1:2']);
  assert.equal(card.runningScores(goals, '3:0'), null);
});

test('finalScoreOf prefers the live score, else the result after extra time', () => {
  assert.equal(card.finalScoreOf({ live_score: '2:1', matchResults: [] }), '2:1');
  const oldbOnly = {
    matchResults: [
      { resultTypeID: 1, pointsTeam1: 0, pointsTeam2: 0 },
      { resultTypeID: 2, pointsTeam1: 1, pointsTeam2: 1 },
      { resultTypeID: 4, pointsTeam1: 1, pointsTeam2: 2 },
      { resultTypeID: 5, pointsTeam1: 4, pointsTeam2: 5 },
    ],
  };
  assert.equal(card.finalScoreOf(oldbOnly), '1:2');
  assert.equal(card.finalScoreOf({}), '–');
});

test('half-time score only from the second half on (ESPN fills it during the first half)', () => {
  const firstHalf = replay.live_first_half.attributes.matches.find((m) => m.status === 'live' && m.ht_score);
  assert.ok(firstHalf, 'replay has a first-half match with ht_score');
  assert.doesNotMatch(card.centerHtml(firstHalf, ctx()), /c-sub/);
  const second = replay.live_second_half.attributes.matches.find((m) => m.status === 'live' && m.ht_score);
  assert.match(card.centerHtml(second, ctx()), /c-sub/);
});

test('replay states: pre shows kick-off time, half-time shows HZ, live shows the minute', () => {
  const c = ctx({ now: Date.parse(replay.pre.time) });
  const pre = replay.pre.attributes.matches.find((m) => m.status === 'pre');
  assert.match(card.centerHtml(pre, c), /20:45/);
  assert.match(card.centerHtml(pre, c), /in 22 min/);
  const ht = replay.halftime.attributes.matches.find((m) => m.status === 'ht');
  assert.match(card.centerHtml(ht, c), />HZ</);
  const stoppage = replay.stoppage.attributes.matches.find((m) => m.status === 'live');
  assert.match(card.centerHtml(stoppage, c), /90'\+\d'/);
  assert.ok(card.hasLiveMatch(replay.stoppage.attributes.matches));
  assert.ok(!card.hasLiveMatch(replay.post.attributes.matches));
});

// --- table zones --------------------------------------------------------------------

test('default zones of the Bundesliga', () => {
  const zones = card.defaultZones('bl1');
  const at = (rank) => (card.resolveZone(zones, rank, 18) || {}).labelKey || null;
  assert.deepEqual([1, 4, 5, 6, 7, 15, 16, 17, 18].map(at), ['cl', 'cl', 'el', 'ecl', null, null, 'releg', 'down', 'down']);
  assert.deepEqual(
    card.legendItems(zones, 18, t).map((x) => x.label),
    ['CL', 'EL', 'Conference-Quali', 'Relegation', 'Abstieg'],
  );
});

test('default zones of 2. Bundesliga, Premier League and the UEFA league phase', () => {
  const label = (code, rank, total) => (card.resolveZone(card.defaultZones(code), rank, total) || {}).labelKey || null;
  assert.deepEqual([1, 2, 3, 4, 16, 17].map((r) => label('bl2', r, 18)), ['up', 'up', 'upReleg', null, 'releg', 'down']);
  assert.deepEqual([4, 5, 6, 17, 18, 20].map((r) => label('pl', r, 20)), ['cl', 'el', null, null, 'down', 'down']);
  assert.deepEqual([8, 9, 24, 25].map((r) => label('ucl', r, 36)), ['r16', 'playoff', 'playoff', 'out']);
  assert.deepEqual(card.defaultZones('dfb'), []);
});

test('zones may count from the bottom and override the defaults', () => {
  const zones = card.normalizeConfig({ entity: 'sensor.x', zones: [{ from: 1, color: 'gold', label: 'Meister' }, { from: -2, to: -1, color: 'red', label: 'Abstieg' }] }).competitions[0].zones;
  assert.equal(card.resolveZone(zones, 1, 18).label, 'Meister');
  assert.equal(card.resolveZone(zones, 17, 18).label, 'Abstieg');
  assert.equal(card.resolveZone(zones, 16, 18), null);
  assert.equal(card.resolveZone(zones, 20, 20).label, 'Abstieg');
  assert.deepEqual(card.legendItems(zones, 18, t).map((x) => x.label), ['Meister', 'Abstieg']);
});

test('tableHtml renders zones, live score and all columns', () => {
  const rows = JSON.parse(JSON.stringify(blTable));
  rows[2].live = true;
  rows[2].live_score = '2:1';
  const html = card.tableHtml(rows, ctx({ zones: card.defaultZones('bl1') }));
  assert.equal((html.match(/class="tr[ "]/g) || []).length, 19); // header + 18
  assert.equal((html.match(/--zone:#1e88e5/g) || []).length, 4);
  assert.match(html, /t-live"><span class="live-dot"><\/span>2:1/);
  assert.match(html, />\+7</);
  assert.match(html, />Pkt</);
});

test('formatDiff', () => {
  assert.equal(card.formatDiff(7), '+7');
  assert.equal(card.formatDiff(0), '0');
  assert.equal(card.formatDiff(-10), '-10');
  assert.equal(card.formatDiff(undefined), '');
});

// --- team mode -------------------------------------------------------------------------

test('team mode collects matches over competitions and picks the closest ones', () => {
  const sources = [
    { code: 'bl1', badge: 'BL', matches: bl },
    { code: 'dfb', badge: 'Pokal', matches: pokal },
  ];
  const all = card.collectTeamMatches(sources, 'SC Freiburg');
  assert.deepEqual(all.map((m) => m._src.badge), ['Pokal', 'BL']);
  assert.ok(all.every((m) => !('matches' in m._src)));
  const now = Date.parse('2026-09-27T12:00:00Z');
  assert.equal(card.selectTeamWindow(all, 1, now)[0].matchID, 83186);
  const live = all.map((m, i) => (i === 0 ? Object.assign({}, m, { status: 'live' }) : m));
  assert.deepEqual(card.selectTeamWindow(live, 1, now).map((m) => m.status), ['live']);
  assert.equal(card.collectTeamMatches(sources, 'Freiburg').length, 2, 'short name matches too');
});

// --- configuration ------------------------------------------------------------------------

test('normalizeConfig: single entity with defaults', () => {
  const c = card.normalizeConfig({ entity: 'sensor.matchday_bundesliga_spieltag', table_entity: 'sensor.matchday_bundesliga_tabelle' });
  assert.equal(c.competitions.length, 1);
  assert.equal(c.competitions[0].table_entity, 'sensor.matchday_bundesliga_tabelle');
  assert.equal(c.competitions[0].zones, null);
  assert.equal(c.layout, 'auto');
  assert.equal(c.names, 'auto');
  assert.equal(c.show_table, true);
  assert.equal(c.compact, false);
  assert.equal(c.limit, 5);
});

test('normalizeConfig: competitions list', () => {
  const c = card.normalizeConfig({
    competitions: [{ name: 'Bundesliga', entity: 'sensor.a', table_entity: 'sensor.b', zones: false }, 'sensor.c'],
    compact: true,
    layout: 'stacked',
  });
  assert.deepEqual(c.competitions.map((x) => x.entity), ['sensor.a', 'sensor.c']);
  assert.deepEqual(c.competitions[0].zones, []);
  assert.equal(c.compact, true);
  assert.equal(card.competitionIndex(c.competitions, 'bundesliga'), 0);
  assert.equal(card.competitionIndex(c.competitions, 'sensor.c'), 1);
  assert.equal(card.competitionIndex(c.competitions, 5), -1);
});

test('normalizeConfig: clear errors', () => {
  const err = (cfg, re) => assert.throws(() => card.normalizeConfig(cfg), re);
  err({}, /Define "entity"/);
  err({ entity: 'sensor.a', competitions: [] }, /either "entity" or "competitions"/);
  err({ competitions: [] }, /non-empty list/);
  err({ competitions: [{ name: 'x' }] }, /competitions\[0\]: "entity"/);
  err({ entity: 'light.kitchen' }, /"entity" must be a Matchday matchday sensor/);
  err({ entity: 'sensor.a', table_entity: 'nope' }, /"table_entity"/);
  err({ entity: 'sensor.a', layout: 'grid' }, /"layout" must be one of/);
  err({ entity: 'sensor.a', compact: 'yes' }, /"compact" must be true or false/);
  err({ entity: 'sensor.a', zones: [{ from: 0, color: 'red' }] }, /zones\[0\]: "from"/);
  err({ entity: 'sensor.a', zones: [{ from: 1 }] }, /zones\[0\]: "color"/);
  err({ competitions: ['sensor.a'], zones: [] }, /per competition/);
  err({ entity: 'sensor.a', limit: 0 }, /"limit"/);
});

test('stubConfig picks a Matchday sensor and the table of the same competition', () => {
  const states = {
    'sensor.other': { attributes: {} },
    'sensor.matchday_premier_league_tabelle': { attributes: { table: [], competition: 'pl' } },
    'sensor.matchday_bundesliga_tabelle': { attributes: { table: [], competition: 'bl1' } },
    'sensor.matchday_bundesliga_spieltag': { attributes: { matches: [], competition: 'bl1' } },
  };
  assert.deepEqual(card.stubConfig(states), {
    entity: 'sensor.matchday_bundesliga_spieltag',
    table_entity: 'sensor.matchday_bundesliga_tabelle',
  });
  assert.deepEqual(card.stubConfig({}), { entity: 'sensor.matchday_bundesliga_spieltag' });
});

test('languageOf and translations', () => {
  assert.equal(card.languageOf(null, { locale: { language: 'de' } }), 'de');
  assert.equal(card.languageOf(null, { language: 'fr' }), 'en');
  assert.equal(card.languageOf('de', { language: 'en' }), 'de');
  assert.equal(card.translator('en')('noTeamMatches', { team: 'X' }), 'No matches of X found.');
  Object.keys(card.STRINGS.de).forEach((k) => assert.ok(k in card.STRINGS.en, k));
});

test('escHtml escapes markup from sensor data', () => {
  assert.equal(card.escHtml('<b a="1">&</b>'), '&lt;b a=&quot;1&quot;&gt;&amp;&lt;/b&gt;');
  const m = JSON.parse(JSON.stringify(byId(bl, 83183)));
  m.team1.shortName = '<img src=x onerror=alert(1)>';
  assert.doesNotMatch(card.zoneContentHtml(m, ctx()) + card.centerHtml(m, ctx()), /<img src=x/);
});
