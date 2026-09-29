import {
  type MarketId,
  MarketUtils,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { BundlesPermitKind } from "@morpho-org/morpho-sdk";
import {
  blueAbi,
  blueBundlesV1Abi,
  blueMarketParamsAbi,
  vaultBundlesV1Abi,
  vaultExitBundlesV1Abi,
  vaultV2Abi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { _try } from "@morpho-org/morpho-ts";
import {
  type Address,
  type DecodeFunctionDataReturnType,
  decodeAbiParameters,
  decodeFunctionData,
  type Hex,
  isAddressEqual,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import {
  ProtocolBindingMismatchError,
  type SimulationErrorContext,
  SimulationValidationError,
  UnsupportedChainError,
  UnsupportedOperationError,
} from "../errors.js";
import type { SimulationOperationSubject } from "../limits.js";
import type { SimulationTransaction } from "../types.js";
import type {
  DecodedOperation,
  DecodedOperationFields,
  MarketBinding,
  OperationFunding,
  OperationReallocation,
  OperationSignature,
} from "./operation.js";

/**
 * Vault the caller has bound from pinned state. VaultBundlesV1 and VaultExitBundlesV1 calldata
 * carries the vault address but not its version or underlying asset, so the decoder cannot read
 * either from calldata alone — SDK-1295's pinned reads supply these bindings.
 */
export interface VaultBinding {
  readonly address: Address;
  readonly kind: "vaultV1" | "vaultV2";
  readonly asset: Address;
}

/**
 * Pre-liquidation contract bound to its market, for direct Morpho `setAuthorization` calls.
 * The calldata carries only the authorized address, so the market binding comes from pinned reads.
 */
export interface PreLiquidationBinding {
  readonly address: Address;
  readonly market: MarketBinding;
}

/** Parameters for {@link decodeOperations}. */
export interface DecodeOperationsParams {
  readonly chainId: number;
  readonly mode: "preview" | "final";
  /** Pinned block the simulation is verified against; carried into error contexts. */
  readonly blockNumber: bigint;
  readonly transactions: readonly Readonly<SimulationTransaction>[];
  readonly vaults?: readonly VaultBinding[];
  readonly preLiquidations?: readonly PreLiquidationBinding[];
}

/** Ordered decoded operations plus the single transaction sender they share. */
export interface DecodedOperations {
  readonly owner: Address;
  readonly operations: readonly DecodedOperation[];
}

interface DecodedMarketParams {
  readonly loanToken: Address;
  readonly collateralToken: Address;
  readonly oracle: Address;
  readonly irm: Address;
  readonly lltv: bigint;
}

interface TokenPermitArg {
  readonly kind: number;
  readonly data: Hex;
}

interface SharesPermitArg {
  readonly value: bigint;
  readonly nonce: bigint;
  readonly deadline: bigint;
  readonly v: number;
  readonly r: Hex;
  readonly s: Hex;
}

interface SignedAuthorizationArg {
  readonly signature: { readonly v: number; readonly r: Hex; readonly s: Hex };
  readonly nonce: bigint;
  readonly deadline: bigint;
}

interface ReallocationArg {
  readonly vault: Address;
  readonly adapter: Address;
  readonly marketParams: DecodedMarketParams;
  readonly fromIdle: boolean;
  readonly sourceAdapter: Address;
  readonly sourceMarketParams: DecodedMarketParams;
  readonly assets: bigint;
  readonly penalty: bigint;
}

interface Env {
  readonly chainId: number;
  readonly mode: "preview" | "final";
  readonly blockNumber: bigint;
  readonly owner: Address;
  readonly morpho: Address;
  readonly wNative: Address | undefined;
  readonly blueBundlesV1: Address | undefined;
  readonly vaultBundlesV1: Address | undefined;
  readonly vaultExitBundlesV1: Address | undefined;
  readonly rejected: readonly Address[];
  readonly vaults: readonly VaultBinding[];
  readonly preLiquidations: readonly PreLiquidationBinding[];
}

interface Loc {
  readonly index: number;
  readonly subject?: SimulationOperationSubject;
}

interface Fails {
  readonly env: Env;
  readonly loc: Loc;
  readonly with: (detail: {
    readonly subject?: SimulationOperationSubject;
  }) => Fails;
  readonly mismatch: (message: string, options?: ErrorOptions) => never;
  readonly unsupported: (message: string, options?: ErrorOptions) => never;
}

/** Operation payload without its identity fields; assembled per transaction by decodeOperations. */
type OperationBody = {
  [Type in keyof DecodedOperationFields]: {
    readonly type: Type;
  } & DecodedOperationFields[Type];
}[keyof DecodedOperationFields];

const errorContext = (env: Env, loc: Loc): SimulationErrorContext => {
  const base = {
    chainId: env.chainId,
    mode: env.mode,
    blockNumber: env.blockNumber,
  };
  if (loc.subject == null) {
    return { ...base, stage: "validation" };
  }
  return {
    ...base,
    stage: "verification",
    ...loc.subject,
    failedTransactionIndex: loc.index,
  };
};

const fails = (env: Env, loc: Loc): Fails => {
  // Before the operation is known the context carries no transaction index,
  // so validation failures keep it in the message.
  const prefix = loc.subject == null ? `Transaction "${loc.index}": ` : "";
  return {
    env,
    loc,
    with: (detail) => fails(env, { ...loc, ...detail }),
    mismatch: (message, options) => {
      throw new ProtocolBindingMismatchError(prefix + message, {
        context: errorContext(env, loc),
        ...options,
      });
    },
    unsupported: (message, options) => {
      throw new UnsupportedOperationError(prefix + message, {
        context: errorContext(env, loc),
        ...options,
      });
    },
  };
};

const marketBinding = (params: DecodedMarketParams): MarketBinding => ({
  marketId: MarketUtils.getMarketId(params),
  params,
});

const findVault = (env: Env, address: Address): VaultBinding | undefined =>
  env.vaults.find((vault) => isAddressEqual(vault.address, address));

const PREVIEW_SIGNATURE_MESSAGE =
  "Preview calldata must not consume signatures; build with BundlesPermitKind.None and pass wallet requests via authorizations";

const checkPreview = (f: Fails, signature: OperationSignature): void => {
  if (f.env.mode === "preview" && signature.type !== "none") {
    f.unsupported(
      `${PREVIEW_SIGNATURE_MESSAGE}. Signature form "${signature.type}" is present`,
    );
  }
};

/** Decodes a TokenLib `Permit{kind,data}` argument into its signature form. */
const decodeTokenPermit = (
  permit: TokenPermitArg,
  f: Fails,
): Exclude<
  OperationSignature,
  { readonly type: "blueAuthorizationSignature" }
> => {
  switch (permit.kind) {
    case BundlesPermitKind.None: {
      if (permit.data !== "0x") {
        f.mismatch(
          `Permit data expected "0x" for kind "0" (no permit), got non-empty data. Rebuild with BundlesPermitKind.None`,
        );
      }
      return { type: "none" };
    }
    case BundlesPermitKind.ERC2612: {
      // ERC-2612: abi.encode(deadline uint256, v uint8, r bytes32, s bytes32); no nonce.
      if (permit.data === "0x") {
        f.mismatch(
          `Permit data expected an ERC-2612 payload for kind "1", got "0x". Rebuild the permit requirement`,
        );
      }
      const [deadline] = decodePermitData(f, {
        data: permit.data,
        parameters: ERC2612_PERMIT_DATA_PARAMETERS,
      });
      return { type: "erc2612Permit", deadline };
    }
    case BundlesPermitKind.Permit2: {
      // Permit2 SignatureTransfer: abi.encode(nonce uint256, deadline uint256, signature bytes).
      if (permit.data === "0x") {
        f.mismatch(
          `Permit data expected a Permit2 payload for kind "2", got "0x". Rebuild the permit requirement`,
        );
      }
      const [nonce, deadline] = decodePermitData(f, {
        data: permit.data,
        parameters: PERMIT2_PERMIT_DATA_PARAMETERS,
      });
      return { type: "permit2SignatureTransfer", nonce, deadline };
    }
    default:
      return f.unsupported(
        `Permit kind expected "0", "1", or "2", got "${permit.kind}". Only None, ERC-2612, and Permit2 SignatureTransfer permits are supported`,
      );
  }
};

const ERC2612_PERMIT_DATA_PARAMETERS = [
  { type: "uint256", name: "deadline" },
  { type: "uint8", name: "v" },
  { type: "bytes32", name: "r" },
  { type: "bytes32", name: "s" },
] as const;

const PERMIT2_PERMIT_DATA_PARAMETERS = [
  { type: "uint256", name: "nonce" },
  { type: "uint256", name: "deadline" },
  { type: "bytes", name: "signature" },
] as const;

const decodePermitData = <
  const TParameters extends readonly { type: string; name: string }[],
>(
  f: Fails,
  spec: { readonly data: Hex; readonly parameters: TParameters },
) => {
  try {
    return decodeAbiParameters(spec.parameters, spec.data);
  } catch (cause) {
    return f.mismatch(
      "Permit data does not decode to the expected layout. Rebuild the permit requirement",
      { cause },
    );
  }
};

/** Decodes a vault-share `SharesPermit` struct; the all-zero sentinel maps to no signature. */
const decodeSharesPermit = (
  permit: SharesPermitArg,
): Extract<OperationSignature, { readonly type: "none" | "erc2612Permit" }> => {
  if (permit.v === 0 && permit.r === zeroHash && permit.s === zeroHash) {
    return { type: "none" };
  }
  return {
    type: "erc2612Permit",
    nonce: permit.nonce,
    deadline: permit.deadline,
  };
};

/** Decodes a Morpho `signedAuthorization` struct; the all-zero sentinel maps to no signature. */
const decodeSignedAuthorization = (
  authorization: SignedAuthorizationArg,
): Extract<
  OperationSignature,
  { readonly type: "none" | "blueAuthorizationSignature" }
> => {
  const { signature, nonce, deadline } = authorization;
  if (
    signature.v === 0 &&
    signature.r === zeroHash &&
    signature.s === zeroHash &&
    nonce === 0n &&
    deadline === 0n
  ) {
    return { type: "none" };
  }
  return { type: "blueAuthorizationSignature", nonce, deadline };
};

/**
 * Narrows a decoded signature to the no-signature sentinel for a leg that
 * cannot carry one (a zero funded leg has no token permit; a zero protected
 * leg has no Morpho authorization), mirroring the builders' rejections.
 */
const requireNoSignature = (
  f: Fails,
  spec: {
    readonly signature: OperationSignature;
    readonly entrypoint: string;
    readonly leg: string;
  },
): Extract<OperationSignature, { readonly type: "none" }> => {
  const { signature, entrypoint, leg } = spec;
  if (signature.type !== "none") {
    return f.unsupported(
      `${entrypoint} expected no ${leg} without its leg, got "${signature.type}"`,
    );
  }
  return signature;
};

/** Maps decoded `PublicAllocations` reallocation tuples onto domain entries. */
const decodeReallocations = (
  f: Fails,
  spec: {
    readonly reallocations: readonly ReallocationArg[];
    readonly targetMarket: MarketBinding;
  },
): readonly OperationReallocation[] => {
  const { reallocations, targetMarket } = spec;
  return reallocations.map((reallocation) => {
    const to = marketBinding(reallocation.marketParams);
    if (to.marketId !== targetMarket.marketId) {
      f.mismatch(
        `Reallocation target market expected "${targetMarket.marketId}", got "${to.marketId}". Reallocations must target the enclosing market`,
      );
    }
    if (reallocation.assets <= 0n) {
      f.unsupported(
        `Reallocation assets expected a positive amount, got "${reallocation.assets}". Reallocations must move liquidity`,
      );
    }
    const source = reallocation.sourceMarketParams;
    let from: OperationReallocation["from"];
    if (reallocation.fromIdle) {
      const idleSentinel =
        isAddressEqual(source.loanToken, targetMarket.params.loanToken) &&
        isAddressEqual(source.collateralToken, zeroAddress) &&
        isAddressEqual(source.oracle, zeroAddress) &&
        isAddressEqual(source.irm, zeroAddress) &&
        source.lltv === 0n;
      if (!isAddressEqual(reallocation.sourceAdapter, zeroAddress)) {
        f.mismatch(
          `Reallocation fromIdle expected sourceAdapter "${zeroAddress}", got "${reallocation.sourceAdapter}". Idle sources carry no adapter`,
        );
      }
      if (!idleSentinel) {
        f.mismatch(
          `Reallocation fromIdle expected the idle market sentinel for loan token "${targetMarket.params.loanToken}". Rebuild the reallocation from the SDK output`,
        );
      }
      from = { type: "idle" };
    } else {
      const sourceMarket = marketBinding(source);
      if (sourceMarket.marketId === targetMarket.marketId) {
        f.mismatch(
          `Reallocation source market expected a market different from the target "${targetMarket.marketId}". A reallocation moves liquidity between markets`,
        );
      }
      if (
        !isAddressEqual(
          sourceMarket.params.loanToken,
          targetMarket.params.loanToken,
        )
      ) {
        f.mismatch(
          `Reallocation source loan token expected "${targetMarket.params.loanToken}", got "${sourceMarket.params.loanToken}". Source and target must share the loan token`,
        );
      }
      from = {
        type: "market",
        adapter: reallocation.sourceAdapter,
        market: sourceMarket,
      };
    }
    return {
      vault: reallocation.vault,
      from,
      to: { adapter: reallocation.adapter, market: to },
      assets: reallocation.assets,
      penaltyWad: reallocation.penalty,
    };
  });
};

interface FundingSpec {
  readonly token: Address;
  readonly amount: bigint;
  readonly value: bigint;
  readonly permit: TokenPermitArg;
}

/** Resolves a funded leg's exclusive ERC-20 or native source from `tx.value` and the permit kind. */
const resolveFunding = (
  f: Fails,
  spec: FundingSpec,
): Extract<OperationFunding, { readonly type: "erc20" | "native" }> => {
  const env = f.env;
  const { token, amount, value, permit } = spec;
  if (value > 0n) {
    if (permit.kind !== BundlesPermitKind.None) {
      f.unsupported(
        `Native funding is exclusive with a token permit, got permit kind "${permit.kind}". Build with BundlesPermitKind.None`,
      );
    }
    if (env.wNative == null || !isAddressEqual(token, env.wNative)) {
      f.mismatch(
        `Native funding expected the funded token to be wNative "${env.wNative ?? "unregistered"}", got "${token}". Only wNative accepts tx.value funding`,
      );
    }
    if (value !== amount) {
      f.mismatch(
        `Native funding value expected "${amount}", got "${value}". tx.value must equal the funded amount`,
      );
    }
    return { type: "native", wrappedToken: env.wNative, assets: value };
  }
  return { type: "erc20", token, assets: amount };
};

const rejectValue = (
  f: Fails,
  spec: { readonly value: bigint; readonly name: string },
): void => {
  if (spec.value > 0n) {
    f.mismatch(
      `${spec.name} expected tx.value "0", got "${spec.value}". This entrypoint takes no native funding`,
    );
  }
};

/** Resolves a calldata vault address against the caller-supplied bindings, checking the expected kind. */
const boundVault = (
  f: Fails,
  spec: {
    readonly address: Address;
    readonly kind?: VaultBinding["kind"];
  },
): VaultBinding => {
  const { address, kind } = spec;
  const vault = findVault(f.env, address);
  if (vault == null) {
    return f.mismatch(
      `Vault "${address}" is not bound in decodeOperations params. Pass a VaultBinding resolved from pinned state`,
    );
  }
  if (kind != null && vault.kind !== kind) {
    return f.mismatch(
      `Vault "${address}" expected kind "${kind}", got "${vault.kind}". Check the VaultBinding from pinned state`,
    );
  }
  return vault;
};

const referralFee = (
  referralFeePct: bigint,
  referralFeeRecipient: Address,
): { readonly rateWad: bigint; readonly recipient: Address } => ({
  rateWad: referralFeePct,
  recipient: referralFeeRecipient,
});

const decodeBlueBundles = (
  base: Fails,
  tx: Readonly<SimulationTransaction>,
): OperationBody => {
  let decoded: DecodeFunctionDataReturnType<typeof blueBundlesV1Abi>;
  try {
    decoded = decodeFunctionData({ abi: blueBundlesV1Abi, data: tx.data });
  } catch (cause) {
    return base.unsupported(
      "Transaction data does not decode as a BlueBundlesV1 call. Only the released Blue entrypoints are supported",
      { cause },
    );
  }
  const value = tx.value ?? 0n;
  const functionName: string = decoded.functionName;

  switch (decoded.functionName) {
    case "blueBundlesV1Supply": {
      const [marketParams, assets, loanTokenPermit, pct, recipient, deadline] =
        decoded.args;
      const f = base.with({
        subject: {
          operation: "blueSupply",
          marketId: marketBinding(marketParams).marketId,
        },
      });
      const tokenSignature = decodeTokenPermit(loanTokenPermit, f);
      checkPreview(f, tokenSignature);
      return {
        type: "blueSupply",
        route: "blueBundlesV1",
        market: marketBinding(marketParams),
        onBehalf: base.env.owner,
        receiver: base.env.owner,
        assets,
        funding: resolveFunding(f, {
          token: marketParams.loanToken,
          amount: assets,
          value,
          permit: loanTokenPermit,
        }),
        tokenSignature,
        authorizationSignature: { type: "none" },
        deadline,
        referralFee: referralFee(pct, recipient),
      };
    }
    case "blueBundlesV1Withdraw": {
      const [
        marketParams,
        withdrawAssets,
        withdrawShares,
        signedAuthorization,
        reallocations,
        pct,
        recipient,
        deadline,
      ] = decoded.args;
      const market = marketBinding(marketParams);
      const f = base.with({
        subject: { operation: "blueWithdraw", marketId: market.marketId },
      });
      rejectValue(f, { value, name: "blueBundlesV1Withdraw" });
      const hasAssets = withdrawAssets > 0n;
      const hasShares = withdrawShares > 0n;
      if (hasAssets === hasShares) {
        f.unsupported(
          `blueBundlesV1Withdraw expected exactly one of withdrawAssets/withdrawShares, got assets "${withdrawAssets}", shares "${withdrawShares}"`,
        );
      }
      if (withdrawShares === maxUint256) {
        f.unsupported(
          "blueBundlesV1Withdraw withdrawShares expected an exact share amount, got maxUint256. Shares mode has no saturated full-close sentinel; full close is resolved against pinned state",
        );
      }
      const authorizationSignature =
        decodeSignedAuthorization(signedAuthorization);
      checkPreview(f, authorizationSignature);
      return {
        type: "blueWithdraw",
        route: "blueBundlesV1",
        market,
        onBehalf: base.env.owner,
        receiver: base.env.owner,
        amount: hasAssets
          ? { type: "assets", assets: withdrawAssets }
          : { type: "shares", shares: withdrawShares },
        fullClose: false,
        reallocations: decodeReallocations(f, {
          reallocations,
          targetMarket: market,
        }),
        tokenSignature: { type: "none" },
        authorizationSignature,
        deadline,
        referralFee: referralFee(pct, recipient),
      };
    }
    case "blueBundlesV1SupplyCollateralAndBorrow": {
      const [
        marketParams,
        collateralAssets,
        borrowAssets,
        maxLtv,
        collateralPermit,
        signedAuthorization,
        reallocations,
        pct,
        recipient,
        deadline,
      ] = decoded.args;
      const market = marketBinding(marketParams);
      const hasCollateral = collateralAssets > 0n;
      const hasBorrow = borrowAssets > 0n;
      const operation = hasCollateral
        ? hasBorrow
          ? "blueSupplyCollateralBorrow"
          : "blueSupplyCollateral"
        : hasBorrow
          ? "blueBorrow"
          : undefined;
      if (operation === undefined) {
        base.unsupported(
          "blueBundlesV1SupplyCollateralAndBorrow expected a non-zero collateral or borrow leg, got both zero",
        );
      }
      const f = base.with({
        subject: { operation, marketId: market.marketId },
      });
      if (hasCollateral && !hasBorrow && reallocations.length > 0) {
        f.unsupported(
          `blueBundlesV1SupplyCollateralAndBorrow expected no reallocations without a borrow leg, got "${reallocations.length}". Reallocations only fund borrowing`,
        );
      }
      const tokenSignature = decodeTokenPermit(collateralPermit, f);
      const authorizationSignature =
        decodeSignedAuthorization(signedAuthorization);
      checkPreview(f, tokenSignature);
      checkPreview(f, authorizationSignature);
      const common = {
        route: "blueBundlesV1" as const,
        market,
        onBehalf: base.env.owner,
        receiver: base.env.owner,
        tokenSignature,
        authorizationSignature,
        deadline,
        referralFee: referralFee(pct, recipient),
      };
      if (hasCollateral) {
        const funding = resolveFunding(f, {
          token: marketParams.collateralToken,
          amount: collateralAssets,
          value,
          permit: collateralPermit,
        });
        return hasBorrow
          ? {
              type: "blueSupplyCollateralBorrow",
              ...common,
              collateralAssets,
              borrowAssets,
              maxLtvWad: maxLtv,
              funding,
              reallocations: decodeReallocations(f, {
                reallocations,
                targetMarket: market,
              }),
            }
          : {
              type: "blueSupplyCollateral",
              ...common,
              authorizationSignature: requireNoSignature(f, {
                signature: authorizationSignature,
                entrypoint: "blueBundlesV1SupplyCollateralAndBorrow",
                leg: "Morpho authorization",
              }),
              collateralAssets,
              maxLtvWad: maxLtv,
              funding,
            };
      }
      rejectValue(f, {
        value,
        name: "blueBundlesV1SupplyCollateralAndBorrow",
      });
      return {
        type: "blueBorrow",
        ...common,
        tokenSignature: requireNoSignature(f, {
          signature: tokenSignature,
          entrypoint: "blueBundlesV1SupplyCollateralAndBorrow",
          leg: "collateral permit",
        }),
        borrowAssets,
        maxLtvWad: maxLtv,
        reallocations: decodeReallocations(f, {
          reallocations,
          targetMarket: market,
        }),
      };
    }
    case "blueBundlesV1RepayAndWithdrawCollateral": {
      const [
        marketParams,
        repayAssets,
        repayShares,
        maxRepayAssets,
        collateralAssets,
        maxLtv,
        loanTokenPermit,
        signedAuthorization,
        pct,
        recipient,
        deadline,
      ] = decoded.args;
      const market = marketBinding(marketParams);
      const hasRepay = repayAssets > 0n || repayShares > 0n;
      const hasCollateral = collateralAssets > 0n;
      const operation = hasRepay
        ? hasCollateral
          ? "blueRepayWithdrawCollateral"
          : "blueRepay"
        : hasCollateral
          ? "blueWithdrawCollateral"
          : undefined;
      if (repayAssets > 0n && repayShares > 0n) {
        base.unsupported(
          `blueBundlesV1RepayAndWithdrawCollateral expected at most one of repayAssets/repayShares, got assets "${repayAssets}", shares "${repayShares}"`,
        );
      }
      if (operation === undefined) {
        base.unsupported(
          "blueBundlesV1RepayAndWithdrawCollateral expected a non-zero repay or collateral leg, got both zero",
        );
      }
      const f = base.with({
        subject: { operation, marketId: market.marketId },
      });
      const tokenSignature = decodeTokenPermit(loanTokenPermit, f);
      const authorizationSignature =
        decodeSignedAuthorization(signedAuthorization);
      checkPreview(f, tokenSignature);
      checkPreview(f, authorizationSignature);
      const common = {
        route: "blueBundlesV1" as const,
        market,
        onBehalf: base.env.owner,
        receiver: base.env.owner,
        tokenSignature,
        authorizationSignature,
        deadline,
        referralFee: referralFee(pct, recipient),
      };
      if (!hasRepay) {
        rejectValue(f, {
          value,
          name: "blueBundlesV1RepayAndWithdrawCollateral",
        });
        if (maxRepayAssets !== 0n) {
          f.unsupported(
            `blueBundlesV1RepayAndWithdrawCollateral expected maxRepayAssets "0" without a repay leg, got "${maxRepayAssets}". A repay bound requires a repay amount`,
          );
        }
        return {
          type: "blueWithdrawCollateral",
          ...common,
          tokenSignature: requireNoSignature(f, {
            signature: tokenSignature,
            entrypoint: "blueBundlesV1RepayAndWithdrawCollateral",
            leg: "loan token permit",
          }),
          collateralAssets,
          maxLtvWad: maxLtv,
        };
      }
      if (maxRepayAssets === 0n) {
        f.unsupported(
          `blueBundlesV1RepayAndWithdrawCollateral expected a positive maxRepayAssets for the repay leg, got "0". A repay bound is required`,
        );
      }
      const repay = {
        repay:
          repayAssets > 0n
            ? ({ type: "assets", assets: repayAssets } as const)
            : ({ type: "shares", shares: repayShares } as const),
        maxRepayAssets,
        fullClose: repayShares === maxUint256,
        funding: resolveFunding(f, {
          token: marketParams.loanToken,
          amount: maxRepayAssets,
          value,
          permit: loanTokenPermit,
        }),
      };
      return hasCollateral
        ? {
            type: "blueRepayWithdrawCollateral",
            ...common,
            ...repay,
            collateralAssets,
            maxLtvWad: maxLtv,
          }
        : {
            type: "blueRepay",
            ...common,
            authorizationSignature: requireNoSignature(f, {
              signature: authorizationSignature,
              entrypoint: "blueBundlesV1RepayAndWithdrawCollateral",
              leg: "Morpho authorization",
            }),
            ...repay,
          };
    }
    case "blueBundlesV1MigrateBorrowPosition": {
      const [
        sourceMarketParams,
        destMarketParams,
        maxLtv,
        signedAuthorization,
        reallocations,
        pct,
        recipient,
        deadline,
      ] = decoded.args;
      const sourceMarket = marketBinding(sourceMarketParams);
      const targetMarket = marketBinding(destMarketParams);
      const f = base.with({
        subject: {
          operation: "blueRefinance",
          sourceMarketId: sourceMarket.marketId,
          targetMarketId: targetMarket.marketId,
        },
      });
      rejectValue(f, {
        value,
        name: "blueBundlesV1MigrateBorrowPosition",
      });
      if (sourceMarket.marketId === targetMarket.marketId) {
        f.mismatch(
          `Refinance destination market expected a market different from "${sourceMarket.marketId}". Source and destination must differ`,
        );
      }
      if (
        !isAddressEqual(
          sourceMarket.params.loanToken,
          targetMarket.params.loanToken,
        )
      ) {
        f.mismatch(
          `Refinance loan token expected "${sourceMarket.params.loanToken}", got "${targetMarket.params.loanToken}". Source and destination must share the loan token`,
        );
      }
      if (
        !isAddressEqual(
          sourceMarket.params.collateralToken,
          targetMarket.params.collateralToken,
        )
      ) {
        f.mismatch(
          `Refinance collateral token expected "${sourceMarket.params.collateralToken}", got "${targetMarket.params.collateralToken}". Source and destination must share the collateral token`,
        );
      }
      const authorizationSignature =
        decodeSignedAuthorization(signedAuthorization);
      checkPreview(f, authorizationSignature);
      return {
        type: "blueRefinance",
        route: "blueBundlesV1",
        sourceMarket,
        targetMarket,
        onBehalf: base.env.owner,
        maxLtvWad: maxLtv,
        sourceFullClose: true,
        reallocations: decodeReallocations(f, {
          reallocations,
          targetMarket: targetMarket,
        }),
        authorizationSignature,
        deadline,
        referralFee: referralFee(pct, recipient),
      };
    }
    default:
      return base.unsupported(
        `BlueBundlesV1 function "${functionName}" is not a supported entrypoint. Only the released Blue write entrypoints are supported`,
      );
  }
};

const decodeVaultBundles = (
  base: Fails,
  tx: Readonly<SimulationTransaction>,
): OperationBody => {
  let decoded: DecodeFunctionDataReturnType<typeof vaultBundlesV1Abi>;
  try {
    decoded = decodeFunctionData({ abi: vaultBundlesV1Abi, data: tx.data });
  } catch (cause) {
    return base.unsupported(
      "Transaction data does not decode as a VaultBundlesV1 call. Only the released vault entrypoints are supported",
      { cause },
    );
  }
  const value = tx.value ?? 0n;

  switch (decoded.functionName) {
    case "vaultBundlesV1Deposit": {
      const [
        vaultAddress,
        assets,
        maxSharePriceE27,
        assetPermit,
        pct,
        recipient,
        deadline,
      ] = decoded.args;
      const vault = boundVault(base, { address: vaultAddress });
      const f = base.with({
        subject: {
          operation:
            vault.kind === "vaultV1" ? "vaultV1Deposit" : "vaultV2Deposit",
          vault: vault.address,
        },
      });
      const tokenSignature = decodeTokenPermit(assetPermit, f);
      checkPreview(f, tokenSignature);
      return {
        type: vault.kind === "vaultV1" ? "vaultV1Deposit" : "vaultV2Deposit",
        route: "vaultBundlesV1",
        vault: vault.address,
        asset: vault.asset,
        receiver: base.env.owner,
        funding: resolveFunding(f, {
          token: vault.asset,
          amount: assets,
          value,
          permit: assetPermit,
        }),
        maxSharePriceE27,
        tokenSignature,
        deadline,
        referralFee: referralFee(pct, recipient),
      };
    }
    case "vaultBundlesV1Withdraw": {
      const [
        vaultAddress,
        assets,
        shares,
        sharesPermit,
        pct,
        recipient,
        deadline,
      ] = decoded.args;
      const vault = boundVault(base, { address: vaultAddress });
      rejectValue(base, { value, name: "vaultBundlesV1Withdraw" });
      const hasAssets = assets > 0n;
      const hasShares = shares > 0n;
      if (hasAssets === hasShares) {
        base.unsupported(
          `vaultBundlesV1Withdraw expected exactly one of assets/shares, got assets "${assets}", shares "${shares}"`,
        );
      }
      const f = base.with({
        subject: {
          operation:
            vault.kind === "vaultV1"
              ? hasAssets
                ? "vaultV1Withdraw"
                : "vaultV1Redeem"
              : hasAssets
                ? "vaultV2Withdraw"
                : "vaultV2Redeem",
          vault: vault.address,
        },
      });
      const tokenSignature = decodeSharesPermit(sharesPermit);
      checkPreview(f, tokenSignature);
      const common = {
        route: "vaultBundlesV1" as const,
        vault: vault.address,
        asset: vault.asset,
        receiver: base.env.owner,
        tokenSignature,
        deadline,
        referralFee: referralFee(pct, recipient),
      };
      return hasAssets
        ? {
            type:
              vault.kind === "vaultV1" ? "vaultV1Withdraw" : "vaultV2Withdraw",
            ...common,
            assets,
          }
        : {
            type: vault.kind === "vaultV1" ? "vaultV1Redeem" : "vaultV2Redeem",
            ...common,
            shares,
          };
    }
    case "vaultBundlesV1Migrate": {
      const [
        sourceVaultAddress,
        destVaultAddress,
        assetsWithdrawn,
        sharesRedeemed,
        destMaxSharePriceE27,
        sharesPermit,
        pct,
        recipient,
        deadline,
      ] = decoded.args;
      const f = base.with({
        subject: {
          operation: "vaultV1MigrateToV2",
          sourceVault: sourceVaultAddress,
          targetVault: destVaultAddress,
        },
      });
      const sourceVault = boundVault(f, {
        address: sourceVaultAddress,
        kind: "vaultV1",
      });
      const destVault = boundVault(f, {
        address: destVaultAddress,
        kind: "vaultV2",
      });
      rejectValue(f, { value, name: "vaultBundlesV1Migrate" });
      if (!isAddressEqual(sourceVault.asset, destVault.asset)) {
        f.mismatch(
          `Migration destination asset expected "${sourceVault.asset}", got "${destVault.asset}". Source and destination vaults must share an asset`,
        );
      }
      const hasAssets = assetsWithdrawn > 0n;
      const hasShares = sharesRedeemed > 0n;
      if (hasAssets === hasShares) {
        f.unsupported(
          `vaultBundlesV1Migrate expected exactly one of assetsWithdrawn/sharesRedeemed, got assets "${assetsWithdrawn}", shares "${sharesRedeemed}"`,
        );
      }
      const tokenSignature = decodeSharesPermit(sharesPermit);
      checkPreview(f, tokenSignature);
      return {
        type: "vaultV1MigrateToV2",
        route: "vaultBundlesV1",
        sourceVault: sourceVault.address,
        targetVault: destVault.address,
        asset: sourceVault.asset,
        amount: hasAssets
          ? { type: "assets", assets: assetsWithdrawn }
          : { type: "shares", shares: sharesRedeemed },
        receiver: base.env.owner,
        maxTargetSharePriceE27: destMaxSharePriceE27,
        tokenSignature,
        deadline,
        referralFee: referralFee(pct, recipient),
      };
    }
    default:
      return base.unsupported(
        `VaultBundlesV1 function "${decoded.functionName}" is not a supported entrypoint. Only deposit, withdraw, and migrate are supported`,
      );
  }
};

const decodeVaultExitBundles = (
  base: Fails,
  tx: Readonly<SimulationTransaction>,
): OperationBody => {
  let decoded: DecodeFunctionDataReturnType<typeof vaultExitBundlesV1Abi>;
  try {
    decoded = decodeFunctionData({ abi: vaultExitBundlesV1Abi, data: tx.data });
  } catch (cause) {
    return base.unsupported(
      "Transaction data does not decode as a VaultExitBundlesV1 call. Only the released vault-exit entrypoints are supported",
      { cause },
    );
  }
  const value = tx.value ?? 0n;

  switch (decoded.functionName) {
    case "vaultExitBundlesV1ForceWithdrawVaultV2": {
      const [
        vaultAddress,
        adapter,
        exitAssets,
        minSharePriceE27,
        sharesPermit,
        pct,
        recipient,
        deadline,
      ] = decoded.args;
      const f = base.with({
        subject: {
          operation: "vaultV2ForceWithdraw",
          vault: vaultAddress,
          adapter,
        },
      });
      rejectValue(f, {
        value,
        name: "vaultExitBundlesV1ForceWithdrawVaultV2",
      });
      const vault = boundVault(f, { address: vaultAddress, kind: "vaultV2" });
      const tokenSignature = decodeSharesPermit(sharesPermit);
      checkPreview(f, tokenSignature);
      return {
        type: "vaultV2ForceWithdraw",
        route: "vaultExitBundlesV1",
        vault: vault.address,
        asset: vault.asset,
        adapter,
        exitAssets,
        minSharePriceE27,
        onBehalf: base.env.owner,
        receiver: base.env.owner,
        tokenSignature,
        deadline,
        referralFee: referralFee(pct, recipient),
      };
    }
    case "vaultExitBundlesV1InKindRedemptionVaultV1": {
      const [
        vaultAddress,
        marketParamsList,
        exitAssets,
        sharesPermit,
        deadline,
      ] = decoded.args;
      const f = base.with({
        subject: { operation: "vaultV1InKindRedeem", vault: vaultAddress },
      });
      rejectValue(f, {
        value,
        name: "vaultExitBundlesV1InKindRedemptionVaultV1",
      });
      const vault = boundVault(f, { address: vaultAddress, kind: "vaultV1" });
      const tokenSignature = decodeSharesPermit(sharesPermit);
      checkPreview(f, tokenSignature);
      return {
        type: "vaultV1InKindRedeem",
        route: "vaultExitBundlesV1",
        vault: vault.address,
        asset: vault.asset,
        assets: exitAssets,
        markets: marketParamsList.map(marketBinding),
        onBehalf: base.env.owner,
        tokenSignature,
        deadline,
      };
    }
    case "vaultExitBundlesV1InKindRedemptionVaultV2": {
      const [
        vaultAddress,
        adapter,
        marketParamsList,
        exitAssets,
        sharesPermit,
        deadline,
      ] = decoded.args;
      const f = base.with({
        subject: {
          operation: "vaultV2InKindRedeem",
          vault: vaultAddress,
          adapter,
        },
      });
      rejectValue(f, {
        value,
        name: "vaultExitBundlesV1InKindRedemptionVaultV2",
      });
      const vault = boundVault(f, { address: vaultAddress, kind: "vaultV2" });
      const tokenSignature = decodeSharesPermit(sharesPermit);
      checkPreview(f, tokenSignature);
      return {
        type: "vaultV2InKindRedeem",
        route: "vaultExitBundlesV1",
        vault: vault.address,
        asset: vault.asset,
        adapter,
        assets: exitAssets,
        markets: marketParamsList.map(marketBinding),
        onBehalf: base.env.owner,
        tokenSignature,
        deadline,
      };
    }
    default:
      return base.unsupported(
        `VaultExitBundlesV1 function "${decoded.functionName}" is not a supported entrypoint. Only force-withdraw and in-kind redemption are supported`,
      );
  }
};

const decodeVaultV2Multicall = (
  base: Fails,
  spec: {
    readonly tx: Readonly<SimulationTransaction>;
    readonly vault: VaultBinding;
  },
): OperationBody => {
  const { tx, vault } = spec;
  const f = base.with({
    subject: { operation: "vaultV2ForceRedeem", vault: vault.address },
  });
  if (vault.kind !== "vaultV2") {
    f.unsupported(
      `Vault "${vault.address}" is bound as "${vault.kind}" but received a VaultV2 multicall. Only vaultV2 bindings support forceRedeem`,
    );
  }
  rejectValue(f, { value: tx.value ?? 0n, name: "VaultV2 multicall" });

  let decoded: DecodeFunctionDataReturnType<typeof vaultV2Abi>;
  try {
    decoded = decodeFunctionData({ abi: vaultV2Abi, data: tx.data });
  } catch (cause) {
    return f.unsupported(
      `Vault "${vault.address}" transaction data does not decode as a VaultV2 call. Only multicall forceRedeem is supported`,
      { cause },
    );
  }
  if (decoded.functionName !== "multicall") {
    return f.unsupported(
      `Vault "${vault.address}" function "${decoded.functionName}" is not supported. Only multicall forceRedeem is supported on bound vaults`,
    );
  }
  const [calls] = decoded.args;

  const inner = calls.map((data, callIndex) => {
    try {
      return decodeFunctionData({ abi: vaultV2Abi, data });
    } catch (cause) {
      return f.unsupported(
        `VaultV2 multicall inner call "${callIndex}" does not decode. Only forceDeallocate legs then a final redeem are supported`,
        { cause },
      );
    }
  });

  const last = inner.at(-1);
  if (inner.length < 2 || last == null) {
    return f.unsupported(
      `Vault "${vault.address}" multicall expected at least one forceDeallocate before redeem, got "${inner.length}" inner call(s). A forceRedeem multicall is forceDeallocate legs then a final redeem`,
    );
  }

  const deallocations = inner.slice(0, -1).map((call, callIndex) => {
    if (call.functionName !== "forceDeallocate") {
      return f.unsupported(
        `VaultV2 multicall inner call "${callIndex}" decoded to "${call.functionName}", expected "forceDeallocate". Only forceDeallocate legs then a final redeem are supported`,
      );
    }
    const [adapter, data, assets, onBehalf] = call.args;
    if (!isAddressEqual(onBehalf, base.env.owner)) {
      f.mismatch(
        `VaultV2 forceDeallocate onBehalf expected "${base.env.owner}", got "${onBehalf}". Deallocations must act on the transaction sender`,
      );
    }
    let marketId: MarketId | undefined;
    if (data !== "0x") {
      try {
        const [params] = decodeAbiParameters([blueMarketParamsAbi], data);
        marketId = marketBinding(params).marketId;
      } catch (cause) {
        return f.mismatch(
          `VaultV2 forceDeallocate data does not decode as market params. Rebuild the deallocation`,
          { cause },
        );
      }
    }
    return {
      adapter,
      assets,
      data,
      ...(marketId === undefined ? {} : { marketId }),
    };
  });

  if (last.functionName !== "redeem") {
    return f.unsupported(
      `VaultV2 multicall final inner call decoded to "${last.functionName}", expected "redeem". A forceRedeem multicall ends with redeem`,
    );
  }
  const [shares, receiver, onBehalf] = last.args;
  if (!isAddressEqual(receiver, base.env.owner)) {
    f.mismatch(
      `VaultV2 redeem receiver expected "${base.env.owner}", got "${receiver}". The redeem must pay the transaction sender`,
    );
  }
  if (!isAddressEqual(onBehalf, base.env.owner)) {
    f.mismatch(
      `VaultV2 redeem onBehalf expected "${base.env.owner}", got "${onBehalf}". The redeem must burn the transaction sender's shares`,
    );
  }

  return {
    type: "vaultV2ForceRedeem",
    route: "vaultV2Multicall",
    vault: vault.address,
    asset: vault.asset,
    onBehalf: base.env.owner,
    receiver: base.env.owner,
    shares,
    deallocations,
  };
};

const decodeMorphoCall = (
  base: Fails,
  tx: Readonly<SimulationTransaction>,
): OperationBody => {
  const f = base;
  rejectValue(f, { value: tx.value ?? 0n, name: "Morpho setAuthorization" });

  let decoded: DecodeFunctionDataReturnType<typeof blueAbi>;
  try {
    decoded = decodeFunctionData({ abi: blueAbi, data: tx.data });
  } catch (cause) {
    return f.unsupported(
      "Transaction data does not decode as a Morpho call. Only setAuthorization prerequisites are supported",
      { cause },
    );
  }
  if (decoded.functionName !== "setAuthorization") {
    return f.unsupported(
      `Morpho function "${decoded.functionName}" is not supported. Only setAuthorization prerequisites are supported`,
    );
  }
  const [authorized, isAuthorized] = decoded.args;
  const bound = f.with({
    subject: { operation: "blueAuthorization", authorized },
  });

  const operator = (() => {
    if (
      base.env.blueBundlesV1 != null &&
      isAddressEqual(authorized, base.env.blueBundlesV1)
    ) {
      return { type: "bundles" } as const;
    }
    const preLiquidation = base.env.preLiquidations.find((binding) =>
      isAddressEqual(binding.address, authorized),
    );
    if (preLiquidation != null) {
      return {
        type: "preLiquidation",
        market: preLiquidation.market,
      } as const;
    }
    return bound.mismatch(
      `Morpho authorization operator "${authorized}" is neither the registered BlueBundlesV1 nor a bound pre-liquidation contract. Bind it via preLiquidations`,
    );
  })();

  return {
    type: "blueAuthorization",
    route: "morpho",
    authorizer: base.env.owner,
    authorized,
    isAuthorized,
    operator,
    signature: { type: "none" },
  };
};

const decodeTransaction = (
  env: Env,
  spec: {
    readonly tx: Readonly<SimulationTransaction>;
    readonly index: number;
  },
): OperationBody => {
  const { tx, index } = spec;
  const loc: Loc = { index };
  const f = fails(env, loc);
  if (tx.data === "0x" || tx.data.length < 10) {
    return f.unsupported(
      "Transaction carries no decodable calldata. Only fixed-bundles entrypoints are supported",
    );
  }
  if (env.rejected.some((address) => isAddressEqual(address, tx.to))) {
    return f.unsupported(
      `Transaction targets "${tx.to}", an unsupported deployment. Only BlueBundlesV1, VaultBundlesV1, VaultExitBundlesV1, bound vaults, and Morpho setAuthorization are supported`,
    );
  }
  if (env.blueBundlesV1 != null && isAddressEqual(tx.to, env.blueBundlesV1)) {
    return decodeBlueBundles(f, tx);
  }
  if (env.vaultBundlesV1 != null && isAddressEqual(tx.to, env.vaultBundlesV1)) {
    return decodeVaultBundles(f, tx);
  }
  if (
    env.vaultExitBundlesV1 != null &&
    isAddressEqual(tx.to, env.vaultExitBundlesV1)
  ) {
    return decodeVaultExitBundles(f, tx);
  }
  if (isAddressEqual(tx.to, env.morpho)) {
    return decodeMorphoCall(f, tx);
  }
  const vault = findVault(env, tx.to);
  if (vault != null) {
    return decodeVaultV2Multicall(f, { tx, vault });
  }
  return f.unsupported(
    `Transaction targets "${tx.to}", which is not a supported deployment or bound vault. Only BlueBundlesV1, VaultBundlesV1, VaultExitBundlesV1, bound vaults, and Morpho setAuthorization are supported`,
  );
};

/**
 * Decodes fixed-bundles v6 calldata into ordered {@link DecodedOperation} entries, one per
 * top-level transaction.
 *
 * Transactions route on `to`: the chain's registered BlueBundlesV1, VaultBundlesV1, or
 * VaultExitBundlesV1 deployments, a bound Vault V2 (multicall force-redeem), or the Morpho core
 * contract (`setAuthorization` only). Vault version/asset and pre-liquidation market bindings are
 * not recoverable from calldata, so callers pass them via `vaults`/`preLiquidations` (supplied by
 * SDK-1295's pinned reads).
 *
 * The decoder is pure and synchronous: no RPC reads, no clock, no signing. Signature bytes are
 * never returned — only their form (kind, nonce, deadline). In `preview` mode any embedded
 * signature throws {@link UnsupportedOperationError}: preview requests carry wallet signatures via
 * `authorizations` instead.
 *
 * @param params - Decode parameters.
 * @param params.chainId - Target chain; must be present in the address registry.
 * @param params.mode - `"preview"` rejects signature-consuming calldata.
 * @param params.blockNumber - Pinned block the simulation is verified against; carried into error contexts.
 * @param params.transactions - Normalized user transactions; every `from` must equal the owner.
 * @param params.vaults - Vault bindings resolved from pinned state.
 * @param params.preLiquidations - Bound pre-liquidation contracts for direct authorizations.
 * @returns The shared owner and one decoded operation per transaction, in input order.
 * @throws {SimulationValidationError} when `transactions` is empty.
 * @throws {UnsupportedChainError} when `chainId` is absent from the address registry.
 * @throws {ProtocolBindingMismatchError} when senders differ, bindings disagree with calldata, or
 *   value/operator/market bindings violate the route's contract.
 * @throws {UnsupportedOperationError} when a transaction targets an unsupported deployment,
 *   function, permit kind, leg combination, or consumes a signature in preview mode.
 * @example
 * ```ts
 * import { decodeOperations } from "@morpho-org/evm-simulation";
 * import { blueSupply } from "@morpho-org/morpho-sdk";
 * import { getAddress, type Address } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const owner = getAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045") as Address;
 * const marketParams = {
 *   loanToken: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
 *   collateralToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
 *   oracle: getAddress("0xd48ae1c530183bcebc59a25924f09829fbd27bb1"),
 *   irm: getAddress("0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC"),
 *   lltv: 860_000000000000000n,
 * };
 * const tx = blueSupply({
 *   market: { chainId: mainnet.id, marketParams },
 *   args: { userAddress: owner, assets: 1_000_000n, deadline: 1_900_000_000n },
 * });
 * const { operations } = decodeOperations({
 *   chainId: mainnet.id,
 *   mode: "final",
 *   blockNumber: 23_000_000n,
 *   transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
 * });
 * // operations[0] satisfies DecodedOperation with type "blueSupply",
 * // route "blueBundlesV1", transactionIndex 0, and the market binding recovered from calldata.
 * ```
 */
export function decodeOperations(
  params: DecodeOperationsParams,
): DecodedOperations {
  const { chainId, mode, blockNumber, transactions } = params;

  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) {
    throw new UnsupportedChainError(chainId);
  }

  const first = transactions[0];
  if (first == null) {
    throw new SimulationValidationError(
      "transactions: expected at least one transaction, got 0",
      ["transactions"],
    );
  }
  const owner = first.from;
  for (const [index, transaction] of transactions.entries()) {
    if (!isAddressEqual(transaction.from, owner)) {
      throw new ProtocolBindingMismatchError(
        `Transaction "${index}" sender expected "${owner}", got "${transaction.from}". All transactions must share one sender`,
        {
          context: {
            stage: "validation",
            chainId,
            mode,
            blockNumber,
          },
        },
      );
    }
  }

  const env: Env = {
    chainId,
    mode,
    blockNumber,
    owner,
    morpho: addresses.blue,
    wNative: addresses.wNative,
    blueBundlesV1: addresses.bundles?.blueBundlesV1,
    vaultBundlesV1: addresses.bundles?.vaultBundlesV1,
    vaultExitBundlesV1: addresses.bundles?.vaultExitBundlesV1,
    rejected: [addresses.midnightBundles, addresses.midnight].filter(
      (address): address is Address => address != null,
    ),
    vaults: params.vaults ?? [],
    preLiquidations: params.preLiquidations ?? [],
  };

  const operations = transactions.map((transaction, index) => {
    return {
      transactionIndex: index,
      callPath: [],
      chainId,
      deployment: transaction.to,
      owner,
      ...decodeTransaction(env, { tx: transaction, index }),
    } satisfies DecodedOperation;
  });

  return { owner, operations };
}
