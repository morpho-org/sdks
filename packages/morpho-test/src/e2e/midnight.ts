import { strictEqual } from "node:assert";
import {
  Market,
  MarketParams,
  midnightAbi,
  type OfferStruct,
  OfferUtils,
  PriceRatifierV1,
  RateRatifierV1,
  SetterRatifier,
  SetterRatifierUtils,
  setterRatifierAbi,
  type Tree,
  type TreeSnapshot,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type Chain,
  erc20Abi,
  type Hex,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import { getE2eAsset } from "./asset.js";
import { installE2eAsset, installE2eOracle, wrapE2eNative } from "./setup.js";

/** Fork addresses of the named E2E wallets. */
export const E2E_MIDNIGHT_WALLETS = {
  A: "0x00000000000000000000000000000000e2E0000A",
  B: "0x00000000000000000000000000000000e2E0000b",
  C: "0x00000000000000000000000000000000e2E0000C",
  D: "0x00000000000000000000000000000000e2e0000d",
} as const satisfies Record<string, Address>;

/** Names of the reusable Midnight E2E wallets. */
export type E2eMidnightWallet = keyof typeof E2E_MIDNIGHT_WALLETS;

/** Parameters and initial snapshot for an E2E Midnight market. */
export interface E2eMidnightMarket {
  readonly params: MarketParams;
  readonly marketData: Market;
}

/** Thrown when wallet assets are requested without Midnight market parameters. */
export class E2eMidnightMarketRequiredError extends Error {
  public constructor() {
    super(
      "Wallet asset funding requires a Midnight market. Pass `market` to fundE2eMidnightWallets or remove loanAssets/collateralAssets.",
    );
    this.name = "E2eMidnightMarketRequiredError";
  }
}

/** Installs assets and the fixed-price oracle, then creates an empty Midnight market snapshot. */
// biome-ignore lint/complexity/useMaxParams: Keep the fixture interface's chain and maturity inputs explicit.
export const createE2eMidnightMarket = async (
  client: AnvilTestClient<Chain>,
  chainId: number,
  options: { readonly maturity?: bigint } = {},
): Promise<E2eMidnightMarket> => {
  const midnight = getChainAddress(chainId, "midnight");
  const loanAsset = getE2eAsset(chainId);
  const loanToken = loanAsset.address.toLowerCase() as Address;
  const collateralToken =
    "0xE2e0000000000000000000000000000000000004" as Address;

  if (loanAsset.requiresInstall) await installE2eAsset(client, loanToken);
  await installE2eAsset(client, collateralToken);
  const oracle = await installE2eOracle(client);

  const params = new MarketParams({
    chainId,
    midnight,
    loanToken,
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle,
      },
    ],
    maturity: options.maturity ?? 2_000_000_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });
  const marketData = new Market({
    params,
    totalUnits: 0n,
    lossFactor: 0n,
    withdrawable: 0n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 1,
  });

  return { params, marketData };
};

/**
 * Clears code and funds gas for named wallets, adding requested assets and approvals to their
 * existing balances and allowances.
 */
export const fundE2eMidnightWallets = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly market?: MarketParams;
    readonly wallets: Partial<
      Record<
        E2eMidnightWallet,
        { readonly loanAssets?: bigint; readonly collateralAssets?: bigint }
      >
    >;
    readonly approve?: Address;
  },
): Promise<void> => {
  const hasAssetFunding = Object.values(params.wallets).some(
    (wallet) => wallet?.loanAssets != null || wallet?.collateralAssets != null,
  );
  if (hasAssetFunding && params.market == null)
    throw new E2eMidnightMarketRequiredError();

  for (const walletName of Object.keys(
    E2E_MIDNIGHT_WALLETS,
  ) as E2eMidnightWallet[]) {
    const funding = params.wallets[walletName];
    if (funding == null) continue;

    const account = E2E_MIDNIGHT_WALLETS[walletName];
    await client.setCode({ address: account, bytecode: "0x" });
    await client.setBalance({ address: account, value: parseEther("1") });

    const assetsToFund: {
      readonly token: Address;
      readonly amount: bigint;
      readonly useNativeFunding: boolean;
    }[] = [];
    if (funding.collateralAssets != null) {
      assetsToFund.push({
        token: params.market!.collateralParams[0]!.token,
        amount: funding.collateralAssets,
        useNativeFunding: false,
      });
    }
    if (funding.loanAssets != null) {
      const market = params.market!;
      assetsToFund.push({
        token: market.loanToken,
        amount: funding.loanAssets,
        useNativeFunding: true,
      });
    }

    for (const { token, amount, useNativeFunding } of assetsToFund) {
      const balanceBefore = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
      if (useNativeFunding) {
        await wrapE2eNative(client, {
          wNative: token,
          amount,
          account,
        });
      } else {
        await client.deal({
          erc20: token,
          account,
          amount: balanceBefore + amount,
        });
      }

      strictEqual(
        await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        }),
        balanceBefore + amount,
      );

      if (params.approve != null) {
        const allowanceBefore = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, params.approve],
        });
        const target =
          allowanceBefore + amount > maxUint256
            ? maxUint256
            : allowanceBefore + amount;
        await client.writeContract({
          account,
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [params.approve, target],
        });
        strictEqual(
          await client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "allowance",
            args: [account, params.approve],
          }),
          target,
        );
      }
    }
  }
};

/** Authorizes the SetterRatifier for a maker and marks the tree root ratified. */
export const postE2eSetterTree = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly chainId: number;
    readonly maker: Address;
    readonly tree: Tree | Tree<"setter">;
  },
): Promise<void> => {
  const midnight = getChainAddress(params.chainId, "midnight");
  const setterRatifier = getChainAddress(params.chainId, "setterRatifier");

  await client.writeContract({
    account: params.maker,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [setterRatifier, true, params.maker],
  });
  await client.writeContract({
    account: params.maker,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [params.maker, params.tree.root, true],
  });
};

/** A readonly offer fill with the matching ratifier's data. */
export interface E2eTakeableOffer {
  readonly units: bigint;
  readonly offer: OfferStruct;
  readonly ratifierData: Hex;
}

/** Converts legacy or tagged trees and snapshots into SDK takeable offers using the matching ratifier. */
export const getE2eTakeableOffers = (params: {
  readonly tree:
    | Tree
    | Tree<"setter">
    | Tree<"priceV1">
    | Tree<"rateV1">
    | TreeSnapshot<"setter">
    | TreeSnapshot<"priceV1">
    | TreeSnapshot<"rateV1">;
  readonly units: bigint;
}): readonly E2eTakeableOffer[] => {
  const items =
    params.tree.type === "priceV1"
      ? PriceRatifierV1.ratify({ tree: params.tree })
      : params.tree.type === "rateV1"
        ? RateRatifierV1.ratify({ tree: params.tree })
        : params.tree.type === "setter"
          ? SetterRatifier.ratify({ tree: params.tree })
          : SetterRatifierUtils.ratify({ tree: params.tree });

  return items.map(({ offer, ratifierData }) => ({
    units: params.units,
    offer: OfferUtils.toStruct({ offer }),
    ratifierData,
  }));
};
