import {
  type Address,
  MarketConfig,
  UnknownMarketConfigError,
  VaultConfig,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { format } from "@morpho-org/morpho-ts";

import {
  type BundlingOptions,
  type InputBundlerOperation,
  encodeBundle,
  finalizeBundle,
  populateBundle,
} from "../src/index.js";

import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { withSimplePermit } from "@morpho-org/morpho-test";
import {
  type SimulationState,
  isBlueOperation,
  isErc20Operation,
  isMetaMorphoOperation,
} from "@morpho-org/simulation-sdk";
import { type AnvilTestClient, testAccount } from "@morpho-org/test-viem";
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
        data.getMarket(data.getVault(vault).withdrawQueue[0]!).config,
        donation,
        0n,
        vault,
        "0x",
      ],
    });
  };

export const setupBundle = async <chain extends Chain = Chain>(
  client: AnvilTestClient<chain>,
  startData: SimulationState,
  inputOperations: InputBundlerOperation[],
  {
    account: account_ = client.account,
    supportsSignature,
    unwrapTokens,
    unwrapSlippage,
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

  let { operations } = populateBundle(inputOperations, startData, {
    ...options,
    withSimplePermit: new Set([
      ...withSimplePermit[startData.chainId],
      ...(options?.withSimplePermit ?? []),
    ]),
  });
  operations = finalizeBundle(
    operations,
    startData,
    account.address,
    unwrapTokens,
    unwrapSlippage,
  );

  const bundle = encodeBundle(operations, startData, supportsSignature);

  const tokens = new Set<Address>();

  operations.forEach((operation) => {
    const { address } = operation;

    if (
      isBlueOperation(operation) &&
      operation.type !== "Blue_SetAuthorization"
    ) {
      try {
        const marketConfig = MarketConfig.get(operation.args.id);

        if (marketConfig.loanToken !== zeroAddress)
          tokens.add(marketConfig.loanToken);

        if (marketConfig.collateralToken !== zeroAddress)
          tokens.add(marketConfig.collateralToken);
      } catch (error) {
        if (!(error instanceof UnknownMarketConfigError)) throw error;
      }
    }

    if (isMetaMorphoOperation(operation)) {
      tokens.add(address);

      const vaultConfig = VaultConfig.get(address, startData.chainId);
      if (vaultConfig) tokens.add(vaultConfig.asset);
    }

    if (isErc20Operation(operation)) {
      tokens.add(address);

      const unwrapped = getUnwrappedToken(address, startData.chainId);
      if (unwrapped != null) tokens.add(unwrapped);
    }
  });

  await onBundleTx?.(startData);

  await Promise.all(
    bundle.requirements.signatures.map((requirement) =>
      requirement.sign(client, account),
    ),
  );

  const txs = bundle.requirements.txs.map(({ tx }) => tx).concat([bundle.tx()]);

  for (const tx of txs) {
    await client.sendTransaction(
      // @ts-ignore
      { ...tx, account },
    );
  }

  const { bundler } = getChainAddresses(startData.chainId);

  await Promise.all(
    [...tokens].map(async (token) => {
      const balance = await client.balanceOf({ erc20: token, owner: bundler });

      expect(
        format.number.of(balance, startData.getToken(token).decimals),
      ).toBeCloseTo(0, 8);
    }),
  );

  return { operations, bundle };
};
