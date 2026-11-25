import { blueAbi, midnightEventsAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeEventLog,
  getAbiItem,
  type Hex,
  isAddressEqual,
  toEventSelector,
} from "viem";
import { UnexpectedPositionChangeError } from "../errors.js";
import type {
  InputOperationLimit,
  OperationLimit,
  OperationType,
} from "../limits.js";
import type { RawLog } from "../types.js";
import type { ResolvedSlippageOperation } from "./backends/resolve-assets.js";

type Kind =
  | "Borrow"
  | "Withdraw"
  | "WithdrawCollateral"
  | "Take"
  | "SupplyCollateral";
type Operation = OperationLimit | InputOperationLimit;
type CollateralMovement = {
  readonly marketId: Hex;
  readonly account: Address;
  readonly assets: bigint;
};

type RefinanceMarketTokens = {
  readonly sourceMarketId: Hex;
  readonly targetMarketId: Hex;
  readonly sourceToken: Address;
  readonly targetToken: Address;
};

function aggregateCollateralMovements(
  movements: readonly CollateralMovement[],
): readonly CollateralMovement[] {
  const aggregates = new Map<string, CollateralMovement>();
  for (const movement of movements) {
    const key = `${movement.marketId.toLowerCase()}:${movement.account.toLowerCase()}`;
    const aggregate = aggregates.get(key);
    aggregates.set(
      key,
      aggregate === undefined
        ? movement
        : { ...aggregate, assets: aggregate.assets + movement.assets },
    );
  }
  return [...aggregates.values()];
}

const POSITION_CHANGES = {
  blueSupply: [],
  blueWithdraw: ["Withdraw"],
  blueSupplyCollateral: [],
  blueBorrow: ["Borrow"],
  blueSupplyCollateralBorrow: ["Borrow"],
  blueRepay: [],
  blueWithdrawCollateral: ["WithdrawCollateral"],
  blueRepayWithdrawCollateral: ["WithdrawCollateral"],
  blueRefinance: ["Borrow", "WithdrawCollateral"],
  vaultV1Deposit: [],
  vaultV2Deposit: [],
  vaultV1Withdraw: [],
  vaultV2Withdraw: [],
  vaultV1Redeem: [],
  vaultV2Redeem: [],
  vaultV2ForceWithdraw: [],
  vaultV2ForceRedeem: [],
  vaultV1InKindRedeem: [],
  vaultV2InKindRedeem: [],
  vaultV1MigrateToV2: [],
  midnightSupplyCollateral: [],
  midnightSupplyCollateralBatch: [],
  midnightWithdrawCollateralBatch: ["WithdrawCollateral"],
  midnightSupplyCollateralMakeBorrow: [],
  midnightSupplyBlueMakeLend: [],
  midnightRedeem: ["Withdraw"],
  midnightTakeLend: [],
  midnightTakeBorrow: ["Take", "Withdraw"],
  midnightTakeWithdraw: ["Take", "Withdraw"],
  midnightSupplyCollateralTakeBorrow: ["Take", "Withdraw"],
  midnightRepayWithdrawCollateral: ["WithdrawCollateral"],
  midnightTakeRepayWithdrawCollateral: ["WithdrawCollateral"],
} as const satisfies Record<OperationType, readonly Kind[]>;

const blueEvents = [
  getAbiItem({ abi: blueAbi, name: "Borrow" }),
  getAbiItem({ abi: blueAbi, name: "Withdraw" }),
  getAbiItem({ abi: blueAbi, name: "WithdrawCollateral" }),
  getAbiItem({ abi: blueAbi, name: "SupplyCollateral" }),
] as const;
const midnightEvents = [
  getAbiItem({ abi: midnightEventsAbi, name: "Take" }),
  getAbiItem({ abi: midnightEventsAbi, name: "Withdraw" }),
  getAbiItem({ abi: midnightEventsAbi, name: "WithdrawCollateral" }),
] as const;
const blueTopics = new Map(
  blueEvents.map((event) => [toEventSelector(event), event.name]),
);
const midnightTopics = new Map(
  midnightEvents.map((event) => [toEventSelector(event), event.name]),
);

