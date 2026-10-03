/**
 * Pure detection core of the production regression watch (SDK-1351).
 *
 * Builds the Better Stack query for SDK-generated transaction outcomes of a
 * consumer app, parses its rows, and flags action × chain regressions against
 * a trailing baseline. Network I/O lives in `watch-production-regressions.ts`.
 */

/** A consumer app whose production transactions are built by this repository's SDKs. */
export interface Consumer {
  /** Short identifier used in issue titles, e.g. `vvrm-app`. */
  readonly id: string;
  /** GitHub repository that owns the app, `owner/name`. */
  readonly repository: string;
  /** Path of the app's `package.json` inside `repository`. */
  readonly manifestPath: string;
  /** Better Stack metrics collection holding the app's `tx_outcome` events. */
  readonly metricsCollection: string;
  /** Better Stack dashboard humans use to inspect the same signals. */
  readonly dashboardUrl: string;
  /** Actions that are not SDK-generated transactions, excluded from every signal. */
  readonly excludedActions: readonly string[];
  /** Extra SQL predicates excluding known false positives, ANDed as `NOT (...)`. */
  readonly excludedPredicates: readonly string[];
}

/** Consumers watched in production. VVRM is the first; others onboard by adding an entry. */
export const CONSUMERS = [
  {
    id: "vvrm-app",
    repository: "morpho-org/morpho-apps",
    manifestPath: "apps/vvrm-app/package.json",
    metricsCollection: "remote(t384553_vvrm_app_vercel_otel_metrics)",
    dashboardUrl:
      "https://telemetry.betterstack.com/team/t340147/dashboards/1139642",
    excludedActions: ["aaveV3MigrateToVaultV2", "unknown", ""],
    // Same exclusion as the dashboard: a known wrapLegacyMorpho network_error burst.
    excludedPredicates: [
      "label('action_type') = 'wrapLegacyMorpho' AND ifNull(label('error_category'), '') = 'network_error' AND dt >= toDateTime('2026-09-29 14:00:00') AND dt < toDateTime('2026-09-29 15:00:00')",
    ],
  },
] as const satisfies readonly Consumer[];

/**
 * Transaction health signals. Each keeps the dashboard's definition so a
 * flagged regression reads the same on the "VVRM web3 health" charts:
 * - `simulation_failure`: EVM simulation rejected the SDK transaction.
 * - `tx_failure`: non-simulation failures, excluding Safe proposals and receipt timeouts.
 * - `onchain_revert`: the transaction was mined and reverted.
 */
const SIGNALS = ["simulation_failure", "tx_failure", "onchain_revert"] as const;

/** One transaction health signal. */
export type Signal = (typeof SIGNALS)[number];

/** Actions that never go through EVM simulation, excluded from `simulation_failure`. */
const UNSIMULATED_ACTIONS = new Set(["approval_tx", "signature"]);
/** Actions excluded from the failure signals, matching the dashboard error heatmap. */
const NON_TRANSACTION_ACTIONS = new Set(["signature"]);

/** Time windows compared by the detector. */
export interface Windows {
  /** End of the current window, in milliseconds. */
  readonly nowMs: number;
  /** Length of the current window, in hours. */
  readonly currentHours: number;
  /** Length of the baseline window that immediately precedes the current one, in hours. */
  readonly baselineHours: number;
}

/** Default windows: the last 24 hours against the 7 days before. */
export const DEFAULT_WINDOWS = {
  currentHours: 24,
  baselineHours: 7 * 24,
} as const;

/** Aggregated `tx_outcome` counts for one action × chain × app release × window. */
export interface OutcomeRow {
  readonly actionType: string;
  readonly chainId: string;
  /** Deployed app commit, or `""` for events emitted before releases were logged. */
  readonly release: string;
  readonly window: "current" | "baseline";
  readonly successes: number;
  readonly txFailures: number;
  readonly simulationFailures: number;
  /** Successful transactions sent after a simulation failure was bypassed. */
  readonly bypassedSimulationFailures: number;
  readonly onchainReverts: number;
  /** First event of this group, in milliseconds. */
  readonly firstSeenMs: number;
}

