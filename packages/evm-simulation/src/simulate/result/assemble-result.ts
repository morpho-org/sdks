import { deepFreeze } from "@morpho-org/morpho-ts";
import type { SimulationErrorContext } from "../../errors.js";
import { InvalidSimulationResponseError } from "../../errors.js";
import type {
  AuthorizationPreparation,
  Conversion,
  Fee,
  MarketState,
  PositionState,
  SignatureNonce,
  SimulatedOperation,
  SimulationState,
  SimulationStateChange,
  SimulationVerification,
  TokenAllowance,
  TokenBalance,
  VaultAllocation,
  VaultState,
  VerifiedSimulationResult,
} from "../../result.js";
import { type AssetChangeEntry, groupAssetChanges } from "../asset-changes.js";
import { operationSubject } from "../internal/error-context.js";
import type {
  Applicable,
  AuthorizationEvidence,
  FeeEvidence,
  AuthorizationPreparation as InternalPreparation,
  PermissionState,
  RiskMetric,
  VerificationDiff,
  VerificationSnapshot,
} from "../internal/evidence.js";
import type { ConstrainedEffects } from "../internal/stages.js";
import { parseTransfers } from "../parsing/index.js";

const finite = (metric: RiskMetric): bigint | undefined =>
  metric.type === "finite" ? metric.valueWad : undefined;

const applicable = <T>(value: Applicable<T>): T | undefined =>
  value.type === "applicable" ? value.value : undefined;

const toTokenBalances = (
  snapshot: VerificationSnapshot,
): readonly TokenBalance[] =>
  snapshot.wallet.map((entry) => ({
    account: entry.account,
    token: entry.token,
    assets: entry.assets,
  }));

const splitPermissions = (
  permissions: readonly PermissionState[],
): {
  readonly allowances: readonly TokenAllowance[];
  readonly morphoAuthorizations: SimulationState["morphoAuthorizations"];
  readonly nonces: readonly SignatureNonce[];
} => {
  const allowances: TokenAllowance[] = [];
  const morphoAuthorizations: {
    authorizer: `0x${string}`;
    authorized: `0x${string}`;
    isAuthorized: boolean;
  }[] = [];
  const nonces: SignatureNonce[] = [];
  for (const permission of permissions) {
    switch (permission.type) {
      case "erc20Allowance":
        allowances.push({
          token: permission.token,
          owner: permission.owner,
          spender: permission.spender,
          amount: permission.amount,
        });
        break;
      case "blueAuthorization":
        morphoAuthorizations.push({
          authorizer: permission.authorizer,
          authorized: permission.authorized,
          isAuthorized: permission.isAuthorized,
        });
        break;
      case "erc2612Nonce":
        nonces.push({
          type: "erc2612",
          verifyingContract: permission.verifyingContract,
          owner: permission.owner,
          nonce: permission.nonce,
        });
        break;
      case "blueAuthorizationNonce":
        nonces.push({
          type: "blueAuthorization",
          verifyingContract: permission.verifyingContract,
          owner: permission.owner,
          nonce: permission.nonce,
        });
        break;
      case "permit2Nonce":
        nonces.push({
          type: "permit2",
          verifyingContract: permission.permit2,
          owner: permission.owner,
          nonce: permission.bitmap,
          used: permission.consumed,
        });
        break;
    }
  }
  return { allowances, morphoAuthorizations, nonces };
};

const toPublicPositions = (
  positions: VerificationSnapshot["positions"],
): readonly PositionState[] =>
  positions.map((position) => ({
    marketId: position.marketId,
    user: position.owner,
    supplyAssets: position.supplyAssets,
    supplyShares: position.supplyShares,
    borrowAssets: position.borrowAssets,
    borrowShares: position.borrowShares,
    collateral: position.collateralAssets,
    ltvWad: finite(position.ltvWad),
    healthFactorWad: finite(position.healthFactorWad),
  }));