function permits(params: {
  readonly operation: Operation;
  readonly protocol: "Blue" | "Midnight";
  readonly marketId: Hex;
  readonly event: Kind;
  readonly owner: Address;
  readonly collateralToken?: Address;
  readonly midnightCollateralTokens?: ResolvedSlippageOperation["midnightCollateralTokens"];
}): boolean {
  const {
    operation,
    protocol,
    marketId,
    event,
    owner,
    collateralToken,
    midnightCollateralTokens,
  } = params;
  if (!isAddressEqual(operation.account ?? owner, owner)) {
    return false;
  }
  if (operation.type === "blueRefinance") {
    return (
      protocol === "Blue" &&
      ((event === "Borrow" &&
        operation.targetMarketId.toLowerCase() === marketId.toLowerCase()) ||
        (event === "WithdrawCollateral" &&
          operation.sourceMarketId.toLowerCase() === marketId.toLowerCase()))
    );
  }
  if (
    !("marketId" in operation) ||
    operation.marketId.toLowerCase() !== marketId.toLowerCase()
  ) {
    return false;
  }
  if (operation.type.startsWith("blue") !== (protocol === "Blue")) {
    return false;
  }
  const kinds: readonly Kind[] = POSITION_CHANGES[operation.type];
  if (!kinds.includes(event)) {
    return false;
  }
  if (operation.type === "blueSupplyCollateralBorrow") {
    return operation.inputs === undefined
      ? operation.quote.assetsReceived !== undefined
      : (operation.inputs.borrowAssets ?? 0n) > 0n;
  }
  if (operation.type === "blueRepayWithdrawCollateral") {
    return operation.inputs === undefined
      ? operation.quote.assetsReceived !== undefined
      : (operation.inputs.collateralAssets ?? 0n) > 0n;
  }
  if (
    event === "WithdrawCollateral" &&
    (operation.type === "midnightWithdrawCollateralBatch" ||
      operation.type === "midnightRepayWithdrawCollateral" ||
      operation.type === "midnightTakeRepayWithdrawCollateral")
  ) {
    return (
      collateralToken !== undefined &&
      (operation.quote.collateralWithdrawals ?? []).some(
        ({ collateralIndex }) =>
          midnightCollateralTokens?.some(
            (resolved) =>
              resolved.collateralIndex === collateralIndex &&
              isAddressEqual(resolved.token, collateralToken),
          ),
      )
    );
  }
  return true;
}

// biome-ignore lint/complexity/useMaxParams: protocol, event and raw log form one decode key
function decodeChange(protocol: "Blue" | "Midnight", event: Kind, log: RawLog) {
  const [topic, ...topics] = log.topics;
  if (topic === undefined) {
    return undefined;
  }
  if (protocol === "Blue") {
    const decoded = decodeEventLog({
      abi: blueEvents,
      data: log.data,
      topics: [topic, ...topics],
      strict: true,
    });
    let collateral: CollateralMovement | undefined;
    if (
      decoded.eventName === "SupplyCollateral" ||
      decoded.eventName === "WithdrawCollateral"
    ) {
      collateral = {
        marketId: decoded.args.id,
        account:
          decoded.eventName === "SupplyCollateral"
            ? decoded.args.caller
            : decoded.args.receiver,
        assets: decoded.args.assets,
      };
    }
    return {
      marketId: decoded.args.id,
      account: decoded.args.onBehalf,
      event,
      collateral,
      collateralToken: undefined,
    };
  }
  const decoded = decodeEventLog({
    abi: midnightEvents,
    data: log.data,
    topics: [topic, ...topics],
    strict: true,
  });
  if (decoded.eventName === "Take" && decoded.args.units === 0n) {
    return undefined;
  }
  let account: Address;
  if (decoded.eventName === "Take") {
    account = decoded.args.offerIsBuy ? decoded.args.taker : decoded.args.maker;
  } else {
    account = decoded.args.onBehalf;
  }
  return {
    marketId: decoded.args.id_,
    account,
    event,
    collateral: undefined,
    collateralToken:
      decoded.eventName === "WithdrawCollateral"
        ? decoded.args.collateral
        : undefined,
  };
}

function refinanceRouteKeys(
  operations: readonly Operation[],
  refinanceMarketTokens?: readonly RefinanceMarketTokens[],
): ReadonlySet<string> {
  const sameTokenRoutes = new Set(
    (refinanceMarketTokens ?? [])
      .filter((tokens) =>
        isAddressEqual(tokens.sourceToken, tokens.targetToken),
      )
      .map(
        (tokens) =>
          `${tokens.sourceMarketId.toLowerCase()}:${tokens.targetMarketId.toLowerCase()}`,
      ),
  );
  return new Set(
    operations
      .filter(
        (
          operation,
        ): operation is Extract<Operation, { type: "blueRefinance" }> =>
          operation.type === "blueRefinance",
      )
      .map(
        (operation) =>
          `${operation.sourceMarketId.toLowerCase()}:${operation.targetMarketId.toLowerCase()}`,
      )
      .filter((key) => sameTokenRoutes.has(key)),
  );
}

