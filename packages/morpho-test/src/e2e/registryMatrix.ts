import {
  type AddressLabel,
  type AddressRegistry,
  addressesRegistry,
  ChainId,
  type DeploymentRegistry,
  deployments,
} from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import type { Address } from "viem";

/** An E2E scenario family and the registry labels it needs on a chain. */
export interface E2eScenario {
  /** Family name used in test titles and filters, e.g. `"vaultV2"`. */
  readonly name: string;
  /** Registry labels that must all be registered on a chain for the family to run there. */
  readonly requires: readonly AddressLabel[];
}

/**
 * Minimum fork block per chain. A scenario forks at the highest of this block and the registered
 * deployment blocks of its required labels, so a deployment with a registered block never forks
 * before it exists. Required deployments without a registered block are listed in
 * `E2eTarget.undatedDeployments` for the harness to check onchain. A chain without an entry here
 * can still run when every required label has a registered deployment block.
 */
export const E2E_FORK_BLOCKS: { readonly [chainId: number]: bigint } = {
  [ChainId.EthMainnet]: 26_140_000n,
  [ChainId.OptimismMainnet]: 157_880_000n,
  [ChainId.Unichain]: 60_620_000n,
  [ChainId.PolygonMainnet]: 95_110_000n,
  [ChainId.MonadMainnet]: 111_305_000n,
  [ChainId.WorldChainMainnet]: 36_017_000n,
  [ChainId.StableMainnet]: 42_151_000n,
  [ChainId.HyperliquidMainnet]: 47_899_000n,
  [ChainId.TempoMainnet]: 43_016_000n,
  [ChainId.RobinhoodMainnet]: 82_418_000n,
  [ChainId.ArcMainnet]: 24_719_000n,
  [ChainId.BaseMainnet]: 52_290_000n,
  [ChainId.ArbitrumMainnet]: 512_540_000n,
  [ChainId.KatanaMainnet]: 44_627_000n,
};

/** A required deployment and its registered address. */
export interface E2eDeployment {
  readonly label: AddressLabel;
  readonly address: Address;
}

/** Where an eligible scenario runs on one chain. */
export interface E2eTarget {
  readonly chainId: number;
  /** `ChainId` enum key, e.g. `"BaseMainnet"`, or `Chain<id>` for an unnamed chain. */
  readonly chainName: string;
  readonly forkBlockNumber: bigint;
  /**
   * Required deployments with no registered deployment block. The fork block does not account for
   * them, so the harness must check they have code at `forkBlockNumber`.
   */
  readonly undatedDeployments: readonly E2eDeployment[];
}

/** Whether a scenario can run on a chain, and why not when it can't. */
export type E2eEligibility =
  | { readonly status: "eligible"; readonly target: E2eTarget }
  | {
      readonly status: "missingDeployments";
      readonly chainId: number;
      readonly missing: readonly AddressLabel[];
    }
  | { readonly status: "missingForkBlock"; readonly chainId: number };

/** Registries an eligibility check reads; defaults to the canonical ones. */
export interface E2eRegistries {
  readonly addresses?: AddressRegistry;
  readonly deployments?: DeploymentRegistry;
  readonly forkBlocks?: { readonly [chainId: number]: bigint };
}

/**
 * Thrown by `getE2eRuns` when `E2E_CHAINS` selects an eligible chain but `ERPC_SECRET` is unset.
 */
export class E2eErpcSecretUnsetError extends Error {
  /** @param chainName - Selected chain, e.g. `"BaseMainnet"`. */
  public constructor(public readonly chainName: string) {
    super(
      `E2E_CHAINS selects "${chainName}" but ERPC_SECRET is unset. Set it or drop the chain from E2E_CHAINS.`,
    );
    this.name = "E2eErpcSecretUnsetError";
  }
}

/** Thrown by `getE2eRuns` when an `E2E_CHAINS` entry names no known chain. */
export class E2eUnknownChainError extends Error {
  /** @param entry - The unmatched `E2E_CHAINS` entry. */
  public constructor(public readonly entry: string) {
    super(
      `E2E_CHAINS entry "${entry}" matches no chain. Use a chain id (e.g. "8453") or a ChainId key (e.g. "BaseMainnet").`,
    );
    this.name = "E2eUnknownChainError";
  }
}

