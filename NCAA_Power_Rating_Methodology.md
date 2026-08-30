# NCAA Football Power Rating — Methodology v0.1

## Purpose

Produce an independent, inspectable estimate of the expected spread and total
for a given matchup, so it can be compared against the market line. This is
**not** a pick generator. It is a second opinion, built from documented inputs,
that either agrees with the market (no edge) or diverges from it (worth a
closer look — not a bet on its own).

## Status

**Unvalidated.** Every number below is a starting assumption, not a proven
weight. Nothing from this system should influence real money until Phase 3
(backtesting) is complete and reviewed.

---

## Phase 1: Inputs

All inputs are pulled from CollegeFootballData (CFBD), which is already wired
into the dashboard.

| Input | CFBD source | Why it's included |
|---|---|---|
| SP+ overall rating | `/ratings/sp` | Best available all-in-one predictive power rating; already opponent-adjusted |
| Offensive PPA | `/ppa/teams` | Captures scoring efficiency independent of pace |
| Defensive PPA | `/ppa/teams` | Same, defensive side |
| Home field advantage | Fixed constant, adjustable per venue | Documented ~2–3 pt average in CFB; some venues (altitude, historically loud) get a manual override |
| Rest differential | `/games` (days since last game) | Short week vs. bye week matchups |
| Talent composite | `/talent` | Recruiting-based roster talent, used only as a tiebreaker/sanity check, not a primary weight |

Explicitly **excluded** for now, per the earlier discussion:

- Turnover margin (too noisy, regresses hard — including it un-adjusted would
  hurt more than help)
- Historical ATS trends (roster turnover makes multi-year trends close to
  meaningless in CFB)
- Raw yards/game (misleading without pace adjustment — PPA and SP+ already
  account for this properly)

## Phase 2: Formula (draft, v0.1)

```
projected_spread(home) =
    (home_SP+  - away_SP+)
    + home_field_adjustment
    + rest_adjustment

projected_total =
    baseline_total
    + (home_off_PPA - away_def_PPA) * pace_factor
    + (away_off_PPA - home_def_PPA) * pace_factor
```

This is intentionally simple to start. SP+ already blends offense, defense,
and special teams, so most of the heavy lifting is done there — PPA is layered
in mainly to refine the total, since SP+ alone is tuned more for spread
prediction than scoring environment.

**Home field adjustment**: starts at a flat +2.5, with a manually maintained
override list for known outliers (e.g. elevation venues, historically extreme
environments). This list needs to be built and justified with data, not vibes
— that's part of Phase 3.

**Rest adjustment**: placeholder value, e.g. -1.0 for a team on a short week
facing a team off a bye. Needs backtesting to confirm magnitude, or whether it
should exist at all.

## Phase 3: Backtesting (required before any real use)

This is the part that actually matters. The plan:

1. Pull 2–3 full seasons of historical games from CFBD (`/games` with scores)
   and historical closing lines (`/lines`).
2. For every historical game, compute what the formula *would have* projected,
   using only data available before kickoff (no lookahead bias — this is the
   most common way homebrew models cheat without realizing it).
3. Compare projected spread vs. actual closing line vs. actual final margin.
4. Compute, across the full sample:
   - How often the model disagreed with the market by more than X points
   - When it disagreed, which side actually covered more often
   - Whether that edge is large enough to survive the vig (need >52.4% just
     to break even at -110)
5. Only if step 4 shows a real, statistically meaningful edge — not just a
   good-looking small sample — does the model get used to flag games on the
   dashboard.

If the backtest shows no edge, that's a valid and useful outcome. It means
the market is already efficiently pricing what this formula captures, and
we'd know not to trust its output for real decisions.

## Phase 4 (only after Phase 3 passes): Dashboard integration

If backtesting shows something real, the dashboard gets a new field per game:
`model spread` next to `market spread`, with the gap size, and a link back
to this document so the number is never presented without its own paper
trail.

---

## Scoping decisions (locked in 2026-08-27)

- **Backtest window**: 3 seasons.
- **Formula scope**: spread and totals both in scope for Phase 1-2 (not
  spread-only-first, despite that being the initially suggested default).
- **Phase 1-2 output**: a standalone script (`power_rating.ps1`), separate
  from `cfb_odds_dashboard.html`. The dashboard is not touched until Phase 3
  passes review, per Phase 4 above.

