// Mock of `hass.connection` for the dev harness: answers the actions of the Matchday
// integration >= 0.4.0 (matchday.get_matchday, matchday.get_match_details) from the
// fixtures, with simulated latency and optional failures.
//
// options:
//   latency        ms per get_matchday call (default 600)
//   detailsLatency ms per get_match_details call (default: latency)
//   failOnce       keys whose first call fails: "<competition>|<matchday>" or "details:<matchID>"
//   responses      extra get_matchday answers by "<competition>|<matchday>" (win over the fixtures)
//   details        extra get_match_details answers by match id
//
// Matchdays without a recorded answer (fixtures/get_matchday.json) are synthesized from the
// sensor's current matches, moved to the matchday's first kick-off (pairings are not real).

const clone = (x) => JSON.parse(JSON.stringify(x));
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Home Assistant rejects with plain { code, message } objects.
const haError = (code, message) => ({ code, message });

function synthesize(st, entry, nowMs) {
  const a = st.attributes;
  if (!entry.first_kickoff) return { matches: [] };
  const current = a.matches || [];
  const base = Math.min(...current.map((m) => Date.parse(m.matchDateTimeUTC)));
  const shift = Date.parse(entry.first_kickoff) - base;
  const matches = current.map((src, i) => {
    const m = clone(src);
    m.matchID = 9000000 + entry.matchday * 100 + i;
    m.matchDateTimeUTC = new Date(Date.parse(src.matchDateTimeUTC) + shift).toISOString().replace('.000Z', 'Z');
    m.group = { groupName: entry.name, groupOrderID: entry.matchday, groupID: 0 };
    Object.assign(m, { substitutions: [], stats: null, lineups: null, ht_score: null, pso: null });
    if (Date.parse(m.matchDateTimeUTC) > nowMs) {
      Object.assign(m, { status: 'pre', minute: null, live_score: null, scorers: [], cards: [], matchResults: [], goals: [], matchIsFinished: false, oldb_score: null });
    }
    return m;
  });
  return { matches };
}

export function createConnection({ fixtures, getStates, options = {} }) {
  const recorded = Object.assign({}, fixtures['get_matchday'], options.responses);
  const details = Object.assign({}, fixtures['get_match_details'], options.details);
  const latency = options.latency == null ? 600 : options.latency;
  const detailsLatency = options.detailsLatency == null ? latency : options.detailsLatency;
  const failOnce = new Set(options.failOnce || []);
  const calls = [];

  async function getMatchday(st, sd) {
    const a = st.attributes;
    const code = a.competition;
    // As the integration: without `matchday` only the sensor's season has a default.
    if (sd.matchday == null && sd.season != null && sd.season !== a.season) {
      throw haError('service_validation_error', 'A matchday is required for season ' + sd.season + '.');
    }
    const n = sd.matchday == null ? a.matchday : Number(sd.matchday);
    await sleep(latency);
    const key = code + '|' + n;
    if (failOnce.delete(key)) throw haError('home_assistant_error', 'OpenLigaDB: Zeitüberschreitung beim Abruf von ' + key);
    const entry = (a.matchdays || []).find((x) => x.matchday === n);
    if (!entry) throw haError('service_validation_error', 'Matchday ' + n + ' does not exist in season ' + a.season + '.');
    if (sd.season != null && sd.season !== a.season) throw haError('service_validation_error', 'Only season ' + a.season + ' is available.');
    const current = n === a.matchday;
    const body = current ? { matches: a.matches } : recorded[key] || synthesize(st, entry, Date.now());
    // A cup round without fixtures: the integration answers with the bare minimum.
    if (!current && !body.matches.length) return { name: entry.name, matches: [], is_current: false };
    return {
      competition: code,
      season: a.season,
      matchday: n,
      name: entry.name,
      is_current: current,
      matches: clone(body.matches),
    };
  }

  async function getMatchDetails(st, sd) {
    await sleep(detailsLatency);
    if (failOnce.delete('details:' + sd.match_id)) throw haError('home_assistant_error', 'ESPN: summary ' + sd.match_id + ' unavailable (HTTP 503)');
    const d = details[String(sd.match_id)];
    // Matches that did not start yet: empty fields, no error.
    return d ? clone(d) : { match_id: sd.match_id, substitutions: [], stats: null, lineups: null, ht_score: null, pso: null };
  }

  return {
    calls,
    async sendMessagePromise(msg) {
      calls.push(clone(msg));
      if (msg.type !== 'call_service') throw haError('unknown_command', 'Unknown command.');
      if (msg.domain !== 'matchday' || !['get_matchday', 'get_match_details'].includes(msg.service)) {
        throw haError('not_found', 'Action ' + msg.domain + '.' + msg.service + ' not found.');
      }
      if (!msg.return_response) throw haError('service_validation_error', 'An action which does not return responses cannot be called with return_response=True');
      const sd = msg.service_data || {};
      const st = getStates()[sd.entity_id];
      if (!st || !st.attributes || !st.attributes.competition) {
        throw haError('service_validation_error', 'Entity ' + sd.entity_id + ' is not a Matchday matchday sensor.');
      }
      const response = msg.service === 'get_matchday' ? await getMatchday(st, sd) : await getMatchDetails(st, sd);
      return { context: { id: 'mock', parent_id: null, user_id: null }, response };
    },
  };
}
