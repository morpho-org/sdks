import { expect } from "chai";
import { MorphoBlue__factory } from "ethers-types";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { ChainId, addresses } from "@morpho-org/blue-sdk";
import { setUp } from "@morpho-org/morpho-test";
import { User } from "../../src/augment/User";

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

  test("should fetch user data", async () => {
    const expectedData = new User({
      address: signer.address,
      isBundlerAuthorized: true,
      morphoNonce: 0n,
    });

    const value = await User.fetch(signer.address, signer);

    expect(value).to.eql(expectedData);
  });
});