## Phase 3 findings and corrections (2026-08-27)

- **SP+ substitution**: `/ratings/sp` has no per-week history in the CFBD API
  (confirmed against its OpenAPI spec - no `week` parameter exists). Using
  season-final SP+ on any historical game would leak that season's outcome
  into the projection. Backtest uses CFBD's `homePregameElo`/`awayPregameElo`
  instead (embedded per-game, correct-as-of-kickoff by construction). Live
  projections in `power_rating.ps1` still use current SP+, which is correct
  for that use case (no lookahead risk when projecting a future game).
- **Spread formula**: no edge found. 49.6-50.2% ATS hit rate across all
  disagreement thresholds, stable across all 3 individual seasons (48.7% /
  51.6% / 49.2%), CIs straddling 50% throughout. Does not clear the bar for
  Phase 4 dashboard integration.
- **Totals formula - sign error found and fixed**: the original formula
  subtracted `away_def_PPA`. CFBD's `defense.overall` convention is "opponent's
  average PPA per play against this defense" - positive means a WORSE defense
  (allows more), confirmed empirically (r=0.869 against 2024 points-allowed
  data). Subtracting it inverted the effect of facing a bad defense. Corrected
  to add both defensive PPA terms instead of subtracting them.
- **Totals formula - pace_factor refit**: the original guess (65, reasoning
  from "avg plays/game") produced nonsensical projected totals (range: -30 to
  162) after the sign fix, MAE 42 pts vs. market. Refit via OLS on 2023+2024
  data only (slope = 1.23), evaluated out-of-sample on held-out 2025.
- **Totals formula - current status**: MAE vs. market now 5.82 pts (was 17
  pre-fix), comparable to the spread formula's own 4.54. Pooled 3-season hit
  rate is 54.5-55.4% across thresholds, but that figure is partly in-sample
  (2023-2024 were used to fit pace_factor). The clean read is 2025 alone
  (untouched by fitting): 53.6% hit rate, n=513, 95% CI 49.3-57.9% at a 3-pt
  threshold - a promising point estimate, not yet a statistically confirmed
  edge on its own. **Not yet cleared for Phase 4.** Worth re-checking once
  2026 completes as a second genuinely clean out-of-sample season.
- **Dashboard integration (2026-08-27)**: totals-only model note added to
  `cfb_odds_dashboard.html`, explicitly labeled "research, unconfirmed" with
  the 53.6% / n=513 / CI 49.3-57.9% figure shown inline on every flagged game
  card (not just in this doc). Spread deliberately has no dashboard presence
  at all, per the no-edge finding above.

## Spread edge search - five independent methods, five null results (2026-08-27)

Before adding anything further to the dashboard, five genuinely different
approaches to finding a spread edge were tested. The first three used a train
(2023-2024) / held-out test (2025) split; the last two are pre-declared,
zero-fitted-parameter hypothesis tests run against the full 2023-2025 sample
directly (no fitting involved, so no train/test split needed):

1. **Fundamentals - Elo power rating**: home field and Elo-to-margin conversion
   refit via OLS on train data (3.5 pts, 23.86 Elo/pt - both close to the
   original guesses of 2.5 and 25, so this was not a calibration problem).
   Held-out 2025 result: 47.5-50.2% ATS across thresholds. No edge.
2. **Market behavior - naive line movement**: "the side the closing line moved
   toward covers more often." 2,510 games, 2023-2025. 47-50.1% across movement
   thresholds; per-season breakdown swung 53.5% / 52% / 46.9% - no stable
   direction. No edge.
3. **Richer fundamentals - success rate + havoc rate**: both CFBD-native,
   per-game, cumulative-through-week (no lookahead), sign conventions verified
   empirically before use (`defense.successRate` positive=worse defense,
   r=0.391 vs. points allowed; `defense.havocRate` positive=better defense,
   r=-0.754 vs. points allowed - opposite polarities, confirmed rather than
   assumed after getting the totals sign wrong once already). Fit as an
   adjustment to the Elo model's residual on train, tested on held-out 2025:
   47.4-50.7% - no improvement over Elo alone at any threshold.
