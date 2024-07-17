import { expect } from "chai";
import { MorphoBlue__factory } from "ethers-types";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { ChainId, User, addresses } from "@morpho-org/blue-sdk";
import { setUp } from "@morpho-org/morpho-test";

import sinon from "sinon";
import "../src/augment/User";

describe("augment/User", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;

    const morpho = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      signer,
    );

    await (
      await morpho.setAuthorization(addresses[ChainId.EthMainnet].bundler, true)
    ).wait();

    sinon.spy(signer.provider, "call");
  });

  afterEach(() => {
    (signer.provider.call as sinon.SinonSpy).resetHistory();
  });

  after(() => {
    (signer.provider.call as sinon.SinonSpy).restore();
  });

  it("should fetch user data", async () => {
    const expectedData = new User({
      address: signer.address,
      isBundlerAuthorized: true,
      morphoNonce: 0n,
    });

    const value = await User.fetch(signer.address, signer);

    expect(value).to.eql(expectedData);
    expect((signer.provider.call as sinon.SinonSpy).getCalls()).to.have.length(
      2,
    );
  });
});