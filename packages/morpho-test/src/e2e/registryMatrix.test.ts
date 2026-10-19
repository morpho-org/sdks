import {
  type AddressRegistry,
  addressesRegistry,
  ChainId,
  type DeploymentRegistry,
  deployments,
} from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { describe, expect, test } from "vitest";
import {
  E2E_FORK_BLOCKS,
  E2eErpcSecretUnsetError,
  E2eForkBlockMissingError,
  type E2eScenario,
  E2eUnknownChainError,
  getE2eEligibility,
  getE2eMatrix,
  getE2eRuns,
} from "./registryMatrix.js";

const midnightScenario: E2eScenario = {
  name: "midnight",
  requires: ["midnight", "midnightBundlesV2", "setterRatifier"],
};
const vaultScenario: E2eScenario = {
  name: "vaultV2",
  requires: ["bundles.vaultBundlesV1", "vaultV2Factory", "wNative"],
};
const blueScenario: E2eScenario = {
  name: "blue",
  requires: ["blue", "adaptiveCurveIrm"],
};
const vaultExitScenario: E2eScenario = {
  name: "vaultExit",
  requires: [
    "blue",
    "adaptiveCurveIrm",
    "vaultV2Factory",
    "morphoMarketV1AdapterV2Factory",
    "bundles.vaultExitBundlesV1",
  ],
};

const eligibleChainIds = (scenario: E2eScenario, registries = {}) =>
  getE2eMatrix(scenario, registries).flatMap((entry) =>
    entry.status === "eligible" ? [entry.target.chainId] : [],
  );

const withArbitrumMidnight = () =>
  ({
    ...addressesRegistry,
    [ChainId.ArbitrumMainnet]: {
      ...addressesRegistry[ChainId.ArbitrumMainnet],
      midnight: "0x0000000000000000000000000000000000000001",
      midnightBundlesV2: "0x0000000000000000000000000000000000000002",
      setterRatifier: "0x0000000000000000000000000000000000000003",
    },
  }) as AddressRegistry;

