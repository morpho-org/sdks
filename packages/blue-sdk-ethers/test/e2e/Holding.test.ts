import { expect } from "chai";
import { parseUnits } from "ethers";
import { ERC20__factory, Permit2__factory } from "ethers-types";
import { deal } from "hardhat-deal";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { ChainId, MathLib, addresses } from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/src/tests/mocks/markets";

import { setUp } from "@morpho-org/morpho-test";
import { ethers } from "hardhat";
import { Holding } from "../../src/augment/Holding";

describe("augment/Holding", () => {
  let signer: SignerWithAddress;

  setUp(async () => {
    signer = (await ethers.getSigners())[0]!;
  });

  test("should fetch user token data", async () => {
    const token = MAINNET_MARKETS.eth_wstEth.loanToken;

    const erc20 = ERC20__factory.connect(token, signer);
    const permit2 = Permit2__factory.connect(
      addresses[ChainId.EthMainnet].permit2,
      signer,
    );

    const expectedData = new Holding({
      token,
      user: signer.address,
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
      balance: parseUnits("10"),
      canTransfer: true,
    });

    await deal(token, signer.address, expectedData.balance);
    await erc20.approve(
      addresses[ChainId.EthMainnet].morpho,
      expectedData.erc20Allowances.morpho,
    );
    await erc20.approve(
      addresses[ChainId.EthMainnet].bundler,
      expectedData.erc20Allowances.bundler,
    );
    await erc20.approve(
      addresses[ChainId.EthMainnet].permit2,
      expectedData.erc20Allowances.permit2,
    );
    await permit2.approve(
      token,
      addresses[ChainId.EthMainnet].morpho,
      expectedData.permit2Allowances.morpho.amount,
      expectedData.permit2Allowances.morpho.expiration,
    );
    await permit2.approve(
      token,
      addresses[ChainId.EthMainnet].bundler,
      expectedData.permit2Allowances.bundler.amount,
      expectedData.permit2Allowances.bundler.expiration,
    );

    const value = await Holding.fetch(
      signer.address,
      MAINNET_MARKETS.eth_wstEth.loanToken,
      signer,
    );

    expect(value).to.eql(expectedData);
  });
});