4. **Market microstructure - key-number crossing**: does "follow the movement"
   work better specifically when the open->close move crosses 3 or 7 (the most
   common CFB margins)? 2,345 games. Crosses a key number: 47.8% (n=404).
   Doesn't cross: 49% (n=1,289). Crossing performed *worse*, not better, and
   was unstable per-season (45.3% / 49.7% / 47%). No edge.
5. **Market microstructure - cross-book dispersion**: does disagreement between
   DraftKings/ESPN Bet/Bovada's closing lines predict favorite-cover rate?
   Low-dispersion quartile: 51.6% (n=579). High-dispersion quartile: 51.2%
   (n=580). No meaningful difference; both within a CI straddling the 52.4%
   breakeven line. No edge.

**Conclusion**: this is convergent evidence, not five isolated failures. With
five independent tests at ~5% significance, chance alone would predict
something crossing a naive threshold roughly a quarter of the time
(1 - 0.95^5 ~ 23%); getting a clean sweep of nulls - several landing *below*
50%, not just short of 52.4% - is stronger evidence of no exploitable edge
than a single null result would be. Spread stays out of the dashboard's
flagging/sorting entirely; it's shown transparently as a labeled
"no proven edge" reference number only (see `computeModelSpread` in
`cfb_odds_dashboard.html`).

A real spread edge, if one exists, likely requires information not already
priced into the closing line at all (e.g. injury/availability data, actual
sportsbook bet%/money% splits, or timestamped multi-book line history for
juice movement / sharp-book sequencing) rather than a more sophisticated
combination of publicly-available box-score-adjacent stats or the closing-
snapshot-only market data CFBD provides. See conversation log for a
cost/access survey of paid data sources that could supply that (Action
Network, SportsDataIO, OddsJam, Unabated) - all require paid access, none
currently in use.

## CLV (closing line value) check on the totals model (2026-08-27)

Independent of the ATS/OU hit-rate backtest, checked whether the market's own
subsequent action (opening line -> closing line movement) corroborates the
totals model's read - i.e., does the closing line move toward the model's
side more often than chance, regardless of whether the eventual bet won.

Result: **does not corroborate.** Aggregate across 2,126 games: closing line
moved toward the model's side only 46.9-47.9% of the time (slightly *below*
chance). Per-season breakdown is unstable in a way that argues against a real
effect: 37.8% (2023) -> 47.3% (2024) -> 55.6% (2025).

This doesn't overturn the 53.6% held-out hit-rate result, but it doesn't
support it either - it's an additional reason the totals signal stays labeled
"promising, not confirmed" rather than moving toward confirmed. No dashboard
copy changed as a result (the existing label already reflected this level of
uncertainty), but recorded here since every number this project surfaces is
supposed to carry its full paper trail, including the ones that complicate
the story.

## Team-name matching bugs found via live-dashboard spot check (2026-08-27)

The user spot-checked live model-spread output and found nonsensical results
(e.g. "Indiana State Sycamores @ Purdue Boilermakers" showing Purdue as a
27.8-point underdog, when the market had Purdue favored by 35.5). A full
audit of `matchTeamKey` in `cfb_odds_dashboard.html` followed. Root cause:
the matcher only checked the sparse `eloMap`/`efficiencyMap` (data for ~136
FBS teams). When a team was missing from that map, it fell back to whatever
*other* map key happened to be a text prefix of the search string - which is
sometimes a real but completely unrelated school.

**Two real bugs found this way** (both confirmed by the user, not just
theorized):
- "Indiana State Sycamores" (FCS, no Elo data) matched "Indiana" (FBS, real
  Elo 2064) - Indiana is a valid text prefix of "Indiana State Sycamores."
- "Arkansas Pine Bluff Golden Lions" (FCS) matched "Arkansas" (FBS, real Elo
  1547) - same mechanism.

**A third bug found via full-slate audit** (not reported by the user, caught
by systematically checking every game rather than one at a time): "Houston
Baptist Huskies" matched "Houston" (FBS). Houston Baptist officially renamed
itself Houston Christian in 2022; the odds feed still uses the old name,
which CFBD's database has no record of at all.

