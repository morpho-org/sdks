import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { MetaMorpho__factory, PublicAllocator__factory } from "ethers-types";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

import { ChainId, MarketId, Vault, addresses } from "@morpho-org/blue-sdk";
import { setUp } from "@morpho-org/morpho-test";

import "../src/augment/Vault";
import { steakUsdc } from "./fixtures";

describe("augment/Vault", () => {
  let signer: SignerWithAddress;

  setUp(async (block) => {
    signer = (await ethers.getSigners())[0]!;

    const mm = MetaMorpho__factory.connect(steakUsdc.address, signer);

    const owner = await ethers.getImpersonatedSigner(await mm.owner());

    await setNextBlockTimestamp(block.timestamp);
    await mm
      .connect(owner)
      .setIsAllocator(addresses[ChainId.EthMainnet].publicAllocator, true);

    const publicAllocator = PublicAllocator__factory.connect(
      addresses[ChainId.EthMainnet].publicAllocator,
      owner,
    );

    await setNextBlockTimestamp(block.timestamp);
    await publicAllocator.setFee(steakUsdc.address, 1);
  });

  it("should fetch vault data", async () => {
    const expectedData = new Vault({
      config: steakUsdc,
      curator: ZeroAddress,
      fee: 50000000000000000n,
      feeRecipient: "0x255c7705e8BB334DfCae438197f7C4297988085a",
      guardian: "0xCF0FE65E39C776D2d6Eb420364A5df776c9cFf5f",
      owner: "0x255c7705e8BB334DfCae438197f7C4297988085a",
      pendingGuardian: {
        validAt: 0n,
        value: ZeroAddress,
      },
      pendingOwner: ZeroAddress,
      pendingTimelock: {
        validAt: 0n,
        value: 0n,
      },
      skimRecipient: ZeroAddress,
      publicAllocatorConfig: {
        admin: ZeroAddress,
        fee: 1n,
        accruedFee: 0n,
      },
      supplyQueue: [
        "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId,
        "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8" as MarketId,
      ],
      timelock: 604800n,
      withdrawQueue: [
        "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8" as MarketId,
        "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId,
        "0x495130878b7d2f1391e21589a8bcaef22cbc7e1fbbd6866127193b3cc239d8b1" as MarketId,
        "0x06f2842602373d247c4934f7656e513955ccc4c377f0febc0d9ca2c3bcc191b1" as MarketId,
        "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49" as MarketId,
      ],
      lastTotalAssets: 26129569140552n,
      totalAssets: 26138939802936n,
      totalSupply: 25752992371062043744406063n,
    });

    const value = await Vault.fetch(steakUsdc.address, signer);

    expect(value).to.eql(expectedData);
  });
});
