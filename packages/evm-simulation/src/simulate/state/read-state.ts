import {
  _try,
  AccrualPosition,
  type AccrualVault,
  type AccrualVaultV2,
  Market,
  type MarketId,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import type { ChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, ethAddress, isAddressEqual, zeroAddress } from "viem";
import type { SimulationAuthorization } from "../../authorizations.js";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import type { MarketState, PositionState, VaultState } from "../../result.js";
import type {
  MarketBinding,
  PreLiquidationBinding,
  VaultBinding,
} from "../backends/read-bindings.js";
import type { DecodedStateRead, StateRead } from "./contract.js";
import { decodeErc20Value, erc20Reads, parseErc20 } from "./erc20.js";
import { decodeMorphoValue, morphoReads, parseMorpho } from "./morpho.js";
import { decodeNativeValue, nativeReads, parseNative } from "./native.js";
import { decodePermit2Value, parsePermit2, permit2Reads } from "./permit2.js";
import type {
  MarketInternals,
  ParsedState,
  PositionInternals,
  VaultInternals,
} from "./types.js";
import { positionKey } from "./types.js";
import { decodeVaultValue, vaultV1Reads } from "./vault-v1.js";
import { vaultV2Reads } from "./vault-v2.js";

const eq = (a: Address, b: Address) => isAddressEqual(a, b);
const MAX_LLTV_WAD = MathLib.WAD;

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const add = <T>(list: T[], value: T, key: (v: T) => string): void => {
  const k = key(value);
  if (!list.some((v) => key(v) === k)) list.push(value);
};

/** Every subject a state-read phase must observe, derived from the declared limits. @internal */
export interface StateSubjects {
  readonly accounts: ReadonlySet<Address>;
  readonly tokens: ReadonlySet<Address>;
  readonly bundles: ReadonlySet<Address>;
  readonly spenders: readonly {
    readonly owner: Address;
    readonly token: Address;
    readonly spender: Address;
  }[];
  readonly permit2Tokens: readonly {
    readonly owner: Address;
    readonly token: Address;
  }[];
  readonly erc2612Tokens: readonly {
    readonly owner: Address;
    readonly token: Address;
  }[];
  readonly permit2Nonces: readonly {
    readonly owner: Address;
    readonly nonce: bigint;
  }[];
  readonly blueAuthorizations: readonly {
    readonly authorizer: Address;
    readonly authorized: Address;
  }[];
  readonly markets: readonly MarketBinding[];
  /** Accounts whose per-market positions must be read (owner + every `onBehalf`). */
  readonly positionAccounts: ReadonlySet<Address>;
  readonly preLiquidationMarkets: ReadonlyMap<MarketId, Address>;
  readonly vaults: ReadonlyMap<Address, VaultBinding>;
}

/**
 * Collect every state subject implied by the decoded operations plus the
 * pending authorizations — wallet balances for owner/receivers/periphery,
 * allowances for every decoded pull and request, signature nonces, Morpho
 * authorizations, touched markets and bound vaults.
 * @internal
 */
export function collectSubjects(params: {
  readonly owner: Address;
  readonly operations: readonly OperationLimit[];
  readonly authorizations: readonly SimulationAuthorization[];
  readonly markets: readonly MarketBinding[];
  readonly vaults: readonly VaultBinding[];
  readonly preLiquidations: readonly PreLiquidationBinding[];
  readonly addresses: ChainAddresses;
}): StateSubjects {
  const {
    owner,
    operations,
    authorizations,
    markets: marketBindings,
    vaults,
    preLiquidations,
    addresses,
  } = params;

  const accounts = new Set<Address>([owner]);
  // Accounts whose per-market positions are read: the bundle owner plus any
  // pinned `expectedOnBehalf`/`expectedRecipient` acting account.
  const positionAccounts = new Set<Address>([owner]);
  const tokens = new Set<Address>();
  const bundleAddresses = new Set<Address>();
  const spenders: StateSubjects["spenders"] extends readonly (infer T)[]
    ? T[]
    : never = [];
  const permit2Tokens: { owner: Address; token: Address }[] = [];
  const erc2612Tokens: { owner: Address; token: Address }[] = [];
  const permit2Nonces: { owner: Address; nonce: bigint }[] = [];
  const blueAuthorizations: { authorizer: Address; authorized: Address }[] = [];
  const markets: MarketBinding[] = [];
  const preLiquidationMarkets = new Map<MarketId, Address>();
  const vaultMap = new Map<Address, VaultBinding>();
  for (const binding of vaults) {
    vaultMap.set(binding.address, binding);
    tokens.add(binding.asset);
  }
  for (const binding of preLiquidations) {
    preLiquidationMarkets.set(binding.market.marketId, binding.address);
  }

  const addMarket = (market: MarketBinding) => {
    add(markets, market, (m) => m.marketId);
    tokens.add(market.params.loanToken);
    tokens.add(market.params.collateralToken);
  };

  // Bundles that pull or act on the owner's behalf hold balances too.
  for (const bundle_ of [
    addresses.bundles?.blueBundlesV1,
    addresses.bundles?.vaultBundlesV1,
    addresses.bundles?.vaultExitBundlesV1,
  ]) {
    if (bundle_ != null) accounts.add(bundle_);
  }

  const boundMarket = (marketId: MarketId) =>
    marketBindings.find(
      (b) => b.marketId.toLowerCase() === marketId.toLowerCase(),
    );

  for (const op of operations) {
    if ("expectedOnBehalf" in op && op.expectedOnBehalf != null) {
      accounts.add(op.expectedOnBehalf);
      positionAccounts.add(op.expectedOnBehalf);
    }
    if ("expectedReceiver" in op && op.expectedReceiver != null)
      accounts.add(op.expectedReceiver);
    if ("expectedRecipient" in op && op.expectedRecipient != null)
      accounts.add(op.expectedRecipient);
    const addMarketId = (marketId: MarketId) => {
      const binding = boundMarket(marketId);
      if (binding != null) addMarket(binding);
    };
    const namedMarketIds = (): MarketId[] => {
      const ids: MarketId[] = [];
      if ("marketId" in op && op.marketId != null) ids.push(op.marketId);
      if ("sourceMarketId" in op) ids.push(op.sourceMarketId);
      if ("targetMarketId" in op) ids.push(op.targetMarketId);
      if ("expectedMarketIds" in op)
        for (const leg of op.expectedMarketIds ?? []) ids.push(leg);
      if ("expectedDeallocations" in op)
        for (const leg of op.expectedDeallocations ?? [])
          if (leg.marketId != null) ids.push(leg.marketId);
      if ("minSupplyAssetsByMarket" in op)
        for (const entry of op.minSupplyAssetsByMarket ?? [])
          ids.push(entry.marketId);
      return ids;
    };
    for (const marketId of namedMarketIds()) addMarketId(marketId);

    switch (op.type) {
      case "blueWithdraw":
      case "blueBorrow":
      case "blueWithdrawCollateral":
      case "blueSupplyCollateralBorrow":
      case "blueRepayWithdrawCollateral":
      case "blueRefinance": {
        // Protected operations move the acting account's position through the
        // bundles contract; the isAuthorized(owner, bundle) flag must be read.
        const spender = addresses.bundles?.blueBundlesV1;
        if (spender != null)
          add(
            blueAuthorizations,
            { authorizer: owner, authorized: spender },
            (a) => `${a.authorizer}:${a.authorized}`,
          );
        break;
      }
      case "blueAuthorization": {
        const preLiq = preLiquidations.find((b) =>
          eq(b.address, op.authorized),
        );
        if (preLiq != null) addMarket(preLiq.market);
        add(
          blueAuthorizations,
          { authorizer: owner, authorized: op.authorized },
          (a) => `${a.authorizer}:${a.authorized}`,
        );
        break;
      }
      default:
        break;
    }
  }

  // Pending authorizations add their own allowance/nonce subjects so the
  // before/after read-back proves the preparation landed.
  for (const auth of authorizations) {
    switch (auth.type) {
      case "erc20Approval":
        add(
          spenders,
          { owner: auth.owner, token: auth.token, spender: auth.spender },
          (s) => `${s.owner}:${s.token}:${s.spender}`,
        );
        break;
      case "erc2612Permit": {
        const { domain, message } = auth.typedData;
        add(
          spenders,
          {
            owner: message.owner,
            token: domain.verifyingContract,
            spender: message.spender,
          },
          (s) => `${s.owner}:${s.token}:${s.spender}`,
        );
        add(
          erc2612Tokens,
          { owner: message.owner, token: domain.verifyingContract },
          (t) => `${t.owner}:${t.token}`,
        );
        break;
      }
      case "permit2SignatureTransfer": {
        const { message } = auth.typedData;
        add(
          permit2Tokens,
          { owner: auth.owner, token: message.permitted.token },
          (t) => `${t.owner}:${t.token}`,
        );
        add(
          permit2Nonces,
          { owner: auth.owner, nonce: message.nonce },
          (n) => `${n.owner}:${n.nonce}`,
        );
        if (addresses.permit2 != null)
          add(
            spenders,
            {
              owner: auth.owner,
              token: message.permitted.token,
              spender: addresses.permit2,
            },
            (s) => `${s.owner}:${s.token}:${s.spender}`,
          );
        add(
          spenders,
          {
            owner: auth.owner,
            token: message.permitted.token,
            spender: message.spender,
          },
          (s) => `${s.owner}:${s.token}:${s.spender}`,
        );
        break;
      }
      case "blueAuthorization":
        add(
          blueAuthorizations,
          { authorizer: auth.authorizer, authorized: auth.authorized },
          (a) => `${a.authorizer}:${a.authorized}`,
        );
        break;
      case "blueAuthorizationSignature":
        add(
          blueAuthorizations,
          {
            authorizer: auth.typedData.message.authorizer,
            authorized: auth.typedData.message.authorized,
          },
          (a) => `${a.authorizer}:${a.authorized}`,
        );
        break;
    }
  }

  return {
    accounts,
    tokens,
    bundles: bundleAddresses,
    spenders,
    permit2Tokens,
    erc2612Tokens,
    permit2Nonces,
    blueAuthorizations,
    markets,
    positionAccounts,
    preLiquidationMarkets,
    vaults: vaultMap,
  };
}

/** Vault entity internals fetched at the pinned block, retained for accrual and cap math. @internal */
export type VaultData = ReadonlyMap<Address, AccrualVault | AccrualVaultV2>;

/**
 * Build the ordered, deduped {@link StateRead} list for one phase. Order is
 * ERC-20 → Permit2 → Morpho → vaults → native; ids dedupe shared subjects.
 * @internal
 */
export function planStateReads(params: {
  readonly subjects: StateSubjects;
  readonly owner: Address;
  readonly morpho: Address;
  readonly permit2?: Address;
  readonly vaultData: VaultData;
}): StateRead[] {
  const { subjects, owner, morpho, permit2, vaultData } = params;

  const balances: { token: Address; account: Address }[] = [];
  for (const token of subjects.tokens) {
    for (const account of subjects.accounts) {
      if (token === ethAddress) continue; // native is probed separately
      balances.push({ token, account });
    }
  }
  for (const bundle of subjects.bundles) {
    for (const token of subjects.tokens) {
      if (token !== ethAddress) balances.push({ token, account: bundle });
    }
  }

  const marketSubjects = subjects.markets.map((binding) => ({
    marketId: binding.marketId,
    params: binding.params,
    preLiquidation: subjects.preLiquidationMarkets.get(binding.marketId),
  }));

  const positionSubjects = subjects.markets.flatMap((binding) =>
    [...subjects.positionAccounts].map((positionOwner) => ({
      marketId: binding.marketId,
      owner: positionOwner,
    })),
  );

  const nonceOwners = subjects.blueAuthorizations.length > 0 ? [owner] : [];

  // Vault V1 queue markets that no decoded op bound still need market reads so
  // `parseState` converts their vault position shares to assets.
  const boundMarketIds = new Set(subjects.markets.map((m) => m.marketId));
  const queueMarketIds = new Set<MarketId>();
  for (const [vaultAddress, binding] of subjects.vaults) {
    if (binding.kind !== "vaultV1") continue;
    for (const marketId of v1AllocationMarketIds(vaultData.get(vaultAddress)))
      if (!boundMarketIds.has(marketId)) queueMarketIds.add(marketId);
  }

  const reads: StateRead[] = [
    ...erc20Reads({
      balances,
      allowances: subjects.spenders,
      nonces: subjects.erc2612Tokens,
    }),
    ...(permit2 != null
      ? permit2Reads({ permit2, nonces: subjects.permit2Nonces })
      : []),
    ...morphoReads({
      morpho,
      markets: marketSubjects,
      queueMarkets: [...queueMarketIds],
      positions: positionSubjects,
      authorizations: subjects.blueAuthorizations,
      nonceOwners,
    }),
  ];

  for (const [vaultAddress, binding] of subjects.vaults) {
    const entity = vaultData.get(vaultAddress);
    if (binding.kind === "vaultV1") {
      reads.push(
        ...vaultV1Reads({
          vault: vaultAddress,
          owner,
          morpho,
          allocationMarketIds: v1AllocationMarketIds(entity),
        }),
      );
    } else {
      const v2 = entity as AccrualVaultV2 | undefined;
      reads.push(
        ...vaultV2Reads({
          vault: vaultAddress,
          owner,
          asset: binding.asset,
          liquidityAdapter: v2?.liquidityAdapter,
          allocationIds: v2AllocationIds(entity),
        }),
      );
    }
  }

  reads.push(...nativeReads([...subjects.accounts]));

  // Dedupe by id, keeping first occurrence (stable order).
  const seen = new Set<string>();
  return reads.filter((read) => {
    if (seen.has(read.id)) return false;
    seen.add(read.id);
    return true;
  });
}

const v1AllocationMarketIds = (
  entity: AccrualVault | AccrualVaultV2 | undefined,
): MarketId[] => {
  if (entity == null || !(entity as AccrualVault).withdrawQueue) return [];
  return (entity as AccrualVault).withdrawQueue;
};

const v2AllocationIds = (
  entity: AccrualVault | AccrualVaultV2 | undefined,
): `0x${string}`[] => {
  const allocations = (entity as AccrualVaultV2 | undefined)
    ?.liquidityAllocations;
  if (allocations == null) return [];
  return allocations.map((a) => a.id);
};

/**
 * Decode a state read's raw `returnData` through the kind's decoder. A call
 * that returned no data at all (filtered failed call) surfaces as an
 * `InvalidSimulationResponseError` here.
 * @internal
 */
export function decodeStateRead(
  read: StateRead,
  data: `0x${string}`,
): DecodedStateRead {
  switch (read.kind) {
    case "native.balance":
      return { read, value: decodeNativeValue(read, data) };
    case "erc20.balance":
    case "erc20.allowance":
    case "erc2612.nonce":
      return { read, value: decodeErc20Value(read, data) };
    case "permit2.nonceBitmap":
      return { read, value: decodePermit2Value(read, data) };
    case "morpho.isAuthorized":
    case "morpho.nonce":
    case "morpho.position":
    case "morpho.market":
    case "morpho.marketParams":
    case "morpho.oraclePrice":
    case "morpho.irmRateAtTarget":
    case "preLiquidation.params":
      return { read, value: decodeMorphoValue(read, data) };
    case "vault.totalAssets":
    case "vault.totalSupply":
    case "vault.balanceOf":
    case "vault.idleAssets":
    case "vault.allocation":
      return { read, value: decodeVaultValue(read, data) };
  }
}

const finiteMetric = (
  value: bigint | undefined,
  fallback:
    | {
        readonly type: "unbounded";
        readonly reason: "zeroCollateral" | "zeroLiquidity";
      }
    | { readonly type: "debtFree" },
): { type: "finite"; valueWad: bigint } | typeof fallback =>
  value == null || value > MAX_LLTV_WAD * 10n ** 10n
    ? fallback
    : { type: "finite", valueWad: value };

/**
 * Merge the decoded reads of one phase into the {@link ParsedState} — the
 * public {@link SimulationState} plus the internals checks and accrual need.
 * @internal
 */
export function parseState(params: {
  readonly reads: readonly DecodedStateRead[];
  readonly subjects: StateSubjects;
  readonly owner: Address;
  readonly morpho: Address;
  readonly vaultData: VaultData;
  readonly marketBindings: ReadonlyMap<MarketId, MarketBinding>;
}): ParsedState {
  const { reads, subjects, vaultData, marketBindings } = params;

  const erc20 = parseErc20(reads);
  const permit2Nonces = parsePermit2(reads);
  const morpho = parseMorpho(reads);
  const nativeBalances = parseNative(reads);

  const balances = [...erc20.balances, ...nativeBalances];

  // Market internals + public market state.
  const marketInternals = new Map<MarketId, MarketInternals>();
  const marketStates: MarketState[] = [];
  for (const market of morpho.markets) {
    const bound = marketBindings.get(market.marketId);
    const marketParams =
      bound?.params ?? morpho.marketParams.get(market.marketId);
    if (marketParams == null)
      throw new InvalidSimulationResponseError(
        `Market read for "${market.marketId}" has no decoded binding`,
      );
    const binding = { marketId: market.marketId, params: marketParams };
    const oracle = binding.params.oracle;
    const irm = binding.params.irm;
    const oraclePrice =
      oracle !== zeroAddress ? morpho.oraclePrices.get(oracle) : undefined;
    const rateAtTarget =
      irm !== zeroAddress
        ? morpho.irmRates.get(market.marketId)?.rateAtTarget
        : undefined;
    const preLiquidation = morpho.preLiquidations.get(market.marketId);

    const internals: MarketInternals = {
      marketId: market.marketId,
      params: binding.params,
      ...(oraclePrice == null ? {} : { oracleScale: ORACLE_PRICE_SCALE }),
      ...(rateAtTarget == null
        ? {}
        : { rateAtTargetPerSecondWad: rateAtTarget }),
      ...(preLiquidation == null ? {} : { preLiquidation }),
    };
    marketInternals.set(market.marketId, internals);

    const liquidityAssets = market.totalSupplyAssets - market.totalBorrowAssets;
    const entity = new Market({
      params: binding.params,
      totalSupplyAssets: market.totalSupplyAssets,
      totalSupplyShares: market.totalSupplyShares,
      totalBorrowAssets: market.totalBorrowAssets,
      totalBorrowShares: market.totalBorrowShares,
      lastUpdate: market.lastUpdate,
      fee: market.fee,
      price: oraclePrice,
      rateAtTarget,
    });
    const utilization = _try(() => entity.utilization) ?? undefined;
    const borrowApy = _try(() => entity.endBorrowRate) ?? undefined;

    marketStates.push({
      marketId: market.marketId,
      totalSupplyAssets: market.totalSupplyAssets,
      totalSupplyShares: market.totalSupplyShares,
      totalBorrowAssets: market.totalBorrowAssets,
      totalBorrowShares: market.totalBorrowShares,
      liquidityAssets,
      lastUpdate: market.lastUpdate,
      feeWad: market.fee,
      ...(utilization == null || market.totalSupplyAssets === 0n
        ? {}
        : { utilizationWad: utilization }),
      ...(borrowApy == null || irm === zeroAddress
        ? {}
        : { borrowApyWad: borrowApy }),
      ...(oraclePrice == null ? {} : { oraclePrice }),
    });
  }

  // Positions + risk metrics.
  const positionInternals = new Map<string, PositionInternals>();
  const positionStates: PositionState[] = [];
  for (const position of morpho.positions) {
    const internals = marketInternals.get(position.marketId);
    const marketTuple = morpho.markets.find(
      (m) => m.marketId === position.marketId,
    );
    let ltvWad: bigint | undefined;
    let healthFactorWad: bigint | undefined;
    let risk: PositionInternals = {
      ltvWad: { type: "debtFree" },
      healthFactorWad: { type: "unbounded", reason: "zeroCollateral" },
    };
    if (internals != null && marketTuple != null) {
      const entity = new Market({
        params: internals.params,
        totalSupplyAssets: marketTuple.totalSupplyAssets,
        totalSupplyShares: marketTuple.totalSupplyShares,
        totalBorrowAssets: marketTuple.totalBorrowAssets,
        totalBorrowShares: marketTuple.totalBorrowShares,
        lastUpdate: marketTuple.lastUpdate,
        fee: marketTuple.fee,
        price:
          internals.oracleScale != null
            ? morpho.oraclePrices.get(internals.params.oracle)
            : undefined,
        rateAtTarget: internals.rateAtTargetPerSecondWad,
      });
      const accrual = new AccrualPosition(
        {
          user: position.owner,
          supplyShares: position.supplyShares,
          borrowShares: position.borrowShares,
          collateral: position.collateral,
        },
        entity,
      );
      const ltv = _try(() => accrual.ltv) ?? undefined;
      const hf = _try(() => accrual.healthFactor) ?? undefined;
      risk = {
        ltvWad: finiteMetric(ltv, { type: "debtFree" }),
        healthFactorWad: finiteMetric(hf, {
          type: "unbounded",
          reason: "zeroCollateral",
        }),
      };
      ltvWad = risk.ltvWad.type === "finite" ? risk.ltvWad.valueWad : undefined;
      healthFactorWad =
        risk.healthFactorWad.type === "finite"
          ? risk.healthFactorWad.valueWad
          : undefined;
    }
    positionInternals.set(positionKey(position.marketId, position.owner), risk);
    positionStates.push({
      marketId: position.marketId,
      user: position.owner,
      supplyAssets:
        internals != null && marketTuple != null
          ? new Market({
              params: internals.params,
              totalSupplyAssets: marketTuple.totalSupplyAssets,
              totalSupplyShares: marketTuple.totalSupplyShares,
              totalBorrowAssets: marketTuple.totalBorrowAssets,
              totalBorrowShares: marketTuple.totalBorrowShares,
              lastUpdate: marketTuple.lastUpdate,
              fee: marketTuple.fee,
            }).toSupplyAssets(position.supplyShares, "Down")
          : 0n,
      supplyShares: position.supplyShares,
      borrowAssets:
        internals != null && marketTuple != null
          ? new Market({
              params: internals.params,
              totalSupplyAssets: marketTuple.totalSupplyAssets,
              totalSupplyShares: marketTuple.totalSupplyShares,
              totalBorrowAssets: marketTuple.totalBorrowAssets,
              totalBorrowShares: marketTuple.totalBorrowShares,
              lastUpdate: marketTuple.lastUpdate,
              fee: marketTuple.fee,
            }).toBorrowAssets(position.borrowShares, "Up")
          : 0n,
      borrowShares: position.borrowShares,
      collateral: position.collateral,
      ...(ltvWad == null ? {} : { ltvWad }),
      ...(healthFactorWad == null ? {} : { healthFactorWad }),
    });
  }

  // Vaults.
  const vaultInternals = new Map<Address, VaultInternals>();
  const vaultStates: VaultState[] = [];
  for (const [vaultAddress, binding] of subjects.vaults) {
    const entity = vaultData.get(vaultAddress);
    const vaultValue = (kind: string, extra?: string) =>
      reads.find(
        ({ read }) =>
          read.kind === kind &&
          "vault" in read &&
          eq(read.vault, vaultAddress) &&
          (extra == null ||
            ("allocationId" in read && read.allocationId === extra)),
      )?.value;
    const totalAssets = vaultValue("vault.totalAssets");
    const totalSupply = vaultValue("vault.totalSupply");
    const ownerShares = vaultValue("vault.balanceOf");
    const idle = vaultValue("vault.idleAssets");
    if (
      typeof totalAssets !== "bigint" ||
      typeof totalSupply !== "bigint" ||
      typeof ownerShares !== "bigint"
    ) {
      throw new InvalidSimulationResponseError(
        `Vault "${vaultAddress}" is missing totals reads`,
      );
    }

    const sharePriceE27 =
      totalSupply === 0n
        ? 0n
        : MathLib.mulDivUp(totalAssets, 10n ** 27n, totalSupply);

    if (binding.kind === "vaultV1") {
      const v1 = entity as AccrualVault | undefined;
      const allocations = (v1?.withdrawQueue ?? []).map((marketId) => {
        const positionRead = reads.find(
          ({ read: r }) =>
            r.kind === "morpho.position" &&
            "marketId" in r &&
            r.marketId === marketId &&
            "owner" in r &&
            eq(r.owner, vaultAddress),
        );
        const tuple = positionRead?.value as
          | { supplyShares: bigint }
          | undefined;
        const marketInternalsEntry = marketInternals.get(marketId);
        const marketTuple = morpho.markets.find((m) => m.marketId === marketId);
        const shares = tuple?.supplyShares ?? 0n;
        const assets =
          marketInternalsEntry != null && marketTuple != null
            ? new Market({
                params: marketInternalsEntry.params,
                totalSupplyAssets: marketTuple.totalSupplyAssets,
                totalSupplyShares: marketTuple.totalSupplyShares,
                totalBorrowAssets: marketTuple.totalBorrowAssets,
                totalBorrowShares: marketTuple.totalBorrowShares,
                lastUpdate: marketTuple.lastUpdate,
                fee: marketTuple.fee,
              }).toSupplyAssets(shares, "Down")
            : 0n;
        const config = v1?.allocations.get(marketId)?.config;
        return {
          marketId,
          assets,
          internals: {
            adapter: undefined,
            marketId,
            shares,
            absoluteCapAssets: config?.cap,
            relativeCapWad: 0n,
            penaltyWad: 0n,
          },
        };
      });
      vaultStates.push({
        vault: vaultAddress,
        version: "v1",
        asset: binding.asset,
        totalAssets,
        totalShares: totalSupply,
        userShares: ownerShares,
        idleAssets: 0n,
        allocations: allocations.map(({ marketId, assets }) => ({
          marketId,
          assets,
        })),
      });
      vaultInternals.set(vaultAddress, {
        version: "v1",
        feeRecipient: v1?.feeRecipient,
        performanceFeeWad: v1?.fee,
        decimalsOffset: v1?.decimalsOffset,
        ...(v1?.lostAssets == null ? {} : { lostAssets: v1.lostAssets }),
        lastTotalAssets: v1?.lastTotalAssets,
        sharePriceE27,
        allocations: allocations.map((a) => a.internals),
        ...(entity == null ? {} : { entity }),
      });
    } else {
      const v2 = entity as AccrualVaultV2 | undefined;
      const liquidityAllocations = v2?.liquidityAllocations ?? [];
      const allocations = liquidityAllocations.map((allocation) => {
        const assets = vaultValue("vault.allocation", allocation.id);
        return {
          adapter: zeroAddress as Address | undefined,
          marketId: undefined as MarketId | undefined,
          id: allocation.id,
          assets: typeof assets === "bigint" ? assets : 0n,
          internals: {
            adapter: zeroAddress,
            shares: 0n,
            absoluteCapAssets: allocation.absoluteCap,
            relativeCapWad: allocation.relativeCap,
            penaltyWad: v2?.forceDeallocatePenalties?.[allocation.id] ?? 0n,
          },
        };
      });
      vaultStates.push({
        vault: vaultAddress,
        version: "v2",
        asset: binding.asset,
        totalAssets,
        totalShares: totalSupply,
        userShares: ownerShares,
        idleAssets: typeof idle === "bigint" ? idle : 0n,
        allocations: allocations.map(({ adapter, marketId, assets }) => ({
          ...(adapter == null || adapter === zeroAddress ? {} : { adapter }),
          ...(marketId == null ? {} : { marketId }),
          assets,
        })),
      });
      vaultInternals.set(vaultAddress, {
        version: "v2",
        feeRecipient: v2?.performanceFeeRecipient,
        performanceFeeWad: v2?.performanceFee,
        managementFeeWad: v2?.managementFee,
        managementFeeRecipient: v2?.managementFeeRecipient,
        maxRatePerSecondWad: v2?.maxRate,
        lastUpdate: v2?.lastUpdate,
        recordedTotalAssets: v2?._totalAssets,
        virtualShares: v2?.virtualShares,
        liquidityAdapter: v2?.liquidityAdapter,
        sharePriceE27,
        allocations: allocations.map((a) => ({
          adapter:
            a.internals.adapter === zeroAddress
              ? undefined
              : a.internals.adapter,
          shares: a.internals.shares,
          absoluteCapAssets: a.internals.absoluteCapAssets,
          relativeCapWad: a.internals.relativeCapWad,
          penaltyWad: a.internals.penaltyWad,
        })),
        ...(entity == null ? {} : { entity }),
      });
    }
  }

  return {
    balances,
    allowances: erc20.allowances,
    morphoAuthorizations: morpho.authorizations,
    nonces: [...erc20.nonces, ...permit2Nonces, ...morpho.nonces],
    positions: positionStates,
    markets: marketStates,
    vaults: vaultStates,
    internals: {
      markets: marketInternals,
      vaults: vaultInternals,
      positions: positionInternals,
    },
  };
}
