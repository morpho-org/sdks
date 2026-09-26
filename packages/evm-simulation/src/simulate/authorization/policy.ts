import {
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  MathLib,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import {
  computeVaultMaxShareAllowance,
  computeVaultV2ForceWithdrawFeeSharesMinted,
} from "@morpho-org/morpho-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { APPROVE_ONLY_ONCE_TOKENS } from "@morpho-org/morpho-sdk/constants";
import { _try, deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, getAddress, isAddressEqual, maxUint256 } from "viem";
import type {
  ExecutionContext,
  PermissionState,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type { EffectiveSimulationLimits } from "../../domain/limits.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { ExpectedRequest } from "../../domain/stages.js";
import {
  brandValidated,
  type DecodedBundle,
  type PinnedInputs,
  type ValidatedAuthorizations,
} from "../../domain/stages.js";
import {
  AuthorizationRequestMismatchError,
  UnexpectedSimulationError,
  UnsupportedChainError,
  UnsupportedOperationError,
} from "../../errors.js";
import { preparePreviewAuthorizations } from "./prepare.js";

export type { ExpectedRequest } from "../../domain/stages.js";

const opLocation = (op: DecodedOperation) =>
  ({
    type: "transaction",
    txIdx: op.transactionIndex,
    callPath: op.callPath,
  }) as const;

const requirementMismatch = (op: DecodedOperation, message: string): never => {
  throw new AuthorizationRequestMismatchError(message, {
    stage: "authorization",
    location: opLocation(op),
  });
};

const authorizationMismatch = (
  authorizationIndex: number,
  message: string,
): never => {
  throw new AuthorizationRequestMismatchError(message, {
    stage: "authorization",
    location: { type: "authorization", authorizationIndex },
  });
};

const eq = (a: Address, b: Address): boolean => isAddressEqual(a, b);

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findAllowance = (
  before: VerificationSnapshot,
  token: Address,
  owner: Address,
  spender: Address,
): bigint =>
  before.permissions.find(
    (p): p is Extract<PermissionState, { type: "erc20Allowance" }> =>
      p.type === "erc20Allowance" &&
      eq(p.token, token) &&
      eq(p.owner, owner) &&
      eq(p.spender, spender),
  )?.amount ?? 0n;

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findErc2612Nonce = (
  before: VerificationSnapshot,
  token: Address,
  owner: Address,
): bigint | undefined =>
  before.permissions.find(
    (p): p is Extract<PermissionState, { type: "erc2612Nonce" }> =>
      p.type === "erc2612Nonce" &&
      eq(p.verifyingContract, token) &&
      eq(p.owner, owner),
  )?.nonce;

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findBlueNonce = (
  before: VerificationSnapshot,
  morpho: Address,
  owner: Address,
): bigint | undefined =>
  before.permissions.find(
    (p): p is Extract<PermissionState, { type: "blueAuthorizationNonce" }> =>
      p.type === "blueAuthorizationNonce" &&
      eq(p.verifyingContract, morpho) &&
      eq(p.owner, owner),
  )?.nonce;

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findPermit2Bitmap = (
  before: VerificationSnapshot,
  permit2: Address,
  owner: Address,
  wordPosition: bigint,
): bigint | undefined =>
  before.permissions.find(
    (p): p is Extract<PermissionState, { type: "permit2Nonce" }> =>
      p.type === "permit2Nonce" &&
      eq(p.permit2, permit2) &&
      eq(p.owner, owner) &&
      p.wordPosition === wordPosition,
  )?.bitmap;

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const findBlueAuthorized = (
  before: VerificationSnapshot,
  morpho: Address,
  authorizer: Address,
  authorized: Address,
): boolean =>
  before.permissions.find(
    (p): p is Extract<PermissionState, { type: "blueAuthorization" }> =>
      p.type === "blueAuthorization" &&
      eq(p.morpho, morpho) &&
      eq(p.authorizer, authorizer) &&
      eq(p.authorized, authorized),
  )?.isAuthorized === true;

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const permit2BitUsed = (
  before: VerificationSnapshot,
  permit2: Address,
  owner: Address,
  nonce: bigint,
): boolean => {
  const bitmap = findPermit2Bitmap(before, permit2, owner, nonce >> 8n);
  return bitmap != null && (bitmap & (1n << (nonce % 256n))) !== 0n;
};

/**
 * Exact share cap for an asset-mode vault exit, reusing the SDK's
 * `computeVaultMaxShareAllowance` over the pinned entity snapshot so the
 * expected allowance matches SDK-derived requirements bit for bit.
 */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const shareCap = (
  inputs: PinnedInputs,
  op: DecodedOperation,
  vault: Address,
  assets: bigint,
  deadline: bigint,
  limits: EffectiveSimulationLimits,
): bigint => {
  const vaultData = inputs.internals.vaultData.get(getAddress(vault));
  if (vaultData == null) {
    return requirementMismatch(
      op,
      `Vault "${vault}" has no pinned entity data; cannot derive the exact share allowance`,
    );
  }
  return computeVaultMaxShareAllowance({
    vaultData,
    deadline,
    assets,
    slippageTolerance: limits.maxSlippageWad,
  });
};

/**
 * Reproduces the VaultExitBundlesV1 `forceWithdraw` share-allowance bound the
 * vaultV2 entity derives for `getRequirements()`: the allowance is sized from
 * the encoded `minSharePriceE27` floor (not from the entity's internal burn
 * plan, which never reaches calldata) discounted by one tolerance step, plus
 * the management-fee shares the first withdrawal mints, capped at `maxUint256`.
 * `slippageTolerance` is the pipeline's `limits.maxSlippageWad` — equal to the
 * SDK default a caller gets when they do not override it.
 */
// biome-ignore lint/complexity/useMaxParams: mirrors the entity's positional argument list
const forceWithdrawShareCap = (
  inputs: PinnedInputs,
  op: DecodedOperation,
  vault: Address,
  exitAssets: bigint,
  minSharePriceE27: bigint,
  owner: Address,
  deadline: bigint,
  limits: EffectiveSimulationLimits,
): bigint => {
  const vaultData = inputs.internals.vaultData.get(getAddress(vault));
  if (!(vaultData instanceof AccrualVaultV2)) {
    return requirementMismatch(
      op,
      `Vault "${vault}" has no pinned Vault V2 entity data; cannot derive the exact share allowance`,
    );
  }
  const allowanceSharePriceE27 = MathLib.max(
    MathLib.min(
      MathLib.mulDivDown(
        minSharePriceE27,
        MathLib.WAD - limits.maxSlippageWad,
        MathLib.WAD,
      ),
      minSharePriceE27 - 1n,
    ),
    1n,
  );
  const feeSharesProjected = computeVaultV2ForceWithdrawFeeSharesMinted({
    vaultData,
    owner,
    timestamp: deadline,
  });
  return MathLib.min(
    MathLib.max(
      MathLib.mulDivUp(exitAssets, MathLib.RAY, allowanceSharePriceE27),
      MathLib.mulDivUp(exitAssets, MathLib.RAY, minSharePriceE27) + 1n,
    ) + feeSharesProjected,
    maxUint256,
  );
};

/**
 * Reproduces the VaultExitBundlesV1 in-kind-redemption share-allowance bound
 * the vaultV2 entity derives for `getRequirements()`: a per-leg bound over the
 * decoded market list — one share for the spend-allowance base plus a
 * separately rounded preview for the idle leg, each deallocation leg, and
 * each leg's penalty, evaluated at both the raw and deadline-accrued vault
 * snapshots and taking the maximum. Market-side availability is accrued at
 * the op's deadline (the largest timestamp either side can observe).
 */
// biome-ignore lint/complexity/useMaxParams: mirrors the entity's positional argument list
const inKindRedeemShareCap = (
  inputs: PinnedInputs,
  op: DecodedOperation & { readonly type: "vaultV2InKindRedeem" },
  amount: bigint,
  deadline: bigint,
): bigint => {
  const vaultData = inputs.internals.vaultData.get(getAddress(op.vault));
  if (!(vaultData instanceof AccrualVaultV2)) {
    return requirementMismatch(
      op,
      `Vault "${op.vault}" has no pinned Vault V2 entity data; cannot derive the exact share allowance`,
    );
  }
  const soleAdapter = vaultData.accrualAdapters[0];
  if (
    vaultData.accrualAdapters.length !== 1 ||
    !(soleAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2) ||
    !isAddressEqual(soleAdapter.address, op.adapter)
  ) {
    return requirementMismatch(
      op,
      `Vault "${op.vault}" does not have a single decodable Blue adapter at "${op.adapter}"; cannot derive the exact share allowance`,
    );
  }
  const penalty = vaultData.forceDeallocatePenalties[soleAdapter.address] ?? 0n;
  const idleAssets = MathLib.min(vaultData.assetBalance, amount);
  const assetsToDeallocate = MathLib.wDivDown(
    amount - idleAssets,
    MathLib.WAD + penalty,
  );
  const { vault: allowanceVault } = vaultData.accrueInterest(deadline);
  const previewAllowance = (assets: bigint) =>
    MathLib.max(
      vaultData.toShares(assets, "Up"),
      allowanceVault.toShares(assets, "Up"),
    );
  const assetsByMarket = new Map(
    soleAdapter.markets
      .filter((market) => (soleAdapter.supplyShares[market.id] ?? 0n) !== 0n)
      .map((market) => [
        market.id,
        market
          .accrueInterest(deadline)
          .toSupplyAssets(soleAdapter.supplyShares[market.id] ?? 0n),
      ]),
  );
  let requiredShareAllowance = previewAllowance(BigInt(op.markets.length));
  requiredShareAllowance += previewAllowance(idleAssets);
  let remaining = assetsToDeallocate;
  const consumedMarketIds = new Set<string>();
  for (const { marketId } of op.markets) {
    const available = consumedMarketIds.has(marketId)
      ? 0n
      : (assetsByMarket.get(marketId) ?? 0n);
    consumedMarketIds.add(marketId);
    const chunk = MathLib.min(available, remaining);
    requiredShareAllowance += previewAllowance(MathLib.wMulUp(chunk, penalty));
    requiredShareAllowance += previewAllowance(chunk);
    remaining -= chunk;
  }
  return requiredShareAllowance;
};

type Route = DecodedOperation["route"];

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const bundleSpender = (
  route: Route,
  bundles: NonNullable<ReturnType<typeof getChainAddresses>["bundles"]> | null,
  chainId: number,
  op: DecodedOperation,
): Address => {
  const address =
    route === "blueBundlesV1"
      ? bundles?.blueBundlesV1
      : route === "vaultBundlesV1"
        ? bundles?.vaultBundlesV1
        : route === "vaultExitBundlesV1"
          ? bundles?.vaultExitBundlesV1
          : undefined;
  if (address == null) {
    throw new UnsupportedOperationError(
      `Chain "${chainId}" registers no bundle address for route "${route}"; cannot derive the pull spender`,
      { stage: "authorization", location: opLocation(op) },
    );
  }
  return address;
};

/**
 * Derive the expected wallet requests from the decoded operations — the
 * single source of truth for authorization policy (design §7).
 * @internal
 */
export function deriveExpectedRequests(params: {
  readonly bundle: DecodedBundle;
  readonly inputs: PinnedInputs;
  readonly limits: EffectiveSimulationLimits;
  readonly context: ExecutionContext;
}): readonly ExpectedRequest[] {
  const { bundle, inputs, limits } = params;
  const chainId = bundle.request.chainId;
  const owner = bundle.owner;

  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) throw new UnsupportedChainError(chainId);
  const bundles = addresses.bundles ?? null;

  const expected: ExpectedRequest[] = [];
  const grantedAuthorized = new Set<string>();

  bundle.operations.forEach((op, operationIndex) => {
    const push = (
      request: Omit<
        Extract<ExpectedRequest, { type: "tokenPull" }>,
        "type" | "operationIndex"
      >,
    ): void => {
      expected.push({ type: "tokenPull", operationIndex, ...request });
    };

    switch (op.type) {
      case "blueSupply":
      case "blueSupplyCollateral":
      case "blueSupplyCollateralBorrow":
      case "blueRepay":
      case "blueRepayWithdrawCollateral": {
        if (op.funding.type === "erc20") {
          push({
            token: op.funding.token,
            owner,
            spender: bundleSpender(op.route, bundles, chainId, op),
            amount: op.funding.assets,
            signature: op.tokenSignature,
          });
        }
        // Native funding is a tx.value pull — no token request.
        if (
          op.type === "blueSupplyCollateralBorrow" ||
          op.type === "blueRepayWithdrawCollateral"
        ) {
          expected.push({
            type: "blueOperatorAuthority",
            operationIndex,
            authorizer: owner,
            authorized: bundleSpender(op.route, bundles, chainId, op),
            signature: op.authorizationSignature,
            satisfiedByEarlierOp: grantedAuthorized.has(
              getAddress(bundleSpender(op.route, bundles, chainId, op)),
            ),
          });
        }
        break;
      }
      case "blueWithdraw":
      case "blueBorrow":
      case "blueWithdrawCollateral": {
        const authorized = bundleSpender(op.route, bundles, chainId, op);
        expected.push({
          type: "blueOperatorAuthority",
          operationIndex,
          authorizer: owner,
          authorized,
          signature: op.authorizationSignature,
          satisfiedByEarlierOp: grantedAuthorized.has(getAddress(authorized)),
        });
        break;
      }
      case "blueRefinance": {
        const authorized = bundleSpender(op.route, bundles, chainId, op);
        expected.push({
          type: "blueOperatorAuthority",
          operationIndex,
          authorizer: owner,
          authorized,
          signature: op.authorizationSignature,
          satisfiedByEarlierOp: grantedAuthorized.has(getAddress(authorized)),
        });
        break;
      }
      case "blueAuthorization": {
        // The op itself is a user transaction setting authority; it issues
        // no wallet request but satisfies later requirements for the same
        // authorized address.
        if (op.isAuthorized) grantedAuthorized.add(getAddress(op.authorized));
        break;
      }
      case "vaultV1Deposit":
      case "vaultV2Deposit": {
        if (op.funding.type === "erc20") {
          push({
            token: op.funding.token,
            owner,
            spender: bundleSpender(op.route, bundles, chainId, op),
            amount: op.funding.assets,
            signature: op.tokenSignature,
          });
        }
        break;
      }
      case "vaultV1Withdraw":
      case "vaultV2Withdraw": {
        push({
          token: op.vault,
          owner,
          spender: bundleSpender(op.route, bundles, chainId, op),
          amount: shareCap(
            inputs,
            op,
            op.vault,
            op.assets,
            op.deadline,
            limits,
          ),
          signature: op.tokenSignature,
        });
        break;
      }
      case "vaultV1Redeem":
      case "vaultV2Redeem": {
        push({
          token: op.vault,
          owner,
          spender: bundleSpender(op.route, bundles, chainId, op),
          amount: op.shares,
          signature: op.tokenSignature,
        });
        break;
      }
      case "vaultV2ForceWithdraw": {
        push({
          token: op.vault,
          owner,
          spender: bundleSpender(op.route, bundles, chainId, op),
          amount: forceWithdrawShareCap(
            inputs,
            op,
            op.vault,
            op.exitAssets,
            op.minSharePriceE27,
            owner,
            op.deadline,
            limits,
          ),
          signature: op.tokenSignature,
        });
        break;
      }
      case "vaultV2ForceRedeem": {
        // Multicall force-redeem burns the caller's shares inside the vault's
        // own multicall — no allowance pull is requested.
        break;
      }
      case "vaultV1InKindRedeem": {
        push({
          token: op.vault,
          owner,
          spender: bundleSpender(op.route, bundles, chainId, op),
          amount: shareCap(
            inputs,
            op,
            op.vault,
            op.assets,
            op.deadline,
            limits,
          ),
          signature: op.tokenSignature,
        });
        break;
      }
      case "vaultV2InKindRedeem": {
        push({
          token: op.vault,
          owner,
          spender: bundleSpender(op.route, bundles, chainId, op),
          amount: inKindRedeemShareCap(inputs, op, op.assets, op.deadline),
          signature: op.tokenSignature,
        });
        break;
      }
      case "vaultV1MigrateToV2": {
        push({
          token: op.sourceVault,
          owner,
          spender: bundleSpender(op.route, bundles, chainId, op),
          amount:
            op.amount.type === "shares"
              ? op.amount.shares
              : shareCap(
                  inputs,
                  op,
                  op.sourceVault,
                  op.amount.assets,
                  op.deadline,
                  limits,
                ),
          signature: op.tokenSignature,
        });
        break;
      }
      default: {
        const _exhaustive: never = op;
        return _exhaustive;
      }
    }
  });

  return expected;
}

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const checkSignatureDeadline = (
  op: DecodedOperation,
  deadline: bigint,
  context: ExecutionContext,
): void => {
  if (deadline <= context.stateBlockTimestamp) {
    requirementMismatch(
      op,
      `Signature deadline "${deadline}" is not after the pinned timestamp "${context.stateBlockTimestamp}"`,
    );
  }
};

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const checkAuthorizationDeadline = (
  authorizationIndex: number,
  deadline: bigint,
  context: ExecutionContext,
  limits: EffectiveSimulationLimits,
): void => {
  if (deadline <= context.stateBlockTimestamp) {
    authorizationMismatch(
      authorizationIndex,
      `Signature deadline "${deadline}" is not after the pinned timestamp "${context.stateBlockTimestamp}"`,
    );
  }
  const bound =
    context.stateBlockTimestamp + limits.maxSignatureLifetimeSeconds;
  if (deadline > bound) {
    authorizationMismatch(
      authorizationIndex,
      `Signature deadline "${deadline}" exceeds the allowed lifetime bound "${bound}"`,
    );
  }
};

interface ChainEnv {
  readonly chainId: number;
  readonly morpho: Address;
  readonly permit2: Address | undefined;
}

const chainEnv = (chainId: number): ChainEnv => {
  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) throw new UnsupportedChainError(chainId);
  return {
    chainId,
    morpho: addresses.blue,
    permit2: addresses.permit2,
  };
};

