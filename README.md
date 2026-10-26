# Matchday Card

Lovelace card for the [Matchday](https://github.com/nuggie/ha-matchday) integration: the current matchday of a
football competition with live scores, goal scorers, cards, substitutions, stats and line-ups, plus the live table
with coloured zones. Several competitions fit into one card with chips to switch between them, and you can browse
through all matchdays of the season.

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=nuggie&repository=matchday-card&category=plugin)

![Matchday and live table, desktop](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/live-desktop.png)

## Features

- **Matchday** grouped by day (with "today" marker): kick-off time and countdown (last two hours), live score with
  minute including stoppage time, half-time score, half-time marker, full-time score, red cards next to the team name.
  Running matches are marked and flash when the score changes.
- **Match details** on tap (one match open at a time): ticker with goals (running score in its own column, penalties
  and own goals marked), cards and substitutions in chronological order (stoppage time sorted correctly; a card ESPN
  has no player for, e.g. for the bench, reads "Yellow card"), possession, shots, corners, line-ups (with Matchday
  **0.8.0** already before kick-off, as soon as ESPN publishes them) and a link to the ESPN match centre.
- **Extra time and penalty shoot-outs:** "AET"/"n.V." and the shoot-out result ("n.E. 2:4") in the match row; the
  shoot-out kicks are listed in their own block with a running tally instead of counting as goals. A shoot-out in
  progress shows its current tally ("i.E. 1:3").
- **Live table:** position, crest, team, played, won, drawn, lost, goals, goal difference, points, live marker with the
  team's current score. Coloured zones with legend; defaults for Bundesliga, 2. Bundesliga, Premier League and the UEFA
  league phase, overridable per competition. Short team names on narrow screens.
