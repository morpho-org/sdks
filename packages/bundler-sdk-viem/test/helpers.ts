import {
  type Address,
  NATIVE_ADDRESS,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { isDefined, keys, values } from "@morpho-org/morpho-ts";

import {
  type BundlingOptions,
  type InputBundlerOperation,
  setupBundle,
} from "../src/index.js";

import { blueAbi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import { withSimplePermit } from "@morpho-org/morpho-test";
import type { SimulationState } from "@morpho-org/simulation-sdk";
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
    gasPrice,
    ...options
  }: BundlingOptions & {
    account?: Address | Account;
    supportsSignature?: boolean;
    unwrapTokens?: Set<Address>;
    unwrapSlippage?: bigint;
    onBundleTx?: (data: SimulationState) => Promise<void> | void;
    gasPrice?: bigint;
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

  const tokens = new Set(
    keys(startData.tokens)
      .flatMap((token) => [token, getUnwrappedToken(token, startData.chainId)])
      .concat(
        values(startData.markets).flatMap((market) => [
          market?.params.collateralToken,
          market?.params.loanToken,
        ]),
      )
      .concat(
        values(startData.vaults).flatMap((vault) => [
          vault?.address,
          vault?.asset,
        ]),
      )
      .filter(
        (address): address is Address =>
          address != null && address !== zeroAddress,
      ),
  );
  const users = new Set(keys(startData.users).filter(isDefined));

  await onBundleTx?.(startData);

  await bundle.requirements.sign(client, account);

  for (const tx of bundle.txs()) {
    await client.sendTransaction(
      // @ts-ignore
      { ...tx, account, gasPrice },
    );
  }

  const { morpho, permit2, bundler3 } = getChainAddresses(startData.chainId);

  const bundler3Adapters = values(bundler3).filter(isDefined);

  await Promise.all(
    [...tokens].map(async (token) => {
      const [balances, allowances, authorizations] = await Promise.all([
        Promise.all(
          bundler3Adapters.map(async (adapter) => ({
            adapter,
            balance: await client.balanceOf({ erc20: token, owner: adapter }),
          })),
        ),
        Promise.all(
          [...users].flatMap((user) =>
            bundler3Adapters.flatMap(async (adapter) => ({
              user,
              adapter,
              erc20Allowance: await client.allowance({
                erc20: token,
                owner: user,
                spender: adapter,
              }),
              permit2Allowance:
                permit2 != null
                  ? await client
                      .readContract({
                        abi: permit2Abi,
                        address: permit2,
                        functionName: "allowance",
                        args: [user, token, adapter],
                      })
                      .then(([amount]) => amount)
                  : 0n,
            })),
          ),
        ),
        Promise.all(
          [...users].flatMap((user) =>
            bundler3Adapters.map(async (adapter) => ({
              user,
              adapter,
              isAuthorized: await client.readContract({
                abi: blueAbi,
                address: morpho,
                functionName: "isAuthorized",
                args: [user, adapter],
              }),
            })),
          ),
        ),
      ]);

      for (const { balance, adapter } of balances)
        expect(
          balance,
          `balance of "${adapter}" for token "${token}"`,
        ).toBeLessThanOrEqual(5n);

      for (const { adapter, erc20Allowance, permit2Allowance } of allowances) {
        if (token !== NATIVE_ADDRESS && adapter !== bundler3.generalAdapter1)
          expect(erc20Allowance).toEqual(0n);
        expect(permit2Allowance).toEqual(0n);
      }

      for (const { adapter, isAuthorized } of authorizations) {
        if (adapter !== bundler3.generalAdapter1)
          expect(isAuthorized).toBeFalsy();
      }
    }),
  );

  return { operations, bundle };
};