const toSeconds = (ms: number) => Math.floor(ms / 1000);

/**
 * Builds the ClickHouse query returning {@link OutcomeRow} groups for a consumer.
 *
 * @param consumer The consumer app to query.
 * @param windows The current and baseline windows.
 * @returns A query in `FORMAT JSONEachRow` for the Better Stack SQL API.
 */
export function buildOutcomeQuery(
  consumer: Consumer,
  windows: Windows,
): string {
  const end = toSeconds(windows.nowMs);
  const currentStart = end - windows.currentHours * 3600;
  const baselineStart = currentStart - windows.baselineHours * 3600;
  const excludedActions = consumer.excludedActions
    .map((action) => `'${action.replaceAll("'", "''")}'`)
    .join(", ");
  const excludedPredicates = consumer.excludedPredicates
    .map((predicate) => `\n  AND NOT (${predicate})`)
    .join("");

  return `SELECT
  ifNull(label('action_type'), '') AS action_type,
  ifNull(label('chain_id'), '') AS chain_id,
  ifNull(label('tx_release'), '') AS release,
  if(dt >= toDateTime(${currentStart}), 'current', 'baseline') AS window,
  sumIf(logs_count, label('outcome') = 'success') AS successes,
  sumIf(logs_count, label('outcome') = 'failure' AND ifNull(label('error_category'), '') NOT IN ('safe_proposal_pending', 'timeout_receipt_polling', 'simulation_failed')) AS tx_failures,
  sumIf(logs_count, label('outcome') = 'failure' AND ifNull(label('error_category'), '') = 'simulation_failed') AS simulation_failures,
  sumIf(logs_count, label('outcome') = 'success' AND ifNull(label('bypassed_simulation_failure'), '') = 'true') AS bypassed_simulation_failures,
  sumIf(logs_count, label('outcome') = 'failure' AND ifNull(label('error_category'), '') = 'transaction_reverted_onchain') AS onchain_reverts,
  toUnixTimestamp(min(dt)) AS first_seen
FROM ${consumer.metricsCollection}
WHERE dt >= toDateTime(${baselineStart}) AND dt < toDateTime(${end})
  AND label('metadata_event') = 'tx_outcome'
  AND ifNull(label('action_type'), '') NOT IN (${excludedActions})${excludedPredicates}
GROUP BY action_type, chain_id, release, window
ORDER BY action_type, chain_id, release, window
FORMAT JSONEachRow`;
}

function readCount(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  // ClickHouse quotes 64-bit integers in JSON output by default.
  const count = typeof value === "string" ? Number(value) : value;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new Error(
      `Expected a non-negative integer "${key}", got "${String(value)}".`,
    );
  }
  return count;
}