function collateralMovementsByAccount(
  movements: readonly CollateralMovement[],
): Map<string, CollateralMovement[]> {
  const groups = new Map<string, CollateralMovement[]>();
  for (const movement of movements) {
    const key = movement.account.toLowerCase();
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [movement]);
    } else {
      group.push(movement);
    }
  }
  return groups;
}

// biome-ignore lint/complexity/useMaxParams: graph inputs are independent immutable collections
function refinanceCollateralBalance(
  withdrawals: readonly CollateralMovement[],
  supplies: readonly CollateralMovement[],
  routeKeys: ReadonlySet<string>,
): readonly CollateralMovement[] {
  const aggregatedWithdrawals = aggregateCollateralMovements(withdrawals);
  if (aggregatedWithdrawals.length === 0) {
    return [];
  }
  const withdrawalsByAccount = collateralMovementsByAccount(
    aggregatedWithdrawals,
  );
  const aggregatedSupplies = aggregateCollateralMovements(
    supplies.filter((supply) =>
      withdrawalsByAccount.has(supply.account.toLowerCase()),
    ),
  );
  if (withdrawalsByAccount.size > 1) {
    const suppliesByAccount = collateralMovementsByAccount(aggregatedSupplies);
    return [...withdrawalsByAccount].flatMap(([account, movements]) =>
      refinanceCollateralBalance(
        movements,
        suppliesByAccount.get(account) ?? [],
        routeKeys,
      ),
    );
  }
  if (aggregatedWithdrawals.length + aggregatedSupplies.length > 4096) {
    return aggregatedWithdrawals;
  }
  const sink = aggregatedWithdrawals.length + aggregatedSupplies.length + 1;
  const capacity = new Map<number, Map<number, bigint>>();
  // biome-ignore lint/complexity/useMaxParams: graph edge coordinates and capacity are distinct
  const set = (from: number, to: number, assets: bigint) => {
    const edges = capacity.get(from) ?? new Map<number, bigint>();
    edges.set(to, assets);
    capacity.set(from, edges);
  };
  // biome-ignore lint/complexity/useMaxParams: graph edge coordinates and capacity are distinct
  const add = (from: number, to: number, assets: bigint) =>
    set(from, to, (capacity.get(from)?.get(to) ?? 0n) + assets);
  const suppliesByAccount = new Map<
    string,
    readonly [number, CollateralMovement][]
  >();
  for (const [j, supply] of aggregatedSupplies.entries()) {
    const key = supply.account.toLowerCase();
    suppliesByAccount.set(key, [
      ...(suppliesByAccount.get(key) ?? []),
      [j, supply],
    ]);
  }
  let matchingEdges = 0;
  for (const [i, withdrawal] of aggregatedWithdrawals.entries()) {
    set(0, i + 1, withdrawal.assets);
    for (const [j, supply] of suppliesByAccount.get(
      withdrawal.account.toLowerCase(),
    ) ?? []) {
      if (
        routeKeys.has(
          `${withdrawal.marketId.toLowerCase()}:${supply.marketId.toLowerCase()}`,
        )
      ) {
        matchingEdges += 1;
        if (matchingEdges > 10_000) {
          return aggregatedWithdrawals;
        }
        set(i + 1, aggregatedWithdrawals.length + j + 1, withdrawal.assets);
      }
    }
  }
  for (const [j, supply] of aggregatedSupplies.entries()) {
    set(aggregatedWithdrawals.length + j + 1, sink, supply.assets);
  }
  // Residual paths allocate each supplied unit once, even for overlapping refinances.
  while (true) {
    const parents = new Map<number, number>([[0, 0]]);
    const queue = [0];
    for (const node of queue) {
      for (const [next, available] of capacity.get(node) ?? []) {
        if (available > 0n && !parents.has(next)) {
          parents.set(next, node);
          queue.push(next);
        }
      }
    }
    if (!parents.has(sink)) {
      break;
    }
    let amount: bigint | undefined;
    for (let node = sink; node !== 0; node = parents.get(node) ?? 0) {
      const available = capacity.get(parents.get(node) ?? 0)?.get(node) ?? 0n;
      amount = amount === undefined || available < amount ? available : amount;
    }
    for (let node = sink; node !== 0; node = parents.get(node) ?? 0) {
      const parent = parents.get(node) ?? 0;
      set(
        parent,
        node,
        (capacity.get(parent)?.get(node) ?? 0n) - (amount ?? 0n),
      );
      add(node, parent, amount ?? 0n);
    }
  }
  return aggregatedWithdrawals.filter(
    (_, i) => (capacity.get(0)?.get(i + 1) ?? 0n) > 0n,
  );
}