const toPublicMarkets = (
  markets: VerificationSnapshot["markets"],
): readonly MarketState[] =>
  markets.map((market) => ({
    marketId: market.market.marketId,
    totalSupplyAssets: market.totalSupplyAssets,
    totalSupplyShares: market.totalSupplyShares,
    totalBorrowAssets: market.totalBorrowAssets,
    totalBorrowShares: market.totalBorrowShares,
    liquidityAssets: market.liquidityAssets,
    lastUpdate: market.lastUpdate,
    feeWad: market.feeWad,
    utilizationWad: finite(market.utilizationWad),
    borrowApyWad: applicable(market.borrowApyWad),
    oraclePrice: applicable(market.oraclePrice)?.value,
  }));

const toPublicVaults = (
  vaults: VerificationSnapshot["vaults"],
): readonly VaultState[] =>
  vaults.map((vault) => ({
    vault: vault.vault,
    version: vault.type === "vaultV1" ? "v1" : "v2",
    asset: vault.asset,
    totalAssets: vault.totalAssets,
    totalShares: vault.totalShares,
    userShares: vault.ownerShares,
    idleAssets: vault.idleAssets,
    allocations: vault.allocations.map(
      (allocation): VaultAllocation => ({
        adapter: vault.type === "vaultV2" ? allocation.adapter : undefined,
        marketId: allocation.marketId,
        assets: allocation.assets,
      }),
    ),
  }));

/** Project an internal verification snapshot onto the public {@link SimulationState}. */
const toPublicState = (snapshot: VerificationSnapshot): SimulationState => {
  const { allowances, morphoAuthorizations, nonces } = splitPermissions(
    snapshot.permissions,
  );
  return {
    balances: toTokenBalances(snapshot),
    allowances,
    morphoAuthorizations,
    nonces,
    positions: toPublicPositions(snapshot.positions),
    markets: toPublicMarkets(snapshot.markets),
    vaults: toPublicVaults(snapshot.vaults),
  };
};

/** Project an internal verification diff onto the public {@link SimulationStateChange}. */
const toPublicDiff = (diff: VerificationDiff): SimulationStateChange => ({
  balances: diff.wallet.map((entry) => ({
    account: entry.account,
    token: entry.token,
    assets: entry.assets,
  })),
  allowances: diff.permissions.flatMap((change) =>
    change.before.type === "erc20Allowance" &&
    change.after.type === "erc20Allowance"
      ? [
          {
            token: change.before.token,
            owner: change.before.owner,
            spender: change.before.spender,
            amount: change.after.amount - change.before.amount,
          },
        ]
      : [],
  ),
  positions: diff.positions.map((position) => ({
    marketId: position.marketId,
    user: position.owner,
    supplyAssets: position.supplyAssets,
    supplyShares: position.supplyShares,
    borrowAssets: position.borrowAssets,
    borrowShares: position.borrowShares,
    collateral: position.collateralAssets,
  })),
  markets: diff.markets.map((market) => ({
    marketId: market.marketId,
    totalSupplyAssets: market.totalSupplyAssets,
    totalSupplyShares: market.totalSupplyShares,
    totalBorrowAssets: market.totalBorrowAssets,
    totalBorrowShares: market.totalBorrowShares,
    liquidityAssets: market.liquidityAssets,
  })),
  vaults: diff.vaults.map((vault) => ({
    vault: vault.vault,
    totalAssets: vault.totalAssets,
    totalShares: vault.totalShares,
    userShares: vault.ownerShares,
    idleAssets: vault.idleAssets,
  })),
});

const toPublicOperation = (
  verified: ConstrainedEffects["effects"]["verification"]["operations"][number],
): SimulatedOperation => ({
  transactionIndex: verified.operation.transactionIndex,
  ...operationSubject(verified.operation),
});