describe("getE2eEligibility", () => {
  test("behavior: lists every required label missing from the chain", () => {
    expect(
      getE2eEligibility({
        scenario: midnightScenario,
        chainId: ChainId.PolygonMainnet,
      }),
    ).toStrictEqual({
      status: "missingDeployments",
      chainId: ChainId.PolygonMainnet,
      missing: ["midnight", "midnightBundlesV2", "setterRatifier"],
    });
  });

  test("behavior: resolves nested labels such as bundles.vaultBundlesV1", () => {
    expect(
      getE2eEligibility({
        scenario: vaultScenario,
        chainId: ChainId.EthMainnet,
      }).status,
    ).toBe("eligible");
    expect(
      getE2eEligibility({
        scenario: vaultScenario,
        chainId: ChainId.FlareMainnet,
      }),
    ).toMatchObject({
      status: "missingDeployments",
      missing: ["bundles.vaultBundlesV1"],
    });
  });

  test("behavior: forks at the pinned block when deployments are older", () => {
    expect(
      getE2eEligibility({
        scenario: midnightScenario,
        chainId: ChainId.BaseMainnet,
      }),
    ).toStrictEqual({
      status: "eligible",
      target: {
        chainId: ChainId.BaseMainnet,
        chainName: "BaseMainnet",
        forkBlockNumber: E2E_FORK_BLOCKS[ChainId.BaseMainnet],
        undatedDeployments: [],
      },
    });
  });

  test("behavior: lists required deployments without a registered block on a pinned chain", () => {
    const { midnightBundlesV2: _, ...undated } =
      deployments[ChainId.BaseMainnet]!;
    const eligibility = getE2eEligibility({
      scenario: midnightScenario,
      chainId: ChainId.BaseMainnet,
      registries: {
        deployments: {
          ...deployments,
          [ChainId.BaseMainnet]: undated,
        } as DeploymentRegistry,
      },
    });

    expect(eligibility).toStrictEqual({
      status: "eligible",
      target: expect.objectContaining({
        forkBlockNumber: E2E_FORK_BLOCKS[ChainId.BaseMainnet],
        undatedDeployments: [
          {
            label: "midnightBundlesV2",
            address: addressesRegistry[ChainId.BaseMainnet]!.midnightBundlesV2,
          },
        ],
      }),
    });
  });

  test("behavior: forks after a required deployment registered past the pinned block", () => {
    const pinned = E2E_FORK_BLOCKS[ChainId.BaseMainnet]!;
    const later = {
      ...deployments,
      [ChainId.BaseMainnet]: {
        ...deployments[ChainId.BaseMainnet],
        midnightBundlesV2: pinned + 10n,
      },
    } as DeploymentRegistry;

    expect(
      getE2eEligibility({
        scenario: midnightScenario,
        chainId: ChainId.BaseMainnet,
        registries: {
          deployments: later,
        },
      }),
    ).toMatchObject({
      status: "eligible",
      target: { forkBlockNumber: pinned + 10n },
    });
  });

  test("behavior: derives the fork block from deployments on an unpinned chain", () => {
    expect(
      getE2eEligibility({
        scenario: { name: "blue", requires: ["blue", "adaptiveCurveIrm"] },
        chainId: ChainId.FlareMainnet,
      }),
    ).toMatchObject({
      status: "eligible",
      target: {
        forkBlockNumber:
          deployments[ChainId.FlareMainnet].blue >
          deployments[ChainId.FlareMainnet].adaptiveCurveIrm
            ? deployments[ChainId.FlareMainnet].blue
            : deployments[ChainId.FlareMainnet].adaptiveCurveIrm,
      },
    });
  });

  test("behavior: rejects an unpinned chain when a required label has no deployment block", () => {
    expect(
      getE2eEligibility({
        scenario: vaultScenario,
        chainId: ChainId.EthMainnet,
        registries: { forkBlocks: {} },
      }),
    ).toStrictEqual({
      status: "missingForkBlock",
      chainId: ChainId.EthMainnet,
    });
  });

  test("behavior: rejects an unpinned chain when the scenario requires no deployment", () => {
    expect(
      getE2eEligibility({
        scenario: { name: "empty", requires: [] },
        chainId: ChainId.EthMainnet,
        registries: { forkBlocks: {} },
      }),
    ).toStrictEqual({
      status: "missingForkBlock",
      chainId: ChainId.EthMainnet,
    });
  });
});

describe("getE2eMatrix", () => {
  test("behavior: adding Midnight to a chain's registry makes that chain eligible", () => {
    expect(eligibleChainIds(midnightScenario)).not.toContain(
      ChainId.ArbitrumMainnet,
    );

    expect(
      eligibleChainIds(midnightScenario, { addresses: withArbitrumMidnight() }),
    ).toStrictEqual(
      [...eligibleChainIds(midnightScenario), ChainId.ArbitrumMainnet].sort(
        (a, b) => a - b,
      ),
    );
  });

  test("behavior: adding Midnight leaves scenarios that don't require it unchanged", () => {
    expect(
      eligibleChainIds(vaultScenario, { addresses: withArbitrumMidnight() }),
    ).toStrictEqual(eligibleChainIds(vaultScenario));
  });

  test("invariant: every chain with registered bundles resolves a fork block", () => {
    const missingForkBlock = getE2eMatrix({
      name: "bundles",
      requires: [
        "bundles.vaultBundlesV1",
        "bundles.blueBundlesV1",
        "bundles.vaultExitBundlesV1",
      ],
    }).filter((entry) => entry.status === "missingForkBlock");

    expect(missingForkBlock).toStrictEqual([]);
  });

  test("behavior: includes Tempo when its Blue deployment supports the scenario", () => {
    expect(E2E_FORK_BLOCKS[ChainId.TempoMainnet]).toBeDefined();
    expect(
      getE2eMatrix(blueScenario).find(
        (entry) =>
          entry.status === "eligible" &&
          entry.target.chainId === ChainId.TempoMainnet,
      ),
    ).toMatchObject({
      status: "eligible",
      target: { chainId: ChainId.TempoMainnet },
    });

    const injected = getE2eMatrix(blueScenario, {
      addresses: {
        [ChainId.TempoMainnet]: addressesRegistry[ChainId.TempoMainnet]!,
      } as AddressRegistry,
    });
    expect(injected).toHaveLength(1);
    expect(injected[0]).toMatchObject({
      status: "eligible",
      target: { chainId: ChainId.TempoMainnet },
    });
  });

  test("behavior: includes Tempo as eligible in the vaultExit matrix", () => {
    expect(eligibleChainIds(vaultExitScenario)).toContain(ChainId.TempoMainnet);
  });
});

