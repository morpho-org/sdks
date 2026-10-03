import { describe, expect, test } from "vitest";

import {
  buildOutcomeQuery,
  CONSUMERS,
  countSignal,
  DEFAULT_THRESHOLDS,
  detectRegressions,
  groupIncidents,
  incidentTitle,
  type OutcomeRow,
  parseOutcomeRows,
  renderIncidentBody,
  zScore,
} from "./tx-health.ts";

const NOW_MS = Date.parse("2026-10-03T00:00:00.000Z");
const WINDOWS = { nowMs: NOW_MS, currentHours: 24, baselineHours: 168 };
const CURRENT_START_MS = NOW_MS - 24 * 3_600_000;
const OLD_RELEASE = "a".repeat(40);
const NEW_RELEASE = "b".repeat(40);
const VVRM = CONSUMERS[0];

function row(overrides: Partial<OutcomeRow>): OutcomeRow {
  return {
    actionType: "borrow",
    chainId: "1",
    release: OLD_RELEASE,
    window: "baseline",
    successes: 0,
    txFailures: 0,
    simulationFailures: 0,
    bypassedSimulationFailures: 0,
    onchainReverts: 0,
    firstSeenMs: CURRENT_START_MS - 100 * 3_600_000,
    ...overrides,
  };
}

const HEALTHY_BASELINE = row({ successes: 990, simulationFailures: 10 });

describe("buildOutcomeQuery", () => {
  test("bounds both windows with absolute timestamps and keeps dashboard exclusions", () => {
    const query = buildOutcomeQuery(VVRM, WINDOWS);
    const end = NOW_MS / 1000;
    expect(query).toContain(
      `if(dt >= toDateTime(${end - 86_400}), 'current', 'baseline')`,
    );
    expect(query).toContain(
      `WHERE dt >= toDateTime(${end - 192 * 3600}) AND dt < toDateTime(${end})`,
    );
    expect(query).toContain(
      "FROM remote(t384553_vvrm_app_vercel_otel_metrics)",
    );
    expect(query).toContain("NOT IN ('aaveV3MigrateToVaultV2', 'unknown', '')");
    expect(query).toContain(
      "AND NOT (label('action_type') = 'wrapLegacyMorpho'",
    );
    expect(query.endsWith("FORMAT JSONEachRow")).toBe(true);
  });

  test("escapes quotes in excluded actions", () => {
    const query = buildOutcomeQuery(
      { ...VVRM, excludedActions: ["it's"], excludedPredicates: [] },
      WINDOWS,
    );
    expect(query).toContain("NOT IN ('it''s')");
    expect(query).not.toContain("AND NOT (");
  });
});

describe("parseOutcomeRows", () => {
  test("parses quoted 64-bit counts and skips blank lines", () => {
    const body = `${JSON.stringify({
      action_type: "borrow",
      chain_id: "1",
      release: "",
      window: "current",
      successes: "3",
      tx_failures: 1,
      simulation_failures: "2",
      bypassed_simulation_failures: "0",
      onchain_reverts: "1",
      first_seen: "1790000000",
    })}\n\n`;
    expect(parseOutcomeRows(body)).toEqual([
      {
        actionType: "borrow",
        chainId: "1",
        release: "",
        window: "current",
        successes: 3,
        txFailures: 1,
        simulationFailures: 2,
        bypassedSimulationFailures: 0,
        onchainReverts: 1,
        firstSeenMs: 1_790_000_000_000,
      },
    ]);
  });

  test.each([
    [
      { window: "later" },
      'Expected window "current" or "baseline", got "later".',
    ],
    [
      { successes: "-1" },
      'Expected a non-negative integer "successes", got "-1".',
    ],
    [{ action_type: 1 }, 'Expected a string "action_type", got "1".'],
  ])("rejects malformed rows %j", (override, message) => {
    const base = {
      action_type: "borrow",
      chain_id: "1",
      release: "",
      window: "current",
      successes: "0",
      tx_failures: "0",
      simulation_failures: "0",
      bypassed_simulation_failures: "0",
      onchain_reverts: "0",
      first_seen: "0",
    };
    expect(() =>
      parseOutcomeRows(JSON.stringify({ ...base, ...override })),
    ).toThrow(message);
  });
});

