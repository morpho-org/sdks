import {
  type AccrualPosition,
  type AccrualVault,
  type AccrualVaultV2,
  isMarketId,
  MathLib,
  ORACLE_PRICE_SCALE,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  blueAdaptiveCurveIrmAbi,
  blueOracleAbi,
  bluePreLiquidationAbi,
  erc2612Abi,
  permit2Abi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import {
  fetchAccrualPosition,
  fetchAccrualVault,
  fetchAccrualVaultV2,
  fetchMarket,
} from "@morpho-org/morpho-sdk/blue/fetch";
import { _try, type ChainAddresses, deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Client,
  erc20Abi,
  ethAddress,
  isAddressEqual,
  zeroAddress,
} from "viem";
import { getBalance, readContract } from "viem/actions";
import type {
  PreLiquidationBinding,
  VaultBinding,
} from "../../decode/index.js";
import type {
  MarketState,
  PermissionState,
  PositionState,
  RiskMetric,
  VaultState,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type {
  DecodedOperation,
  MarketBinding,
  OperationFunding,
} from "../../domain/operations.js";
import type { DecodedBundle, PinnedInputs } from "../../domain/stages.js";
import { brandPinned } from "../../domain/stages.js";
import {
  ExternalServiceError,
  SimulationPackageError,
  UnsupportedChainError,
} from "../../errors.js";
import type { PinnedBlock } from "./resolve-pinned-block.js";

const MAX_LLTV_WAD = MathLib.WAD;

interface Subjects {
  readonly accounts: ReadonlySet<Address>;
  readonly tokens: ReadonlySet<Address>;
  readonly bundles: ReadonlySet<Address>;
  readonly spenders: readonly {
    owner: Address;
    token: Address;
    spender: Address;
  }[];
  readonly permit2Tokens: readonly { owner: Address; token: Address }[];
  readonly erc2612Tokens: readonly { owner: Address; token: Address }[];
  readonly permit2Nonces: readonly { owner: Address; nonce: bigint }[];
  readonly blueAuthorizations: readonly {
    authorizer: Address;
    authorized: Address;
  }[];
  readonly markets: readonly MarketBinding[];
  readonly preLiquidationMarkets: ReadonlyMap<string, Address>;
  readonly vaults: ReadonlyMap<Address, VaultBinding>;
}

// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const add = <T>(list: T[], value: T, key: (v: T) => string): void => {
  const k = key(value);
  if (!list.some((v) => key(v) === k)) list.push(value);
};

const BUNDLE_SPENDERS = {
  blueBundlesV1: "blueBundlesV1",
  vaultBundlesV1: "vaultBundlesV1",
  vaultExitBundlesV1: "vaultExitBundlesV1",
} as const satisfies Partial<
  Record<
    DecodedOperation["route"],
    keyof NonNullable<ChainAddresses["bundles"]>
  >
>;

/** Collect every pinned-state subject implied by the decoded operations. */
// biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
const collectSubjects = (
  bundle: DecodedBundle,
  vaults: readonly VaultBinding[],
  preLiquidations: readonly PreLiquidationBinding[],
  addresses: ChainAddresses,
): Subjects => {
  const owner = bundle.owner;
  const accounts = new Set<Address>([owner]);
  const tokens = new Set<Address>();
  const bundleAddresses = new Set<Address>();
  const spenders: Subjects["spenders"] extends readonly (infer T)[]
    ? T[]
    : never = [];
  const permit2Tokens: { owner: Address; token: Address }[] = [];
  const erc2612Tokens: { owner: Address; token: Address }[] = [];
  const permit2Nonces: { owner: Address; nonce: bigint }[] = [];
  const blueAuthorizations: { authorizer: Address; authorized: Address }[] = [];
  const markets: MarketBinding[] = [];
  const preLiquidationMarkets = new Map<string, Address>();
  const vaultMap = new Map<Address, VaultBinding>();
  for (const binding of vaults) vaultMap.set(binding.address, binding);
  for (const binding of preLiquidations) {
    preLiquidationMarkets.set(binding.market.marketId, binding.address);
  }

  const bundleSpender = (
    route: keyof typeof BUNDLE_SPENDERS,
  ): Address | undefined => addresses.bundles?.[BUNDLE_SPENDERS[route]];

  const addFunding = (
    funding: OperationFunding,
    spender: Address | undefined,
  ) => {
    if (funding.type === "erc20") {
      tokens.add(funding.token);
      if (spender != null)
        add(
          spenders,
          { owner, token: funding.token, spender },
          (s) => `${s.owner}:${s.token}:${s.spender}`,
        );
    } else if (funding.type === "native") {
      tokens.add(funding.wrappedToken);
      tokens.add(ethAddress);
      if (spender != null)
        add(
          spenders,
          { owner, token: funding.wrappedToken, spender },
          (s) => `${s.owner}:${s.token}:${s.spender}`,
        );
    }
  };

  const addSignature = (
    sig: { readonly type: string; readonly nonce?: bigint },
    token?: Address,
  ) => {
    if (sig.type === "erc2612Permit" && token != null) {
      add(erc2612Tokens, { owner, token }, (t) => `${t.owner}:${t.token}`);
    } else if (sig.type === "permit2SignatureTransfer" && token != null) {
      add(permit2Tokens, { owner, token }, (t) => `${t.owner}:${t.token}`);
      if (sig.nonce != null)
        add(
          permit2Nonces,
          { owner, nonce: sig.nonce },
          (n) => `${n.owner}:${n.nonce}`,
        );
      // Permit2 pulls through the canonical ERC-20 allowance.
      if (addresses.permit2 != null)
        add(
          spenders,
          { owner, token, spender: addresses.permit2 },
          (s) => `${s.owner}:${s.token}:${s.spender}`,
        );
    }
  };

  const addMarket = (market: MarketBinding) => {
    add(markets, market, (m) => m.marketId);
    tokens.add(market.params.loanToken);
    tokens.add(market.params.collateralToken);
  };

  const addReallocations = (
    reallocations: readonly {
      readonly from:
        | { readonly type: "idle" }
        | { readonly type: "market"; readonly market: MarketBinding };
      readonly to: { readonly market: MarketBinding };
    }[],
  ) => {
    for (const reallocation of reallocations) {
      if (reallocation.from.type === "market")
        addMarket(reallocation.from.market);
      addMarket(reallocation.to.market);
    }
  };

  // biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
  const addPull = (
    token: Address,
    spender: Address | undefined,
    signature: { readonly type: string; readonly nonce?: bigint },
  ) => {
    tokens.add(token);
    if (spender == null) return;
    bundleAddresses.add(spender);
    add(
      spenders,
      { owner, token, spender },
      (s) => `${s.owner}:${s.token}:${s.spender}`,
    );
    addSignature(signature, token);
  };

  // Bundles that pull or act on the owner's behalf hold balances too.
  for (const bundle_ of [
    addresses.bundles?.blueBundlesV1,
    addresses.bundles?.vaultBundlesV1,
    addresses.bundles?.vaultExitBundlesV1,
  ]) {
    if (bundle_ != null) accounts.add(bundle_);
  }

  for (const op of bundle.operations) {
    switch (op.type) {
      case "blueSupply":
      case "blueSupplyCollateral": {
        addMarket(op.market);
        accounts.add(op.receiver);
        accounts.add(op.referralFee.recipient);
        const spender = bundleSpender(op.route);
        if (spender != null) bundleAddresses.add(spender);
        addFunding(op.funding, spender);
        const fundingToken =
          op.funding.type === "erc20"
            ? op.funding.token
            : op.funding.type === "native"
              ? op.funding.wrappedToken
              : undefined;
        addSignature(op.tokenSignature, fundingToken);
        break;
      }
      case "blueWithdraw":
      case "blueBorrow":
      case "blueWithdrawCollateral": {
        addMarket(op.market);
        accounts.add(op.receiver);
        accounts.add(op.referralFee.recipient);
        if (op.type !== "blueWithdrawCollateral")
          addReallocations(op.reallocations);
        {
          const spender = bundleSpender(op.route);
          if (spender != null)
            add(
              blueAuthorizations,
              { authorizer: owner, authorized: spender },
              (a) => `${a.authorizer}:${a.authorized}`,
            );
        }
        break;
      }
      case "blueSupplyCollateralBorrow":
      case "blueRepayWithdrawCollateral":
      case "blueRepay": {
        addMarket(op.market);
        accounts.add(op.receiver);
        accounts.add(op.referralFee.recipient);
        if (op.type === "blueSupplyCollateralBorrow")
          addReallocations(op.reallocations);
        const spender = bundleSpender(op.route);
        if (spender != null) bundleAddresses.add(spender);
        addFunding(op.funding, spender);
        const fundingToken =
          op.funding.type === "erc20"
            ? op.funding.token
            : op.funding.type === "native"
              ? op.funding.wrappedToken
              : undefined;
        addSignature(op.tokenSignature, fundingToken);
        if (op.type !== "blueRepay" && spender != null) {
          add(
            blueAuthorizations,
            { authorizer: owner, authorized: spender },
            (a) => `${a.authorizer}:${a.authorized}`,
          );
        }
        break;
      }
      case "blueRefinance": {
        addMarket(op.sourceMarket);
        addMarket(op.targetMarket);
        accounts.add(op.referralFee.recipient);
        addReallocations(op.reallocations);
        {
          const spender = bundleSpender(op.route);
          if (spender != null)
            add(
              blueAuthorizations,
              { authorizer: owner, authorized: spender },
              (a) => `${a.authorizer}:${a.authorized}`,
            );
        }
        break;
      }
      case "blueAuthorization": {
        if (op.operator.type === "preLiquidation") {
          addMarket(op.operator.market);
          preLiquidationMarkets.set(op.operator.market.marketId, op.authorized);
        }
        add(
          blueAuthorizations,
          { authorizer: owner, authorized: op.authorized },
          (a) => `${a.authorizer}:${a.authorized}`,
        );
        break;
      }
      case "vaultV1Deposit":
      case "vaultV2Deposit": {
        tokens.add(op.asset);
        accounts.add(op.receiver);
        accounts.add(op.referralFee.recipient);
        const spender = bundleSpender(op.route);
        if (spender != null) bundleAddresses.add(spender);
        addFunding(op.funding, spender);
        const fundingToken =
          op.funding.type === "erc20"
            ? op.funding.token
            : op.funding.type === "native"
              ? op.funding.wrappedToken
              : undefined;
        addSignature(op.tokenSignature, fundingToken);
        break;
      }
      case "vaultV1Withdraw":
      case "vaultV2Withdraw":
      case "vaultV1Redeem":
      case "vaultV2Redeem":
      case "vaultV2ForceWithdraw":
      case "vaultV1InKindRedeem":
      case "vaultV2InKindRedeem": {
        tokens.add(op.asset);
        if ("receiver" in op) accounts.add(op.receiver);
        if ("referralFee" in op) accounts.add(op.referralFee.recipient);
        if (
          op.type === "vaultV1InKindRedeem" ||
          op.type === "vaultV2InKindRedeem"
        ) {
          for (const market of op.markets) addMarket(market);
        }
        const spender = bundleSpender(op.route);
        if (spender != null) bundleAddresses.add(spender);
        addPull(op.vault, spender, op.tokenSignature);
        break;
      }
      case "vaultV2ForceRedeem": {
        tokens.add(op.asset);
        accounts.add(op.receiver);
        // The vault itself pulls and burns the caller's shares.
        addPull(op.vault, op.vault, { type: "none" });
        break;
      }
      case "vaultV1MigrateToV2": {
        tokens.add(op.asset);
        accounts.add(op.receiver);
        accounts.add(op.referralFee.recipient);
        const spender = bundleSpender(op.route);
        if (spender != null) bundleAddresses.add(spender);
        addPull(op.sourceVault, spender, op.tokenSignature);
        break;
      }
      default: {
        const _exhaustive: never = op;
        return _exhaustive;
      }
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
    preLiquidationMarkets,
    vaults: vaultMap,
  };
};

const finite = (valueWad: bigint): RiskMetric => ({ type: "finite", valueWad });

const positionRisk = (
  position: AccrualPosition,
): Pick<PositionState, "ltvWad" | "healthFactorWad"> => {
  const ltv = _try(() => position.ltv) ?? undefined;
  const hf = _try(() => position.healthFactor) ?? undefined;
  const toMetric = (
    value: bigint | undefined,
    unbounded: RiskMetric,
  ): RiskMetric =>
    value == null
      ? unbounded
      : value > MAX_LLTV_WAD * 10n ** 10n
        ? unbounded
        : finite(value);
  return {
    ltvWad: toMetric(ltv, { type: "debtFree" }),
    healthFactorWad: toMetric(hf, {
      type: "unbounded",
      reason: "zeroCollateral",
    }),
  };
};

const notApplicable = <_T>(reason: "noOracle" | "noIrm" | "noPreLiquidation") =>
  ({ type: "notApplicable", reason }) as const;

/**
 * Read the complete pre-state at the pinned block: wallet balances for every
 * involved account and token (plus wNative under native funding), permission
 * storage for every decoded pull/grant, positions and markets for every
 * involved market, and vault state for every bound vault.
 *
 * @param params - Read parameters.
 * @param params.client - Shared simulation client.
 * @param params.bundle - The decoded bundle enumerating subjects.
 * @param params.pinnedBlock - The once-resolved pinned block.
 * @param params.vaults - Vault bindings resolved by {@link readBindings}.
 * @param params.preLiquidations - Pre-liquidation bindings resolved by {@link readBindings}.
 * @returns The deep-frozen {@link PinnedInputs}; entity handles are retained
 *   under `internals` for exact-share-cap math and are not part of the snapshot.
 * @throws {ExternalServiceError} when any pinned read fails.
 * @internal
 */
export async function readPinnedInputs(params: {
  readonly client: Client;
  readonly bundle: DecodedBundle;
  readonly pinnedBlock: PinnedBlock;
  readonly vaults?: readonly VaultBinding[];
  readonly preLiquidations?: readonly PreLiquidationBinding[];
}): Promise<PinnedInputs> {
  const {
    client,
    bundle,
    pinnedBlock,
    vaults = [],
    preLiquidations = [],
  } = params;
  const blockNumber = pinnedBlock.number;
  const chainId = bundle.request.chainId;

  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) throw new UnsupportedChainError(chainId);
  const morpho = addresses.blue;
  const owner = bundle.owner;

  try {
    const subjects = collectSubjects(
      bundle,
      vaults,
      preLiquidations,
      addresses,
    );

    // Wallet balances.
    const wallet = (
      await Promise.all(
        [...subjects.accounts].flatMap((account) =>
          [...subjects.tokens].map(async (token) => ({
            account,
            token,
            assets: isAddressEqual(token, ethAddress)
              ? await getBalance(client, { address: account, blockNumber })
              : await readContract(client, {
                  address: token,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [account],
                  blockNumber,
                }),
          })),
        ),
      )
    ).filter(
      (entry) =>
        !(entry.assets === 0n && !isAddressEqual(entry.account, owner)),
    );

    // Permissions.
    const permissions: PermissionState[] = [];
    for (const { owner: o, token, spender } of subjects.spenders) {
      permissions.push({
        type: "erc20Allowance",
        token,
        owner: o,
        spender,
        amount: await readContract(client, {
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [o, spender],
          blockNumber,
        }),
      });
    }
    for (const { owner: o, token } of subjects.erc2612Tokens) {
      permissions.push({
        type: "erc2612Nonce",
        verifyingContract: token,
        owner: o,
        nonce: await readContract(client, {
          address: token,
          abi: erc2612Abi,
          functionName: "nonces",
          args: [o],
          blockNumber,
        }),
      });
    }
    for (const { owner: o, nonce } of subjects.permit2Nonces) {
      const wordPosition = nonce >> 8n;
      const bitmap = await readContract(client, {
        address: addresses.permit2 ?? zeroAddress,
        abi: permit2Abi,
        functionName: "nonceBitmap",
        args: [o, wordPosition],
        blockNumber,
      });
      permissions.push({
        type: "permit2Nonce",
        permit2: addresses.permit2 ?? zeroAddress,
        owner: o,
        nonce,
        wordPosition,
        bitmap,
        consumed: (bitmap & (1n << (nonce % 256n))) !== 0n,
      });
    }
    for (const { authorizer, authorized } of subjects.blueAuthorizations) {
      permissions.push({
        type: "blueAuthorization",
        morpho,
        authorizer,
        authorized,
        isAuthorized: await readContract(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "isAuthorized",
          args: [authorizer, authorized],
          blockNumber,
        }),
      });
    }
    if (subjects.blueAuthorizations.length > 0) {
      permissions.push({
        type: "blueAuthorizationNonce",
        verifyingContract: morpho,
        owner,
        nonce: await readContract(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "nonce",
          args: [owner],
          blockNumber,
        }),
      });
    }

    // Markets and positions.
    const marketEntries = await Promise.all(
      subjects.markets.map(async (binding) => {
        const market = await fetchMarket(binding.marketId, client, {
          blockNumber,
        });
        const oracle = binding.params.oracle;
        const irm = binding.params.irm;
        const oraclePrice = isAddressEqual(oracle, zeroAddress)
          ? notApplicable<{ value: bigint; scale: bigint }>("noOracle")
          : {
              type: "applicable" as const,
              value: {
                value: await readContract(client, {
                  address: oracle,
                  abi: blueOracleAbi,
                  functionName: "price",
                  blockNumber,
                }),
                scale: ORACLE_PRICE_SCALE,
              },
            };
        const borrowRate = isAddressEqual(irm, zeroAddress)
          ? notApplicable<bigint>("noIrm")
          : {
              type: "applicable" as const,
              value: await readContract(client, {
                address: irm,
                abi: blueAdaptiveCurveIrmAbi,
                functionName: "borrowRateView",
                args: [
                  binding.params,
                  {
                    totalSupplyAssets: market.totalSupplyAssets,
                    totalSupplyShares: market.totalSupplyShares,
                    totalBorrowAssets: market.totalBorrowAssets,
                    totalBorrowShares: market.totalBorrowShares,
                    lastUpdate: market.lastUpdate,
                    fee: market.fee,
                  },
                ],
                blockNumber,
              }),
            };
        const rateAtTarget = isAddressEqual(irm, zeroAddress)
          ? notApplicable<bigint>("noIrm")
          : {
              type: "applicable" as const,
              value: await readContract(client, {
                address: irm,
                abi: blueAdaptiveCurveIrmAbi,
                functionName: "rateAtTarget",
                args: [binding.marketId],
                blockNumber,
              }),
            };
        const preLiquidation = subjects.preLiquidationMarkets.get(
          binding.marketId,
        );
        let preLiquidationState: MarketState["preLiquidation"] =
          notApplicable("noPreLiquidation");
        if (preLiquidation != null) {
          const preLiquidationParams = await readContract(client, {
            address: preLiquidation,
            abi: bluePreLiquidationAbi,
            functionName: "preLiquidationParams",
            blockNumber,
          });
          preLiquidationState = {
            type: "applicable",
            value: {
              address: preLiquidation,
              preLltvWad: preLiquidationParams.preLltv,
            },
          };
        }
        const utilization = _try(() => market.utilization) ?? 0n;
        const borrowApy = _try(() => market.endBorrowRate) ?? undefined;
        return {
          market: binding,
          totalSupplyAssets: market.totalSupplyAssets,
          totalSupplyShares: market.totalSupplyShares,
          totalBorrowAssets: market.totalBorrowAssets,
          totalBorrowShares: market.totalBorrowShares,
          lastUpdate: market.lastUpdate,
          feeWad: market.fee,
          liquidityAssets: market.liquidity,
          utilizationWad:
            market.totalSupplyAssets === 0n
              ? ({ type: "unbounded", reason: "zeroLiquidity" } as const)
              : finite(utilization),
          borrowApyWad:
            borrowApy == null
              ? notApplicable<bigint>("noIrm")
              : { type: "applicable" as const, value: borrowApy },
          oraclePrice,
          borrowRatePerSecondWad: borrowRate,
          rateAtTargetPerSecondWad: rateAtTarget,
          preLiquidation: preLiquidationState,
        } satisfies MarketState;
      }),
    );

    const positions = await Promise.all(
      subjects.markets.map(async (binding): Promise<PositionState> => {
        const position = await fetchAccrualPosition(
          owner,
          binding.marketId,
          client,
          { blockNumber },
        );
        return {
          marketId: binding.marketId,
          owner,
          supplyAssets: position.supplyAssets,
          supplyShares: position.supplyShares,
          borrowAssets: position.borrowAssets,
          borrowShares: position.borrowShares,
          collateralAssets: position.collateral,
          ...positionRisk(position),
        };
      }),
    );

    // Vaults.
    const vaultData = new Map<Address, AccrualVault | AccrualVaultV2>();
    const vaultStates = await Promise.all(
      [...subjects.vaults.values()].map(
        async (binding): Promise<VaultState> => {
          const ownerShares = await readContract(client, {
            address: binding.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
            blockNumber,
          });
          if (binding.kind === "vaultV1") {
            const vault = await fetchAccrualVault(binding.address, client, {
              blockNumber,
            });
            vaultData.set(binding.address, vault);
            return {
              type: "vaultV1",
              vault: binding.address,
              owner,
              asset: binding.asset,
              totalAssets: vault.totalAssets,
              totalShares: vault.totalSupply,
              ownerShares,
              idleAssets: 0n,
              sharePriceE27:
                vault.totalSupply === 0n
                  ? 0n
                  : MathLib.mulDivUp(
                      vault.totalAssets,
                      10n ** 27n,
                      vault.totalSupply,
                    ),
              feeRecipient: vault.feeRecipient,
              performanceFeeWad: vault.fee,
              allocations: [...vault.allocations.values()].map(
                (allocation) => ({
                  adapter: zeroAddress,
                  marketId: allocation.position.market.id,
                  assets: allocation.position.supplyAssets,
                  shares: allocation.position.supplyShares,
                  absoluteCapAssets: allocation.config.cap,
                  relativeCapWad: 0n,
                  penaltyWad: 0n,
                }),
              ),
              lastTotalAssets: vault.lastTotalAssets,
              decimalsOffset: vault.decimalsOffset,
              ...(vault.lostAssets == null
                ? {}
                : { lostAssets: vault.lostAssets }),
            };
          }
          const vault = await fetchAccrualVaultV2(binding.address, client, {
            blockNumber,
          });
          vaultData.set(binding.address, vault);
          return {
            type: "vaultV2",
            vault: binding.address,
            owner,
            asset: binding.asset,
            totalAssets: vault._totalAssets,
            totalShares: vault.totalSupply,
            ownerShares,
            // Match the `vaultIdleAssets` probe: withdrawable idle lives in the
            // liquidity adapter, not the vault's own ERC-20 balance.
            idleAssets:
              vault.liquidityAdapter === zeroAddress
                ? 0n
                : await readContract(client, {
                    address: binding.asset,
                    abi: erc20Abi,
                    functionName: "balanceOf",
                    args: [vault.liquidityAdapter],
                    blockNumber,
                  }),
            sharePriceE27:
              vault.totalSupply === 0n
                ? 0n
                : MathLib.mulDivUp(
                    vault._totalAssets,
                    10n ** 27n,
                    vault.totalSupply,
                  ),
            feeRecipient: vault.performanceFeeRecipient,
            performanceFeeWad: vault.performanceFee,
            allocations: (vault.liquidityAllocations ?? []).map(
              (allocation) => ({
                adapter: zeroAddress,
                marketId: isMarketId(allocation.id) ? allocation.id : undefined,
                assets: allocation.allocation,
                shares: 0n,
                absoluteCapAssets: allocation.absoluteCap,
                relativeCapWad: allocation.relativeCap,
                penaltyWad:
                  vault.forceDeallocatePenalties?.[allocation.id] ?? 0n,
              }),
            ),
            managementFeeWad: vault.managementFee,
            managementFeeRecipient: vault.managementFeeRecipient,
            maxRatePerSecondWad: vault.maxRate,
            lastUpdate: vault.lastUpdate,
            recordedTotalAssets: vault._totalAssets,
            virtualShares: vault.virtualShares,
            liquidityAdapter: vault.liquidityAdapter,
          };
        },
      ),
    );

    const before: VerificationSnapshot = deepFreeze({
      wallet,
      permissions,
      positions,
      vaults: vaultStates,
      markets: marketEntries,
    });

    return brandPinned({
      bundle,
      context: {
        chainId,
        stateBlockNumber: pinnedBlock.number,
        stateBlockHash: pinnedBlock.hash,
        stateBlockTimestamp: pinnedBlock.timestamp,
        blockNumber: pinnedBlock.number,
        blockTimestamp: pinnedBlock.timestamp,
      },
      before,
      internals: { vaultData },
    });
  } catch (error) {
    if (error instanceof SimulationPackageError) throw error;
    throw new ExternalServiceError(
      `Pinned state read error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
