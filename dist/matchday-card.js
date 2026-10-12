/* Matchday Card
 * Lovelace card for the Matchday integration (https://github.com/nuggie/ha-matchday):
 * matchday with live scores, ticker, stats and line-ups, the live table with coloured
 * zones, competition chips and a team mode. Vanilla custom element, no build step.
 *
 * Matchday navigation (integration >= 0.4.0): the sensor's `matchdays` attribute lists
 * all rounds; other matchdays than the current one come from the actions
 * matchday.get_matchday / matchday.get_match_details and are cached in memory.
 *
 * Two-legged ties (integration >= 0.6.0, UEFA): a second leg shows the first leg's score
 * before kick-off and the aggregate afterwards, the side that went through gets a tick.
 * The table is shown in the league phase only (sensor attribute `phase`).
 *
 * Rendering: the card only touches the DOM when one of its own entities changed.
 * Same match list as before -> only the changed matches are patched (no image reloads,
 * the open ticker stays open); otherwise the match list is rebuilt.
 */
(function () {
  'use strict';

  const VERSION = '0.3.0';
  const CARD_TAG = 'matchday-card';
  const EDITOR_TAG = 'matchday-card-editor';
  const STORAGE_PREFIX = 'matchday-card:';

  // ---------------------------------------------------------------------------
  // Static data
  // ---------------------------------------------------------------------------

  // Competition codes as reported by the sensors' `competition` attribute.
  // fullNames: the short names are unusable (ESPN abbreviations or community codes
  // like "ManU"), so show the full team names.
  const COMPETITIONS = {
    bl1: { name: 'Bundesliga', badge: 'BL', espn: 'ger.1', fullNames: false },
    bl2: { name: '2. Bundesliga', badge: 'BL2', espn: 'ger.2', fullNames: false },
    dfb: { name: 'DFB-Pokal', badge: 'Pokal', espn: 'ger.dfb_pokal', fullNames: false },
    pl: { name: 'Premier League', badge: 'PL', espn: 'eng.1', fullNames: true },
    ucl: { name: 'Champions League', badge: 'CL', espn: 'uefa.champions', fullNames: true },
    uel: { name: 'Europa League', badge: 'EL', espn: 'uefa.europa', fullNames: true },
    uecl: { name: 'Conference League', badge: 'UECL', espn: 'uefa.europa.conf', fullNames: true },
  };

  const UEFA_LEAGUE_PHASE_ZONES = [
    { from: 1, to: 8, color: '#1e88e5', labelKey: 'r16' },
    { from: 9, to: 24, color: '#f9a825', labelKey: 'playoff' },
    { from: 25, to: 36, color: '#c62828', labelKey: 'out' },
  ];

  // Table zones per competition (taken from the former flex-table-card setup).
  const DEFAULT_ZONES = {
    bl1: [
      { from: 1, to: 4, color: '#1e88e5', labelKey: 'cl' },
      { from: 5, to: 5, color: '#f9a825', labelKey: 'el' },
      { from: 6, to: 6, color: '#2e7d32', labelKey: 'ecl' },
      { from: 16, to: 16, color: '#e57373', labelKey: 'releg' },
      { from: 17, to: 18, color: '#c62828', labelKey: 'down' },
    ],
    bl2: [
      { from: 1, to: 2, color: '#1e88e5', labelKey: 'up' },
      { from: 3, to: 3, color: '#64b5f6', labelKey: 'upReleg' },
      { from: 16, to: 16, color: '#e57373', labelKey: 'releg' },
      { from: 17, to: 18, color: '#c62828', labelKey: 'down' },
    ],
    pl: [
      { from: 1, to: 4, color: '#1e88e5', labelKey: 'cl' },
      { from: 5, to: 5, color: '#f9a825', labelKey: 'el' },
      { from: 18, to: 20, color: '#c62828', labelKey: 'down' },
    ],
    ucl: UEFA_LEAGUE_PHASE_ZONES,
    uel: UEFA_LEAGUE_PHASE_ZONES,
    uecl: UEFA_LEAGUE_PHASE_ZONES,
  };

  const STRINGS = {
    de: {
      today: 'Heute',
      table: 'Tabelle',
      live: 'Live',
      ht: 'HZ',
      aet: 'n.V.',
      pens: 'n.E.',
      pensLive: 'i.E.',
      shootout: 'Elfmeterschießen',
      noEvents: 'Noch keine Ereignisse.',
      noEventData: 'Keine Ereignisdaten verfügbar.',
      unavailable: 'Daten momentan nicht verfügbar.',
      tableUnavailable: 'Tabelle momentan nicht verfügbar.',
      noMatches: 'Keine Spiele.',
      noFixtures: 'Noch keine Ansetzungen.',
      noTeamMatches: 'Keine Spiele von {team} gefunden.',
      possession: 'Ballbesitz',
      shots: 'Schüsse',
      shotsOn: 'Aufs Tor',
      corners: 'Ecken',
      lineup: 'Aufstellung',
      espn: 'Zum ESPN-Ticker ↗',
      subFor: 'für',
      penSuffix: ' (E)',
      ogSuffix: ' (ET)',
      colTeam: 'Verein',
      colPlayed: 'Sp',
      colWon: 'S',
      colDraw: 'U',
      colLost: 'N',
      colGoals: 'Tore',
      colDiff: 'Diff',
      colPoints: 'Pkt',
      navGroup: 'Spieltag',
      navPrev: 'Zurück: {name}',
      navNext: 'Weiter: {name}',
      navPick: 'Spieltag wählen',
      navCurrent: 'Aktuell',
      navCurrentTitle: 'Zum aktuellen Spieltag ({name})',
      currentTag: 'aktuell',
      loadError: 'Spieltag konnte nicht geladen werden.',
      loadingDetails: 'Details werden geladen …',
      detailsError: 'Details konnten nicht geladen werden.',
      retry: 'Erneut versuchen',
      tableAsOf: 'Stand {name}',
      firstLeg: 'Hinspiel',
      aggregate: 'Gesamt',
      advances: '{team} weiter',
      zones: {
        cl: 'CL',
        el: 'EL',
        ecl: 'Conference-Quali',
        releg: 'Relegation',
        down: 'Abstieg',
        up: 'Aufstieg',
        upReleg: 'Aufstiegs-Relegation',
        r16: 'Direkt AF',
        playoff: 'Playoff',
        out: 'Raus',
      },
    },
    en: {
      today: 'Today',
      table: 'Table',
      live: 'Live',
      ht: 'HT',
      aet: 'AET',
      pens: 'pens',
      pensLive: 'pens',
      shootout: 'Penalty shoot-out',
      noEvents: 'No events yet.',
      noEventData: 'No event data available.',
      unavailable: 'Data currently unavailable.',
      tableUnavailable: 'Table currently unavailable.',
      noMatches: 'No matches.',
      noFixtures: 'No fixtures yet.',
      noTeamMatches: 'No matches of {team} found.',
      possession: 'Possession',
      shots: 'Shots',
      shotsOn: 'On target',
      corners: 'Corners',
      lineup: 'Line-ups',
      espn: 'ESPN match centre ↗',
      subFor: 'for',
      penSuffix: ' (P)',
      ogSuffix: ' (OG)',
      colTeam: 'Team',
      colPlayed: 'P',
      colWon: 'W',
      colDraw: 'D',
      colLost: 'L',
      colGoals: 'Goals',
      colDiff: 'GD',
      colPoints: 'Pts',
      navGroup: 'Matchday',
      navPrev: 'Previous: {name}',
      navNext: 'Next: {name}',
      navPick: 'Choose matchday',
      navCurrent: 'Current',
      navCurrentTitle: 'Back to the current matchday ({name})',
      currentTag: 'current',
      loadError: 'Could not load the matchday.',
      loadingDetails: 'Loading details …',
      detailsError: 'Could not load the match details.',
      retry: 'Try again',
      tableAsOf: 'as of {name}',
      firstLeg: '1st leg',
      aggregate: 'Agg.',
      advances: '{team} through',
      zones: {
        cl: 'Champions League',
        el: 'Europa League',
        ecl: 'Conference League qual.',
        releg: 'Relegation play-off',
        down: 'Relegation',
        up: 'Promotion',
        upReleg: 'Promotion play-off',
        r16: 'Round of 16',
        playoff: 'Knockout play-off',
        out: 'Eliminated',
      },
    },
  };

  const ICON_GRID = 'M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3';
  const ICON_TABLE =
    'M5,4H19A2,2 0 0,1 21,6V18A2,2 0 0,1 19,20H5A2,2 0 0,1 3,18V6A2,2 0 0,1 5,4M5,8V12H11V8H5M13,8V12H19V8H13M5,14V18H11V14H5M13,14V18H19V14H13Z';

  const ICON_PREV = 'M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z';
  const ICON_NEXT = 'M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z';
  const ICON_CARET = 'M7,10L12,15L17,10H7Z';
  const ICON_BACK = 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z';

  const GOAL_ICON = '<span class="ic ic-goal"></span>';
  const YELLOW_ICON = '<span class="ic ic-yellow"></span>';
  const RED_ICON = '<span class="ic ic-red"></span>';
  const YELLOWRED_ICON = '<span class="ic ic-yellowred"></span>';
  const SUB_ICON = '<span class="ic ic-sub">⇄</span>';
  const ADVANCE_ICON = '<span class="adv-chip" aria-hidden="true">✓</span>';

  // ---------------------------------------------------------------------------
  // Pure helpers (no DOM access, exported for the unit tests)
  // ---------------------------------------------------------------------------

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function languageOf(configLanguage, hass) {
    const raw =
      configLanguage ||
      (hass && hass.locale && hass.locale.language) ||
      (hass && hass.language) ||
      'en';
    return String(raw).toLowerCase().startsWith('de') ? 'de' : 'en';
  }

  function translator(lang) {
    const table = STRINGS[lang] || STRINGS.en;
    return function t(key, vars) {
      let s = table[key] != null ? table[key] : STRINGS.en[key] != null ? STRINGS.en[key] : key;
      if (vars) Object.keys(vars).forEach((k) => (s = s.replace('{' + k + '}', vars[k])));
      return s;
    };
  }

  function competitionInfo(code) {
    return COMPETITIONS[code] || null;
  }

  // "90'+3'" -> 90*60+3. Base minute times 60 keeps stoppage time behind the
  // regular minute and ahead of the next one (ESPN caps clock values at 45:00/90:00).
  function parseMinute(mn) {
    const mm = String(mn || '0').match(/(\d+)'?\+?(\d+)?/);
    if (!mm) return 0;
    const base = parseInt(mm[1], 10) || 0;
    const extra = mm[2] ? parseInt(mm[2], 10) : 0;
    return base * 60 + extra;
  }

  function minuteBase(mn) {
    const mm = String(mn || '').match(/(\d+)/);
    return mm ? parseInt(mm[1], 10) : 0;
  }

  function sortKeyOf(ev) {
    return typeof ev.sortKey === 'number' ? ev.sortKey : parseMinute(ev.minute);
  }

  // Primary: displayed minute (resolves stoppage time), secondary: ESPN's sortKey,
  // which is exact to the second within the same minute.
  function compareEvents(a, b) {
    const d = parseMinute(a.minute) - parseMinute(b.minute);
    if (d !== 0) return d;
    return sortKeyOf(a) - sortKeyOf(b);
  }

  // Shoot-out kicks arrive as scorers with minutes after 120' ("121'", "122'", ...);
  // extra time itself ends with "120'+x'", whose base minute is 120.
  function isShootoutKick(ev) {
    return !!ev && minuteBase(ev.minute) > 120;
  }

  function splitScorers(scorers) {
    const regular = [];
    const shootout = [];
    (scorers || []).forEach((s) => (isShootoutKick(s) ? shootout : regular).push(s));
    shootout.sort(compareEvents);
    return { regular, shootout };
  }

  function toInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  // Result of the penalty shoot-out: the `pso` field of the integration first,
  // otherwise counted from the scored kicks (only scored kicks are listed).
  function shootoutResult(m) {
    const pso = m && m.pso;
    if (pso && toInt(pso.team1) != null && toInt(pso.team2) != null) {
      return { team1: toInt(pso.team1), team2: toInt(pso.team2), winner: pso.winner || null, counted: false };
    }
    const kicks = splitScorers(m && m.scorers).shootout;
    if (!kicks.length) return null;
    const team1 = kicks.filter((k) => k.team === 'team1').length;
    const team2 = kicks.length - team1;
    return { team1, team2, winner: null, counted: true };
  }

  // Running tally per kick; null if it does not add up to the official result.
  function shootoutTally(kicks, result) {
    let h = 0;
    let a = 0;
    const out = kicks.map((k) => {
      if (k.team === 'team1') h += 1;
      else a += 1;
      return h + ':' + a;
    });
    if (result && (result.team1 !== h || result.team2 !== a)) return null;
    return out;
  }

  // Running score for the goal lines. An own goal counts for the other team
  // (scorer.team is the scorer's team). If the sum does not match the score the
  // card shows, no running score is shown at all rather than a wrong one.
  function runningScores(goals, finalScore) {
    const sorted = (goals || []).slice().sort(compareEvents);
    let h = 0;
    let a = 0;
    const byGoal = new Map();
    sorted.forEach((g) => {
      const forHome = g.type === 'owngoal' ? g.team === 'team2' : g.team === 'team1';
      if (forHome) h += 1;
      else a += 1;
      byGoal.set(g, h + ':' + a);
    });
    const fin = String(finalScore || '');
    if (fin && fin !== h + ':' + a) return null;
    return byGoal;
  }

  function findHalftimeScore(m) {
    const ht = (m.matchResults || []).find((x) => x.resultTypeID === 1);
    if (ht) return ht.pointsTeam1 + ':' + ht.pointsTeam2;
    return m.ht_score || null;
  }

  // Final score: the ESPN live score (same source as the ticker), else the latest
  // OpenLigaDB result after 90 minutes / extra time (never the shoot-out total).
  function finalScoreOf(m) {
    if (m.live_score) return m.live_score;
    const results = (m.matchResults || []).filter((x) => x.resultTypeID === 2 || x.resultTypeID === 4);
    if (!results.length) return '–';
    const r = results.reduce((best, x) => (x.resultTypeID > best.resultTypeID ? x : best));
    return r.pointsTeam1 + ':' + r.pointsTeam2;
  }

  function isAfterExtraTime(m) {
    if (m.status !== 'post' || shootoutResult(m)) return false;
    if (minuteBase(m.minute) > 90) return true;
    return (m.matchResults || []).some((x) => x.resultTypeID === 4) && !m.live_score;
  }

  function isLive(m) {
    return !!m && (m.status === 'live' || m.status === 'ht');
  }

  function hasLiveMatch(matches) {
    return Array.isArray(matches) && matches.some(isLive);
  }

  // prefer: 'short' (OpenLigaDB short name if usable) or 'full'.
  function teamDisplayName(team, prefer) {
    const t = team || {};
    const full = String(t.teamName || '').trim();
    const short = String(t.shortName || '').trim();
    if (prefer === 'full') return full || short || '?';
    const usable = short.length >= 3 && short !== short.toLowerCase();
    return usable ? short : full || short || '?';
  }

  function namePreference(configNames, code) {
    if (configNames === 'short' || configNames === 'full') return configNames;
    const info = competitionInfo(code);
    return info && info.fullNames ? 'full' : 'short';
  }

  function countdownText(kickoffIso, nowMs) {
    const kickoff = new Date(kickoffIso).getTime();
    const diffMs = kickoff - nowMs;
    if (!(diffMs > 0) || diffMs > 2 * 60 * 60 * 1000) return null;
    const totalMin = Math.max(1, Math.round(diffMs / 60000));
    if (totalMin >= 60) {
      const h = Math.floor(totalMin / 60);
      const mm = totalMin % 60;
      return mm > 0 ? 'in ' + h + ' h ' + mm + ' min' : 'in ' + h + ' h';
    }
    return 'in ' + totalMin + ' min';
  }

  function dayKeyOf(iso, tz) {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
  }

  function dayHeaderText(iso, key, todayKey, ctx) {
    const d = new Date(iso);
    const weekday = d
      .toLocaleDateString(ctx.locale, { timeZone: ctx.tz, weekday: 'short' })
      .replace(/\.$/, '')
      .toUpperCase();
    const date = d.toLocaleDateString(ctx.locale, { timeZone: ctx.tz, day: '2-digit', month: '2-digit' });
    const label = weekday + ' ' + date;
    return key === todayKey ? ctx.t('today').toUpperCase() + ' · ' + label : label;
  }

  function formatKickoff(iso, ctx) {
    const opts = { timeZone: ctx.tz, hour: '2-digit', minute: '2-digit' };
    if (ctx.hour12 != null) opts.hour12 = ctx.hour12;
    return new Date(iso).toLocaleTimeString(ctx.locale, opts);
  }

  // Stable sort by kick-off.
  function sortMatches(matches) {
    return (matches || [])
      .map((m, i) => ({ m, i, k: new Date(m.matchDateTimeUTC).getTime() || 0 }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map((x) => x.m);
  }

  function groupByDay(matches, tz) {
    const groups = [];
    const byKey = new Map();
    matches.forEach((m) => {
      const key = dayKeyOf(m.matchDateTimeUTC, tz);
      let g = byKey.get(key);
      if (!g) {
        g = { key, items: [] };
        byKey.set(key, g);
        groups.push(g);
      }
      g.items.push(m);
    });
    return groups;
  }

  // Team mode: all matches of one team over several sensors, oldest first.
  // sources: [{ code, badge, matches }]; each match is tagged with its source.
  function collectTeamMatches(sources, team) {
    const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
    const target = norm(team);
    const out = [];
    (sources || []).forEach((src) => {
      const tag = { code: src.code || null, badge: src.badge || '' };
      (src.matches || []).forEach((m) => {
        const names = [m.team1 && m.team1.teamName, m.team1 && m.team1.shortName, m.team2 && m.team2.teamName, m.team2 && m.team2.shortName].map(norm);
        if (target && names.indexOf(target) !== -1) {
          out.push(Object.assign({}, m, { _src: tag }));
        }
      });
    });
    return sortMatches(out);
  }

  // At most `limit` matches: all running ones, the rest filled with the matches
  // closest to now (past or future). Keeps the chronological order.
  function selectTeamWindow(matches, limit, nowMs) {
    const running = matches.filter(isLive);
    const rest = matches.filter((m) => !isLive(m));
    const budget = Math.max(0, limit - running.length);
    const chosen = new Set(running);
    rest
      .slice()
      .sort(
        (a, b) =>
          Math.abs(new Date(a.matchDateTimeUTC).getTime() - nowMs) -
          Math.abs(new Date(b.matchDateTimeUTC).getTime() - nowMs),
      )
      .slice(0, budget)
      .forEach((m) => chosen.add(m));
    return matches.filter((m) => chosen.has(m));
  }

  // Table zones --------------------------------------------------------------

  function zonePosition(n, total) {
    return n < 0 ? total + 1 + n : n;
  }

  function resolveZone(zones, rank, total) {
    for (const z of zones || []) {
      const from = zonePosition(z.from, total);
      const to = zonePosition(z.to == null ? z.from : z.to, total);
      if (rank >= Math.min(from, to) && rank <= Math.max(from, to)) return z;
    }
    return null;
  }

  function defaultZones(code) {
    return DEFAULT_ZONES[code] || [];
  }

  function zoneLabel(z, t) {
    if (z.label) return z.label;
    const zl = t('zones');
    return (zl && zl[z.labelKey]) || z.labelKey || '';
  }

  // Legend entries for the zones that exist in a table of `total` teams.
  function legendItems(zones, total, t) {
    return (zones || [])
      .filter((z) => {
        const from = zonePosition(z.from, total);
        const to = zonePosition(z.to == null ? z.from : z.to, total);
        return Math.max(from, to) >= 1 && Math.min(from, to) <= total;
      })
      .map((z) => ({ color: z.color, label: zoneLabel(z, t) }))
      .filter((x) => x.label);
  }

  function formatDiff(d) {
    const n = toInt(d);
    if (n == null) return '';
    return n > 0 ? '+' + n : String(n);
  }

  // Two-legged ties (integration >= 0.6.0) ---------------------------------------------

  // `aggregate` of a second leg: first leg and aggregate from the match's team1/team2
  // side ("1:2"), `advances` "team1"/"team2" once decided. null if there is nothing usable.
  function tieOf(m) {
    const a = m && m.aggregate;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
    const score = (v) => (typeof v === 'string' && /^\d+:\d+$/.test(v) ? v : null);
    const tie = {
      firstLeg: score(a.first_leg),
      score: score(a.score),
      advances: a.advances === 'team1' || a.advances === 'team2' ? a.advances : null,
    };
    return tie.firstLeg || tie.score || tie.advances ? tie : null;
  }

  // Line under the score: before kick-off the first leg, from kick-off the aggregate.
  function tieLine(m, t) {
    const tie = tieOf(m);
    if (!tie) return '';
    if (m.status === 'pre') return tie.firstLeg ? t('firstLeg') + ' ' + tie.firstLeg : '';
    return tie.score ? t('aggregate') + ' ' + tie.score : '';
  }

  function advanceIcon(m, teamKey) {
    const tie = tieOf(m);
    return tie && tie.advances === teamKey ? ADVANCE_ICON : '';
  }

  // The table belongs to a league phase: hidden for qualifying and knockout rounds.
  // Sensors without `phase` (OpenLigaDB leagues, integration < 0.6.0) always show it.
  function tableInPhase(phase) {
    return phase == null || phase === '' || phase === 'league-phase';
  }

  // Matchday navigation ----------------------------------------------------------

  // Rounds of the season from the sensor's `matchdays` attribute (integration >= 0.4.0),
  // sorted and de-duplicated; null if the attribute is missing or empty (older versions).
  function matchdayList(attrs) {
    const raw = attrs && attrs.matchdays;
    if (!Array.isArray(raw)) return null;
    const seen = new Set();
    const list = [];
    raw.forEach((x) => {
      const n = x && typeof x === 'object' ? Number(x.matchday) : NaN;
      if (!Number.isInteger(n) || seen.has(n)) return;
      seen.add(n);
      list.push({
        matchday: n,
        name: x.name == null || x.name === '' ? String(n) : String(x.name),
        first_kickoff: typeof x.first_kickoff === 'string' && x.first_kickoff ? x.first_kickoff : null,
        last_kickoff: typeof x.last_kickoff === 'string' && x.last_kickoff ? x.last_kickoff : null,
      });
    });
    list.sort((a, b) => a.matchday - b.matchday);
    return list.length ? list : null;
  }

  // The sensor's current matchday, if it is part of the list.
  function currentMatchdayOf(attrs, list) {
    const n = Number(attrs && attrs.matchday);
    return Number.isInteger(n) && list && list.some((x) => x.matchday === n) ? n : null;
  }

  // Where the navigation stands. shown = null means "the current matchday"; a shown
  // matchday that is no longer in the list falls back to the current one.
  function navState(list, current, shown) {
    if (!list || current == null) return null;
    let index = shown == null ? -1 : list.findIndex((x) => x.matchday === shown);
    if (index === -1) index = list.findIndex((x) => x.matchday === current);
    if (index === -1) return null;
    const entry = list[index];
    const cur = list.find((x) => x.matchday === current);
    return {
      matchday: entry.matchday,
      name: entry.name,
      index,
      isCurrent: entry.matchday === current,
      current,
      currentName: cur.name,
      prev: index > 0 ? list[index - 1] : null,
      next: index < list.length - 1 ? list[index + 1] : null,
    };
  }

  // Normalised selection: the current matchday is stored as null, so the card keeps
  // following the sensor when it moves on to the next matchday.
  function shownMatchday(target, current) {
    return target == null || target === current ? null : target;
  }

  // New option index in the matchday list for a key press, null for other keys.
  function pickerIndex(key, index, length) {
    if (!length) return null;
    const clamp = (i) => Math.max(0, Math.min(length - 1, i));
    switch (key) {
      case 'ArrowDown':
        return clamp(index + 1);
      case 'ArrowUp':
        return clamp(index - 1);
      case 'PageDown':
        return clamp(index + 8);
      case 'PageUp':
        return clamp(index - 8);
      case 'Home':
        return 0;
      case 'End':
        return length - 1;
      default:
        return null;
    }
  }

  // "18.–20.09." (German, same month), "30.09.–02.10.", "18/09–20/09" (English).
  function matchdayDates(entry, ctx) {
    if (!entry || !entry.first_kickoff) return '';
    const fmt = (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(ctx.locale, { timeZone: ctx.tz, day: '2-digit', month: '2-digit' });
    };
    const a = fmt(entry.first_kickoff);
    const b = entry.last_kickoff ? fmt(entry.last_kickoff) : a;
    if (!a) return '';
    if (!b || a === b) return a;
    const ma = a.match(/^(\d{2}\.)(\d{2}\.)$/);
    const mb = b.match(/^(\d{2}\.)(\d{2}\.)$/);
    if (ma && mb && ma[2] === mb[2]) return ma[1] + '–' + b;
    return a + '–' + b;
  }

  // Cache of fetched matchdays and match details ------------------------------------

  const CACHE_TTL_OPEN = 15 * 60 * 1000; // matchday (or match) not finished yet
  const CACHE_TTL_LIVE = 60 * 1000; // one of its matches is running
  const CACHE_TTL_RETRY = 60 * 1000; // a background refresh failed, the old data stays
  const CACHE_MAX = 80;

  function matchdayCacheKey(code, season, matchday) {
    return [code || '?', season == null ? '?' : season, matchday].join('|');
  }

  function detailsCacheKey(code, matchId) {
    return (code || '?') + '|' + matchId;
  }

  function isFinishedMatch(m) {
    return !!m && (m.status === 'post' || (m.status == null && m.matchIsFinished === true));
  }

  // How long fetched matches stay fresh: finished ones for good, running ones a minute,
  // everything else 15 minutes.
  function cacheTtl(matches) {
    const list = Array.isArray(matches) ? matches : [];
    if (list.length && list.every(isFinishedMatch)) return Infinity;
    if (hasLiveMatch(list)) return CACHE_TTL_LIVE;
    return CACHE_TTL_OPEN;
  }

  // record: { data, expires, pending, error } (see remoteLoad).
  function needsFetch(record, nowMs) {
    if (!record) return true;
    if (record.pending || record.error) return false;
    return !(record.data && nowMs < record.expires);
  }

  function remoteRecord(store, key) {
    let r = store.get(key);
    if (!r) {
      r = { data: null, expires: 0, pending: null, error: null };
      store.set(key, r);
      // Oldest first (Map keeps insertion order); never drop a running request.
      for (const [k, v] of store) {
        if (store.size <= CACHE_MAX) break;
        if (!v.pending && k !== key) store.delete(k);
      }
    }
    return r;
  }

  // Load `key` once: concurrent callers share the request. A failure keeps older data
  // (and retries after a minute); without data it is kept as `error` until cleared.
  function remoteLoad(store, key, fetcher, ttlOf, nowFn) {
    const now = nowFn || Date.now;
    const r = remoteRecord(store, key);
    if (r.pending) return r.pending;
    r.error = null;
    r.pending = Promise.resolve()
      .then(fetcher)
      .then(
        (data) => {
          r.data = data;
          r.expires = now() + ttlOf(data);
        },
        (err) => {
          if (r.data) r.expires = now() + CACHE_TTL_RETRY;
          else r.error = errorText(err);
        },
      )
      .then(() => {
        r.pending = null;
      });
    return r.pending;
  }

  function errorText(err) {
    if (err && typeof err === 'object' && err.message) return String(err.message);
    if (err && typeof err === 'object' && err.code) return String(err.code);
    return err == null || err === '' ? 'Unknown error' : String(err);
  }

  // Action responses -------------------------------------------------------------------

  // sendMessagePromise resolves call_service with { context, response }.
  function responseBody(raw) {
    return raw && typeof raw === 'object' && 'response' in raw ? raw.response : raw;
  }

  function mapMatchdayResponse(raw, requested) {
    const r = responseBody(raw);
    if (!r || typeof r !== 'object' || !Array.isArray(r.matches)) {
      throw new Error('Unexpected answer of matchday.get_matchday.');
    }
    const n = Number(r.matchday);
    const matchday = Number.isInteger(n) ? n : requested;
    if (requested != null && matchday !== requested) {
      throw new Error('matchday.get_matchday answered matchday ' + matchday + ' instead of ' + requested + '.');
    }
    return {
      competition: r.competition ? String(r.competition) : null,
      season: toInt(r.season),
      matchday,
      name: r.name ? String(r.name) : null,
      isCurrent: r.is_current === true,
      matches: sortMatches(r.matches.filter((m) => m && typeof m === 'object' && m.matchID != null)),
    };
  }

  function mapDetailsResponse(raw) {
    const r = responseBody(raw);
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('Unexpected answer of matchday.get_match_details.');
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
    return {
      match_id: r.match_id == null ? null : r.match_id,
      substitutions: Array.isArray(r.substitutions) ? r.substitutions : [],
      stats: obj(r.stats),
      lineups: obj(r.lineups),
      ht_score: typeof r.ht_score === 'string' && r.ht_score ? r.ht_score : null,
      pso: obj(r.pso),
    };
  }

  // A match of another matchday with its lazily loaded details.
  function withDetails(m, d) {
    if (!d) return m;
    return Object.assign({}, m, {
      substitutions: d.substitutions && d.substitutions.length ? d.substitutions : m.substitutions || [],
      stats: d.stats || m.stats || null,
      lineups: d.lineups || m.lineups || null,
      ht_score: d.ht_score || m.ht_score || null,
      pso: d.pso || m.pso || null,
    });
  }

  // Configuration --------------------------------------------------------------

  const ENTITY_RE = /^sensor\.[a-z0-9_]+$/;
  const LAYOUTS = ['auto', 'stacked', 'columns'];
  const NAME_MODES = ['auto', 'short', 'full'];

  function normalizeZones(zones, where) {
    if (zones == null) return null;
    if (zones === false) return [];
    if (!Array.isArray(zones)) throw new Error(where + '"zones" must be a list (or false to hide them).');
    return zones.map((z, j) => {
      const at = where + 'zones[' + j + ']: ';
      if (!z || typeof z !== 'object') throw new Error(at + 'must be an object with "from", "to", "color" and "label".');
      const from = Number(z.from);
      const to = z.to == null ? from : Number(z.to);
      if (!Number.isInteger(from) || from === 0) throw new Error(at + '"from" must be a table position (1 = first, -1 = last).');
      if (!Number.isInteger(to) || to === 0) throw new Error(at + '"to" must be a table position (1 = first, -1 = last).');
      if (typeof z.color !== 'string' || !z.color.trim()) throw new Error(at + '"color" is required (e.g. "#1e88e5").');
      return { from, to, color: z.color.trim(), label: z.label == null ? '' : String(z.label) };
    });
  }

  function normalizeCompetition(raw, index) {
    const where = index == null ? '' : 'competitions[' + index + ']: ';
    const x = typeof raw === 'string' ? { entity: raw } : raw;
    if (!x || typeof x !== 'object') throw new Error(where + 'must be an object with at least "entity".');
    if (typeof x.entity !== 'string' || !ENTITY_RE.test(x.entity.trim())) {
      throw new Error(where + '"entity" must be a Matchday matchday sensor, e.g. sensor.matchday_bundesliga_spieltag.');
    }
    if (x.table_entity != null && x.table_entity !== '' && (typeof x.table_entity !== 'string' || !ENTITY_RE.test(x.table_entity.trim()))) {
      throw new Error(where + '"table_entity" must be a Matchday table sensor, e.g. sensor.matchday_bundesliga_tabelle.');
    }
    return {
      name: x.name == null || x.name === '' ? null : String(x.name),
      short: x.short == null || x.short === '' ? null : String(x.short),
      entity: x.entity.trim(),
      table_entity: x.table_entity ? x.table_entity.trim() : null,
      zones: normalizeZones(x.zones, where),
    };
  }

  function boolOption(config, key, fallback) {
    const v = config[key];
    if (v == null) return fallback;
    if (typeof v !== 'boolean') throw new Error('"' + key + '" must be true or false.');
    return v;
  }

  function enumOption(config, key, allowed, fallback) {
    const v = config[key];
    if (v == null || v === '') return fallback;
    if (allowed.indexOf(v) === -1) throw new Error('"' + key + '" must be one of: ' + allowed.join(', ') + '.');
    return v;
  }

  function normalizeConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration.');
    const hasEntity = config.entity != null && config.entity !== '';
    const hasList = config.competitions != null;
    if (hasEntity && hasList) throw new Error('Use either "entity" or "competitions", not both.');
    if (!hasEntity && !hasList) {
      throw new Error('Define "entity" (e.g. sensor.matchday_bundesliga_spieltag) or a list of "competitions".');
    }
    let competitions;
    if (hasEntity) {
      competitions = [
        normalizeCompetition(
          { name: config.name, short: config.short, entity: config.entity, table_entity: config.table_entity, zones: config.zones },
          null,
        ),
      ];
    } else {
      if (!Array.isArray(config.competitions) || config.competitions.length === 0) {
        throw new Error('"competitions" must be a non-empty list.');
      }
      if (config.zones != null) throw new Error('With "competitions", set "zones" per competition.');
      competitions = config.competitions.map((c, i) => normalizeCompetition(c, i));
    }
    const team = config.team == null ? null : String(config.team).trim() || null;
    let limit = 5;
    if (config.limit != null) {
      limit = Number(config.limit);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('"limit" must be a positive whole number.');
    }
    let chipColumns = null;
    if (config.chip_columns != null) {
      chipColumns = Number(config.chip_columns);
      if (!Number.isInteger(chipColumns) || chipColumns < 1 || chipColumns > 8) throw new Error('"chip_columns" must be between 1 and 8.');
    }
    if (config.language != null && ['de', 'en'].indexOf(config.language) === -1) {
      throw new Error('"language" must be "de" or "en".');
    }
    return {
      competitions,
      team,
      limit,
      title: config.title == null || config.title === '' ? null : String(config.title),
      layout: enumOption(config, 'layout', LAYOUTS, 'auto'),
      names: enumOption(config, 'names', NAME_MODES, 'auto'),
      compact: boolOption(config, 'compact', false),
      show_table: boolOption(config, 'show_table', true),
      show_legend: boolOption(config, 'show_legend', true),
      show_header: boolOption(config, 'show_header', true),
      show_espn_link: boolOption(config, 'show_espn_link', true),
      navigation: boolOption(config, 'navigation', true),
      chip_columns: chipColumns,
      default_competition: config.default_competition == null ? null : config.default_competition,
      language: config.language || null,
    };
  }

  function competitionIndex(competitions, wanted) {
    if (wanted == null) return -1;
    if (typeof wanted === 'number') return wanted >= 0 && wanted < competitions.length ? wanted : -1;
    const w = String(wanted).trim().toLowerCase();
    return competitions.findIndex((c) => c.entity === w || (c.name && c.name.toLowerCase() === w));
  }

  // Stub config for the card picker: the first Matchday matchday sensor (and the
  // table sensor of the same competition).
  function stubConfig(states) {
    const all = Object.keys(states || {}).sort();
    const isMatchday = (id) => {
      const a = states[id] && states[id].attributes;
      return id.startsWith('sensor.') && a && Array.isArray(a.matches) && a.competition != null;
    };
    const candidates = all.filter(isMatchday);
    const entity = candidates.find((id) => id.startsWith('sensor.matchday_')) || candidates[0];
    if (!entity) return { entity: 'sensor.matchday_bundesliga_spieltag' };
    const code = states[entity].attributes.competition;
    const table = all.find((id) => {
      const a = states[id] && states[id].attributes;
      return id.startsWith('sensor.') && a && Array.isArray(a.table) && a.competition === code;
    });
    return table ? { entity, table_entity: table } : { entity };
  }

  // ---------------------------------------------------------------------------
  // HTML builders (pure: return strings)
  // ---------------------------------------------------------------------------

  function sendOffIcons(m, teamKey) {
    return (m.cards || [])
      .filter((c) => c.team === teamKey && (c.type === 'red' || c.type === 'yellowred'))
      .slice()
      .sort(compareEvents)
      .map((c) => '<span class="so-chip">' + (c.type === 'yellowred' ? YELLOWRED_ICON : RED_ICON) + '</span>')
      .join('');
  }

  function centerHtml(m, ctx) {
    const t = ctx.t;
    const badge = ctx.badge ? '<div class="c-badge">' + escHtml(ctx.badge) + '</div>' : '';
    const tie = tieLine(m, t);
    const tieHtml = tie ? '<div class="c-agg">' + escHtml(tie) + '</div>' : '';
    const stack = (inner) => '<div class="c-stack">' + badge + inner + tieHtml + '</div>';
    if (m.status === 'pre') {
      const cd = countdownText(m.matchDateTimeUTC, ctx.now) || '';
      return stack(
        '<div class="c-pre">' + escHtml(formatKickoff(m.matchDateTimeUTC, ctx)) + '</div>' +
          '<div class="c-countdown">' + escHtml(cd) + '</div>',
      );
    }
    if (m.status === 'live' || m.status === 'ht') {
      // ESPN fills ht_score from the first period while it is still running: only
      // show it from the second half on.
      const ht = m.status === 'live' && minuteBase(m.minute) > 45 ? findHalftimeScore(m) : null;
      const htHtml = ht ? ' <span class="c-sub">(' + escHtml(ht) + ')</span>' : '';
      const score = '<div class="c-score">' + escHtml(m.live_score || '–') + htHtml + '</div>';
      if (m.status === 'ht') return stack(score + '<div class="c-live c-ht">' + escHtml(t('ht')) + '</div>');
      const so = splitScorers(m.scorers).shootout.length ? shootoutResult(m) : null;
      const label = so ? t('pensLive') + ' ' + so.team1 + ':' + so.team2 : m.minute || t('live');
      return stack(score + '<div class="c-live"><span class="live-dot"></span>' + escHtml(label) + '</div>');
    }
    // post
    const ht = findHalftimeScore(m);
    const htHtml = ht ? ' <span class="c-sub">(' + escHtml(ht) + ')</span>' : '';
    const so = shootoutResult(m);
    const extra = so ? t('pens') + ' ' + so.team1 + ':' + so.team2 : isAfterExtraTime(m) ? t('aet') : '';
    const inner =
      '<div class="c-post">' + escHtml(finalScoreOf(m)) + htHtml + '</div>' +
      (extra ? '<div class="c-extra">' + escHtml(extra) + '</div>' : '');
    return badge || extra || tie ? stack(inner) : inner;
  }

  // Send-offs and, in a decided tie, the tick of the side that went through.
  function sideIcons(m, teamKey) {
    return sendOffIcons(m, teamKey) + advanceIcon(m, teamKey);
  }

  function nameCellHtml(team, m, teamKey, side, ctx) {
    return (
      '<span class="name name-' + side + '"><span class="name-text">' +
      escHtml(teamDisplayName(team, ctx.namePref)) +
      '</span><span class="sendoff">' + sideIcons(m, teamKey) + '</span></span>'
    );
  }

  function logoHtml(team, cls) {
    const src = team && team.teamIconUrl;
    return src
      ? '<img class="logo ' + cls + '" src="' + escHtml(src) + '" alt="" decoding="async" referrerpolicy="no-referrer">'
      : '<span class="logo ' + cls + '"></span>';
  }

  function rowHtml(m, ctx, open) {
    return (
      '<div class="row' + (m.status === 'live' ? ' is-live' : '') + '" data-id="' + escHtml(m.matchID) +
      '" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      logoHtml(m.team1, 'logo1') +
      nameCellHtml(m.team1, m, 'team1', 'left', ctx) +
      '<div class="center">' + centerHtml(m, ctx) + '</div>' +
      nameCellHtml(m.team2, m, 'team2', 'right', ctx) +
      logoHtml(m.team2, 'logo2') +
      '</div>'
    );
  }

  function buildTickerEvents(m, t) {
    const { regular } = splitScorers(m.scorers);
    const running = runningScores(regular, m.live_score);
    const events = [];
    regular.forEach((s) => {
      const suf = s.type === 'penalty' ? t('penSuffix') : s.type === 'owngoal' ? t('ogSuffix') : '';
      events.push({
        team: s.team,
        sortKey: s.sortKey,
        minute: s.minute,
        icon: GOAL_ICON,
        label: escHtml(s.name) + escHtml(suf),
        score: running ? running.get(s) : null,
        cls: 'tick-goal',
      });
    });
    (m.cards || []).forEach((c) => {
      const icon = c.type === 'red' ? RED_ICON : c.type === 'yellowred' ? YELLOWRED_ICON : YELLOW_ICON;
      events.push({ team: c.team, sortKey: c.sortKey, minute: c.minute, icon, label: escHtml(c.name), cls: 'tick-card' });
    });
    (m.substitutions || []).forEach((x) => {
      events.push({
        team: x.team,
        sortKey: x.sortKey,
        minute: x.minute,
        icon: SUB_ICON,
        label: escHtml(x.in) + ' ' + escHtml(t('subFor')) + ' ' + escHtml(x.out),
        cls: 'tick-sub',
      });
    });
    events.sort(compareEvents);
    return events;
  }

  // The score sits in its own fixed-width middle column so all scores line up.
  function tickerLineHtml(ev) {
    const away = ev.team === 'team2';
    const cell =
      '<div class="tick-cell ' + ev.cls + (away ? ' away' : '') + '">' +
      '<div class="tick-icon">' + ev.icon + '</div>' +
      (ev.minute ? '<div class="tick-min">' + escHtml(ev.minute) + '</div>' : '') +
      '<div class="tick-label">' + ev.label + '</div>' +
      '</div>';
    return (
      '<div class="tick-row">' +
      '<div class="tick-side">' + (away ? '' : cell) + '</div>' +
      '<div class="tick-mid">' + (ev.score ? escHtml(ev.score) : '') + '</div>' +
      '<div class="tick-side">' + (away ? cell : '') + '</div>' +
      '</div>'
    );
  }

  function shootoutHtml(m, t) {
    const kicks = splitScorers(m.scorers).shootout;
    const result = shootoutResult(m);
    if (!result) return '';
    const tally = shootoutTally(kicks, result.counted ? null : result);
    const lines = kicks
      .map((k, i) =>
        tickerLineHtml({ team: k.team, minute: '', icon: GOAL_ICON, label: escHtml(k.name), score: tally ? tally[i] : null, cls: 'tick-goal' }),
      )
      .join('');
    return (
      '<div class="so-head">' + escHtml(t('shootout')) + ' <b>' + result.team1 + ':' + result.team2 + '</b></div>' +
      (lines ? '<div class="tick">' + lines + '</div>' : '')
    );
  }

  function statsHtml(stats, t) {
    if (!stats) return '';
    const rows = [];
    const pair = (v) => Array.isArray(v) && v.length === 2;
    if (pair(stats.possession)) {
      const h = toInt(stats.possession[0]) || 0;
      const a = toInt(stats.possession[1]) || 0;
      rows.push(
        '<div class="st-row"><div class="st-v st-h">' + h + '%</div><div class="st-l">' + escHtml(t('possession')) +
          '</div><div class="st-v st-a">' + a + '%</div></div>' +
          '<div class="st-bar"><div class="st-bar-h" style="width:' + h + '%"></div><div class="st-bar-a" style="width:' + a + '%"></div></div>',
      );
    }
    [
      ['shots', 'shots'],
      ['shots_on', 'shotsOn'],
      ['corners', 'corners'],
    ].forEach(([key, label]) => {
      const v = stats[key];
      if (pair(v)) {
        rows.push(
          '<div class="st-row"><div class="st-v st-h">' + escHtml(v[0]) + '</div><div class="st-l">' + escHtml(t(label)) +
            '</div><div class="st-v st-a">' + escHtml(v[1]) + '</div></div>',
        );
      }
    });
    return rows.length ? '<div class="stats">' + rows.join('') + '</div>' : '';
  }

  function lineupsHtml(lineups, t) {
    if (!lineups || !lineups.home || !lineups.away) return '';
    const ok = (x) => Array.isArray(x.players) && x.players.length > 0;
    if (!ok(lineups.home) || !ok(lineups.away)) return '';
    const col = (x) =>
      '<div class="lu-col">' +
      (x.formation ? '<div class="lu-formation">' + escHtml(x.formation) + '</div>' : '') +
      x.players.map((p) => '<div class="lu-player">' + escHtml(p) + '</div>').join('') +
      '</div>';
    return '<div class="lu-head">' + escHtml(t('lineup')) + '</div><div class="lu-cols">' + col(lineups.home) + col(lineups.away) + '</div>';
  }

  function espnUrl(m, code) {
    if (m.espn_id) return 'https://www.espn.com/soccer/match/_/gameId/' + encodeURIComponent(m.espn_id);
    const info = competitionInfo(code);
    return info ? 'https://www.espn.com/soccer/schedule/_/league/' + info.espn : null;
  }

  // First leg, aggregate and who went through, at the top of a second leg's details.
  function tieHtml(m, t) {
    const tie = tieOf(m);
    if (!tie) return '';
    const parts = [];
    if (tie.firstLeg) parts.push(escHtml(t('firstLeg')) + ' <b>' + escHtml(tie.firstLeg) + '</b>');
    if (tie.score && m.status !== 'pre') parts.push(escHtml(t('aggregate')) + ' <b>' + escHtml(tie.score) + '</b>');
    if (tie.advances) parts.push(escHtml(t('advances', { team: teamDisplayName(m[tie.advances], 'full') })));
    return parts.length ? '<div class="tie">' + parts.map((x) => '<span>' + x + '</span>').join('') + '</div>' : '';
  }

  // lead: optional HTML above the ticker (e.g. a failed details request).
  function zoneContentHtml(m, ctx, lead) {
    const t = ctx.t;
    const events = buildTickerEvents(m, t);
    const hasShootout = !!shootoutResult(m);
    let html;
    if (events.length) html = '<div class="tick">' + events.map(tickerLineHtml).join('') + '</div>';
    else if (!hasShootout) html = '<div class="tick-empty">' + escHtml(m.status === 'post' ? t('noEventData') : t('noEvents')) + '</div>';
    else html = '';
    html += shootoutHtml(m, t) + statsHtml(m.stats, t) + lineupsHtml(m.lineups, t);
    const url = ctx.showLink ? espnUrl(m, ctx.code) : null;
    if (url) {
      html += '<div class="zone-footer"><a class="espn-link" href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(t('espn')) + '</a></div>';
    }
    return '<div class="zone-pad">' + (lead || '') + tieHtml(m, t) + html + '</div>';
  }

  function tableHtml(rows, ctx) {
    const t = ctx.t;
    const total = rows.length;
    const head =
      '<div class="tr th"><span class="c-rank">#</span><span></span><span class="c-team">' + escHtml(t('colTeam')) + '</span>' +
      '<span class="c-n">' + escHtml(t('colPlayed')) + '</span>' +
      '<span class="c-n wdl">' + escHtml(t('colWon')) + '</span><span class="c-n wdl">' + escHtml(t('colDraw')) +
      '</span><span class="c-n wdl">' + escHtml(t('colLost')) + '</span>' +
      '<span class="c-goals">' + escHtml(t('colGoals')) + '</span><span class="c-n">' + escHtml(t('colDiff')) +
      '</span><span class="c-pts">' + escHtml(t('colPoints')) + '</span></div>';
    const body = rows
      .map((r, i) => {
        const rank = i + 1;
        const zone = resolveZone(ctx.zones, rank, total);
        const diff = r.diff != null ? r.diff : (toInt(r.goals) || 0) - (toInt(r.opponentGoals) || 0);
        const full = teamDisplayName(r, 'full');
        const short = teamDisplayName(r, ctx.namePref);
        const live = r.live
          ? '<span class="t-live"><span class="live-dot"></span>' + (r.live_score ? escHtml(r.live_score) : '') + '</span>'
          : '';
        return (
          '<div class="tr' + (zone ? ' has-zone' : '') + (r.live ? ' is-live' : '') + '"' +
          (zone ? ' style="--zone:' + escHtml(zone.color) + '"' : '') + '>' +
          '<span class="c-rank">' + rank + '</span>' +
          (r.teamIconUrl
            ? '<img class="crest" src="' + escHtml(r.teamIconUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
            : '<span class="crest"></span>') +
          '<span class="c-team"><span class="n-full" title="' + escHtml(full) + '">' + escHtml(full) + '</span>' +
          '<span class="n-short" title="' + escHtml(full) + '">' + escHtml(short) + '</span>' + live + '</span>' +
          '<span class="c-n">' + escHtml(r.matches) + '</span>' +
          '<span class="c-n wdl">' + escHtml(r.won) + '</span><span class="c-n wdl">' + escHtml(r.draw) +
          '</span><span class="c-n wdl">' + escHtml(r.lost) + '</span>' +
          '<span class="c-goals">' + escHtml(r.goals) + ':' + escHtml(r.opponentGoals) + '</span>' +
          '<span class="c-n">' + escHtml(formatDiff(diff)) + '</span>' +
          '<span class="c-pts">' + escHtml(r.points) + '</span>' +
          '</div>'
        );
      })
      .join('');
    return '<div class="block tbl">' + head + body + '</div>';
  }

  function legendHtml(items) {
    if (!items.length) return '';
    return (
      '<div class="legend">' +
      items.map((x) => '<span class="lg"><span class="lg-dot" style="background:' + escHtml(x.color) + '"></span>' + escHtml(x.label) + '</span>').join('') +
      '</div>'
    );
  }

  function headHtml(icon, text, extra) {
    return (
      '<svg class="head-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + icon + '"></path></svg>' +
      '<span class="head-text">' + escHtml(text) + '</span>' + (extra || '')
    );
  }

  function svgIcon(path, cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"></path></svg>';
  }

  // Skeleton of the navigable matchday heading; texts and states are patched in place
  // (keeps the keyboard focus on the buttons across updates).
  function navHeadHtml(t) {
    return (
      svgIcon(ICON_GRID, 'head-icon') +
      '<span class="head-prefix" hidden></span>' +
      '<div class="nav" role="group" aria-label="' + escHtml(t('navGroup')) + '">' +
      '<button type="button" class="nav-btn nav-prev">' + svgIcon(ICON_PREV, 'nav-ic') + '</button>' +
      '<button type="button" class="nav-title" aria-haspopup="listbox" aria-expanded="false">' +
      '<span class="nav-title-text"></span>' + svgIcon(ICON_CARET, 'nav-caret') + '</button>' +
      '<button type="button" class="nav-btn nav-next">' + svgIcon(ICON_NEXT, 'nav-ic') + '</button>' +
      '</div>' +
      '<button type="button" class="nav-today" hidden>' + svgIcon(ICON_BACK, 'nav-today-ic') +
      '<span>' + escHtml(t('navCurrent')) + '</span></button>' +
      '<div class="nav-bar" aria-hidden="true"></div>'
    );
  }

  function pickerHtml(list, nav, ctx) {
    const t = ctx.t;
    return list
      .map((x) => {
        const shown = x.matchday === nav.matchday;
        const current = x.matchday === nav.current;
        return (
          '<div class="pk-item' + (current ? ' is-current' : '') + '" role="option" tabindex="-1" data-md="' + x.matchday +
          '" aria-selected="' + (shown ? 'true' : 'false') + '">' +
          '<span class="pk-name">' + escHtml(x.name) + '</span>' +
          (current ? '<span class="pk-tag">' + escHtml(t('currentTag')) + '</span>' : '') +
          '<span class="pk-date">' + escHtml(matchdayDates(x, ctx)) + '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function retryHtml(text, detail, kind, id, t) {
    return (
      '<div class="retry-box">' +
      '<div class="retry-text">' + escHtml(text) + '</div>' +
      (detail ? '<div class="retry-detail">' + escHtml(detail) + '</div>' : '') +
      '<button type="button" class="retry" data-kind="' + escHtml(kind) + '"' + (id != null ? ' data-id="' + escHtml(id) + '"' : '') + '>' +
      escHtml(t('retry')) + '</button></div>'
    );
  }

  function zoneLoadingHtml(t) {
    return '<div class="zone-pad"><div class="zone-load" role="status"><span class="spinner"></span>' + escHtml(t('loadingDetails')) + '</div></div>';
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const GOAL_SVG =
    'url(data:image/svg+xml;utf8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%3E%3Ccircle%20cx=%2712%27%20cy=%2712%27%20r=%2711%27%20fill=%27%23ffffff%27/%3E%3Cpolygon%20points=%2712,7.4%2015.8,10.2%2014.3,14.7%209.7,14.7%208.2,10.2%27%20fill=%27%231a1a1a%27/%3E%3Cpath%20d=%27M12%207.4%20L12%202.2%20M15.8%2010.2%20L20.7%208.6%20M14.3%2014.7%20L17.4%2019%20M9.7%2014.7%20L6.6%2019%20M8.2%2010.2%20L3.3%208.6%27%20stroke=%27%231a1a1a%27%20stroke-width=%271.3%27%20fill=%27none%27/%3E%3C/svg%3E)';

  const STYLE = `
:host {
  display: block;
  --mdc-live: var(--matchday-live-color, #ef5350);
  --mdc-text: var(--primary-text-color, #e4e4e7);
  --mdc-text2: var(--secondary-text-color, #8a8c99);
  --mdc-strong: var(--matchday-score-color, var(--primary-text-color, #ffffff));
  --mdc-block: var(--matchday-block-background, var(--ha-card-background, var(--card-background-color, #ffffff)));
  --mdc-inset: var(--matchday-detail-background, color-mix(in srgb, var(--mdc-text) 4%, transparent));
  --mdc-line: color-mix(in srgb, var(--mdc-text) 7%, transparent);
  --mdc-hover: color-mix(in srgb, var(--mdc-text) 5%, transparent);
  --mdc-logo-bg: var(--matchday-logo-background, #e8e8e8);
  --mdc-radius: var(--ha-card-border-radius, 12px);
}
:host([dark]) {
  --mdc-block: var(--matchday-block-background, color-mix(in srgb, var(--primary-background-color, #101215) 45%, #000));
  --mdc-strong: var(--matchday-score-color, #ffffff);
  --mdc-inset: var(--matchday-detail-background, rgba(0, 0, 0, 0.25));
}
.mdc { container: mdc / inline-size; color: var(--mdc-text); }
.title { font-size: 18px; font-weight: 600; padding: 4px 4px 12px; }
.chips { display: grid; grid-template-columns: repeat(var(--chip-cols, 4), minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
.chips:empty { display: none; }
.chip {
  position: relative; height: 32px; border-radius: 16px; border: none; padding: 0 8px; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 600; color: var(--mdc-text2);
  background: color-mix(in srgb, var(--mdc-text) 5%, transparent);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: background-color 0.15s ease-out, color 0.15s ease-out;
}
.chip:hover { background: color-mix(in srgb, var(--mdc-text) 9%, transparent); }
.chip.active { background: var(--mdc-text); color: var(--primary-background-color, #121212); }
.chip:focus-visible, .row:focus-visible { outline: 2px solid var(--primary-color, #e08a00); outline-offset: -2px; }
.chip .chip-dot { position: absolute; top: 4px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--mdc-live); }
@container mdc (max-width: 500px) { .chip { font-size: 11px; padding: 0 4px; } }
.body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
.body.columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
@container mdc (min-width: 760px) { .body.auto.two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.pane[hidden] { display: none; }
.head { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 0 4px; font-size: 15px; font-weight: 600; color: var(--mdc-text); }
.head[hidden] { display: none; }
.head-icon { width: 18px; height: 18px; fill: currentColor; flex: 0 0 auto; }
.pane-matches .head { position: relative; min-height: 36px; }
.pane-table .head { min-height: 36px; }
.head-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head-note { font-size: 12px; font-weight: 500; color: var(--mdc-text2); white-space: nowrap; }
.head-prefix { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head-prefix[hidden] { display: none; }
.nav { display: flex; align-items: center; gap: 2px; min-width: 0; margin-left: -4px; }
.nav-btn, .nav-title, .nav-today, .retry {
  font: inherit; color: inherit; background: none; border: none; margin: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.nav-btn { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border-radius: 50%; color: var(--mdc-text); }
.nav-ic { width: 22px; height: 22px; fill: currentColor; }
.nav-btn:disabled { opacity: 0.25; cursor: default; }
.nav-title { display: flex; align-items: center; gap: 2px; min-width: 0; height: 36px; padding: 0 6px 0 8px; border-radius: 18px; font-weight: 600; }
.nav-title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.nav-caret { width: 18px; height: 18px; flex: 0 0 auto; fill: var(--mdc-text2); transition: transform 0.15s ease-out; }
.nav-title[aria-expanded="true"] .nav-caret { transform: rotate(180deg); }
.nav-today {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; margin-left: auto; height: 28px; padding: 0 10px 0 8px;
  border-radius: 14px; font-size: 12px; font-weight: 600; color: var(--primary-color, #e08a00);
  background: color-mix(in srgb, var(--primary-color, #e08a00) 14%, transparent);
}
.nav-today[hidden] { display: none; }
.nav-today-ic { width: 14px; height: 14px; fill: currentColor; }
/* Narrow card with the competition name in front (single competition): the round name
   ("Achtelfinale") gets the room, "Current" keeps only its icon (and its label for AT). */
@container mdc (max-width: 459px) {
  .head:has(.head-prefix:not([hidden])) { gap: 4px; }
  .head:has(.head-prefix:not([hidden])) .nav-today { width: 32px; padding: 0; justify-content: center; }
  .head:has(.head-prefix:not([hidden])) .nav-today span { display: none; }
}
@media (hover: hover) {
  .nav-btn:not(:disabled):hover, .nav-title:hover { background: var(--mdc-hover); }
  .nav-today:hover { background: color-mix(in srgb, var(--primary-color, #e08a00) 22%, transparent); }
}
.nav-btn:focus-visible, .nav-title:focus-visible, .nav-today:focus-visible, .retry:focus-visible {
  outline: 2px solid var(--primary-color, #e08a00); outline-offset: -2px;
}
.nav-bar { position: absolute; left: 4px; right: 4px; bottom: -4px; height: 2px; border-radius: 1px; overflow: hidden; opacity: 0; pointer-events: none; transition: opacity 0.15s; }
.nav-bar.on { opacity: 1; transition-delay: 0.15s; }
.nav-bar::before { content: ''; position: absolute; top: 0; bottom: 0; left: -35%; width: 35%; background: var(--primary-color, #e08a00); animation: mdc-bar 1.1s ease-in-out infinite; }
@keyframes mdc-bar { from { left: -35%; } to { left: 100%; } }
.head-wrap { position: relative; }
.picker {
  position: absolute; z-index: 6; top: calc(100% + 4px); left: 0; width: min(340px, 100%); max-height: min(360px, 60vh);
  overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box; padding: 4px;
  background: var(--matchday-popup-background, var(--card-background-color, var(--mdc-block)));
  border-radius: 12px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--mdc-line);
}
.picker[hidden] { display: none; }
.pk-item { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border-radius: 8px; cursor: pointer; font-size: 14px; outline: none; }
.pk-item:hover { background: var(--mdc-hover); }
.pk-item:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-color, #e08a00); }
.pk-item[aria-selected="true"] { font-weight: 700; background: color-mix(in srgb, var(--mdc-text) 9%, transparent); }
.pk-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-tag { flex: 0 0 auto; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--primary-color, #e08a00); }
.pk-date { flex: 0 0 auto; font-size: 12px; font-weight: 500; color: var(--mdc-text2); font-variant-numeric: tabular-nums; }
.list { transition: opacity 0.15s; }
.list.loading { opacity: 0.4; pointer-events: none; transition-delay: 0.15s; }
.retry-box { padding: 20px 12px; text-align: center; }
.retry-text { font-size: 13px; color: var(--mdc-text); }
.retry-detail { margin-top: 4px; font-size: 11px; color: var(--mdc-text2); overflow-wrap: anywhere; }
.retry {
  margin-top: 12px; min-height: 36px; padding: 0 16px; border-radius: 18px; font-size: 13px; font-weight: 600;
  color: var(--primary-color, #e08a00); background: color-mix(in srgb, var(--primary-color, #e08a00) 14%, transparent);
}
.zone-pad > .retry-box { padding: 8px 0 12px; }
.zone-load { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; font-size: 12px; color: var(--mdc-text2); }
.spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--mdc-line); border-top-color: var(--primary-color, #e08a00); animation: mdc-spin 0.8s linear infinite; }
@keyframes mdc-spin { to { transform: rotate(360deg); } }
.head-live { display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--mdc-live); text-transform: uppercase; }
.day-header { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mdc-text2); padding: 12px 4px 6px; }
.block { background: var(--mdc-block); border-radius: var(--mdc-radius); overflow: hidden; margin-bottom: 8px; }
.msg { padding: 24px 12px; text-align: center; font-size: 13px; color: var(--mdc-text2); }
.block > .row ~ .row { border-top: 1px solid var(--mdc-line); }
.row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: center;
  gap: 8px; min-height: 48px; padding: 0 12px; cursor: pointer; scroll-margin-top: 72px;
  transition: background-color 0.15s ease-out, box-shadow 0.15s ease-out, min-height 0.15s ease-out;
}
.compact .row { min-height: 40px; gap: 6px; }
.row:hover { background-color: var(--mdc-hover); }
.row.is-live { min-height: 56px; box-shadow: inset 3px 0 0 var(--mdc-live); }
.logo { width: 24px; height: 24px; background: var(--mdc-logo-bg); border-radius: 50%; padding: 2px; box-sizing: border-box; object-fit: contain; display: block; }
.compact .logo { width: 20px; height: 20px; }
.name { display: flex; align-items: center; min-width: 0; font-size: 13px; font-weight: 500; }
.name-right { justify-content: flex-end; }
.name-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sendoff { flex-shrink: 0; }
.so-chip { display: inline-block; margin-left: 3px; vertical-align: middle; }
.center { text-align: center; }
.c-stack { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.c-badge { font-size: 9px; font-weight: 600; letter-spacing: 0.04em; color: var(--mdc-text2); text-transform: uppercase; }
.c-pre { font-size: 14px; font-weight: 600; color: var(--mdc-text2); font-variant-numeric: tabular-nums; }
.c-countdown { font-size: 10px; font-weight: 500; color: var(--mdc-text2); font-variant-numeric: tabular-nums; }
.c-countdown:empty { display: none; }
.c-score, .c-post { font-size: 16px; font-weight: 800; color: var(--mdc-strong); font-variant-numeric: tabular-nums; white-space: nowrap; }
.c-sub { font-size: 10px; font-weight: 500; color: var(--mdc-text2); }
.c-extra { font-size: 10px; font-weight: 600; color: var(--mdc-text2); white-space: nowrap; }
.c-agg { font-size: 10px; font-weight: 600; color: var(--mdc-text2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.adv-chip { display: inline-block; margin-left: 4px; vertical-align: middle; font-size: 12px; font-weight: 800; line-height: 1; color: var(--matchday-advance-color, var(--success-color, #43a047)); }
.tie { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; padding: 2px 0 10px; font-size: 12px; color: var(--mdc-text2); font-variant-numeric: tabular-nums; }
.tie b { color: var(--mdc-text); font-weight: 700; }
.c-live { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--mdc-live); font-variant-numeric: tabular-nums; white-space: nowrap; }
.live-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--mdc-live); display: inline-block; flex: 0 0 auto; animation: mdc-pulse 1.4s ease-in-out infinite; }
@keyframes mdc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.c-score.flash { animation: mdc-flash 1.5s ease-out; }
@keyframes mdc-flash {
  0% { text-shadow: none; }
  15% { color: var(--mdc-live); text-shadow: 0 0 8px var(--mdc-live); }
  100% { color: var(--mdc-strong); text-shadow: none; }
}
@media (prefers-reduced-motion: reduce) {
  .live-dot { animation: none; }
  .c-score.flash { animation: none; color: var(--mdc-live); }
  .zone { transition: none; }
  .nav-caret { transition: none; }
  .nav-bar::before { animation: none; left: 0; width: 100%; opacity: 0.6; }
}
.zone { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 150ms ease-out; }
.zone.open { grid-template-rows: 1fr; border-top: 1px solid var(--mdc-line); }
.zone-inner { min-height: 0; overflow: hidden; background: var(--mdc-inset); cursor: default; }
.zone-pad { padding: 10px 12px; }
.tick-empty { padding: 10px 0; text-align: center; font-size: 12px; color: var(--mdc-text2); }
.tick-row { display: grid; grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr); gap: 6px; padding: 5px 0; border-top: 1px solid var(--mdc-line); }
.tick-row:first-child { border-top: none; }
.tick-side { min-width: 0; }
.tick-cell { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.tick-cell.away { flex-direction: row-reverse; text-align: right; }
.tick-goal { color: var(--mdc-text); font-weight: 600; }
.tick-card { color: var(--mdc-text2); }
.tick-sub { color: var(--mdc-text2); opacity: 0.9; }
.tick-mid { display: flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; font-weight: 700; color: var(--mdc-strong); font-size: 12px; white-space: nowrap; }
.tick-icon { flex: 0 0 14px; display: flex; align-items: center; justify-content: center; }
.tick-min { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.tick-label { flex: 1; min-width: 0; }
.so-head { margin-top: 8px; padding: 8px 0 4px; border-top: 1px solid var(--mdc-line); text-align: center; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mdc-text2); }
.so-head b { color: var(--mdc-strong); font-size: 12px; margin-left: 4px; }
.ic { display: inline-block; }
.ic-goal { width: 11px; height: 11px; background: ${GOAL_SVG} center/contain no-repeat; }
.ic-yellow { width: 8px; height: 11px; border-radius: 2px; background: #fdd835; }
.ic-red { width: 8px; height: 11px; border-radius: 2px; background: #c62828; }
.ic-yellowred { width: 8px; height: 11px; border-radius: 2px; background: #c62828; box-shadow: -3px -3px 0 #fdd835; margin: 3px 0 0 3px; }
.ic-sub { font-size: 10px; color: var(--mdc-text2); }
.stats { padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--mdc-line); }
.st-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; color: var(--mdc-text); opacity: 0.85; font-variant-numeric: tabular-nums; }
.st-h { text-align: right; }
.st-a { text-align: left; }
.st-l { text-align: center; font-size: 11px; color: var(--mdc-text2); }
.st-bar { display: flex; height: 4px; border-radius: 2px; overflow: hidden; margin: 2px 0 6px; background: var(--mdc-line); }
.st-bar-h { background: color-mix(in srgb, var(--mdc-text) 70%, transparent); }
.st-bar-a { background: color-mix(in srgb, var(--mdc-text) 25%, transparent); }
.lu-head { font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mdc-text2); padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--mdc-line); }
.lu-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 6px; }
.lu-col { min-width: 0; }
.lu-col + .lu-col { text-align: right; }
.lu-formation { font-size: 11px; font-weight: 700; color: var(--mdc-text2); margin-bottom: 4px; }
.lu-player { font-size: 11px; line-height: 1.5; color: var(--mdc-text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zone-footer { text-align: center; margin-top: 8px; border-top: 1px solid var(--mdc-line); }
.espn-link { display: block; padding: 12px 0 4px; font-size: 12px; color: var(--mdc-text2); text-decoration: none; }
.espn-link:hover { color: var(--mdc-text); }
.pane-table { container: mdc-table / inline-size; }
.tbl { margin-top: 12px; }
.tr {
  display: grid; grid-template-columns: 22px 22px minmax(0, 1fr) 22px 20px 20px 20px 44px 30px 28px;
  column-gap: 6px; align-items: center; min-height: 36px; padding: 0 10px 0 8px;
  font-size: 13px; font-variant-numeric: tabular-nums;
}
.tr + .tr { border-top: 1px solid var(--mdc-line); }
.tr.has-zone { box-shadow: inset 3px 0 0 var(--zone); }
.tr.th { min-height: 32px; font-size: 11px; font-weight: 600; color: var(--mdc-text2); }
.tr > span { text-align: center; white-space: nowrap; }
.tr > .c-team { text-align: left; display: flex; align-items: center; gap: 6px; min-width: 0; }
.c-rank { color: var(--mdc-text2); }
.c-pts { font-weight: 700; color: var(--mdc-strong); }
.tr.th .c-pts { color: var(--mdc-text2); }
.c-goals { color: var(--mdc-text2); }
.crest { width: 22px; height: 22px; object-fit: contain; display: block; }
.n-full, .n-short { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.n-short { display: none; }
.t-live { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; font-size: 11px; font-weight: 700; color: var(--mdc-live); }
.compact .wdl { display: none; }
.compact .tr { grid-template-columns: 22px 22px minmax(0, 1fr) 22px 44px 30px 28px; }
@container mdc-table (max-width: 439px) {
  .n-full { display: none; }
  .n-short { display: inline; }
  .tr { column-gap: 4px; padding: 0 8px 0 6px; }
}
@container mdc-table (max-width: 339px) {
  .wdl { display: none; }
  .tr { grid-template-columns: 22px 22px minmax(0, 1fr) 22px 44px 30px 28px; }
}
.legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; padding: 4px 12px 0; }
.legend:empty { display: none; }
.lg { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--mdc-text2); }
.lg-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
`;

  // ---------------------------------------------------------------------------
  // Card element
  // ---------------------------------------------------------------------------

  function storageGet(store, key) {
    try {
      return window[store].getItem(STORAGE_PREFIX + key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(store, key, value) {
    try {
      if (value == null) window[store].removeItem(STORAGE_PREFIX + key);
      else window[store].setItem(STORAGE_PREFIX + key, value);
    } catch (e) {
      // Storage may be unavailable (private mode, quota): the choice is just not kept.
    }
  }

  function stateOk(st, attr) {
    return !!(st && st.state !== 'unavailable' && st.state !== 'unknown' && st.attributes && Array.isArray(st.attributes[attr]));
  }

  const HTMLElementBase = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

  // Fetched matchdays and match details, shared by all cards of the page: HA re-creates
  // the cards when the dashboard view changes, the cache survives that.
  const MATCHDAY_STORE = new Map();
  const DETAILS_STORE = new Map();

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function setText(el, value) {
    if (el.textContent !== value) el.textContent = value;
  }

  class MatchdayCard extends HTMLElementBase {
    static getConfigElement() {
      return document.createElement(EDITOR_TAG);
    }

    static getStubConfig(hass) {
      return stubConfig(hass && hass.states);
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML =
        '<style>' + STYLE + '</style>' +
        '<div class="mdc">' +
        '<div class="title" hidden></div>' +
        '<div class="chips" role="tablist"></div>' +
        '<div class="body">' +
        '<section class="pane pane-matches"><div class="head-wrap"><div class="head"></div>' +
        '<div class="picker" id="mdc-picker" role="listbox" hidden></div></div><div class="list"></div></section>' +
        '<section class="pane pane-table" hidden><div class="head"></div><div class="table"></div><div class="legend-wrap"></div></section>' +
        '</div></div>';
      const $ = (sel) => this.shadowRoot.querySelector(sel);
      this._el = {
        root: $('.mdc'),
        title: $('.title'),
        chips: $('.chips'),
        body: $('.body'),
        headWrap: $('.pane-matches .head-wrap'),
        matchesHead: $('.pane-matches .head'),
        picker: $('.picker'),
        list: $('.pane-matches .list'),
        tablePane: $('.pane-table'),
        tableHead: $('.pane-table .head'),
        table: $('.pane-table .table'),
        legend: $('.pane-table .legend-wrap'),
      };
      this._el.root.addEventListener('click', (ev) => this._onClick(ev));
      this._el.root.addEventListener('keydown', (ev) => this._onKey(ev));
      // A crest that fails to load becomes an empty placeholder instead of the broken-image icon.
      this._el.root.addEventListener(
        'error',
        (ev) => {
          const img = ev.target;
          if (!(img instanceof HTMLImageElement)) return;
          const span = document.createElement('span');
          span.className = img.className;
          img.replaceWith(span);
        },
        true,
      );
      // Closes the matchday list on a tap outside of heading and list.
      this._outside = (ev) => {
        const path = ev.composedPath ? ev.composedPath() : [];
        if (path.indexOf(this._el.headWrap) === -1) this._closePicker(false);
      };
      this._awaiting = new Set();
      this._pickerOpen = false;
      this._timer = null;
      this._shown = null;
      this._openOther = null;
      this._reset();
    }

    _reset() {
      this._refs = null;
      this._structKey = null;
      this._fps = new Map();
      this._matchById = new Map();
      this._chipsKey = null;
      this._tableKey = null;
      this._headMode = null;
      this._headHtml = null;
      this._head = null;
      this._nav = null;
      this._other = false;
    }

    setConfig(config) {
      const cfg = normalizeConfig(config);
      this._config = cfg;
      this._closePicker(false);
      this._reset();
      // The matchday choice is not kept: a (re)configured card starts at the current one.
      this._shown = null;
      this._openOther = null;
      this._active = this._initialCompetition();
      this._el.root.classList.toggle('compact', cfg.compact);
      if (this._hass) this._render(true);
    }

    set hass(hass) {
      this._hass = hass;
      this._render(false);
    }

    get hass() {
      return this._hass;
    }

    getCardSize() {
      return this._config && this._tableEntity() ? 14 : 8;
    }

    getGridOptions() {
      // With a table the card lays matchday and table out side by side, so it takes the
      // full width of the section (a column_span 2 section has 24 grid columns).
      const withTable =
        this._config &&
        this._config.show_table &&
        !this._teamMode() &&
        this._config.competitions.some((c) => c.table_entity);
      return withTable ? { columns: 'full', min_columns: 6 } : { columns: 12, min_columns: 6 };
    }

    connectedCallback() {
      if (!this._timer) this._timer = setInterval(() => this._tick(), 30000);
      if (this._hass && this._config) this._render(true);
    }

    disconnectedCallback() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
      this._closePicker(false);
    }

    // --- state helpers --------------------------------------------------------

    _storeKey() {
      return this._config.competitions.map((c) => c.entity).join(',');
    }

    _initialCompetition() {
      const comps = this._config.competitions;
      if (comps.length === 1) return 0;
      const saved = storageGet('localStorage', 'active:' + this._storeKey());
      const fromStore = saved ? comps.findIndex((c) => c.entity === saved) : -1;
      if (fromStore !== -1) return fromStore;
      const configured = competitionIndex(comps, this._config.default_competition);
      return configured !== -1 ? configured : 0;
    }

    _teamMode() {
      return !!this._config.team;
    }

    _competition() {
      return this._config.competitions[this._active] || this._config.competitions[0];
    }

    _tableEntity() {
      if (this._teamMode() || !this._config.show_table) return null;
      const comp = this._competition();
      if (!comp.table_entity) return null;
      const st = this._hass && this._hass.states ? this._hass.states[comp.entity] : null;
      return tableInPhase(st && st.attributes ? st.attributes.phase : null) ? comp.table_entity : null;
    }

    _openKey() {
      return 'open:' + (this._teamMode() ? 'team:' + this._config.team : this._competition().entity);
    }

    _baseCtx() {
      const hass = this._hass;
      const lang = languageOf(this._config.language, hass);
      const locale = lang === 'de' ? 'de-DE' : (hass.locale && hass.locale.language) || hass.language || 'en-GB';
      const tf = hass.locale && hass.locale.time_format;
      const tz = hass.locale && hass.locale.time_zone === 'local' ? undefined : (hass.config && hass.config.time_zone) || undefined;
      return {
        lang,
        t: translator(lang),
        locale,
        tz,
        hour12: tf === '12' ? true : tf === '24' ? false : undefined,
        now: Date.now(),
        showLink: this._config.show_espn_link,
      };
    }

    _matchCtx(base, m, code) {
      const src = m._src;
      const c = src ? src.code : code;
      return Object.assign({}, base, {
        code: c,
        namePref: namePreference(this._config.names, c),
        badge: src ? src.badge : '',
      });
    }

    // --- matchday navigation ----------------------------------------------------

    // Navigation state of the active competition, or null without navigation (team mode,
    // switched off, headings hidden, or an integration without the `matchdays` attribute).
    _navInfo(st) {
      const cfg = this._config;
      if (this._teamMode() || !cfg.navigation || !cfg.show_header) return null;
      const list = matchdayList(st.attributes);
      if (!list) return null;
      const nav = navState(list, currentMatchdayOf(st.attributes, list), this._shown);
      if (!nav) return null;
      // Once the shown matchday is the current one, follow the sensor again.
      if (nav.isCurrent) this._shown = null;
      return Object.assign(nav, {
        list,
        entity: this._competition().entity,
        code: st.attributes.competition || null,
        season: toInt(st.attributes.season),
      });
    }

    _call(service, serviceData) {
      const conn = this._hass && this._hass.connection;
      if (!conn || typeof conn.sendMessagePromise !== 'function') {
        return Promise.reject(new Error('No connection to Home Assistant.'));
      }
      return conn.sendMessagePromise({
        type: 'call_service',
        domain: 'matchday',
        service,
        service_data: serviceData,
        return_response: true,
      });
    }

    // Re-render once a request (possibly started by another card) has finished.
    _watch(promise) {
      if (this._awaiting.has(promise)) return;
      this._awaiting.add(promise);
      promise.then(() => {
        this._awaiting.delete(promise);
        this._refreshView();
      });
    }

    _otherMatchday(base, comp, nav, prefix) {
      const key = matchdayCacheKey(nav.code, nav.season, nav.matchday);
      let r = MATCHDAY_STORE.get(key);
      if (needsFetch(r, base.now)) {
        const serviceData = { entity_id: nav.entity, matchday: nav.matchday };
        if (nav.season != null) serviceData.season = nav.season;
        const requested = nav.matchday;
        remoteLoad(
          MATCHDAY_STORE,
          key,
          () => this._call('get_matchday', serviceData).then((raw) => mapMatchdayResponse(raw, requested)),
          (data) => cacheTtl(data.matches),
        );
        r = MATCHDAY_STORE.get(key);
      }
      if (r && r.pending) this._watch(r.pending);
      const data = {
        identity: comp.entity + '#' + key,
        heading: prefix ? prefix + ' · ' + nav.name : nav.name,
        prefix,
        code: nav.code,
        nav,
        other: true,
        loading: !!(r && r.pending),
      };
      if (r && r.data) {
        data.matches = r.data.matches.map((m) => withDetails(m, this._detailsRecordData(nav.code, m)));
        // Keeps the details of an opened running match fresh (15 min / 1 min cache).
        const open = this._openOther != null && data.matches.find((m) => String(m.matchID) === this._openOther);
        if (open) this._loadDetails(nav.code, open);
        return data;
      }
      if (r && r.error) data.error = r.error;
      else data.pending = true;
      return data;
    }

    _detailsRecordData(code, m) {
      const r = DETAILS_STORE.get(detailsCacheKey(code, m.matchID));
      return r ? r.data : null;
    }

    // 'ready', 'loading' or 'error': matches of another matchday load their details
    // (substitutions, stats, line-ups) when they are opened.
    _detailStatus(code, m, other) {
      if (!other || m.status === 'pre') return 'ready';
      const r = DETAILS_STORE.get(detailsCacheKey(code, m.matchID));
      if (r && r.data) return 'ready';
      if (r && r.error) return 'error';
      return 'loading';
    }

    _loadDetails(code, m) {
      if (!m || m.status === 'pre') return;
      const key = detailsCacheKey(code, m.matchID);
      const r = DETAILS_STORE.get(key);
      if (r && r.pending) {
        this._watch(r.pending);
        return;
      }
      if (!needsFetch(r, Date.now())) return;
      const serviceData = { entity_id: this._competition().entity, match_id: m.matchID };
      const ttl = cacheTtl([m]);
      this._watch(
        remoteLoad(DETAILS_STORE, key, () => this._call('get_match_details', serviceData).then(mapDetailsResponse), () => ttl),
      );
    }

    _zoneHtml(m, ctx, status) {
      if (status === 'loading') return zoneLoadingHtml(ctx.t);
      if (status === 'error') {
        const r = DETAILS_STORE.get(detailsCacheKey(ctx.code, m.matchID));
        return zoneContentHtml(m, ctx, retryHtml(ctx.t('detailsError'), r && r.error, 'details', m.matchID, ctx.t));
      }
      return zoneContentHtml(m, ctx);
    }

    _goTo(target) {
      const nav = this._nav;
      if (!nav) return;
      const next = shownMatchday(target, nav.current);
      this._closePicker(false);
      if (next === this._shown) return;
      this._shown = next;
      this._openOther = null;
      if (next != null) {
        // Coming back to a matchday that failed to load tries again.
        const r = MATCHDAY_STORE.get(matchdayCacheKey(nav.code, nav.season, next));
        if (r && r.error && !r.pending) r.error = null;
      }
      this._refreshView();
    }

    _retry(kind, id) {
      if (kind === 'matchday') {
        const nav = this._nav;
        const r = nav && MATCHDAY_STORE.get(matchdayCacheKey(nav.code, nav.season, nav.matchday));
        if (r && !r.pending) r.error = null;
      } else if (kind === 'details') {
        const m = this._matchById.get(String(id));
        const r = m && DETAILS_STORE.get(detailsCacheKey(this._code, m.matchID));
        if (r && !r.pending) r.error = null;
        if (m) this._loadDetails(this._code, m);
      }
      this._refreshView();
    }

    _openPicker() {
      const nav = this._nav;
      if (!nav || this._pickerOpen || !this._head) return;
      const picker = this._el.picker;
      const base = this._baseCtx();
      picker.innerHTML = pickerHtml(nav.list, nav, base);
      picker.setAttribute('aria-label', base.t('navPick'));
      picker.hidden = false;
      this._pickerOpen = true;
      this._head.title.setAttribute('aria-expanded', 'true');
      const sel = picker.querySelector('.pk-item[aria-selected="true"]');
      if (sel) {
        picker.scrollTop = Math.max(0, sel.offsetTop - (picker.clientHeight - sel.offsetHeight) / 2);
        sel.focus({ preventScroll: true });
      }
      window.addEventListener('pointerdown', this._outside, true);
    }

    _closePicker(refocus) {
      if (!this._pickerOpen) return;
      this._pickerOpen = false;
      this._el.picker.hidden = true;
      this._el.picker.innerHTML = '';
      if (this._head) {
        this._head.title.setAttribute('aria-expanded', 'false');
        if (refocus) this._head.title.focus();
      }
      window.removeEventListener('pointerdown', this._outside, true);
    }

    // Renders matchday list and table outside of a hass update (navigation, loaded data).
    _refreshView() {
      if (!this._config || !this._hass || !this._hass.states) return;
      try {
        const base = this._baseCtx();
        this._renderMatches(base, this._today || dayKeyOf(base.now, base.tz), false);
        this._renderTable(base, false);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('matchday-card:', e);
      }
    }

    // --- rendering ------------------------------------------------------------

    _render(force) {
      const cfg = this._config;
      const hass = this._hass;
      if (!cfg || !hass || !hass.states) return;
      const ids = [];
      cfg.competitions.forEach((c) => {
        ids.push(c.entity);
        if (c.table_entity) ids.push(c.table_entity);
      });
      const refs = ids.map((id) => hass.states[id]);
      const base = this._baseCtx();
      const today = dayKeyOf(base.now, base.tz);
      const dark = !!(hass.themes && hass.themes.darkMode);
      const sameRefs = this._refs && this._refs.length === refs.length && this._refs.every((r, i) => r === refs[i]);
      if (!force && sameRefs && this._today === today && this._lang === base.lang && this._dark === dark) return;
      this._refs = refs;
      this._today = today;
      this._lang = base.lang;
      this._dark = dark;
      this.toggleAttribute('dark', dark);

      this._el.title.hidden = !cfg.title;
      this._el.title.textContent = cfg.title || '';
      this._renderChips(base);
      this._renderMatches(base, today, force);
      this._renderTable(base, force);
    }

    _renderChips(base) {
      const cfg = this._config;
      const comps = cfg.competitions;
      if (comps.length < 2 || this._teamMode()) {
        if (this._chipsKey !== '') this._el.chips.innerHTML = '';
        this._chipsKey = '';
        return;
      }
      const hass = this._hass;
      const chips = comps.map((c, i) => {
        const st = hass.states[c.entity];
        const code = st && st.attributes && st.attributes.competition;
        const info = competitionInfo(code);
        const label = c.name || (info && info.name) || (st && st.attributes && st.attributes.friendly_name) || c.entity;
        return { label, live: stateOk(st, 'matches') && hasLiveMatch(st.attributes.matches), active: i === this._active };
      });
      const key = JSON.stringify(chips) + base.lang;
      if (key === this._chipsKey) return;
      this._chipsKey = key;
      this._el.chips.style.setProperty('--chip-cols', String(cfg.chip_columns || Math.min(comps.length, 4)));
      this._el.chips.innerHTML = chips
        .map(
          (c, i) =>
            '<button class="chip' + (c.active ? ' active' : '') + '" role="tab" aria-selected="' + (c.active ? 'true' : 'false') +
            '" data-index="' + i + '" title="' + escHtml(c.label) + '">' + escHtml(c.label) +
            (c.live ? '<span class="chip-dot" aria-label="' + escHtml(base.t('live')) + '"></span>' : '') + '</button>',
        )
        .join('');
    }

    _collectMatches(base) {
      const cfg = this._config;
      const hass = this._hass;
      if (this._teamMode()) {
        const sources = cfg.competitions.map((c) => {
          const st = hass.states[c.entity];
          const ok = stateOk(st, 'matches');
          const code = ok ? st.attributes.competition : null;
          const info = competitionInfo(code);
          return { ok, code, badge: c.short || (info && info.badge) || c.name || '', matches: ok ? st.attributes.matches : [] };
        });
        if (sources.every((s) => !s.ok)) return { unavailable: true, heading: cfg.team };
        const all = collectTeamMatches(sources, cfg.team);
        return {
          identity: 'team:' + cfg.team,
          heading: cfg.team,
          code: null,
          matches: selectTeamWindow(all, cfg.limit, base.now),
        };
      }
      const comp = this._competition();
      const st = hass.states[comp.entity];
      if (!stateOk(st, 'matches')) return { unavailable: true, identity: comp.entity, heading: comp.name || '' };
      const single = cfg.competitions.length === 1;
      const prefix = single && comp.name ? comp.name : null;
      const nav = this._navInfo(st);
      if (nav && !nav.isCurrent) return this._otherMatchday(base, comp, nav, prefix);
      return {
        identity: comp.entity,
        heading: prefix ? prefix + ' · ' + st.state : st.state,
        prefix,
        code: st.attributes.competition,
        nav,
        matches: sortMatches(st.attributes.matches),
      };
    }

    // Plain heading, or the navigation (‹ 4. Spieltag ›) patched in place.
    _renderHead(base, data) {
      const head = this._el.matchesHead;
      head.hidden = !this._config.show_header;
      const nav = data.nav || null;
      this._nav = nav;
      if (!nav) {
        this._closePicker(false);
        const html = headHtml(ICON_GRID, data.heading || '');
        if (this._headMode !== 'plain' || this._headHtml !== html) head.innerHTML = html;
        this._headMode = 'plain';
        this._headHtml = html;
        this._head = null;
        return;
      }
      if (this._headMode !== 'nav' || this._headLang !== base.lang) {
        this._closePicker(false);
        head.innerHTML = navHeadHtml(base.t);
        const q = (sel) => head.querySelector(sel);
        this._head = {
          prefix: q('.head-prefix'),
          prev: q('.nav-prev'),
          next: q('.nav-next'),
          title: q('.nav-title'),
          text: q('.nav-title-text'),
          today: q('.nav-today'),
          bar: q('.nav-bar'),
        };
        this._headMode = 'nav';
        this._headLang = base.lang;
        this._headHtml = null;
      }
      const h = this._head;
      const t = base.t;
      const active = this.shadowRoot.activeElement;
      setText(h.prefix, data.prefix ? data.prefix + ' ·' : '');
      h.prefix.hidden = !data.prefix;
      setText(h.text, nav.name);
      setAttr(h.title, 'aria-label', nav.name + ', ' + t('navPick'));
      setAttr(h.title, 'aria-controls', 'mdc-picker');
      setAttr(h.title, 'title', t('navPick'));
      [
        [h.prev, nav.prev, 'navPrev'],
        [h.next, nav.next, 'navNext'],
      ].forEach(([btn, target, key]) => {
        btn.disabled = !target;
        const label = t(key, { name: target ? target.name : '' }).replace(/[:\s]+$/, '');
        setAttr(btn, 'aria-label', label);
        setAttr(btn, 'title', label);
        btn.dataset.md = target ? String(target.matchday) : '';
      });
      h.today.hidden = nav.isCurrent;
      setAttr(h.today, 'title', t('navCurrentTitle', { name: nav.currentName }));
      setAttr(h.today, 'aria-label', t('navCurrentTitle', { name: nav.currentName }));
      h.bar.classList.toggle('on', !!(data.loading || data.pending));
      // A button that just got disabled or hidden would drop the keyboard focus.
      if (active && head.contains(active) && (active.disabled || active.hidden)) h.title.focus();
    }

    _renderMatches(base, today, force) {
      const data = this._collectMatches(base);
      this._renderHead(base, data);
      const list = this._el.list;
      // Another matchday on its way: the previous list stays (dimmed) until it is there.
      list.classList.toggle('loading', !!data.pending);
      setAttr(list, 'aria-busy', data.pending || data.loading ? 'true' : 'false');
      if (data.pending) return;
      if (data.error) {
        const key = [data.identity, 'error', data.error, base.lang].join('|');
        if (this._structKey !== key) {
          list.innerHTML = '<div class="block">' + retryHtml(base.t('loadError'), data.error, 'matchday', null, base.t) + '</div>';
          this._structKey = key;
          this._fps = new Map();
          this._matchById = new Map();
        }
        return;
      }
      if (data.unavailable) {
        list.innerHTML = '<div class="block msg">' + escHtml(base.t('unavailable')) + '</div>';
        this._structKey = null;
        this._matchById = new Map();
        return;
      }
      const matches = data.matches;
      const structKey = [data.identity, today, base.lang, matches.map((m) => m.matchID).join(',')].join('|');
      if (!force && structKey === this._structKey) {
        this._patch(base, data, matches);
        return;
      }
      this._structKey = structKey;
      this._rebuild(base, data, matches, today);
    }

    _rebuild(base, data, matches, today) {
      this._fps = new Map();
      this._matchById = new Map();
      this._code = data.code;
      this._other = !!data.other;
      if (!matches.length) {
        // Another matchday without matches: a cup round that is not drawn yet.
        const text = this._teamMode()
          ? base.t('noTeamMatches', { team: this._config.team })
          : base.t(this._other ? 'noFixtures' : 'noMatches');
        this._el.list.innerHTML = '<div class="block msg">' + escHtml(text) + '</div>';
        return;
      }
      // The opened match of another matchday is only kept in memory.
      const openId = this._other ? this._openOther : storageGet('sessionStorage', this._openKey());
      let html = '';
      groupByDay(matches, base.tz).forEach((g) => {
        html += '<div class="day-header">' + escHtml(dayHeaderText(g.items[0].matchDateTimeUTC, g.key, today, base)) + '</div><div class="block">';
        g.items.forEach((m) => {
          const id = String(m.matchID);
          const ctx = this._matchCtx(base, m, data.code);
          const open = openId === id;
          const status = this._detailStatus(data.code, m, this._other);
          this._matchById.set(id, m);
          this._fps.set(id, JSON.stringify(m) + '|' + status);
          html +=
            rowHtml(m, ctx, open) +
            '<div class="zone' + (open ? ' open' : '') + '" data-zone="' + escHtml(id) + '"' + (open ? ' data-built="1"' : '') +
            '><div class="zone-inner">' + (open ? this._zoneHtml(m, ctx, status) : '') + '</div></div>';
        });
        html += '</div>';
      });
      this._el.list.innerHTML = html;
    }

    _patch(base, data, matches) {
      const other = !!data.other;
      matches.forEach((m) => {
        const id = String(m.matchID);
        const status = this._detailStatus(data.code, m, other);
        const fp = JSON.stringify(m) + '|' + status;
        const old = this._matchById.get(id);
        this._matchById.set(id, m);
        if (this._fps.get(id) === fp) return;
        this._fps.set(id, fp);
        const ctx = this._matchCtx(base, m, data.code);
        const row = this._el.list.querySelector('.row[data-id="' + CSS.escape(id) + '"]');
        if (row) {
          row.classList.toggle('is-live', m.status === 'live');
          const center = row.querySelector('.center');
          const html = centerHtml(m, ctx);
          if (center.innerHTML !== html) {
            center.innerHTML = html;
            if (old && isLive(m) && m.live_score && old.live_score !== m.live_score) this._flash(center);
          }
          [
            ['.name-left', m.team1, 'team1', '.logo1'],
            ['.name-right', m.team2, 'team2', '.logo2'],
          ].forEach(([sel, team, key, logoSel]) => {
            const cell = row.querySelector(sel);
            const text = teamDisplayName(team, ctx.namePref);
            const textEl = cell.querySelector('.name-text');
            if (textEl.textContent !== text) textEl.textContent = text;
            const so = sideIcons(m, key);
            const soEl = cell.querySelector('.sendoff');
            if (soEl.innerHTML !== so) soEl.innerHTML = so;
            const logo = row.querySelector(logoSel);
            const src = (team && team.teamIconUrl) || '';
            if (logo && logo.tagName === 'IMG' && logo.getAttribute('src') !== src) logo.setAttribute('src', src);
          });
        }
        const zone = this._el.list.querySelector('.zone[data-zone="' + CSS.escape(id) + '"]');
        if (zone && zone.dataset.built) {
          const inner = zone.querySelector('.zone-inner');
          const html = this._zoneHtml(m, ctx, status);
          if (inner.innerHTML !== html) inner.innerHTML = html;
        }
      });
    }

    _renderTable(base, force) {
      const pane = this._el.tablePane;
      const entity = this._tableEntity();
      const layout = this._config.layout;
      const body = this._el.body;
      body.className = 'body ' + layout + (entity ? ' two' : '');
      if (!entity) {
        pane.hidden = true;
        this._tableKey = null;
        return;
      }
      pane.hidden = false;
      const st = this._hass.states[entity];
      // The table is always the current one: next to another matchday its heading says so,
      // its live markers belong to the current matchday.
      const nav = this._nav;
      const note = nav && !nav.isCurrent ? base.t('tableAsOf', { name: nav.currentName }) : '';
      const key = [entity, base.lang, this._active, note].join('|');
      if (!force && this._tableKey === key && this._tableState === st) return;
      this._tableKey = key;
      this._tableState = st;
      const head = this._el.tableHead;
      head.hidden = !this._config.show_header;
      if (!stateOk(st, 'table')) {
        head.innerHTML = headHtml(ICON_TABLE, base.t('table'));
        this._el.table.innerHTML = '<div class="block msg tbl">' + escHtml(base.t('tableUnavailable')) + '</div>';
        this._el.legend.innerHTML = '';
        return;
      }
      const comp = this._competition();
      const matchState = this._hass.states[comp.entity];
      const code = st.attributes.competition || (matchState && matchState.attributes && matchState.attributes.competition);
      const zones = comp.zones != null ? comp.zones : defaultZones(code);
      const rows = st.attributes.table;
      const live = st.attributes.live || rows.some((r) => r.live);
      head.innerHTML = headHtml(
        ICON_TABLE,
        base.t('table'),
        (note ? '<span class="head-note">· ' + escHtml(note) + '</span>' : '') +
          (live ? '<span class="head-live"><span class="live-dot"></span>' + escHtml(base.t('live')) + '</span>' : ''),
      );
      const ctx = Object.assign({}, base, { zones, namePref: namePreference(this._config.names, code) });
      this._el.table.innerHTML = tableHtml(rows, ctx);
      this._el.legend.innerHTML = this._config.show_legend ? legendHtml(legendItems(zones, rows.length, base.t)) : '';
    }

    // --- interaction ----------------------------------------------------------

    _onClick(ev) {
      const path = ev.composedPath ? ev.composedPath() : [];
      const target = path.length ? path[0] : ev.target;
      if (!(target instanceof Element)) return;
      if (target.closest('a')) return;
      const chip = target.closest('.chip');
      if (chip) {
        this._select(Number(chip.dataset.index));
        return;
      }
      const item = target.closest('.pk-item');
      if (item) {
        this._closePicker(true);
        this._goTo(Number(item.dataset.md));
        return;
      }
      const step = target.closest('.nav-prev, .nav-next');
      if (step) {
        if (!step.disabled && step.dataset.md) this._goTo(Number(step.dataset.md));
        return;
      }
      if (target.closest('.nav-title')) {
        if (this._pickerOpen) this._closePicker(false);
        else this._openPicker();
        return;
      }
      if (target.closest('.nav-today')) {
        this._goTo(null);
        return;
      }
      const retry = target.closest('.retry');
      if (retry) {
        this._retry(retry.dataset.kind, retry.dataset.id);
        return;
      }
      const row = target.closest('.row');
      if (row) this._toggle(row.dataset.id);
    }

    _onKey(ev) {
      const el = ev.target instanceof Element ? ev.target : null;
      if (!el) return;
      if (this._pickerOpen && el.closest('.picker')) {
        const items = Array.from(this._el.picker.querySelectorAll('.pk-item'));
        const cur = el.closest('.pk-item');
        const i = pickerIndex(ev.key, items.indexOf(cur), items.length);
        if (i != null) {
          ev.preventDefault();
          items[i].focus();
        } else if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          if (cur) {
            this._closePicker(true);
            this._goTo(Number(cur.dataset.md));
          }
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          this._closePicker(true);
        } else if (ev.key === 'Tab') {
          // Back to the heading; the Tab then continues from there.
          this._closePicker(true);
        }
        return;
      }
      if (ev.key === 'Escape' && this._pickerOpen) {
        ev.stopPropagation();
        this._closePicker(true);
        return;
      }
      if (el.closest('.nav-title') && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
        ev.preventDefault();
        this._openPicker();
        return;
      }
      if (el.closest('.nav, .nav-today') && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
        ev.preventDefault();
        const nav = this._nav;
        const target = nav && (ev.key === 'ArrowLeft' ? nav.prev : nav.next);
        if (target) this._goTo(target.matchday);
        return;
      }
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const row = el.closest('.row');
      if (!row) return;
      ev.preventDefault();
      this._toggle(row.dataset.id);
    }

    _select(index) {
      if (!(index >= 0) || index === this._active) return;
      this._active = index;
      // Another competition starts at its current matchday.
      this._shown = null;
      this._openOther = null;
      this._closePicker(false);
      storageSet('localStorage', 'active:' + this._storeKey(), this._config.competitions[index].entity);
      this._render(true);
    }

    // Accordion: at most one match open at a time.
    _toggle(id) {
      const list = this._el.list;
      const zone = list.querySelector('.zone[data-zone="' + CSS.escape(id) + '"]');
      if (!zone) return;
      const willOpen = !zone.classList.contains('open');
      list.querySelectorAll('.zone.open').forEach((z) => {
        if (z !== zone) {
          z.classList.remove('open');
          const r = list.querySelector('.row[data-id="' + CSS.escape(z.dataset.zone) + '"]');
          if (r) r.setAttribute('aria-expanded', 'false');
        }
      });
      if (this._other) this._openOther = willOpen ? id : null;
      else storageSet('sessionStorage', this._openKey(), willOpen ? id : null);
      const row = list.querySelector('.row[data-id="' + CSS.escape(id) + '"]');
      if (row) row.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      if (!willOpen) {
        zone.classList.remove('open');
        return;
      }
      const m = this._matchById.get(id);
      if (m) {
        if (this._other) this._loadDetails(this._code, m);
        const ctx = this._matchCtx(this._baseCtx(), m, this._code);
        zone.querySelector('.zone-inner').innerHTML = this._zoneHtml(m, ctx, this._detailStatus(this._code, m, this._other));
        zone.dataset.built = '1';
      }
      zone.classList.add('open');
      // A match closing above moves the opened one up: bring its row back to the top
      // (scroll-margin-top keeps it clear of the HA toolbar) once the animation ran.
      if (row && row.scrollIntoView) setTimeout(() => row.scrollIntoView({ block: 'start', behavior: 'smooth' }), 260);
    }

    _flash(center) {
      const el = center.querySelector('.c-score');
      if (!el) return;
      el.classList.remove('flash');
      void el.offsetWidth; // restart the animation
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
    }

    _tick() {
      try {
        if (!this._hass || !this._config) return;
        const base = this._baseCtx();
        if (dayKeyOf(base.now, base.tz) !== this._today) {
          this._render(true);
          return;
        }
        // Another matchday: refetches it (and an opened match) once the cache ran out.
        if (this._shown != null) this._refreshView();
        this._matchById.forEach((m, id) => {
          if (m.status !== 'pre') return;
          const el = this._el.list.querySelector('.row[data-id="' + CSS.escape(id) + '"] .c-countdown');
          if (!el) return;
          const cd = countdownText(m.matchDateTimeUTC, base.now) || '';
          if (el.textContent !== cd) el.textContent = cd;
        });
      } catch (e) {
        // A timer must never throw.
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Editor (single competition; multi-competition setups are edited in YAML)
  // ---------------------------------------------------------------------------

  const EDITOR_LABELS = {
    de: {
      entity: 'Spieltag-Sensor',
      table_entity: 'Tabellen-Sensor (optional)',
      name: 'Name (optional)',
      title: 'Titel (optional)',
      show_table: 'Tabelle anzeigen',
      show_legend: 'Legende anzeigen',
      show_header: 'Überschriften anzeigen',
      show_espn_link: 'ESPN-Link anzeigen',
      navigation: 'Spieltag-Navigation',
      compact: 'Kompakt',
      layout: 'Anordnung',
      names: 'Vereinsnamen',
      multi: 'Diese Karte nutzt mehrere Wettbewerbe oder den Team-Modus. Wettbewerbe bitte im YAML-Editor bearbeiten; hier nur die Anzeige-Optionen.',
    },
    en: {
      entity: 'Matchday sensor',
      table_entity: 'Table sensor (optional)',
      name: 'Name (optional)',
      title: 'Title (optional)',
      show_table: 'Show table',
      show_legend: 'Show legend',
      show_header: 'Show headings',
      show_espn_link: 'Show ESPN link',
      navigation: 'Matchday navigation',
      compact: 'Compact',
      layout: 'Layout',
      names: 'Team names',
      multi: 'This card uses several competitions or the team mode. Edit the competitions in the YAML editor; only the display options are available here.',
    },
  };

  function editorSchema(multi, lang) {
    const de = lang === 'de';
    const display = [
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'show_table', selector: { boolean: {} } },
          { name: 'show_legend', selector: { boolean: {} } },
          { name: 'show_header', selector: { boolean: {} } },
          { name: 'show_espn_link', selector: { boolean: {} } },
          { name: 'navigation', selector: { boolean: {} } },
          { name: 'compact', selector: { boolean: {} } },
        ],
      },
      {
        type: 'grid',
        name: '',
        schema: [
          {
            name: 'layout',
            selector: {
              select: {
                mode: 'dropdown',
                options: [
                  { value: 'auto', label: de ? 'Automatisch' : 'Automatic' },
                  { value: 'stacked', label: de ? 'Untereinander' : 'Stacked' },
                  { value: 'columns', label: de ? 'Nebeneinander' : 'Side by side' },
                ],
              },
            },
          },
          {
            name: 'names',
            selector: {
              select: {
                mode: 'dropdown',
                options: [
                  { value: 'auto', label: de ? 'Automatisch' : 'Automatic' },
                  { value: 'short', label: de ? 'Kurz' : 'Short' },
                  { value: 'full', label: de ? 'Voll' : 'Full' },
                ],
              },
            },
          },
        ],
      },
    ];
    if (multi) return [{ name: 'title', selector: { text: {} } }].concat(display);
    return [
      { name: 'entity', required: true, selector: { entity: { domain: 'sensor', integration: 'matchday' } } },
      { name: 'table_entity', selector: { entity: { domain: 'sensor', integration: 'matchday' } } },
      { type: 'grid', name: '', schema: [{ name: 'name', selector: { text: {} } }, { name: 'title', selector: { text: {} } }] },
    ].concat(display);
  }

  class MatchdayCardEditor extends HTMLElementBase {
    setConfig(config) {
      this._config = Object.assign({}, config);
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
      else this._render();
    }

    _render() {
      if (!this._hass || !this._config) return;
      const lang = languageOf(null, this._hass);
      const labels = EDITOR_LABELS[lang];
      const multi = Array.isArray(this._config.competitions) || !!this._config.team;
      if (!this._form || this._multi !== multi) {
        this.innerHTML = '';
        if (multi) {
          const note = document.createElement('p');
          note.style.cssText = 'margin:0 0 12px;color:var(--secondary-text-color);font-size:13px;';
          note.textContent = labels.multi;
          this.appendChild(note);
        }
        this._form = document.createElement('ha-form');
        this._form.computeLabel = (s) => labels[s.name] || s.name;
        this._form.addEventListener('value-changed', (ev) => this._changed(ev.detail.value));
        this.appendChild(this._form);
        this._multi = multi;
      }
      const defaults = { show_table: true, show_legend: true, show_header: true, show_espn_link: true, navigation: true, compact: false, layout: 'auto', names: 'auto' };
      this._form.hass = this._hass;
      this._form.schema = editorSchema(multi, lang);
      this._form.data = Object.assign({}, defaults, this._config);
    }

    _changed(value) {
      const defaults = { show_table: true, show_legend: true, show_header: true, show_espn_link: true, navigation: true, compact: false, layout: 'auto', names: 'auto' };
      const config = Object.assign({}, this._config, value);
      Object.keys(config).forEach((k) => {
        if (config[k] === '' || config[k] == null || (k in defaults && config[k] === defaults[k] && !(k in this._config))) delete config[k];
      });
      this._config = config;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    }
  }

  // ---------------------------------------------------------------------------
  // Registration / exports
  // ---------------------------------------------------------------------------

  if (typeof customElements !== 'undefined') {
    if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, MatchdayCard);
    if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, MatchdayCardEditor);
    window.customCards = window.customCards || [];
    if (!window.customCards.some((c) => c.type === CARD_TAG)) {
      window.customCards.push({
        type: CARD_TAG,
        name: 'Matchday Card',
        description: 'Matchday with live scores, ticker and live table for the Matchday integration.',
        preview: true,
        documentationURL: 'https://github.com/nuggie/matchday-card',
      });
    }
    // eslint-disable-next-line no-console
    console.info('%c MATCHDAY-CARD %c ' + VERSION + ' ', 'color:#fff;background:#2e7d32;font-weight:700', 'color:#2e7d32;background:#fff');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      VERSION,
      COMPETITIONS,
      DEFAULT_ZONES,
      STRINGS,
      escHtml,
      languageOf,
      translator,
      parseMinute,
      minuteBase,
      compareEvents,
      isShootoutKick,
      splitScorers,
      shootoutResult,
      shootoutTally,
      runningScores,
      findHalftimeScore,
      finalScoreOf,
      isAfterExtraTime,
      isLive,
      hasLiveMatch,
      teamDisplayName,
      namePreference,
      countdownText,
      dayKeyOf,
      dayHeaderText,
      formatKickoff,
      sortMatches,
      groupByDay,
      collectTeamMatches,
      selectTeamWindow,
      resolveZone,
      defaultZones,
      legendItems,
      formatDiff,
      tieOf,
      tieLine,
      advanceIcon,
      tableInPhase,
      tieHtml,
      matchdayList,
      currentMatchdayOf,
      navState,
      shownMatchday,
      pickerIndex,
      matchdayDates,
      matchdayCacheKey,
      detailsCacheKey,
      cacheTtl,
      needsFetch,
      remoteLoad,
      errorText,
      mapMatchdayResponse,
      mapDetailsResponse,
      withDetails,
      CACHE_TTL_OPEN,
      CACHE_TTL_LIVE,
      CACHE_TTL_RETRY,
      normalizeConfig,
      competitionIndex,
      stubConfig,
      centerHtml,
      buildTickerEvents,
      shootoutHtml,
      zoneContentHtml,
      tableHtml,
      pickerHtml,
      navHeadHtml,
      editorSchema,
    };
  }
})();
