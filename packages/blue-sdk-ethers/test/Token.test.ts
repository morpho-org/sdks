import { expect } from "chai";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import {
  ChainId,
  ExchangeRateWrappedToken,
  Token,
  addresses,
} from "@morpho-org/blue-sdk";
import { setUp } from "@morpho-org/morpho-test";

import sinon from "sinon";
import "../src/augment/Token";

describe("augment/Token", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;

    sinon.spy(signer.provider, "call");
  });

  afterEach(() => {
    (signer.provider.call as sinon.SinonSpy).resetHistory();
  });

  after(() => {
    (signer.provider.call as sinon.SinonSpy).restore();
  });

  it("should fetch token data", async () => {
    const expectedData = new Token({
      address: addresses[ChainId.EthMainnet].usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
    });

    const value = await Token.fetch(addresses[ChainId.EthMainnet].usdc, signer);

    expect(value).to.eql(expectedData);
    expect((signer.provider.call as sinon.SinonSpy).getCalls()).to.have.length(
      3,
    );
  });

  it("should fetch wrapped token data", async () => {
    const expectedData = new ExchangeRateWrappedToken(
      {
        address: addresses[ChainId.EthMainnet].wstEth,
        decimals: 18,
        symbol: "wstETH",
        name: "Wrapped liquid staked Ether 2.0",
      },
      addresses[ChainId.EthMainnet].stEth,
      expect.bigint,
    );

    const value = await Token.fetch(
      addresses[ChainId.EthMainnet].wstEth,
      signer,
    );

    expect(value).to.eql(expectedData);
    expect((signer.provider.call as sinon.SinonSpy).getCalls()).to.have.length(
      4,
    );
  });

  it("Should fetch MKR token data", async () => {
    const expectedData = new Token({
      address: addresses[ChainId.EthMainnet].mkr,
      decimals: 18,
      symbol: "MKR",
      name: "Maker",
    });

    const value = await Token.fetch(addresses[ChainId.EthMainnet].mkr, signer);

    expect(value).to.eql(expectedData);
    expect((signer.provider.call as sinon.SinonSpy).getCalls()).to.have.length(
      3,
    );
  });
});
