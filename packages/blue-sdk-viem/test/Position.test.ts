import { expect } from "chai";
import { deal } from "hardhat-deal";

import { viem } from "hardhat";
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
  maxUint256,
  parseUnits,
  publicActions,
  testActions,
} from "viem";

import { ChainId, Position, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";
import { setUp } from "@morpho-org/morpho-test";
import "../src/augment/Position";
import { blueAbi } from "../src/abis";

const market = MAINNET_MARKETS.usdc_wstEth;

const supplyAssets = parseUnits("10", 6);
const borrowShares = parseUnits("7", 12);
const collateral = parseUnits("1", 18);

describe("augment/Position", () => {
  let client: Client<
    Transport,
    Chain,
    Account,
    WalletRpcSchema,
    WalletActions<Chain, Account> &
      PublicActions<Transport, Chain, Account> &
      TestActions
  >;
  let supplier: Client<
    Transport,
    Chain,
    Account,
    WalletRpcSchema,
    WalletActions<Chain, Account> &
      PublicActions<Transport, Chain, Account> &
      TestActions
  >;

  setUp(async () => {
    const clients = await viem.getWalletClients();
    client = clients[0]!
      .extend(publicActions)
      .extend(testActions({ mode: "hardhat" }));
    supplier = clients[1]!
      .extend(publicActions)
      .extend(testActions({ mode: "hardhat" }));

    await deal(market.loanToken, supplier.account.address, supplyAssets);
    await supplier.writeContract({
      address: market.loanToken as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses[ChainId.EthMainnet].morpho, maxUint256],
    });
    await supplier.writeContract({
      address: addresses[ChainId.EthMainnet].morpho as Address,
      abi: blueAbi,
      functionName: "supply",
      args: [market.asViem(), supplyAssets, 0n, supplier.account.address, "0x"],
    });

    await deal(market.collateralToken, client.account.address, collateral);
    await client.writeContract({
      address: market.collateralToken as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses[ChainId.EthMainnet].morpho, maxUint256],
    });
    await client.writeContract({
      address: addresses[ChainId.EthMainnet].morpho as Address,
      abi: blueAbi,
      functionName: "supplyCollateral",
      args: [market.asViem(), collateral, client.account.address, "0x"],
    });
    await client.writeContract({
      address: addresses[ChainId.EthMainnet].morpho as Address,
      abi: blueAbi,
      functionName: "borrow",
      args: [
        market.asViem(),
        0n,
        borrowShares,
        client.account.address,
        client.account.address,
      ],
    });
  });

  it("should fetch position", async () => {
    const expectedData = new Position({
      user: client.account.address,
      marketId: market.id,
      supplyShares: 0n,
      borrowShares,
      collateral,
    });

    const value = await Position.fetch(
      client.account.address,
      market.id,
      client,
    );

    expect(value).to.eql(expectedData);
  });
});