const requirePermit2 = (
  env: ChainEnv,
  authorizationIndex?: number,
): Address => {
  if (env.permit2 == null) {
    const message = `Chain "${env.chainId}" registers no canonical Permit2 address`;
    if (authorizationIndex == null) {
      throw new UnsupportedChainError(env.chainId);
    }
    return authorizationMismatch(authorizationIndex, message);
  }
  return env.permit2;
};

/**
 * Match pending wallet requests one-to-one against the expected requests
 * derived from the decoded operations and pinned state (design §7). Final
 * mode requires pinned state alone to satisfy every requirement; preview
 * mode requires every unsatisfied requirement to be covered by exactly one
 * authorization.
 * @internal
 */
export function checkRequests(params: {
  readonly inputs: PinnedInputs;
  readonly limits: EffectiveSimulationLimits;
}): ValidatedAuthorizations {
  const { inputs, limits } = params;
  const { bundle, before, context } = inputs;
  const authorizations = bundle.request.authorizations;
  const mode = bundle.request.mode;

  const env = chainEnv(bundle.request.chainId);
  const expected = deriveExpectedRequests({
    bundle,
    inputs,
    limits,
    context,
  });
  const op = (request: ExpectedRequest): DecodedOperation => {
    const operation = bundle.operations[request.operationIndex];
    if (operation == null) {
      throw new UnexpectedSimulationError(
        `Expected request references operation index "${request.operationIndex}" that does not exist`,
        { stage: "authorization" },
      );
    }
    return operation;
  };

  if (mode === "final") {
    if (authorizations.length > 0) {
      authorizationMismatch(
        0,
        "Final-mode requests carry no pending authorizations; requirements must be satisfied by pinned state or embedded signatures",
      );
    }
    for (const request of expected) {
      const operation = op(request);
      if (request.type === "tokenPull") {
        switch (request.signature.type) {
          case "none":
            if (
              findAllowance(
                before,
                request.token,
                request.owner,
                request.spender,
              ) < request.amount
            ) {
              requirementMismatch(
                operation,
                `Allowance ${request.owner}→${request.spender} on "${request.token}" is below the required "${request.amount}"`,
              );
            }
            break;
          case "erc2612Permit": {
            const signature = request.signature;
            const pinned = findErc2612Nonce(
              before,
              request.token,
              request.owner,
            );
            if (
              signature.nonce != null &&
              pinned != null &&
              signature.nonce !== pinned
            ) {
              requirementMismatch(
                operation,
                `ERC-2612 nonce must equal the pinned nonce "${pinned}", got "${signature.nonce}"`,
              );
            }
            checkSignatureDeadline(operation, signature.deadline, context);
            break;
          }
          case "permit2SignatureTransfer": {
            const signature = request.signature;
            const permit2 = requirePermit2(env);
            checkSignatureDeadline(operation, signature.deadline, context);
            if (
              permit2BitUsed(before, permit2, request.owner, signature.nonce)
            ) {
              requirementMismatch(
                operation,
                `Permit2 nonce "${signature.nonce}" is already used at the pinned block`,
              );
            }
            if (
              findAllowance(before, request.token, request.owner, permit2) <
              request.amount
            ) {
              requirementMismatch(
                operation,
                `Permit2 transfer requires allowance ${request.owner}→${permit2} on "${request.token}" of at least "${request.amount}"`,
              );
            }
            break;
          }
        }
      } else {
        switch (request.signature.type) {
          case "none":
            if (
              !request.satisfiedByEarlierOp &&
              !findBlueAuthorized(
                before,
                env.morpho,
                request.authorizer,
                request.authorized,
              )
            ) {
              requirementMismatch(
                operation,
                `Morpho authorization ${request.authorizer}→${request.authorized} is not granted at the pinned block`,
              );
            }
            break;
          case "blueAuthorizationSignature": {
            const signature = request.signature;
            const pinned = findBlueNonce(
              before,
              env.morpho,
              request.authorizer,
            );
            if (pinned != null && signature.nonce !== pinned) {
              requirementMismatch(
                operation,
                `Morpho authorization nonce must equal the pinned nonce "${pinned}", got "${signature.nonce}"`,
              );
            }
            checkSignatureDeadline(operation, signature.deadline, context);
            break;
          }
        }
      }
    }
    return brandValidated(
      deepFreeze({ inputs, limits, preparations: [], matches: [], expected }),
    );
  }

  // Preview mode: the decoder guarantees calldata carries no signatures.
  const satisfied = expected.map((request) => {
    if (request.type === "tokenPull") {
      return (
        findAllowance(before, request.token, request.owner, request.spender) >=
        request.amount
      );
    }
    return (
      request.satisfiedByEarlierOp ||
      findBlueAuthorized(
        before,
        env.morpho,
        request.authorizer,
        request.authorized,
      )
    );
  });

  const matched = new Array<boolean>(expected.length).fill(false);
  const used = new Array<boolean>(authorizations.length).fill(false);
  const matches: { authorizationIndex: number; expectedIndex: number }[] = [];
  const recordMatch = (authorizationIndex: number, expectedIndex: number) => {
    matched[expectedIndex] = true;
    used[authorizationIndex] = true;
    matches.push({ authorizationIndex, expectedIndex });
  };
  // permit2SignatureTransfer index → satisfied owner→permit2 prerequisite.
  const permit2PrereqSatisfied = new Set<number>();

  // biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
  const candidatePull = (
    request: ExpectedRequest,
    i: number,
    token: Address,
    owner: Address,
    spender: Address,
  ): boolean =>
    !matched[i] &&
    request.type === "tokenPull" &&
    eq(request.token, token) &&
    eq(request.owner, owner) &&
    eq(request.spender, spender);

  // biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
  const findPull = (token: Address, owner: Address, spender: Address): number =>
    expected.findIndex((request, i) =>
      candidatePull(request, i, token, owner, spender),
    );

  authorizations.forEach((auth, authorizationIndex) => {
    if (used[authorizationIndex]) return;

    switch (auth.type) {
      case "erc20Approval": {
        if (auth.amount === 0n) {
          // Ordered zero-reset: only valid immediately before the exact
          // approval for an approve-only-once token with a live allowance.
          const next = authorizations[authorizationIndex + 1];
          const approveOnlyOnce = (
            APPROVE_ONLY_ONCE_TOKENS[bundle.request.chainId] ?? []
          ).some((token) => eq(token, auth.token));
          if (
            next?.type === "erc20Approval" &&
            !used[authorizationIndex + 1] &&
            eq(next.token, auth.token) &&
            eq(next.owner, auth.owner) &&
            eq(next.spender, auth.spender) &&
            approveOnlyOnce &&
            findAllowance(before, auth.token, auth.owner, auth.spender) > 0n
          ) {
            used[authorizationIndex] = true;
            return;
          }
          return authorizationMismatch(
            authorizationIndex,
            `Zero approval for "${auth.token}" is only accepted immediately before the exact approval, on an approve-only-once token, with a non-zero pinned allowance`,
          );
        }
        const i = findPull(auth.token, auth.owner, auth.spender);
        if (i >= 0) {
          const request = expected[i];
          if (request?.type !== "tokenPull") return;
          if (satisfied[i]) {
            return authorizationMismatch(
              authorizationIndex,
              `Approval for "${auth.token}"→"${auth.spender}" is redundant: pinned state already satisfies the requirement`,
            );
          }
          if (auth.amount !== request.amount) {
            return authorizationMismatch(
              authorizationIndex,
              `ERC-20 approval amount must be exact: expected "${request.amount}", got "${auth.amount}"`,
            );
          }
          recordMatch(authorizationIndex, i);
          return;
        }
        // An approval to canonical Permit2 can satisfy the prerequisite of a
        // permit2SignatureTransfer authorization instead of a pull directly.
        if (env.permit2 != null && eq(auth.spender, env.permit2)) {
          const j = authorizations.findIndex(
            (other, otherIndex) =>
              otherIndex !== authorizationIndex &&
              !used[otherIndex] &&
              other.type === "permit2SignatureTransfer" &&
              eq(other.typedData.message.permitted.token, auth.token) &&
              eq(other.owner, auth.owner) &&
              other.typedData.message.permitted.amount <= auth.amount &&
              findPull(
                other.typedData.message.permitted.token,
                auth.owner,
                other.typedData.message.spender,
              ) >= 0,
          );
          if (j >= 0) {
            permit2PrereqSatisfied.add(j);
            used[authorizationIndex] = true;
            return;
          }
        }
        return authorizationMismatch(
          authorizationIndex,
          `ERC-20 approval for token "${auth.token}" spender "${auth.spender}" matches no decoded requirement`,
        );
      }
      case "erc2612Permit": {
        const { domain, message } = auth.typedData;
        const i = findPull(
          domain.verifyingContract,
          message.owner,
          message.spender,
        );
        if (i < 0) {
          return authorizationMismatch(
            authorizationIndex,
            `ERC-2612 permit for "${domain.verifyingContract}" spender "${message.spender}" matches no decoded requirement`,
          );
        }
        const request = expected[i];
        if (request?.type !== "tokenPull") return;
        if (satisfied[i]) {
          return authorizationMismatch(
            authorizationIndex,
            "ERC-2612 permit is redundant: pinned state already satisfies the requirement",
          );
        }
        if (BigInt(domain.chainId) !== BigInt(env.chainId)) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit domain chainId "${domain.chainId}" differs from request chain "${env.chainId}"`,
          );
        }
        if (!eq(message.owner, request.owner)) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit owner "${message.owner}" differs from the bundle owner "${request.owner}"`,
          );
        }
        if (message.value !== request.amount) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit value must be exact: expected "${request.amount}", got "${message.value}"`,
          );
        }
        const pinnedNonce = findErc2612Nonce(
          before,
          request.token,
          request.owner,
        );
        if (pinnedNonce != null && message.nonce !== pinnedNonce) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit nonce must equal the pinned nonce "${pinnedNonce}", got "${message.nonce}"`,
          );
        }
        checkAuthorizationDeadline(
          authorizationIndex,
          message.deadline,
          context,
          limits,
        );
        recordMatch(authorizationIndex, i);
        return;
      }
      case "permit2SignatureTransfer": {
        const { domain, message } = auth.typedData;
        const permit2 = requirePermit2(env, authorizationIndex);
        const i = findPull(
          message.permitted.token,
          auth.owner,
          message.spender,
        );
        if (i < 0) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit2 transfer for "${message.permitted.token}" spender "${message.spender}" matches no decoded requirement`,
          );
        }
        const request = expected[i];
        if (request?.type !== "tokenPull") return;
        if (satisfied[i]) {
          return authorizationMismatch(
            authorizationIndex,
            "Permit2 transfer is redundant: pinned state already satisfies the requirement",
          );
        }
        if (!eq(domain.verifyingContract, permit2)) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit2 domain must name canonical Permit2 "${permit2}", got "${domain.verifyingContract}"`,
          );
        }
        if (!eq(auth.owner, request.owner)) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit2 owner "${auth.owner}" differs from the bundle owner "${request.owner}"`,
          );
        }
        if (message.permitted.amount !== request.amount) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit2 amount must be exact: expected "${request.amount}", got "${message.permitted.amount}"`,
          );
        }
        checkAuthorizationDeadline(
          authorizationIndex,
          message.deadline,
          context,
          limits,
        );
        if (permit2BitUsed(before, permit2, auth.owner, message.nonce)) {
          return authorizationMismatch(
            authorizationIndex,
            `Permit2 nonce "${message.nonce}" is already used at the pinned block`,
          );
        }
        const prereqAllowance = findAllowance(
          before,
          request.token,
          auth.owner,
          permit2,
        );
        if (
          prereqAllowance < request.amount &&
          !permit2PrereqSatisfied.has(authorizationIndex)
        ) {
          const j = authorizations.findIndex(
            (other, otherIndex) =>
              otherIndex !== authorizationIndex &&
              !used[otherIndex] &&
              other.type === "erc20Approval" &&
              eq(other.token, request.token) &&
              eq(other.owner, auth.owner) &&
              eq(other.spender, permit2) &&
              other.amount >= request.amount,
          );
          if (j < 0) {
            return authorizationMismatch(
              authorizationIndex,
              `Permit2 pull of "${request.amount}" on "${request.token}" lacks the canonical Permit2 allowance or a pending approval`,
            );
          }
          used[j] = true;
        }
        recordMatch(authorizationIndex, i);
        return;
      }
      case "blueAuthorization": {
        const i = expected.findIndex(
          (request, requestIndex) =>
            !matched[requestIndex] &&
            request.type === "blueOperatorAuthority" &&
            eq(request.authorizer, auth.authorizer) &&
            eq(request.authorized, auth.authorized),
        );
        if (i < 0) {
          return authorizationMismatch(
            authorizationIndex,
            `Morpho authorization ${auth.authorizer}→"${auth.authorized}" matches no decoded requirement`,
          );
        }
        if (satisfied[i]) {
          return authorizationMismatch(
            authorizationIndex,
            "Morpho authorization is redundant: pinned state or an earlier operation already grants it",
          );
        }
        if (auth.isAuthorized !== true) {
          return authorizationMismatch(
            authorizationIndex,
            "Morpho authorization must grant (isAuthorized=true)",
          );
        }
        recordMatch(authorizationIndex, i);
        return;
      }
      case "blueAuthorizationSignature": {
        const { domain, message } = auth.typedData;
        const i = expected.findIndex(
          (request, requestIndex) =>
            !matched[requestIndex] &&
            request.type === "blueOperatorAuthority" &&
            eq(request.authorized, message.authorized) &&
            eq(request.authorizer, message.authorizer),
        );
        if (i < 0) {
          return authorizationMismatch(
            authorizationIndex,
            `Morpho authorization signature for "${message.authorized}" matches no decoded requirement`,
          );
        }
        if (satisfied[i]) {
          return authorizationMismatch(
            authorizationIndex,
            "Morpho authorization signature is redundant: pinned state or an earlier operation already grants it",
          );
        }
        if (
          BigInt(domain.chainId) !== BigInt(env.chainId) ||
          !eq(domain.verifyingContract, env.morpho)
        ) {
          return authorizationMismatch(
            authorizationIndex,
            `Morpho authorization domain must be the chain's Morpho "${env.morpho}"`,
          );
        }
        if (message.isAuthorized !== true) {
          return authorizationMismatch(
            authorizationIndex,
            "Morpho authorization signature must grant (isAuthorized=true)",
          );
        }
        const pinnedNonce = findBlueNonce(
          before,
          env.morpho,
          message.authorizer,
        );
        if (pinnedNonce != null && message.nonce !== pinnedNonce) {
          return authorizationMismatch(
            authorizationIndex,
            `Morpho authorization nonce must equal the pinned nonce "${pinnedNonce}", got "${message.nonce}"`,
          );
        }
        checkAuthorizationDeadline(
          authorizationIndex,
          message.deadline,
          context,
          limits,
        );
        recordMatch(authorizationIndex, i);
        return;
      }
    }
  });

  // Every unsatisfied requirement must be covered by exactly one authorization.
  expected.forEach((request, i) => {
    if (matched[i] || satisfied[i]) return;
    requirementMismatch(
      op(request),
      `Requirement "${request.type}" at operation ${request.operationIndex} is not covered by any pending authorization or pinned state`,
    );
  });

  const preparations = preparePreviewAuthorizations({
    authorizations,
    owner: bundle.owner,
    morpho: env.morpho,
  });

  return brandValidated(
    deepFreeze({ inputs, limits, preparations, matches, expected }),
  );
}
