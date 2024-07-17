import { expect } from "chai";
import { deal } from "hardhat-deal";

import { ChainId, Holding, MathLib, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";

import { setUp } from "@morpho-org/morpho-test";
import { viem } from "hardhat";
import "../src/augment/Holding";
import {
  Account,
  Address,
  Chain,
  Client,
  PublicActions,
  TestActions,
  Transport,
  WalletActions,
  WalletRpcSchema,
  erc20Abi,
  publicActions,
  testActions,
} from "viem";
import { permit2Abi } from "../src/abis";

describe("augment/Holding", () => {
  let client: Client<
    Transport,
    Chain,
    Account,
    WalletRpcSchema,
    WalletActions<Chain, Account> &
      PublicActions<Transport, Chain, Account> &
      TestActions
  >;

  setUp(async () => {
    client = (await viem.getWalletClients())[0]!
      .extend(publicActions)
      .extend(testActions({ mode: "hardhat" }));
  });

  it("should fetch user token data", async () => {
    const token = MAINNET_MARKETS.eth_wstEth.loanToken as Address;

    const expectedData = new Holding({
      token,
      user: client.account.address,
      erc20Allowances: {
        morpho: 1n,
        permit2: 3n,
        bundler: 2n,
      },
      permit2Allowances: {
        morpho: {
          amount: 4n,
          expiration: MathLib.MAX_UINT_48 - 1n,
          nonce: 0n,
        },
        bundler: {
          amount: 7n,
          expiration: MathLib.MAX_UINT_48 - 2n,
          nonce: 0n,
        },
      },
      balance: 10n * MathLib.WAD,
      canTransfer: true,
    });

    await deal(token, client.account.address, expectedData.balance);
    await client.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [
        addresses[ChainId.EthMainnet].morpho,
        expectedData.erc20Allowances.morpho,
      ],
    });
    await client.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [
        addresses[ChainId.EthMainnet].bundler,
        expectedData.erc20Allowances.bundler,
      ],
    });
    await client.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [
        addresses[ChainId.EthMainnet].permit2,
        expectedData.erc20Allowances.permit2,
      ],
    });
    await client.writeContract({
      address: addresses[ChainId.EthMainnet].permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        token,
        addresses[ChainId.EthMainnet].morpho,
        expectedData.permit2Allowances.morpho.amount,
        Number(expectedData.permit2Allowances.morpho.expiration),
      ],
    });
    await client.writeContract({
      address: addresses[ChainId.EthMainnet].permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [
        token,
        addresses[ChainId.EthMainnet].bundler,
        expectedData.permit2Allowances.bundler.amount,
        Number(expectedData.permit2Allowances.bundler.expiration),
      ],
    });

    const value = await Holding.fetch(
      client.account.address,
      MAINNET_MARKETS.eth_wstEth.loanToken as Address,
      client,
    );

    expect(value).to.eql(expectedData);
  });
});