const toPublicPreparation = (
  evidence: AuthorizationEvidence,
): AuthorizationPreparation => {
  const preparation: InternalPreparation = evidence.preparation;
  return {
    authorizationIndex: evidence.authorizationIndex,
    authorization: evidence.request,
    calls:
      preparation.type === "approvalCalls"
        ? preparation.calls.map((call) => ({
            transaction: call.transaction,
            result: call.result,
          }))
        : [],
    stateOverride:
      preparation.type === "stateOverride"
        ? {
            address: preparation.address,
            slot: preparation.slot,
            value: preparation.value,
          }
        : undefined,
  };
};

const toPublicFee = (fee: FeeEvidence): Fee => ({
  transactionIndex: fee.transactionIndex,
  type: fee.type,
  token: fee.token,
  recipient: fee.recipient,
  expectedAmount: fee.expectedAmount,
  observedAmount: fee.observedAmount,
});

/**
 * Assemble the public result from constrained effects. Only user
 * transactions appear in `simulationTxs`/`calls`/`transfers` — preparation
 * calls and probes are never exposed. The rich internal verification report
 * is projected onto the public {@link SimulationVerification} contract.
 *
 * @internal
 * @param effects - Limit-checked effects carrying complete evidence.
 * @returns The deep-frozen {@link VerifiedSimulationResult}.
 * @throws {InvalidSimulationResponseError} when the user call count does not
 *   match the caller's transactions.
 */
export function assembleResult(
  effects: ConstrainedEffects,
): VerifiedSimulationResult {
  const { evidence, verification } = effects.effects;
  const request = evidence.plan.request;

  const userCalls = evidence.calls
    .filter(
      (
        call,
      ): call is typeof call & {
        identity: { type: "transaction"; transactionIndex: number };
      } => call.identity.type === "transaction",
    )
    .sort((a, b) => a.identity.transactionIndex - b.identity.transactionIndex)
    .map((call) => call.result);

  if (userCalls.length !== request.transactions.length) {
    const context: SimulationErrorContext = {
      stage: "transport",
      chainId: request.chainId,
      mode: request.mode,
      blockNumber: evidence.context.blockNumber,
    };
    throw new InvalidSimulationResponseError(
      `Evidence contains ${userCalls.length} user call result(s) for ${request.transactions.length} transaction(s) — refusing to map transfers with mismatched lengths`,
      { context },
    );
  }

  const transfers = parseTransfers(userCalls);

  const entries: AssetChangeEntry[] = [];
  for (const { token, from, to, amount } of transfers) {
    entries.push({ account: to, token, diff: amount });
    entries.push({ account: from, token, diff: -amount });
  }

  const publicVerification: SimulationVerification = {
    mode: verification.mode,
    chainId: evidence.context.chainId,
    blockNumber: evidence.context.blockNumber,
    blockTimestamp: evidence.context.blockTimestamp,
    limits: verification.limits,
    operations: verification.operations.map(toPublicOperation),
    authorizations:
      verification.mode === "preview"
        ? verification.authorizations.map(toPublicPreparation)
        : [],
    before: toPublicState(verification.before),
    after: toPublicState(verification.after),
    diff: toPublicDiff(verification.diff),
    actionDiff: toPublicDiff(verification.actionDiff),
    conversions: verification.conversions.map(
      (conversion): Conversion => ({
        transactionIndex: conversion.transactionIndex,
        marketId:
          conversion.subject.type === "market"
            ? conversion.subject.marketId
            : undefined,
        vault:
          conversion.subject.type === "vault"
            ? conversion.subject.vault
            : undefined,
        assets: conversion.assets,
        shares: conversion.shares,
        quotedSharePriceE27: conversion.quotedSharePriceE27,
        actualSharePriceE27: conversion.actualSharePriceE27,
        minSharePriceE27: conversion.minSharePriceE27,
        maxSharePriceE27: conversion.maxSharePriceE27,
      }),
    ),
    fees: verification.fees.map(toPublicFee),
  };

  return deepFreeze({
    simulationTxs: request.transactions,
    calls: userCalls,
    transfers,
    assetChanges: groupAssetChanges(entries),
    verification: publicVerification,
  });
}