**Fix**: `matchTeamKey` now resolves against CFBD's full ~700-school
`/teams` list (all divisions, loaded once via `loadAllTeamNames`) *before*
checking the sparse data maps. If the correctly-identified school has no
data, it now returns null honestly instead of substituting a different
school's real numbers. Also fixed in the same pass, found via the same
audit:
- Hyphen handling: `normalizeTeamName` was stripping hyphens instead of
  treating them as word separators, so CFBD's "Arkansas-Pine Bluff" never
  matched the odds feed's "Arkansas Pine Bluff" at all (contributing to the
  bug above beyond just the missing-data fallback).
- Extended `TEAM_NAME_ALIASES` to bidirectional pairs (was one-directional,
  CFBD-short-name to odds-full-name only, e.g. App State). Added: Houston
  Baptist/Houston Christian, UMass/Massachusetts (UMass is genuinely FBS -
  this is a real data-completeness fix, not just bug avoidance), Albany/
  UAlbany, LIU/Long Island University, Citadel/The Citadel, Southeastern
  Louisiana/SE Louisiana, Youngstown St/Youngstown State.

**Verification**: ran a full-slate audit (every game with both a model and
market spread, 64 of 111 games) flagging any game where model and market
disagreed on which team is even favored, or disagreed by more than 20
points. 12 games flagged before the fix, 11 after (Houston Baptist/Rice
dropped out). Every one of the remaining 11 was individually verified to
resolve to its own correct, distinct school - not further matching bugs (see
next section for what they actually are).

## Systematic blowout under-prediction (2026-08-27)

Investigating why the remaining 11 flagged games (e.g. Missouri State @
Texas A&M, market -41.5 vs model -18.7) weren't matching bugs surfaced a
real pattern: **the model increasingly disagrees with the market as the
market's own predicted margin gets larger.**

Checked across all 64 games with both a model and market spread on the live
2026 preseason slate: correlation of 0.743 between market spread magnitude
and the size of the model/market gap. Bucketed:

| Market spread | n | Avg model/market gap |
|---|---|---|
| Close (0-7 pts) | 22 | 3.6 pts |
| Moderate (7-17 pts) | 16 | 5.7 pts |
| Big favorite (17-30 pts) | 17 | 10.7 pts |
| Blowout (30+ pts) | 9 | 17.2 pts |

Hypothesis: the model converts Elo differential to margin with ONE fixed
linear coefficient (23.86 Elo points per margin point) across the whole
range. Real blowouts might not scale linearly - talent gaps could compound
beyond what a straight-line extrapolation predicts.

**Tested properly, not patched on assumption.** Fit a signed-quadratic term
(`sign(eloDiff) * eloDiff^2`) against the residual (actual margin - linear
prediction) on train seasons (2023-2024), evaluated on held-out 2025,
broken down by the same market-spread buckets to confirm any improvement
would concentrate where predicted (not just move the aggregate number).

**Result: no effect.** Fitted coefficient was `-3.4E-07` - indistinguishable
from zero. Blowout-bucket average gap vs. market was 10.3 pts before, 10.4
after - no improvement.

**Conclusion**: the blowout-tier disagreement is not a fixable curvature
problem in the Elo-to-margin conversion. Actual historical margins don't
show the compounding effect the market's behavior seemed to suggest - a
plausible reason is that real blowouts often get *capped* below a pure
talent extrapolation (backups play, garbage time), which would cancel out
exactly the effect being tested for. This doesn't contradict the "no proven
edge" finding - it's consistent with it: the market's edge over this model
at the extremes likely comes from information (roster depth, coaching
intent, situational context) that a two-number power-rating comparison
structurally cannot capture, at any curve shape. No formula change made;
`SPREAD_ELO_PER_MARGIN` stays linear.

## Barnum & Payne architecture upgrade - terminology and confidence layer (2026-08-30)

The user supplied a full architecture spec (four separated layers - Market
Price, Model Fair Value, Market Signal Engine, and a not-yet-computable
Opportunity Score) with one non-negotiable rule running through it: **never
let a model/market discrepancy be labeled a proven edge, and never let a
large discrepancy read as high confidence.** That rule is exactly what this
document has enforced from Phase 3 onward, so implementation proceeds as a
restructuring/renaming pass, not a change in the science.

**Phase 1 (implemented)**: renamed all user-facing "model signal"/"model
edge" language to **Model Disagreement**, throughout `cfb_odds_dashboard.html`
(dashboard summary line, game-card badge, spread/total notes). Added a
rule-based **Model Confidence** score (0-100, see `computeModelConfidence`),
which deducts - never adds - for known low-reliability conditions:
- Game week not resolvable against CFBD's schedule (`weekMap`, built from
  the same `/games` fetch `loadEloAndRest` already makes - no new API call)