- **Matchday navigation:** `‹ 4. Spieltag ›` in the heading browses back and forth, a tap on the title lists all
  matchdays (cup rounds) of the season with their dates, "Current" leads back. Other matchdays are loaded on demand
  from the integration and kept in memory (finished ones for good, others for 15 minutes); the details of a match
  (substitutions, stats, line-ups) load when it is opened. The table stays the current one and says so ("as of
  4. Spieltag") next to another matchday. Keyboard: arrow keys on the heading, arrow keys/Home/End/Enter/Esc in the
  list. Cup rounds that are not drawn yet can be selected and say so. Needs Matchday **0.4.0** or later; with older
  versions (or while the integration does not know the season's rounds yet) the card works as before without
  navigation.
- **Two-legged ties (UEFA):** a second leg shows the first leg's score before kick-off ("Hinspiel 0:1") and the
  aggregate from kick-off on ("Gesamt 4:1", live while it runs); the side that went through gets a tick, the match
  details start with first leg, aggregate and "Liverpool weiter". The table is shown in the league phase only, not
  in qualifying and knockout rounds. Needs Matchday **0.6.0** or later (match field `aggregate`, sensor attribute
  `phase`).
- **Competition chips:** switch between competitions inside the card (the choice is remembered per browser), with a
  live dot on every competition that has a running match.
- **Team mode:** the next and last matches of one team across all configured competitions.
- Side-by-side layout (matchday | table) on wide cards, stacked on phones. Uses the theme variables of Home Assistant
  (dark and light themes), German and English texts, visual editor for the single-competition setup.

| Phone, live | Penalty shoot-out in progress | Team mode |
| --- | --- | --- |
| ![Live matchday on a phone](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/live-mobile.png) | ![Penalty shoot-out](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/pokal-shootout-live-mobile.png) | ![Team mode](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/team-mobile.png) |

| Previous matchday with match details | Choosing a matchday |
| --- | --- |
| ![An earlier matchday on a phone](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/nav-back-mobile.png) | ![List of all matchdays](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/nav-picker-mobile.png) |

![Earlier matchday next to the current table](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/nav-back-desktop.png)

![Champions League round of 16, second legs with aggregate](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/uefa-ko-desktop.png)

![Four competitions, dark theme](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/overview-desktop.png)
![Light theme](https://raw.githubusercontent.com/nuggie/matchday-card/main/docs/overview-light-desktop.png)

## Requirements

- The [Matchday](https://github.com/nuggie/ha-matchday) integration. **0.4.0 or later** for the matchday navigation
  (sensor attribute `matchdays`, actions `matchday.get_matchday` and `matchday.get_match_details`); 0.3.0 works
  without it. **0.6.0 or later** for two-legged ties and the UEFA knockout rounds, **0.8.0 or later** for line-ups
  before kick-off.

## Installation

1. HACS → three dots → *Custom repositories* → add `https://github.com/nuggie/matchday-card`, category *Dashboard*.
2. Install **Matchday Card**. HACS registers the resource `/hacsfiles/matchday-card/matchday-card.js`
   (if your resources are managed in YAML, add it yourself with `type: module`).

Manual: copy `dist/matchday-card.js` to `config/www/` and add `/local/matchday-card.js` as a JavaScript module resource.

## Configuration

### One competition

```yaml
type: custom:matchday-card
entity: sensor.matchday_bundesliga_spieltag
table_entity: sensor.matchday_bundesliga_tabelle
```

### Several competitions with chips

```yaml
type: custom:matchday-card
competitions:
  - name: Bundesliga
    entity: sensor.matchday_bundesliga_spieltag
    table_entity: sensor.matchday_bundesliga_tabelle
  - name: 2. Liga
    entity: sensor.matchday_2_bundesliga_spieltag
    table_entity: sensor.matchday_2_bundesliga_tabelle
  - name: Premier League
    entity: sensor.matchday_premier_league_spieltag
    table_entity: sensor.matchday_premier_league_tabelle
  - name: DFB-Pokal
    entity: sensor.matchday_dfb_pokal_spieltag
```

In a sections view, put the card into a section that spans two columns to get matchday and table side by side.

### Team mode

```yaml
type: custom:matchday-card
team: SC Freiburg
limit: 4
competitions:
  - sensor.matchday_bundesliga_spieltag
  - sensor.matchday_dfb_pokal_spieltag
```

### Options

| Option | Default | Description |
| --- | --- | --- |
| `entity` | – | Matchday sensor of one competition (`sensor.matchday_*_spieltag`). Use either `entity` or `competitions`. |
| `table_entity` | – | Table sensor (`sensor.matchday_*_tabelle`) for `entity`. |
| `name` | – | Name shown in the heading (single competition). |
| `zones` | per competition | Table zones for `entity`, see below. `false` hides them. |
| `competitions` | – | List of competitions: `name`, `entity`, `table_entity`, `zones`, `short` (badge in team mode). A plain entity id works too. |
| `default_competition` | first | Competition shown until the user picks another chip: name, entity id or index. |
| `team` | – | Team mode: team name (full or short name as in the sensor). |
| `limit` | `5` | Team mode: number of matches (running matches are always included). |
| `show_table` | `true` | Show the table (when a `table_entity` is set). |
| `show_legend` | `true` | Show the zone legend. |
| `show_header` | `true` | Show the headings ("4. Spieltag", "Tabelle"). |
| `show_espn_link` | `true` | Link to the ESPN match centre in the match details. |
| `navigation` | `true` | Browse through the matchdays (needs Matchday 0.4.0 and `show_header`). The card always opens at the current matchday; switching the competition goes back to its current matchday. |
| `compact` | `false` | Lower match rows, table without won/drawn/lost. |
| `layout` | `auto` | `auto` (side by side from 760 px card width), `stacked` or `columns`. |
| `names` | `auto` | Team names: `auto` (full names for Premier League and UEFA competitions, short names otherwise), `short` or `full`. |
| `chip_columns` | up to 4 | Number of chip columns. |
| `title` | – | Title above the card. |
| `language` | from HA | `de` or `en`. |

### Table zones

Positions count from the top (`1` = first) or from the bottom (`-1` = last). The first matching zone wins.

```yaml
zones:
  - { from: 1, to: 4, color: "#1e88e5", label: Champions League }
  - { from: 5, color: "#f9a825", label: Europa League }
  - { from: -3, to: -1, color: "#c62828", label: Relegation }
```

Defaults: Bundesliga (CL 1–4, EL 5, Conference qualification 6, relegation play-off 16, relegation 17–18),
2. Bundesliga (promotion 1–2, promotion play-off 3, relegation play-off 16, relegation 17–18), Premier League
(CL 1–4, EL 5, relegation 18–20), Champions/Europa/Conference League (round of 16 1–8, play-off 9–24, out 25–36).

### Theming

The card follows the theme (`--primary-text-color`, `--secondary-text-color`, `--card-background-color`,
`--ha-card-border-radius`, ...). Additional variables:

| Variable | Default |
| --- | --- |
| `--matchday-live-color` | `#ef5350` |
| `--matchday-block-background` | near black in dark themes, card background in light themes |
| `--matchday-detail-background` | background of the opened match details |
| `--matchday-score-color` | white in dark themes, primary text colour otherwise |
| `--matchday-logo-background` | `#e8e8e8` (circle behind the crests in the match rows and the table) |

## Development

No build step: `dist/matchday-card.js` is the source.

- **Unit tests** (pure functions, Node 20+): `npm test` (= `node --test`), no dependencies.
- **Dev harness:** `node dev/serve.mjs` and open `http://127.0.0.1:8765/dev/?scenario=live`. The card renders with a
  mocked `hass` object; the scenarios (`dev/scenarios.js`) use real sensor attributes (`dev/fixtures/`) and the
  ha-matchday replay of a recorded live evening at six points in time (before kick-off, first half, half-time, second
  half, stoppage time, full time). Parameters: `theme=dark|light`, `lang=de|en`, `w=<card width>`.
  `dev/mock-connection.js` plays the integration's actions for the navigation from recorded answers
  (`dev/fixtures/get_matchday.json`, `get_match_details.json`, `matchdays.json`, built with the
  integration's own merge code); `latency=<ms>` / `dlatency=<ms>` set the
  simulated duration, the `nav-error` / `nav-details-error` scenarios fail once, `legacy` has no navigation.
- **Screenshots:** `node dev/snap.mjs` (Playwright; set `PLAYWRIGHT_MODULE` if it is not installed globally) writes
  desktop and phone screenshots of all scenarios to `dev/shots/`; `--docs` refreshes the images of this README.

## License

MIT
