import { ZeroAddress } from "ethers";
import { ERC20__factory, MorphoBlue__factory } from "ethers-types";
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";

import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";

import {
  type Address,
  MarketConfig,
  NATIVE_ADDRESS,
  UnknownMarketConfigError,
  VaultConfig,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { assertApproxEqAbs, mine } from "@morpho-org/morpho-test";
import { keys } from "@morpho-org/morpho-ts";

import {
  type BundlingOptions,
  type InputBundlerOperation,
  encodeBundle,
  finalizeBundle,
  populateBundle,
} from "../src/index.js";

import type { SimulationState } from "@morpho-org/simulation-sdk";
import { WITH_SIMPLE_PERMIT } from "./fixtures.js";

export const donate =
  (
    signer: SignerWithAddress,
    erc20: Address,
    donation: bigint,
    vault: Address,
    morpho: Address,
  ) =>
  async (data: SimulationState) => {
    await deal(erc20, signer.address, donation);
    await ERC20__factory.connect(erc20, signer).approve(morpho, donation);
    await MorphoBlue__factory.connect(morpho, signer).supply(
      data.getMarket(data.getVault(vault).withdrawQueue[0]!).config,
      donation,
      0n,
      vault,
      "0x",
    );
  };

export const setupBundle = async (
  bundlerService: BundlerService,
  signer: SignerWithAddress,
  inputOperations: InputBundlerOperation[],
  {
    unwrapTokens,
    unwrapSlippage,
    onBundleTx,
    ...options
  }: BundlingOptions & {
    unwrapTokens?: Set<Address>;
    unwrapSlippage?: bigint;
    onBundleTx?: (data: SimulationState) => Promise<void> | void;
  } = {},
) => {
  const { value: startData } = await bundlerService.simulationService.data;

  let { operations } = populateBundle(inputOperations, startData, {
    ...options,
    withSimplePermit: new Set([
      ...WITH_SIMPLE_PERMIT[startData.chainId],
      ...(options?.withSimplePermit ?? []),
    ]),
  });
  operations = finalizeBundle(
    operations,
    startData,
    signer.address,
    unwrapTokens,
    unwrapSlippage,
  );

  const bundle = encodeBundle(
    operations,
    startData,
    isSigner(bundlerService.chainService.runner),
  );

  const tokens = new Set<Address>();

  operations.forEach((operation) => {
    const { address } = operation;

    if (
      isBlueOperation(operation) &&
      operation.type !== "Blue_SetAuthorization"
    ) {
      try {
        const marketConfig = MarketConfig.get(operation.args.id);

        if (marketConfig.loanToken !== ZeroAddress)
          tokens.add(marketConfig.loanToken);

        if (marketConfig.collateralToken !== ZeroAddress)
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

  if (onBundleTx != null) {
    const balancesBefore = await Promise.all(
      [...tokens, ...keys(startData.blue.tokensData)].map(async (token) => ({
        token,
        balance: await (token === NATIVE_ADDRESS
          ? ethers.provider.getBalance(signer.address)
          : ERC20__factory.connect(token, signer).balanceOf(signer.address)),
      })),
    );

    await onBundleTx(startData)?.then(() => mine(0));

    await Promise.all(
      balancesBefore.map(({ token, balance }) =>
        token === NATIVE_ADDRESS
          ? setBalance(signer.address, balance)
          : deal(token, signer.address, balance),
      ),
    );
  }

  await Promise.all(
    bundle.requirements.signatures.map((requirement) =>
      requirement.sign(signer)!.wait(),
    ),
  );

  const txs = bundle.requirements.txs.map(({ tx }) => tx).concat([bundle.tx()]);

  for (const tx of txs) {
    await sendTransaction(signer, tx)
      .wait()
      .then(({ status, context }) => {
        if (status !== NotificationStatus.error) return;

        throw context.error; // Bubble up revert reason.
      });
  }

  const { bundler } = getChainAddresses(startData.chainId);

  await Promise.all(
    [...tokens].map(async (token) => {
      const balance =
        token === NATIVE_ADDRESS
          ? await ethers.provider.getBalance(bundler)
          : await ERC20__factory.connect(token, signer).balanceOf(bundler);

      assertApproxEqAbs(
        balance,
        0n,
        5n,
        `non-zero bundler balance for token ${token}: ${balance}`,
      );
    }),
  );

  return { operations, bundle };
};