describe("getE2eRuns", () => {
  test("behavior: forks every eligible chain through eRPC when ERPC_SECRET is set", () => {
    const runs = getE2eRuns({
      scenario: midnightScenario,
      env: { ERPC_SECRET: "ci-key" },
    });

    expect(
      runs.map((run) => [
        run.target.chainId,
        run.status,
        run.status === "run" && run.forkUrl,
      ]),
    ).toStrictEqual(
      eligibleChainIds(midnightScenario).map((chainId) => [
        chainId,
        "run",
        getErpcForkUrl(chainId, "ci-key"),
      ]),
    );
  });

  test("behavior: treats an empty ERPC_SECRET as unset", () => {
    const env = { ERPC_SECRET: "" };

    expect(
      getE2eRuns({ scenario: midnightScenario, env }).map((run) => run.status),
    ).toStrictEqual(eligibleChainIds(midnightScenario).map(() => "skip"));
    expect(
      getE2eRuns({ scenario: midnightScenario, env }).map((run) =>
        run.status === "skip" ? run.reason : undefined,
      ),
    ).toStrictEqual(
      eligibleChainIds(midnightScenario).map(() => "ERPC_SECRET is unset"),
    );
    expect(() =>
      getE2eRuns({
        scenario: midnightScenario,
        env: { ...env, E2E_CHAINS: "BaseMainnet" },
      }),
    ).toThrow(E2eErpcSecretUnsetError);
  });

  test("invariant: only forkUrl carries ERPC_SECRET", () => {
    const secret = "ci-key-not-for-logs";
    const [run] = getE2eRuns({
      scenario: midnightScenario,
      env: { ERPC_SECRET: secret, E2E_CHAINS: "BaseMainnet" },
    });

    expect(run?.status === "run" && run.forkUrl).toContain(secret);
    expect(
      JSON.stringify(run?.target, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).not.toContain(secret);
  });

  test("behavior: skips eligible chains when ERPC_SECRET is unset", () => {
    const runs = getE2eRuns({
      scenario: midnightScenario,
      env: {},
    });

    expect(runs.map((run) => [run.target.chainId, run.status])).toStrictEqual(
      eligibleChainIds(midnightScenario).map((chainId) => [chainId, "skip"]),
    );
  });

  test("behavior: E2E_CHAINS keeps only the named chains, by id or ChainId key", () => {
    const env = {
      E2E_CHAINS: "1, BaseMainnet",
      ERPC_SECRET: "key",
    };

    expect(getE2eRuns({ scenario: midnightScenario, env })).toStrictEqual([
      expect.objectContaining({
        status: "run",
        forkUrl: getErpcForkUrl(ChainId.EthMainnet, "key"),
        target: expect.objectContaining({ chainId: ChainId.EthMainnet }),
      }),
      expect.objectContaining({
        status: "run",
        forkUrl: getErpcForkUrl(ChainId.BaseMainnet, "key"),
        target: expect.objectContaining({ chainId: ChainId.BaseMainnet }),
      }),
    ]);
  });

  test("behavior: E2E_CHAINS leaves out other chains that ERPC_SECRET could fork", () => {
    const chains = [
      ChainId.EthMainnet,
      ChainId.BaseMainnet,
      ChainId.ArbitrumMainnet,
    ];
    const allRuns = getE2eRuns({
      scenario: vaultScenario,
      env: { ERPC_SECRET: "secret" },
    });
    const runs = getE2eRuns({
      scenario: vaultScenario,
      env: {
        ERPC_SECRET: "secret",
        E2E_CHAINS: "EthMainnet,BaseMainnet,ArbitrumMainnet",
      },
    });

    expect(allRuns.some((run) => !chains.includes(run.target.chainId))).toBe(
      true,
    );
    expect(runs).toStrictEqual(
      allRuns.filter((run) => chains.includes(run.target.chainId)),
    );
    expect(runs.map((run) => run.status)).toStrictEqual(runs.map(() => "run"));
  });

  test("behavior: throws when E2E_CHAINS names a chain without ERPC_SECRET", () => {
    const runs = () =>
      getE2eRuns({
        scenario: midnightScenario,
        env: { E2E_CHAINS: "BaseMainnet" },
      });

    expect(runs).toThrow(E2eErpcSecretUnsetError);
    expect(runs).toThrow(
      'E2E_CHAINS selects "BaseMainnet" but ERPC_SECRET is unset. Set it or drop the chain from E2E_CHAINS.',
    );
  });

  test("behavior: throws on an E2E_CHAINS entry that names no chain", () => {
    for (const entry of ["Base", "basemainnet", "999999"])
      expect(() =>
        getE2eRuns({
          scenario: midnightScenario,
          env: { E2E_CHAINS: `1,${entry}`, ERPC_SECRET: "key" },
        }),
      ).toThrow(E2eUnknownChainError);
  });

  test("behavior: E2E_CHAINS selects a chain registered only in injected registries", () => {
    const registries = {
      addresses: {
        999999: {
          midnight: "0x0000000000000000000000000000000000000001",
          midnightBundlesV2: "0x0000000000000000000000000000000000000002",
          setterRatifier: "0x0000000000000000000000000000000000000003",
        },
      } as unknown as AddressRegistry,
      deployments: {} as DeploymentRegistry,
      forkBlocks: { 999999: 100n },
    };

    expect(
      getE2eRuns({
        scenario: midnightScenario,
        env: { E2E_CHAINS: "999999", ERPC_SECRET: "key" },
        registries,
      }),
    ).toStrictEqual([
      expect.objectContaining({
        status: "run",
        forkUrl: getErpcForkUrl(999_999, "key"),
        target: expect.objectContaining({
          chainId: 999_999,
          forkBlockNumber: 100n,
        }),
      }),
    ]);
  });

  test("behavior: leaves out a selected chain where the scenario is not deployed", () => {
    expect(
      getE2eRuns({
        scenario: midnightScenario,
        env: { E2E_CHAINS: "PolygonMainnet" },
      }),
    ).toStrictEqual([]);
  });

  test("behavior: a blank E2E_CHAINS selects every chain", () => {
    for (const E2E_CHAINS of ["", " ", " , "])
      expect(
        getE2eRuns({ scenario: midnightScenario, env: { E2E_CHAINS } }),
      ).toStrictEqual(getE2eRuns({ scenario: midnightScenario, env: {} }));
  });

  test("behavior: selects Tempo at its pinned fork block", () => {
    const runs = getE2eRuns({
      scenario: vaultExitScenario,
      env: { E2E_CHAINS: "TempoMainnet", ERPC_SECRET: "test-secret" },
    });

    expect(runs).toHaveLength(1);
    expect(runs).toMatchObject([
      {
        status: "run",
        target: {
          chainId: ChainId.TempoMainnet,
          chainName: "TempoMainnet",
          forkBlockNumber: 43_016_000n,
        },
      },
    ]);
  });

  test("behavior: throws when a kept chain registers the scenario but has no fork block", () => {
    const { [ChainId.BaseMainnet]: _, ...forkBlocks } = E2E_FORK_BLOCKS;
    const { midnightBundlesV2: __, ...undated } =
      deployments[ChainId.BaseMainnet]!;
    const registries = {
      forkBlocks,
      deployments: {
        ...deployments,
        [ChainId.BaseMainnet]: undated,
      } as DeploymentRegistry,
    };

    expect(() =>
      getE2eRuns({ scenario: midnightScenario, env: {}, registries }),
    ).toThrow(E2eForkBlockMissingError);
    expect(
      getE2eRuns({
        scenario: midnightScenario,
        env: { E2E_CHAINS: "1", ERPC_SECRET: "key" },
        registries,
      }),
    ).toHaveLength(1);
  });
});