describe("countSignal", () => {
  const outcomes = row({
    successes: 10,
    txFailures: 3,
    simulationFailures: 4,
    bypassedSimulationFailures: 1,
    onchainReverts: 2,
  });

  test("uses the dashboard denominators", () => {
    expect(countSignal(outcomes, "tx_failure")).toEqual({
      failures: 3,
      attempts: 13,
    });
    expect(countSignal(outcomes, "onchain_revert")).toEqual({
      failures: 2,
      attempts: 13,
    });
    expect(countSignal(outcomes, "simulation_failure")).toEqual({
      failures: 3,
      attempts: 16,
    });
  });

  test("skips actions outside a signal's scope", () => {
    expect(
      countSignal({ ...outcomes, actionType: "signature" }, "tx_failure"),
    ).toBeNull();
    expect(
      countSignal(
        { ...outcomes, actionType: "approval_tx" },
        "simulation_failure",
      ),
    ).toBeNull();
    expect(
      countSignal({ ...outcomes, actionType: "approval_tx" }, "tx_failure"),
    ).toEqual({
      failures: 3,
      attempts: 13,
    });
  });
});

describe("zScore", () => {
  test("is 0 for empty windows or zero variance", () => {
    expect(
      zScore({ failures: 0, attempts: 0 }, { failures: 1, attempts: 10 }),
    ).toBe(0);
    expect(
      zScore({ failures: 0, attempts: 10 }, { failures: 0, attempts: 10 }),
    ).toBe(0);
  });

  test("is positive when the current rate is higher", () => {
    expect(
      zScore({ failures: 20, attempts: 100 }, { failures: 10, attempts: 1000 }),
    ).toBeGreaterThan(DEFAULT_THRESHOLDS.minZScore);
  });
});

describe("detectRegressions", () => {
  test("flags a significant simulation regression tied to a new release", () => {
    const rows = [
      HEALTHY_BASELINE,
      row({ window: "current", successes: 80, simulationFailures: 2 }),
      row({
        window: "current",
        release: NEW_RELEASE,
        successes: 40,
        simulationFailures: 38,
        firstSeenMs: CURRENT_START_MS + 3_600_000,
      }),
    ];
    const [regression, ...rest] = detectRegressions(rows, {
      consumer: VVRM,
      windows: WINDOWS,
    });
    expect(rest).toEqual([]);
    expect(regression).toMatchObject({
      fingerprint: "vvrm-app:simulation_failure:borrow:1",
      signal: "simulation_failure",
      severity: "high",
      current: { failures: 40, attempts: 160, rate: 0.25 },
      baseline: {
        failures: 10,
        attempts: 1000,
        rate: 0.01,
        scope: "action_chain",
      },
      excessFailures: 38,
      releaseCorrelated: true,
    });
    expect(
      regression?.releases.map(({ release, isNew }) => [release, isNew]),
    ).toEqual([
      [NEW_RELEASE, true],
      [OLD_RELEASE, false],
    ]);
  });

  test.each([
    ["too few attempts", { successes: 10, simulationFailures: 9 }],
    ["too few failures", { successes: 20, simulationFailures: 4 }],
    ["too small an increase", { successes: 960, simulationFailures: 40 }],
  ])("ignores %s", (_, current) => {
    expect(
      detectRegressions(
        [HEALTHY_BASELINE, row({ window: "current", ...current })],
        { consumer: VVRM, windows: WINDOWS },
      ),
    ).toEqual([]);
  });

  test("requires the rate to at least double", () => {
    const rows = [
      row({ successes: 800, simulationFailures: 200 }),
      row({ window: "current", successes: 650, simulationFailures: 350 }),
    ];
    expect(
      detectRegressions(rows, { consumer: VVRM, windows: WINDOWS }),
    ).toEqual([]);
  });

  test("falls back to the action's baseline across chains for a new pair", () => {
    const rows = [
      HEALTHY_BASELINE,
      row({ chainId: "999", successes: 5 }),
      row({
        chainId: "999",
        window: "current",
        successes: 20,
        simulationFailures: 10,
      }),
    ];
    const [regression] = detectRegressions(rows, {
      consumer: VVRM,
      windows: WINDOWS,
    });
    expect(regression?.baseline).toMatchObject({
      scope: "action_all_chains",
      attempts: 1005,
    });
    expect(regression?.severity).toBe("medium");
  });

  test("ignores a pair without any baseline", () => {
    const rows = [
      row({ window: "current", successes: 20, simulationFailures: 20 }),
    ];
    expect(
      detectRegressions(rows, { consumer: VVRM, windows: WINDOWS }),
    ).toEqual([]);
  });

  test("does not mark unlogged releases as new", () => {
    const rows = [
      HEALTHY_BASELINE,
      row({
        window: "current",
        release: "",
        successes: 60,
        simulationFailures: 40,
        firstSeenMs: CURRENT_START_MS + 1,
      }),
    ];
    const [regression] = detectRegressions(rows, {
      consumer: VVRM,
      windows: WINDOWS,
    });
    expect(regression?.releases[0]?.isNew).toBe(false);
    expect(regression?.releaseCorrelated).toBe(false);
  });

  test("sorts by excess failures across signals", () => {
    const rows = [
      row({ successes: 1000 }),
      row({
        window: "current",
        successes: 100,
        txFailures: 30,
        onchainReverts: 10,
      }),
    ];
    expect(
      detectRegressions(rows, { consumer: VVRM, windows: WINDOWS }).map(
        (r) => r.signal,
      ),
    ).toEqual(["tx_failure", "onchain_revert"]);
  });
});