function readString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected a string "${key}", got "${String(value)}".`);
  }
  return value;
}

// Labels are client-reported and end up in issues read by the RCA agent: allowlist them.
const ACTION_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const CHAIN_ID_PATTERN = /^[1-9][0-9]{0,9}$/;
const RELEASE_PATTERN = /^[0-9a-f]{40}$/;

/** Rows of a {@link buildOutcomeQuery} result, and how many were dropped. */
export interface ParsedOutcomes {
  readonly rows: OutcomeRow[];
  /** Rows dropped because their action type or chain id is not a plain identifier. */
  readonly rejectedRows: number;
}

/**
 * Parses the `JSONEachRow` body returned for {@link buildOutcomeQuery}.
 *
 * Rows whose action type or chain id is not a plain identifier are dropped
 * and counted; a release that is not a commit SHA is treated as not logged.
 *
 * @param body Newline-delimited JSON rows.
 * @returns The parsed rows and the number of rejected rows.
 * @throws {SyntaxError} when a row is not JSON.
 * @throws {Error} when a row misses an expected column.
 */
export function parseOutcomeRows(body: string): ParsedOutcomes {
  let rejectedRows = 0;
  const rows = body
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line): OutcomeRow[] => {
      const row = JSON.parse(line) as Record<string, unknown>;
      const window = readString(row, "window");
      if (window !== "current" && window !== "baseline") {
        throw new Error(
          `Expected window "current" or "baseline", got "${window}".`,
        );
      }
      const actionType = readString(row, "action_type");
      const chainId = readString(row, "chain_id");
      const release = readString(row, "release");
      if (
        !ACTION_TYPE_PATTERN.test(actionType) ||
        !CHAIN_ID_PATTERN.test(chainId)
      ) {
        rejectedRows += 1;
        return [];
      }
      const outcome: OutcomeRow = {
        actionType,
        chainId,
        release: RELEASE_PATTERN.test(release) ? release : "",
        window,
        successes: readCount(row, "successes"),
        txFailures: readCount(row, "tx_failures"),
        simulationFailures: readCount(row, "simulation_failures"),
        bypassedSimulationFailures: readCount(
          row,
          "bypassed_simulation_failures",
        ),
        onchainReverts: readCount(row, "onchain_reverts"),
        firstSeenMs: readCount(row, "first_seen") * 1000,
      };
      return [outcome];
    });
  return { rows, rejectedRows };
}

/** Failures and attempts of one signal, with the dashboard's denominators. */
interface Counts {
  readonly failures: number;
  readonly attempts: number;
}

/**
 * Returns the failures and attempts of a signal for one row, or `null` when
 * the signal does not apply to the row's action.
 *
 * @param row The aggregated outcomes.
 * @param signal The signal to count.
 * @returns The counts, or `null` when the action is out of the signal's scope.
 */
export function countSignal(row: OutcomeRow, signal: Signal): Counts | null {
  if (NON_TRANSACTION_ACTIONS.has(row.actionType)) return null;
  const nonSimulationAttempts = row.successes + row.txFailures;
  if (signal === "tx_failure") {
    return { failures: row.txFailures, attempts: nonSimulationAttempts };
  }
  if (signal === "onchain_revert") {
    return { failures: row.onchainReverts, attempts: nonSimulationAttempts };
  }
  if (UNSIMULATED_ACTIONS.has(row.actionType)) return null;
  // A bypassed simulation failure is logged twice (failure, then success); count it once as a success.
  const simulationFailures = Math.max(
    0,
    row.simulationFailures - row.bypassedSimulationFailures,
  );
  return {
    failures: simulationFailures,
    attempts: nonSimulationAttempts + simulationFailures,
  };
}

/** Floors a change must clear before it is reported. */
export interface Thresholds {
  /** Minimum current attempts, so a handful of transactions cannot alert. */
  readonly minCurrentAttempts: number;
  /** Minimum current failures. */
  readonly minCurrentFailures: number;
  /** Minimum baseline attempts before the action × chain baseline is trusted. */
  readonly minBaselineAttempts: number;
  /** Minimum increase of the failure rate, in rate points (0.05 = 5 points). */
  readonly minRateIncrease: number;
  /** Minimum ratio between the current and baseline failure rates. */
  readonly minRateRatio: number;
  /** Minimum one-sided two-proportion z-score. */
  readonly minZScore: number;
}

/** Default thresholds, backtested on 21 days of VVRM traffic (see the design doc). */
export const DEFAULT_THRESHOLDS = {
  minCurrentAttempts: 20,
  minCurrentFailures: 5,
  minBaselineAttempts: 30,
  minRateIncrease: 0.05,
  minRateRatio: 2,
  minZScore: 4,
} as const satisfies Thresholds;

/** Current-window counts of one app release within a regression. */
interface ReleaseBreakdown {
  readonly release: string;
  /** First event of the release across both windows, in milliseconds. */
  readonly firstSeenMs: number;
  /** Whether the release first appeared during the current window. */
  readonly isNew: boolean;
  readonly failures: number;
  readonly attempts: number;
}

/** Impact-based severity. `critical` is reserved for RCA evidence of a fund-loss path. */
export type Severity = "low" | "medium" | "high";

/** A flagged action × chain regression of one signal. */
export interface Regression {
  /** Stable key used to deduplicate issues: consumer, signal, action and chain. */
  readonly fingerprint: string;
  readonly consumer: string;
  readonly signal: Signal;
  readonly actionType: string;
  readonly chainId: string;
  readonly severity: Severity;
  readonly current: Counts & { readonly rate: number };
  readonly baseline: Counts & {
    readonly rate: number;
    /** `action_chain` for the pair itself, `action_all_chains` when the pair lacks history. */
    readonly scope: "action_chain" | "action_all_chains";
  };
  /** Current failures above what the baseline rate predicts. */
  readonly excessFailures: number;
  readonly zScore: number;
  readonly releases: readonly ReleaseBreakdown[];
  /**
   * Whether failures concentrate on releases first deployed in the current
   * window: their share of failures exceeds their share of attempts by 20 points.
   */
  readonly releaseCorrelated: boolean;
}

const rate = ({ failures, attempts }: Counts) =>
  attempts === 0 ? 0 : failures / attempts;

/**
 * One-sided two-proportion z-score of the current rate exceeding the baseline.
 *
 * @param current The current counts.
 * @param baseline The baseline counts.
 * @returns The pooled z-score, or 0 when either window is empty.
 */
export function zScore(current: Counts, baseline: Counts): number {
  if (current.attempts === 0 || baseline.attempts === 0) return 0;
  const pooled =
    (current.failures + baseline.failures) /
    (current.attempts + baseline.attempts);
  const variance =
    pooled * (1 - pooled) * (1 / current.attempts + 1 / baseline.attempts);
  if (variance === 0) return 0;
  return (rate(current) - rate(baseline)) / Math.sqrt(variance);
}

function add(a: Counts, b: Counts): Counts {
  return {
    failures: a.failures + b.failures,
    attempts: a.attempts + b.attempts,
  };
}

const EMPTY: Counts = { failures: 0, attempts: 0 };

/**
 * Flags action × chain regressions of every signal for a consumer.
 *
 * A pair is flagged only when all {@link Thresholds} hold, so a regression
 * needs volume, size and statistical evidence at once; there is no global
 * success-rate floor. Pairs without enough history fall back to the action's
 * baseline across all chains.
 *
 * @param rows Rows returned for {@link buildOutcomeQuery}.
 * @param options The consumer the rows belong to, the windows they were
 *   queried with, and the detection floors.
 * @returns Regressions sorted by excess failures, largest first.
 */
export function detectRegressions(
  rows: readonly OutcomeRow[],
  {
    consumer,
    windows,
    thresholds = DEFAULT_THRESHOLDS,
  }: {
    readonly consumer: Pick<Consumer, "id">;
    readonly windows: Windows;
    readonly thresholds?: Thresholds;
  },
): Regression[] {
  const currentStartMs = windows.nowMs - windows.currentHours * 3_600_000;
  const releaseFirstSeen = new Map<string, number>();
  for (const row of rows) {
    const seen = releaseFirstSeen.get(row.release);
    if (seen == null || row.firstSeenMs < seen) {
      releaseFirstSeen.set(row.release, row.firstSeenMs);
    }
  }

  const regressions: Regression[] = [];
  for (const signal of SIGNALS) {
    const pairs = new Map<
      string,
      {
        actionType: string;
        chainId: string;
        current: Counts;
        baseline: Counts;
        releases: Map<string, Counts>;
      }
    >();
    const actionBaselines = new Map<string, Counts>();
    for (const row of rows) {
      const counts = countSignal(row, signal);
      if (counts == null) continue;
      const key = `${row.actionType}\u0000${row.chainId}`;
      const pair = pairs.get(key) ?? {
        actionType: row.actionType,
        chainId: row.chainId,
        current: EMPTY,
        baseline: EMPTY,
        releases: new Map<string, Counts>(),
      };
      if (row.window === "current") {
        pair.current = add(pair.current, counts);
        pair.releases.set(
          row.release,
          add(pair.releases.get(row.release) ?? EMPTY, counts),
        );
      } else {
        pair.baseline = add(pair.baseline, counts);
        actionBaselines.set(
          row.actionType,
          add(actionBaselines.get(row.actionType) ?? EMPTY, counts),
        );
      }
      pairs.set(key, pair);
    }

    for (const pair of pairs.values()) {
      const { current } = pair;
      if (
        current.attempts < thresholds.minCurrentAttempts ||
        current.failures < thresholds.minCurrentFailures
      ) {
        continue;
      }
      const ownBaseline =
        pair.baseline.attempts >= thresholds.minBaselineAttempts;
      const baseline = ownBaseline
        ? pair.baseline
        : (actionBaselines.get(pair.actionType) ?? EMPTY);
      if (baseline.attempts < thresholds.minBaselineAttempts) continue;

      const currentRate = rate(current);
      const baselineRate = rate(baseline);
      const z = zScore(current, baseline);
      if (
        currentRate - baselineRate < thresholds.minRateIncrease ||
        currentRate < baselineRate * thresholds.minRateRatio ||
        z < thresholds.minZScore
      ) {
        continue;
      }

      const releases = [...pair.releases.entries()]
        .map(([release, counts]) => {
          const firstSeenMs = releaseFirstSeen.get(release) ?? currentStartMs;
          return {
            release,
            firstSeenMs,
            isNew: release !== "" && firstSeenMs >= currentStartMs,
            ...counts,
          };
        })
        .sort((a, b) => b.failures - a.failures);
      const fresh = releases
        .filter(({ isNew }) => isNew)
        .reduce<Counts>(add, EMPTY);
      const excessFailures = Math.round(
        current.failures - baselineRate * current.attempts,
      );

      regressions.push({
        fingerprint: `${consumer.id}:${signal}:${pair.actionType}:${pair.chainId}`,
        consumer: consumer.id,
        signal,
        actionType: pair.actionType,
        chainId: pair.chainId,
        severity:
          excessFailures >= 25 || (currentRate >= 0.5 && current.failures >= 10)
            ? "high"
            : excessFailures >= 10
              ? "medium"
              : "low",
        current: { ...current, rate: currentRate },
        baseline: {
          ...baseline,
          rate: baselineRate,
          scope: ownBaseline ? "action_chain" : "action_all_chains",
        },
        excessFailures,
        zScore: z,
        releases,
        releaseCorrelated:
          fresh.failures / current.failures -
            fresh.attempts / current.attempts >=
          0.2,
      });
    }
  }

  return regressions.sort((a, b) => b.excessFailures - a.excessFailures);
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/** Regressions of one signal on one chain, reported together as one issue. */
export interface Incident {
  /** Issue title, also the deduplication key. */
  readonly title: string;
  readonly consumer: string;
  readonly signal: Signal;
  readonly chainId: string;
  /** Highest severity among the regressions. */
  readonly severity: Severity;
  readonly regressions: readonly Regression[];
}

/**
 * Groups regressions of at least `minSeverity` by consumer, signal and chain.
 *
 * Several actions failing together on one chain usually share a cause
 * (simulation backend, RPC, chain state), so they become one incident.
 *
 * @param regressions Regressions from {@link detectRegressions}.
 * @param minSeverity The lowest severity that opens an issue.
 * @returns Incidents sorted by severity, then by excess failures.
 */
export function groupIncidents(
  regressions: readonly Regression[],
  minSeverity: Severity = "medium",
): Incident[] {
  const incidents = new Map<string, Regression[]>();
  for (const regression of regressions) {
    if (SEVERITY_RANK[regression.severity] < SEVERITY_RANK[minSeverity])
      continue;
    const title = incidentTitle(regression);
    incidents.set(title, [...(incidents.get(title) ?? []), regression]);
  }
  const excess = (incident: Incident) =>
    incident.regressions.reduce((sum, r) => sum + r.excessFailures, 0);
  return [...incidents.entries()]
    .map(([title, grouped]) => {
      const [first] = grouped as [Regression, ...Regression[]];
      return {
        title,
        consumer: first.consumer,
        signal: first.signal,
        chainId: first.chainId,
        severity: grouped.reduce<Severity>(
          (max, { severity }) =>
            SEVERITY_RANK[severity] > SEVERITY_RANK[max] ? severity : max,
          "low",
        ),
        regressions: grouped,
      };
    })
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        excess(b) - excess(a),
    );
}

/**
 * Returns the issue title of a regression's incident.
 *
 * @param regression The regression.
 * @returns `production regression: <consumer> <signal> on chain <chainId>`.
 */
export function incidentTitle(
  regression: Pick<Regression, "consumer" | "signal" | "chainId">,
): string {
  return `production regression: ${regression.consumer} ${regression.signal} on chain ${regression.chainId}`;
}

/** SDK package versions a consumer release depends on, or why they are unknown. */
export type SdkVersions =
  | { readonly packages: Readonly<Record<string, string>> }
  | { readonly error: string };

const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * Renders the issue body for an incident.
 *
 * The body is read by people and by the RCA automation: a summary table,
 * per-release SDK versions, and a fenced JSON block with the raw evidence.
 *
 * @param incident The incident to report.
 * @param context Links and versions resolved outside the pure core.
 * @returns GitHub-flavoured Markdown.
 */
export function renderIncidentBody(
  incident: Incident,
  context: {
    readonly windows: Windows;
    readonly dashboardUrl: string;
    readonly consumerRepository: string;
    readonly sdkVersions: ReadonlyMap<string, SdkVersions>;
  },
): string {
  const { windows } = context;
  const currentStart = new Date(
    windows.nowMs - windows.currentHours * 3_600_000,
  ).toISOString();
  const end = new Date(windows.nowMs).toISOString();
  const rows = incident.regressions.map(
    (r) =>
      `| \`${r.actionType}\` | ${r.severity} | ${r.current.failures}/${r.current.attempts} (${percent(r.current.rate)}) | ${percent(r.baseline.rate)} of ${r.baseline.attempts}${r.baseline.scope === "action_all_chains" ? " (all chains)" : ""} | ${r.excessFailures} | ${r.zScore.toFixed(1)} | ${r.releaseCorrelated ? "yes" : "no"} |`,
  );
  const releases = [
    ...new Set(
      incident.regressions.flatMap((r) => r.releases.map((x) => x.release)),
    ),
  ];
  const releaseLines = releases.map((release) => {
    const label =
      release === ""
        ? "(not logged)"
        : `[\`${release.slice(0, 12)}\`](https://github.com/${context.consumerRepository}/commit/${release})`;
    const versions = context.sdkVersions.get(release);
    const detail =
      versions == null
        ? "SDK versions not resolved"
        : "error" in versions
          ? `SDK versions unresolved: ${versions.error}`
          : Object.entries(versions.packages)
              .map(([name, version]) =>
                EXACT_VERSION_PATTERN.test(version)
                  ? `\`${name}@${version}\``
                  : `\`${name}\` declared as \`${version}\` (not an exact version; check the lockfile)`,
              )
              .join(", ") || "no SDK dependency";
    return `- ${label}: ${detail}`;
  });
  const evidence = {
    consumer: incident.consumer,
    signal: incident.signal,
    chainId: incident.chainId,
    severity: incident.severity,
    windows: {
      currentStart,
      end,
      baselineHours: windows.baselineHours,
    },
    regressions: incident.regressions,
  };

  return [
    `Opened by production-regression-watch (SDK-1351). A Devin Automation investigates this regression, attributes it to a layer and comments here. Close the issue only after production verification.`,
    "",
    `**Signal:** \`${incident.signal}\` on chain \`${incident.chainId}\` · **Severity:** ${incident.severity} (impact only; \`critical\` needs RCA evidence of a fund-loss path)`,
    `**Window:** ${currentStart} → ${end}, against the previous ${windows.baselineHours}h · [Dashboard](${context.dashboardUrl})`,
    "",
    "| Action | Severity | Current failures | Baseline rate | Excess failures | z | New release |",
    "| -- | -- | -- | -- | -- | -- | -- |",
    ...rows,
    "",
    "**Releases in the current window**",
    ...releaseLines,
    "",
    "<details><summary>Evidence (JSON)</summary>",
    "",
    "```json",
    JSON.stringify(evidence, null, 2),
    "```",
    "",
    "</details>",
  ].join("\n");
}