/**
 * Thrown by `getE2eRuns` when a chain registers every deployment a scenario needs but no fork block
 * can be derived for it.
 */
export class E2eForkBlockMissingError extends Error {
  /**
   * @param scenario - Scenario name, e.g. `"vaultV2"`.
   * @param chainId - Chain without a fork block.
   */
  public constructor(
    public readonly scenario: string,
    public readonly chainId: number,
  ) {
    super(
      `Scenario "${scenario}" is registered on chain "${chainId}" but has no fork block. Add E2E_FORK_BLOCKS[${chainId}] or the deployment blocks of its required labels.`,
    );
    this.name = "E2eForkBlockMissingError";
  }
}

/**
 * Decides whether a scenario can run on a chain from the address and deployment registries alone.
 *
 * @param params.scenario - Scenario whose `requires` labels are checked.
 * @param params.chainId - Chain to check.
 * @param params.registries - Registries to read instead of the canonical ones.
 * @returns The target to fork, or the reason the chain is ineligible.
 * @example
 * ```ts
 * import { ChainId } from "@morpho-org/blue-sdk";
 * import { getE2eEligibility } from "@morpho-org/morpho-test";
 *
 * const eligibility = getE2eEligibility({
 *   scenario: { name: "midnight", requires: ["midnight", "midnightBundlesV2"] },
 *   chainId: ChainId.PolygonMainnet,
 * });
 * // { status: "missingDeployments", chainId: 137, missing: ["midnight", "midnightBundlesV2"] }
 * ```
 */
export const getE2eEligibility = ({
  scenario,
  chainId,
  registries = {},
}: {
  readonly scenario: E2eScenario;
  readonly chainId: number;
  readonly registries?: E2eRegistries;
}): E2eEligibility => {
  const lookup = (root: unknown, label: AddressLabel) =>
    label
      .split(".")
      .reduce<unknown>(
        (node, key) =>
          node != null && typeof node === "object"
            ? (node as Record<string, unknown>)[key]
            : undefined,
        root,
      );
  const chainAddresses = (registries.addresses ?? addressesRegistry)[chainId];
  const missing = scenario.requires.filter(
    (label) => typeof lookup(chainAddresses, label) !== "string",
  );
  if (missing.length > 0)
    return { status: "missingDeployments", chainId, missing };

  const chainDeployments = (registries.deployments ?? deployments)[chainId];
  const pinned = (registries.forkBlocks ?? E2E_FORK_BLOCKS)[chainId];
  const known: bigint[] = [];
  const undatedDeployments: E2eDeployment[] = [];
  for (const label of scenario.requires) {
    const block = lookup(chainDeployments, label);
    if (typeof block === "bigint") known.push(block);
    else
      undatedDeployments.push({
        label,
        address: lookup(chainAddresses, label) as Address,
      });
  }
  if (pinned == null && (undatedDeployments.length > 0 || known.length === 0))
    return { status: "missingForkBlock", chainId };

  const forkBlockNumber = known.reduce(
    (max, block) => (block > max ? block : max),
    pinned ?? 0n,
  );

  return {
    status: "eligible",
    target: {
      chainId,
      chainName: ChainId[chainId] ?? `Chain${chainId}`,
      forkBlockNumber,
      undatedDeployments,
    },
  };
};

/**
 * Evaluates a scenario on every chain of the address registry.
 *
 * @param scenario - Scenario whose `requires` labels are checked.
 * @param registries - Registries to read instead of the canonical ones.
 * @returns One eligibility result per registered chain, in ascending chain-id order.
 * @example
 * ```ts
 * import { getE2eMatrix } from "@morpho-org/morpho-test";
 *
 * const chainIds = getE2eMatrix({
 *   name: "vaultV2",
 *   requires: ["bundles.vaultBundlesV1", "vaultV2Factory"],
 * }).flatMap((entry) => (entry.status === "eligible" ? [entry.target.chainId] : []));
 * ```
 */
export const getE2eMatrix = (
  scenario: E2eScenario,
  registries: E2eRegistries = {},
): readonly E2eEligibility[] =>
  Object.keys(registries.addresses ?? addressesRegistry)
    .map(Number)
    .map((chainId) => getE2eEligibility({ scenario, chainId, registries }));