describe("groupIncidents", () => {
  const rows = [
    HEALTHY_BASELINE,
    row({ actionType: "repay", successes: 990, simulationFailures: 10 }),
    row({ window: "current", successes: 100, simulationFailures: 30 }),
    row({
      window: "current",
      actionType: "repay",
      successes: 100,
      simulationFailures: 15,
    }),
    row({ chainId: "8453", successes: 1000 }),
    row({
      chainId: "8453",
      window: "current",
      successes: 40,
      simulationFailures: 6,
    }),
  ];

  test("groups regressions by signal and chain and drops low severity", () => {
    const incidents = groupIncidents(
      detectRegressions(rows, { consumer: VVRM, windows: WINDOWS }),
    );
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      title: "production regression: vvrm-app simulation_failure on chain 1",
      severity: "high",
      chainId: "1",
    });
    expect(incidents[0]?.regressions.map((r) => r.actionType)).toEqual([
      "borrow",
      "repay",
    ]);
  });

  test("keeps low severity when asked", () => {
    expect(
      groupIncidents(
        detectRegressions(rows, { consumer: VVRM, windows: WINDOWS }),
        "low",
      ).map((i) => i.title),
    ).toEqual([
      "production regression: vvrm-app simulation_failure on chain 1",
      "production regression: vvrm-app simulation_failure on chain 8453",
    ]);
  });

  test("builds the title from consumer, signal and chain", () => {
    expect(
      incidentTitle({
        consumer: "vvrm-app",
        signal: "tx_failure",
        chainId: "10",
      }),
    ).toBe("production regression: vvrm-app tx_failure on chain 10");
  });
});

describe("renderIncidentBody", () => {
  test("renders the summary, release SDK versions and evidence", () => {
    const rows = [
      HEALTHY_BASELINE,
      row({ chainId: "999", successes: 10 }),
      row({ window: "current", successes: 100, simulationFailures: 30 }),
      row({
        window: "current",
        release: NEW_RELEASE,
        successes: 5,
        simulationFailures: 5,
      }),
      row({ window: "current", release: "", successes: 5 }),
    ];
    const [incident] = groupIncidents(
      detectRegressions(rows, { consumer: VVRM, windows: WINDOWS }),
    );
    if (incident == null) throw new Error("expected an incident");
    const body = renderIncidentBody(incident, {
      windows: WINDOWS,
      dashboardUrl: VVRM.dashboardUrl,
      consumerRepository: VVRM.repository,
      sdkVersions: new Map([
        [OLD_RELEASE, { packages: { "@morpho-org/morpho-sdk": "6.4.0" } }],
        [NEW_RELEASE, { error: "GitHub contents request failed (404)" }],
      ]),
    });
    expect(body).toContain(
      "| `borrow` | high | 35/145 (24.1%) | 1.0% of 1000 | 34 | 13.4 | no |",
    );
    expect(body).toContain(
      `- [\`aaaaaaaaaaaa\`](https://github.com/morpho-org/morpho-apps/commit/${OLD_RELEASE}): \`@morpho-org/morpho-sdk@6.4.0\``,
    );
    expect(body).toContain(
      "SDK versions unresolved: GitHub contents request failed (404)",
    );
    expect(body).toContain("- (not logged): SDK versions not resolved");
    expect(body).toContain(
      "**Window:** 2026-10-02T00:00:00.000Z → 2026-10-03T00:00:00.000Z",
    );
    const json = body.split("```json\n")[1]?.split("\n```")[0];
    expect(JSON.parse(json ?? "")).toMatchObject({
      signal: "simulation_failure",
      regressions: [{ fingerprint: "vvrm-app:simulation_failure:borrow:1" }],
    });
  });

  test("states when a release has no SDK dependency", () => {
    const rows = [
      HEALTHY_BASELINE,
      row({ window: "current", successes: 100, simulationFailures: 30 }),
    ];
    const [incident] = groupIncidents(
      detectRegressions(rows, { consumer: VVRM, windows: WINDOWS }),
    );
    if (incident == null) throw new Error("expected an incident");
    expect(
      renderIncidentBody(incident, {
        windows: WINDOWS,
        dashboardUrl: VVRM.dashboardUrl,
        consumerRepository: VVRM.repository,
        sdkVersions: new Map([[OLD_RELEASE, { packages: {} }]]),
      }),
    ).toContain(": no SDK dependency");
  });
});