- Week 0 (preseason) or weeks 1-3 (small current-season sample)
- Missing PPA/efficiency data for either team
- Missing Elo data for either team (FCS opponent or new program)

Explicitly **not yet scored**, because no data source is wired in for them:
starting-QB uncertainty, injury reports, coaching-staff turnover,
transfer-portal roster churn. These are listed as gaps, not silently assumed
"fine" - see the `reasons` array `computeModelConfidence` returns.

A confidence score below 50 now surfaces a `LOW MODEL CONFIDENCE` banner
directly under the affected disagreement note, naming which specific
reasons dragged the score down.

**Phase 2 (implemented)**: `lineHistory` is now persisted to localStorage
(`STORAGE_KEY_LINEHISTORY`), so line-movement observations survive across
sessions instead of resetting on every tab close. Each game card now shows
a **Market Activity** block (`marketActivityBlock` in
`cfb_odds_dashboard.html`): opening spread/total vs. current, plus 1H/6H/24H
movement windows computed from the nearest snapshot at or before that age
(`snapshotAtOrBefore`). Any window with no old-enough snapshot yet honestly
reads `N/A` rather than being estimated - this app has no backend or
scheduler, so movement data is only as fine-grained as how often the
dashboard is actually opened. A light dedupe (`LINE_HISTORY_MIN_GAP_MS`,
5 min) prevents rapid-refresh spam from bloating storage without discarding
genuine re-checks. History is pruned on load past 14 days untouched, since
the odds feed never returns a completed/expired event's id again to
overwrite it.

Still explicitly out of scope: moneyline confirmation, juice movement,
cross-book dispersion, sharp-book divergence, steam detection, and
reverse-line-movement - all of these need either timestamped multi-book
history (this app currently samples only the single best-available book
per game) or ticket/money-percentage data this app has no source for. The
Market Activity block says so directly rather than fabricating a number.

**Phase 3 (implemented)**: a frozen recommendation log for backtesting,
persisted to localStorage (`STORAGE_KEY_RECLOG`, `recommendationLog`).
`logRecommendation` writes one entry per (game, market) the FIRST time a
Model Disagreement is computable for it - available line, model fair line,
disagreement gap, model confidence and its reasons, week, sportsbook, all
timestamped. Frozen means frozen: nothing about the recommendation-time
fields is ever rewritten afterward, even if the market later moves in the
model's favor - that would leak future information into what was
"recommended" at the time, the same lookahead-bias failure mode this whole
project has been built to avoid.

Grading (`gradeRecommendations`, manually triggered from the new "Model
Backtest Log" panel) runs after the fact: matches each pending entry to its
completed CFBD game by team + date (same name-resolution path as
`matchTeamKey`), determines whether the model's favored side actually hit
against the *originally logged* available line (not the closing line - the
recommendation is graded against what was actually available when it was
made), and separately pulls CFBD's own recorded closing spread/total (from
`/lines`, not this app's own snapshot cadence) to compute CLV. Sign
convention for CLV: positive means the closing line moved toward the
model's side after logging - independently re-derived and checked against
a worked example in code comments, given this project's history with sign
errors (see the totals-defense sign bug above).

The panel's stats break results down by: flag threshold (validates whether
the `MODEL_FLAG_THRESHOLD = 3` cutoff actually means anything), model
confidence tier, week (0-3 vs. 4+), and for spread specifically, whether
the model backed the market favorite or the underdog (testing the user's
own earlier hunch that "we should favor the underdogs"). Not yet broken
out: conference (needs a team->conference map not yet wired in) and
sportsbook (only one book is captured per game today, so a per-book cut
wouldn't be meaningful yet) - noted directly in the panel rather than
silently omitted.

**Deferred (per the user's own explicit instruction)**: the composite
Opportunity Score. That requires backtested weights, which don't exist and
won't be invented by hand. The recommendation log now exists specifically
so that, once a season's worth of graded observations accumulates, fitting
Opportunity Score weights becomes a legitimate empirical exercise rather
than embedding opinion into a sophisticated-looking score.