/** Find owner position decreases outside declared operation kinds and markets. @internal */
export function findUnexpectedPositionChanges(params: {
  readonly owner: Address;
  readonly logs: readonly RawLog[];
  readonly operations: readonly Operation[];
  readonly resolvedOperations?: readonly Pick<
    ResolvedSlippageOperation,
    "midnightCollateralTokens"
  >[];
  readonly refinanceMarketTokens?: readonly RefinanceMarketTokens[];
  readonly morpho: Address;
  readonly midnight?: Address;
}): UnexpectedPositionChangeError[] {
  const failures: UnexpectedPositionChangeError[] = [];
  const withdrawals: CollateralMovement[] = [];
  const supplies: CollateralMovement[] = [];
  const refinances = params.operations.filter(
    (operation) =>
      operation.type === "blueRefinance" &&
      isAddressEqual(operation.account ?? params.owner, params.owner),
  );
  for (const log of params.logs) {
    let protocol: "Blue" | "Midnight";
    if (isAddressEqual(log.address, params.morpho)) {
      protocol = "Blue";
    } else if (
      params.midnight !== undefined &&
      isAddressEqual(log.address, params.midnight)
    ) {
      protocol = "Midnight";
    } else {
      continue;
    }
    const [topic] = log.topics;
    if (topic === undefined) {
      continue;
    }
    const event =
      protocol === "Blue"
        ? blueTopics.get(topic.toLowerCase() as Hex)
        : midnightTopics.get(topic.toLowerCase() as Hex);
    if (event === undefined) {
      continue;
    }
    if (event === "SupplyCollateral" && refinances.length === 0) {
      continue;
    }
    let marketId: Hex;
    let collateralToken: Address | undefined;
    try {
      const decoded = decodeChange(protocol, event, log);
      if (
        decoded === undefined ||
        !isAddressEqual(decoded.account, params.owner)
      ) {
        continue;
      }
      marketId = decoded.marketId;
      collateralToken = decoded.collateralToken;
      if (decoded.collateral !== undefined) {
        (event === "SupplyCollateral" ? supplies : withdrawals).push(
          decoded.collateral,
        );
      }
    } catch (cause) {
      failures.push(
        new UnexpectedPositionChangeError({
          protocol,
          event,
          owner: params.owner,
          cause,
        }),
      );
      continue;
    }
    if (event === "SupplyCollateral") {
      continue;
    }
    if (
      !params.operations.some((operation, index) => {
        const resolved = params.resolvedOperations?.[index];
        return permits({
          operation,
          protocol,
          marketId,
          event,
          owner: params.owner,
          collateralToken,
          midnightCollateralTokens: resolved?.midnightCollateralTokens,
        });
      })
    ) {
      failures.push(
        new UnexpectedPositionChangeError({
          protocol,
          event,
          marketId,
          owner: params.owner,
        }),
      );
    }
  }
  const refinanceWithdrawals = withdrawals.filter(({ marketId }) => {
    const match = {
      protocol: "Blue" as const,
      marketId,
      event: "WithdrawCollateral" as const,
      owner: params.owner,
    };
    return (
      refinances.some((operation) => permits({ ...match, operation })) &&
      !params.operations.some(
        (operation) =>
          operation.type !== "blueRefinance" &&
          permits({ ...match, operation }),
      )
    );
  });
  for (const withdrawal of refinanceCollateralBalance(
    refinanceWithdrawals,
    supplies,
    refinanceRouteKeys(refinances, params.refinanceMarketTokens),
  )) {
    failures.push(
      new UnexpectedPositionChangeError({
        protocol: "Blue",
        event: "WithdrawCollateral",
        marketId: withdrawal.marketId,
        owner: params.owner,
      }),
    );
  }
  return failures;
}
