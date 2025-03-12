import {
  type Address,
  MarketParams,
  UnknownMarketParamsError,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { format } from "@morpho-org/morpho-ts";

import {
  type BundlingOptions,
  type InputBundlerOperation,
  setupBundle,
} from "../src/index.js";

import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { withSimplePermit } from "@morpho-org/morpho-test";
import {
  type SimulationState,
  isBlueOperation,
  isErc20Operation,
  isMetaMorphoOperation,
} from "@morpho-org/simulation-sdk";
import { type AnvilTestClient, testAccount } from "@morpho-org/test";
import { type Account, type Chain, zeroAddress } from "viem";
import { parseAccount } from "viem/accounts";
import { expect } from "vitest";

export const donator = testAccount(9);

export const donate =
  <chain extends Chain>(
    client: AnvilTestClient<chain>,
    erc20: Address,
    donation: bigint,
    vault: Address,
    morpho: Address,
  ) =>
  async (data: SimulationState) => {
    await client.deal({
      erc20,
      account: donator,
      amount: donation,
    });

    await client.approve({
      account: donator,
      address: erc20,
      args: [morpho, donation],
    });
    await client.writeContract({
      account: donator,
      address: morpho,
      abi: blueAbi,
      functionName: "supply",
      args: [
        { ...data.getMarket(data.getVault(vault).withdrawQueue[0]!).params },
        donation,
        0n,
        vault,
        "0x",
      ],
    });
  };

export const setupTestBundle = async <chain extends Chain = Chain>(
  client: AnvilTestClient<chain>,
  startData: SimulationState,
  inputOperations: InputBundlerOperation[],
  {
    account: account_ = client.account,
    onBundleTx,
    ...options
  }: BundlingOptions & {
    account?: Address | Account;
    supportsSignature?: boolean;
    unwrapTokens?: Set<Address>;
    unwrapSlippage?: bigint;
    onBundleTx?: (data: SimulationState) => Promise<void> | void;
  } = {},
) => {
  const account = parseAccount(account_);

  const { operations, bundle } = setupBundle(
    inputOperations,
    startData,
    account.address,
    {
      ...options,
      withSimplePermit: new Set([
        ...(withSimplePermit[startData.chainId] ?? []),
        ...(options?.withSimplePermit ?? []),
      ]),
      publicAllocatorOptions: {
        enabled: true,
        ...options.publicAllocatorOptions,
      },
    },
  );

  const tokens = new Set<Address>();

  operations.forEach((operation) => {
    const { address } = operation;

    if (
      isBlueOperation(operation) &&
      operation.type !== "Blue_SetAuthorization"
    ) {
      try {
        const marketParams = MarketParams.get(operation.args.id);

        if (marketParams.loanToken !== zeroAddress)
          tokens.add(marketParams.loanToken);

        if (marketParams.collateralToken !== zeroAddress)
          tokens.add(marketParams.collateralToken);
      } catch (error) {
        if (!(error instanceof UnknownMarketParamsError)) throw error;
      }
    }

    if (isMetaMorphoOperation(operation)) {
      tokens.add(address);

      const vault = startData.tryGetVault(address);
      if (vault) tokens.add(vault.asset);
    }

    if (isErc20Operation(operation)) {
      tokens.add(address);

      const unwrapped = getUnwrappedToken(address, startData.chainId);
      if (unwrapped != null) tokens.add(unwrapped);
    }
  });

  await onBundleTx?.(startData);

  await bundle.requirements.sign(client, account);

  for (const tx of bundle.txs()) {
    await client.sendTransaction(
      // @ts-ignore
      { ...tx, account },
    );
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(startData.chainId);

  await Promise.all(
    [...tokens].map(async (token) => {
      const balance = await client.balanceOf({
        erc20: token,
        owner: generalAdapter1,
      });

      expect(
        format.number.of(balance, startData.getToken(token).decimals),
      ).toBeCloseTo(0, 8);
    }),
  );

  return { operations, bundle };
};
