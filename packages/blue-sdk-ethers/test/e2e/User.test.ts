import { expect } from "chai";
import { MorphoBlue__factory } from "ethers-types";
import { ethers } from "hardhat";

import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers.js";

import { type Address, ChainId, addresses } from "@morpho-org/blue-sdk";
import { setUp } from "@morpho-org/morpho-test";
import { User } from "../../src/augment/User.js";

describe("augment/User", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;

    const morpho = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      signer,
    );

    await morpho.setAuthorization(addresses[ChainId.EthMainnet].bundler, true);
  });

  it("should fetch user data", async () => {
    const expectedData = new User({
      address: signer.address as Address,
      isBundlerAuthorized: true,
      morphoNonce: 0n,
    });

    const value = await User.fetch(signer.address as Address, signer);

    expect(value).to.eql(expectedData);
  });
});
