import { expect } from "chai";

import { viem } from "hardhat";
import {
  Account,
  Chain,
  Client,
  PublicActions,
  TestActions,
  Transport,
  WalletActions,
  WalletRpcSchema,
  publicActions,
  testActions,
} from "viem";

import { ChainId, addresses } from "@morpho-org/blue-sdk";
import { setUp } from "@morpho-org/morpho-test";
import { blueAbi } from "../src/abis";
import { User } from "../src/augment/User";

describe("augment/User", () => {
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

    await client.writeContract({
      address: addresses[ChainId.EthMainnet].morpho,
      abi: blueAbi,
      functionName: "setAuthorization",
      args: [addresses[ChainId.EthMainnet].bundler, true],
    });
  });

  it("should fetch user data", async () => {
    const expectedData = new User({
      address: client.account.address,
      isBundlerAuthorized: true,
      morphoNonce: 0n,
    });

    const value = await User.fetch(client.account.address, client);

    expect(value).to.eql(expectedData);
  });
});