/** A target selected to run, or skipped with the reason why. */
export type E2eRun =
  | {
      readonly status: "run";
      readonly target: E2eTarget;
      readonly forkUrl: string;
    }
  | {
      readonly status: "skip";
      readonly target: E2eTarget;
      readonly reason: string;
    };

/**
 * Selects which eligible targets of a scenario run in the given environment.
 *
 * `E2E_CHAINS` (comma-separated chain ids or `ChainId` keys) restricts the chains; each entry must
 * name a known chain. Every eligible chain forks through the Morpho eRPC when `ERPC_SECRET` is set
 * (see `getErpcForkUrl` from `@morpho-org/test`). A selected chain where the scenario is not
 * deployed is left out.
 * Without `E2E_CHAINS` (or when it is blank), chains are skipped when `ERPC_SECRET` is unset.
 *
 * The fork URL embeds the secret, so runners must not put `forkUrl` in test names or logs.
 *
 * @param params.scenario - Scenario to select targets for.
 * @param params.env - Environment to read `ERPC_SECRET` and `E2E_CHAINS` from.
 * @param params.registries - Registries to read instead of the canonical ones.
 * @returns The runs, and the skips when ERPC_SECRET is unset, for eligible chains matching the
 *   environment selection.
 * @throws {E2eUnknownChainError} When an `E2E_CHAINS` entry names no known chain.
 * @throws {E2eErpcSecretUnsetError} When `E2E_CHAINS` names an eligible chain and `ERPC_SECRET` is
 * unset.
 * @throws {E2eForkBlockMissingError} When an included chain registers the scenario but has no fork
 *   block.
 * @example
 * ```ts
 * import { getE2eRuns } from "@morpho-org/morpho-test";
 *
 * const runs = getE2eRuns({
 *   scenario: { name: "vaultV2", requires: ["bundles.vaultBundlesV1", "vaultV2Factory"] },
 *   env: { E2E_CHAINS: "8453", ERPC_SECRET: "key" },
 * });
 * // [{ status: "run", forkUrl: "https://rpc.morpho.dev/cache/evm/8453?secret=key", target: { chainId: 8453, ... } }]
 * ```
 */
export const getE2eRuns = ({
  scenario,
  env,
  registries = {},
}: {
  readonly scenario: E2eScenario;
  readonly env: { readonly [name: string]: string | undefined };
  readonly registries?: E2eRegistries;
}): readonly E2eRun[] => {
  const selected = (env.E2E_CHAINS ?? "")
    .split(",")
    .map((chain) => chain.trim())
    .filter((chain) => chain !== "");
  const matrix = getE2eMatrix(scenario, registries);
  const knownChainIds = new Set([
    ...Object.values(ChainId).filter((id) => typeof id === "number"),
    ...matrix.map((entry) =>
      entry.status === "eligible" ? entry.target.chainId : entry.chainId,
    ),
  ]);
  const selectedIds = selected.map((entry) => {
    const chainId = /^\d+$/.test(entry)
      ? Number(entry)
      : ChainId[entry as keyof typeof ChainId];
    if (typeof chainId !== "number" || !knownChainIds.has(chainId))
      throw new E2eUnknownChainError(entry);

    return chainId;
  });

  return matrix.flatMap((entry): E2eRun[] => {
    if (entry.status === "missingDeployments") return [];
    const chainId =
      entry.status === "eligible" ? entry.target.chainId : entry.chainId;
    if (selectedIds.length > 0 && !selectedIds.includes(chainId)) return [];
    if (entry.status === "missingForkBlock")
      throw new E2eForkBlockMissingError(scenario.name, chainId);

    const { target } = entry;
    const forkUrl = getErpcForkUrl(target.chainId, env.ERPC_SECRET);
    if (forkUrl !== undefined) return [{ status: "run", target, forkUrl }];
    if (selectedIds.length > 0)
      throw new E2eErpcSecretUnsetError(target.chainName);

    return [
      {
        status: "skip",
        target,
        reason: "ERPC_SECRET is unset",
      },
    ];
  });
};
