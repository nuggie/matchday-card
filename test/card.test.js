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

// --- matchday navigation (integration >= 0.4.0) ------------------------------------------

const matchdays = load('matchdays');
const recorded = load('get_matchday');
const recordedDetails = load('get_match_details');

test('matchdayList sorts, de-duplicates and rejects a missing attribute', () => {
  assert.equal(card.matchdayList({}), null, 'integration 0.3.0: no attribute, no navigation');
  assert.equal(card.matchdayList({ matchdays: [] }), null);
  assert.equal(card.matchdayList({ matchdays: 'x' }), null);
  const list = card.matchdayList({
    matchdays: [
      { matchday: 3, name: '3. Spieltag', first_kickoff: '2026-09-11T18:30:00Z', last_kickoff: '2026-09-13T15:30:00Z' },
      { matchday: 1, name: '1. Spieltag' },
      { matchday: 3, name: 'duplicate' },
      { matchday: 'x' },
      null,
      { matchday: 2 },
    ],
  });
  assert.deepEqual(list.map((x) => [x.matchday, x.name]), [[1, '1. Spieltag'], [2, '2'], [3, '3. Spieltag']]);
  assert.equal(list[0].first_kickoff, null);
  assert.equal(card.matchdayList({ matchdays: matchdays.bl1 }).length, 34);
  assert.deepEqual(card.matchdayList({ matchdays: matchdays.dfb }).map((x) => x.name), ['1. Runde', '2. Runde', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Endspiel']);
});

test('currentMatchdayOf only accepts a matchday of the list', () => {
  const list = card.matchdayList({ matchdays: matchdays.bl1 });
  assert.equal(card.currentMatchdayOf({ matchday: 4 }, list), 4);
  assert.equal(card.currentMatchdayOf({ matchday: 40 }, list), null);
  assert.equal(card.currentMatchdayOf({}, list), null);
});

test('navState: neighbours, edges and the current matchday', () => {
  const list = card.matchdayList({ matchdays: matchdays.bl1 });
  const cur = card.navState(list, 4, null);
  assert.equal(cur.matchday, 4);
  assert.equal(cur.isCurrent, true);
  assert.deepEqual([cur.prev.matchday, cur.next.matchday], [3, 5]);
  const first = card.navState(list, 4, 1);
  assert.equal(first.prev, null, 'no way back from the first matchday');
  assert.equal(first.next.matchday, 2);
  assert.equal(first.isCurrent, false);
  assert.equal(first.currentName, '4. Spieltag');
  const last = card.navState(list, 4, 34);
  assert.equal(last.next, null);
  assert.equal(last.prev.matchday, 33);
  assert.equal(card.navState(list, 4, 99).matchday, 4, 'unknown matchday falls back to the current one');
  assert.equal(card.navState(list, null, 3), null, 'no current matchday, no navigation');
  assert.equal(card.navState(null, 4, null), null);
  const cup = card.matchdayList({ matchdays: matchdays.dfb });
  assert.equal(card.navState(cup, 1, null).prev, null);
  assert.equal(card.navState(cup, 1, 6).name, 'Endspiel');
});

test('shownMatchday stores the current matchday as null', () => {
  assert.equal(card.shownMatchday(4, 4), null);
  assert.equal(card.shownMatchday(null, 4), null);
  assert.equal(card.shownMatchday(3, 4), 3);
});

test('pickerIndex: keyboard in the matchday list stays inside its bounds', () => {
  assert.equal(card.pickerIndex('ArrowDown', 3, 34), 4);
  assert.equal(card.pickerIndex('ArrowDown', 33, 34), 33);
  assert.equal(card.pickerIndex('ArrowUp', 0, 34), 0);
  assert.equal(card.pickerIndex('PageDown', 30, 34), 33);
  assert.equal(card.pickerIndex('PageUp', 3, 34), 0);
  assert.equal(card.pickerIndex('Home', 20, 34), 0);
  assert.equal(card.pickerIndex('End', 2, 34), 33);
  assert.equal(card.pickerIndex('Enter', 2, 34), null);
  assert.equal(card.pickerIndex('ArrowDown', 0, 0), null);
});

test('matchdayDates: compact date range of a round', () => {
  const c = ctx();
  assert.equal(card.matchdayDates({ first_kickoff: '2026-09-18T18:30:00Z', last_kickoff: '2026-09-20T17:30:00Z' }, c), '18.–20.09.');
  assert.equal(card.matchdayDates({ first_kickoff: '2026-09-30T18:30:00Z', last_kickoff: '2026-10-02T17:30:00Z' }, c), '30.09.–02.10.');
  assert.equal(card.matchdayDates({ first_kickoff: '2027-05-22T13:30:00Z', last_kickoff: '2027-05-22T13:30:00Z' }, c), '22.05.');
  assert.equal(card.matchdayDates({ first_kickoff: '2026-09-18T22:30:00Z', last_kickoff: null }, c), '19.09.', 'local day');
  assert.equal(card.matchdayDates({ first_kickoff: null, last_kickoff: null }, c), '', 'cup round not drawn yet');
  assert.equal(card.matchdayDates({ first_kickoff: 'nonsense' }, c), '');
  assert.equal(card.matchdayDates({ first_kickoff: '2026-09-18T18:30:00Z', last_kickoff: '2026-09-20T17:30:00Z' }, ctx({ locale: 'en-GB' })), '18/09–20/09');
});

test('cacheTtl: finished matchdays stay, open ones for 15 minutes, running ones for a minute', () => {
  assert.equal(card.cacheTtl(recorded['bl1|3'].matches), Infinity);
  assert.equal(card.cacheTtl(recorded['bl1|5'].matches), 15 * 60 * 1000);
  const live = JSON.parse(JSON.stringify(recorded['bl1|3'].matches));
  live[0].status = 'live';
  assert.equal(card.cacheTtl(live), 60 * 1000);
  const postponed = JSON.parse(JSON.stringify(recorded['bl1|3'].matches));
  postponed[4].status = 'pre';
  assert.equal(card.cacheTtl(postponed), 15 * 60 * 1000, 'a postponed match keeps the matchday open');
  assert.equal(card.cacheTtl([]), 15 * 60 * 1000, 'empty cup round');
  assert.equal(card.cacheTtl([{ matchIsFinished: true }]), Infinity, 'OpenLigaDB-only match without status');
});

test('needsFetch: fresh, expired, running and failed records', () => {
  const now = 1000000;
  assert.equal(card.needsFetch(undefined, now), true);
  assert.equal(card.needsFetch({ data: {}, expires: now + 1, pending: null, error: null }, now), false);
  assert.equal(card.needsFetch({ data: {}, expires: now, pending: null, error: null }, now), true, 'expired');
  assert.equal(card.needsFetch({ data: {}, expires: Infinity, pending: null, error: null }, now), false);
  assert.equal(card.needsFetch({ data: null, expires: 0, pending: Promise.resolve(), error: null }, now), false, 'already loading');
  assert.equal(card.needsFetch({ data: null, expires: 0, pending: null, error: 'x' }, now), false, 'error stays until retried');
});

test('remoteLoad shares a running request and keeps old data when a refresh fails', async () => {
  const store = new Map();
  let now = 0;
  let calls = 0;
  const ok = () => {
    calls += 1;
    return Promise.resolve({ n: calls });
  };
  const p1 = card.remoteLoad(store, 'k', ok, () => 1000, () => now);
  const p2 = card.remoteLoad(store, 'k', ok, () => 1000, () => now);
  assert.equal(p1, p2);
  await p1;
  assert.equal(calls, 1);
  const r = store.get('k');
  assert.deepEqual(r.data, { n: 1 });
  assert.equal(r.expires, 1000);
  assert.equal(r.pending, null);
  now = 5000;
  await card.remoteLoad(store, 'k', () => Promise.reject({ code: 'x', message: 'down' }), () => 1000, () => now);
  assert.deepEqual(r.data, { n: 1 }, 'old data stays');
  assert.equal(r.error, null);
  assert.equal(r.expires, 5000 + card.CACHE_TTL_RETRY);
  await card.remoteLoad(store, 'e', () => Promise.reject({ code: 'home_assistant_error', message: 'OpenLigaDB: timeout' }), () => 1000, () => now);
  assert.equal(store.get('e').error, 'OpenLigaDB: timeout');
  assert.equal(store.get('e').data, null);
  await card.remoteLoad(store, 't', () => {
    throw new Error('sync throw');
  }, () => 1000, () => now);
  assert.equal(store.get('t').error, 'sync throw');
});

test('errorText reads HA error objects', () => {
  assert.equal(card.errorText({ code: 'not_found', message: 'Action matchday.get_matchday not found.' }), 'Action matchday.get_matchday not found.');
  assert.equal(card.errorText({ code: 'timeout' }), 'timeout');
  assert.equal(card.errorText(new Error('x')), 'x');
  assert.equal(card.errorText(undefined), 'Unknown error');
});

test('cache keys per competition, season and matchday', () => {
  assert.equal(card.matchdayCacheKey('bl1', 2026, 3), 'bl1|2026|3');
  assert.notEqual(card.matchdayCacheKey('bl1', 2026, 3), card.matchdayCacheKey('bl2', 2026, 3));
  assert.notEqual(card.matchdayCacheKey('bl1', 2026, 3), card.matchdayCacheKey('bl1', 2027, 3));
  assert.equal(card.matchdayCacheKey(null, null, 3), '?|?|3');
  assert.equal(card.detailsCacheKey('bl1', 83177), 'bl1|83177');
});

test('mapMatchdayResponse: call_service answer of matchday.get_matchday', () => {
  const body = recorded['bl1|3'];
  const shuffled = Object.assign({}, body, { matches: body.matches.slice().reverse().concat([null, { foo: 1 }]) });
  const r = card.mapMatchdayResponse({ context: { id: 'x' }, response: shuffled }, 3);
  assert.equal(r.competition, 'bl1');
  assert.equal(r.season, 2026);
  assert.equal(r.matchday, 3);
  assert.equal(r.name, '3. Spieltag');
  assert.equal(r.isCurrent, false);
  assert.equal(r.matches.length, 9, 'broken entries dropped');
  const kickoffs = r.matches.map((m) => m.matchDateTimeUTC);
  assert.deepEqual(kickoffs, kickoffs.slice().sort(), 'sorted by kick-off');
  assert.equal(card.mapMatchdayResponse(body, 3).matches.length, 9, 'bare response object');
  assert.throws(() => card.mapMatchdayResponse({ response: body }, 4), /answered matchday 3 instead of 4/);
  assert.throws(() => card.mapMatchdayResponse({ response: null }, 3), /Unexpected answer/);
  assert.throws(() => card.mapMatchdayResponse({ response: { matchday: 3 } }, 3), /Unexpected answer/);
  const noNumber = card.mapMatchdayResponse({ response: { matches: [] } }, 5);
  assert.equal(noNumber.matchday, 5);
});

test('recorded matchdays have empty summary fields, the details fill them in', () => {
  const m = recorded['bl1|3'].matches.find((x) => x.matchID === 83177);
  assert.deepEqual([m.substitutions, m.stats, m.lineups, m.ht_score], [[], null, null, null]);
  assert.ok(m.scorers.length && m.cards.length, 'scorers and cards come with the matchday');
  const d = card.mapDetailsResponse({ context: {}, response: recordedDetails['83177'] });
  const full = card.withDetails(m, d);
  assert.ok(full.substitutions.length > 0);
  assert.ok(full.stats && full.lineups);
  assert.equal(full.ht_score, '2:0');
  assert.equal(m.stats, null, 'the cached match is not changed');
  const html = card.zoneContentHtml(full, ctx({ code: 'bl1' }));
  assert.match(html, /Aufstellung/);
  assert.match(html, /Ballbesitz/);
  assert.match(html, / für /);
  const lead = card.zoneContentHtml(m, ctx({ code: 'bl1' }), '<div class="retry-box">x</div>');
  assert.match(lead, /^<div class="zone-pad"><div class="retry-box">x<\/div>/);
});

test('mapDetailsResponse tolerates missing parts', () => {
  const d = card.mapDetailsResponse({ response: { match_id: 1, stats: [], lineups: null } });
  assert.deepEqual(d, { match_id: 1, substitutions: [], stats: null, lineups: null, ht_score: null, pso: null });
  assert.throws(() => card.mapDetailsResponse({ response: null }), /Unexpected answer/);
  assert.throws(() => card.mapDetailsResponse([]), /Unexpected answer/);
  const m = { matchID: 1, substitutions: [{ in: 'a' }], ht_score: '1:0', pso: null };
  assert.equal(card.withDetails(m, null), m);
  assert.deepEqual(card.withDetails(m, d).substitutions, [{ in: 'a' }], 'empty details keep what the match had');
  assert.equal(card.withDetails(m, d).ht_score, '1:0');
});

test('pickerHtml marks the shown and the current matchday', () => {
  const list = card.matchdayList({ matchdays: matchdays.bl1 });
  const html = card.pickerHtml(list, card.navState(list, 4, 2), ctx());
  assert.equal((html.match(/role="option"/g) || []).length, 34);
  assert.match(html, /data-md="2" aria-selected="true"/);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(html, /is-current" role="option" tabindex="-1" data-md="4"/);
  assert.match(html, />aktuell</);
  assert.match(html, />28\.–30\.08\.</);
  const evil = card.pickerHtml([{ matchday: 1, name: '<b>x</b>', first_kickoff: null }], { matchday: 1, current: 1 }, ctx());
  assert.doesNotMatch(evil, /<b>/);
});

test('normalizeConfig: navigation defaults to on', () => {
  assert.equal(card.normalizeConfig({ entity: 'sensor.a' }).navigation, true);
  assert.equal(card.normalizeConfig({ entity: 'sensor.a', navigation: false }).navigation, false);
  assert.throws(() => card.normalizeConfig({ entity: 'sensor.a', navigation: 'no' }), /"navigation" must be true or false/);
  Object.keys(card.STRINGS.en).forEach((k) => assert.ok(k in card.STRINGS.de, k));
});

// --- integration 0.4.0 as delivered (ha-matchday 0af50b6) ----------------------------------

test('a cup round without fixtures: null kick-offs, bare answer, still selectable', () => {
  const list = card.matchdayList({ matchdays: matchdays.dfb });
  const r16 = list.find((x) => x.name === 'Achtelfinale');
  assert.equal(r16.first_kickoff, null);
  const nav = card.navState(list, 2, r16.matchday);
  assert.equal(nav.name, 'Achtelfinale');
  assert.match(card.pickerHtml(list, nav, ctx()), /data-md="3" aria-selected="true"><span class="pk-name">Achtelfinale<\/span><span class="pk-date"><\/span>/);
  const answer = card.mapMatchdayResponse({ response: { name: 'Achtelfinale', matches: [], is_current: false } }, 3);
  assert.deepEqual([answer.matchday, answer.name, answer.matches, answer.isCurrent], [3, 'Achtelfinale', [], false]);
  assert.equal(card.cacheTtl(answer.matches), card.CACHE_TTL_OPEN, 'asked again after 15 minutes (draw)');
  assert.equal(card.STRINGS.de.noFixtures, 'Noch keine Ansetzungen.');
});

test('matchdays: [] while the season list is unknown means no navigation', () => {
  assert.equal(card.matchdayList({ matchdays: [], matchday: 4 }), null);
});

test('pso of past cup rounds: shown as integers, also when it only comes with the details', () => {
  const m = JSON.parse(JSON.stringify(byId(pokal, 81849)));
  Object.assign(m, { substitutions: [], stats: null, lineups: null, ht_score: null });
  // Python floats: 2.0 arrives as 2 from JSON.parse; strings like "4.0" are rounded too.
  m.pso = JSON.parse('{"team1": 2.0, "team2": 4.0, "winner": "team2"}');
  assert.match(card.centerHtml(m, ctx()), /n\.E\. 2:4/);
  m.pso = { team1: '4.0', team2: 3.0, winner: 'team1' };
  m.scorers = m.scorers.filter((s) => !card.isShootoutKick(s));
  assert.match(card.centerHtml(m, ctx()), /n\.E\. 4:3/);
  assert.doesNotMatch(card.centerHtml(m, ctx()), /4\.0/);
  const withoutPso = Object.assign({}, m, { pso: null });
  const d = card.mapDetailsResponse({ response: { match_id: 81849, substitutions: [], stats: null, lineups: null, ht_score: '0:1', pso: { team1: 2.0, team2: 4.0, winner: 'team2' } } });
  assert.match(card.centerHtml(card.withDetails(withoutPso, d), ctx()), /n\.E\. 2:4/);
});

test('details of a match that has not started: empty fields, no error', () => {
  const d = card.mapDetailsResponse({ response: { match_id: 1, substitutions: [], stats: null, lineups: null, ht_score: null, pso: null } });
  const m = recorded['bl1|5'].matches[0];
  assert.equal(card.withDetails(m, d).status, 'pre');
  assert.match(card.zoneContentHtml(card.withDetails(m, d), ctx({ code: 'bl1' })), /Noch keine Ereignisse/);
});

// --- two-legged ties (integration >= 0.6.0) ------------------------------------

const ko = load('sensor.matchday_uefa_champions_league_spieltag').attributes.matches;
const sporting = byId(ko, 401862584); // Sporting - Bodø 5:0 a.e.t., first leg 0:3

test('tieOf takes only well-formed aggregates', () => {
  assert.deepEqual(card.tieOf(sporting), { firstLeg: '0:3', score: '5:3', advances: 'team1' });
  assert.equal(card.tieOf({ aggregate: null }), null);
  assert.equal(card.tieOf({ aggregate: [] }), null);
  assert.equal(card.tieOf({ aggregate: { first_leg: '0-3', score: 5, advances: 'home' } }), null);
  assert.deepEqual(card.tieOf({ aggregate: { first_leg: null, score: '2:1', advances: null } }), { firstLeg: null, score: '2:1', advances: null });
});

test('tieLine: first leg before kick-off, aggregate from kick-off on', () => {
  assert.equal(card.tieLine(sporting, t), 'Gesamt 5:3');
  const pre = Object.assign({}, sporting, { status: 'pre', live_score: null, aggregate: { first_leg: '0:3', score: '0:3', advances: null } });
  assert.equal(card.tieLine(pre, t), 'Hinspiel 0:3');
  const live = Object.assign({}, sporting, { status: 'live', aggregate: { first_leg: '0:3', score: '2:3', advances: null } });
  assert.equal(card.tieLine(live, card.translator('en')), 'Agg. 2:3');
  assert.equal(card.tieLine(byId(bl, 83183), t), '');
});

test('centerHtml adds the tie line under the score and the kick-off', () => {
  assert.match(card.centerHtml(sporting, ctx()), /c-agg">Gesamt 5:3</);
  assert.match(card.centerHtml(sporting, ctx()), /n\.V\./);
  const pre = Object.assign({}, sporting, { status: 'pre', live_score: null, aggregate: { first_leg: '0:3', score: '0:3', advances: null } });
  assert.match(card.centerHtml(pre, ctx()), /c-agg">Hinspiel 0:3</);
  assert.doesNotMatch(card.centerHtml(byId(bl, 83183), ctx()), /c-agg/);
});

test('the side that went through gets the tick, the other one not', () => {
  assert.match(card.advanceIcon(sporting, 'team1'), /adv-chip/);
  assert.equal(card.advanceIcon(sporting, 'team2'), '');
  const open = Object.assign({}, sporting, { aggregate: { first_leg: '0:3', score: '1:3', advances: null } });
  assert.equal(card.advanceIcon(open, 'team1'), '');
});

test('the details of a second leg start with first leg, aggregate and who went through', () => {
  const html = card.zoneContentHtml(sporting, ctx({ code: 'ucl' }));
  assert.match(html, /class="tie"><span>Hinspiel <b>0:3<\/b><\/span><span>Gesamt <b>5:3<\/b><\/span><span>Sporting CP weiter<\/span><\/div>/);
  const pre = Object.assign({}, sporting, { status: 'pre', aggregate: { first_leg: '0:3', score: '0:3', advances: null } });
  assert.doesNotMatch(card.tieHtml(pre, t), /Gesamt/);
  assert.equal(card.tieHtml(byId(bl, 83183), t), '');
});

test('the table belongs to the league phase', () => {
  assert.equal(card.tableInPhase(undefined), true, 'OpenLigaDB leagues, older integration');
  assert.equal(card.tableInPhase(null), true);
  assert.equal(card.tableInPhase('league-phase'), true);
  assert.equal(card.tableInPhase('round-of-16'), false);
  assert.equal(card.tableInPhase('first-round'), false, 'qualifying');
});
