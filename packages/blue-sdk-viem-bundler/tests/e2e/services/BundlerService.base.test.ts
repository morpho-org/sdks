import { expect } from "chai";
import { parseEther, parseUnits } from "ethers";
import { MorphoBlue__factory } from "ethers-types";
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketConfig,
  addresses,
} from "@morpho-org/blue-sdk";
import { mine, reset } from "@morpho-org/morpho-test";

import { setupBundle } from "../helpers";

const { morpho, bundler, adaptiveCurveIrm, wNative, usdc, verUsdc } =
  addresses[ChainId.BaseMainnet];

describe("BundlerService (base)", () => {
  let signer: SignerWithAddress;

  before(async () => {
    const signers = await ethers.getSigners();

    signer = signers[0]!;
  });

  afterEach(async () => {
    // Wait for all fetch promises to resolve before reset.
    await bundlerService?.simulationService.data;

    bundlerService?.simulationService.chainService.close();
    bundlerService?.simulationService.metaMorphoService.blueService.close();
    bundlerService?.simulationService.metaMorphoService.close();
    bundlerService?.simulationService.close();

    await reset();
  });

  describe("with provider + address", () => {
    beforeEach(() => {
      bundlerService = new BundlerService(
        new SimulationService(
          new MetaMorphoService(
            new BlueService(new ChainService(ethers.provider), {
              users: [signer.address],
            }),
          ),
        ),
      );
    });

    it("should wrap then supply aUSDC", async () => {
      const blue = await MorphoBlue__factory.connect(morpho, signer);
      const config = new MarketConfig({
        collateralToken: wNative,
        loanToken: verUsdc,
        lltv: parseEther("0.86"),
        irm: adaptiveCurveIrm,
        oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
      });
      await blue.createMarket(config);

      bundlerService.simulationService.metaMorphoService.deleteUsers(
        signer.address,
      );
      signer = await ethers.getImpersonatedSigner(
        "0x53753098E2660AbD4834A3eD713D11AC1123421A",
      );
      bundlerService.simulationService.metaMorphoService.addUsers(
        signer.address,
      );

      bundlerService.simulationService.metaMorphoService.addMarkets(config.id);

      const assets = parseUnits("500", 6);
      await deal(usdc, signer.address, assets);
      await mine();

      const { operations } = await setupBundle(bundlerService, signer, [
        {
          type: "Erc20_Wrap",
          sender: signer.address,
          address: verUsdc,
          args: {
            amount: assets,
            owner: bundler,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_Supply",
          sender: signer.address,
          address: morpho,
          args: {
            id: config.id,
            assets,
            onBehalf: signer.address,
          },
        },
      ]);

      expect(operations).to.eql([
        {
          type: "Erc20_Permit",
          sender: signer.address,
          address: usdc,
          args: {
            amount: assets,
            spender: bundler,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Permit",
          sender: signer.address,
          address: verUsdc,
          args: {
            amount: assets,
            spender: bundler,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: usdc,
          args: {
            amount: assets,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Erc20_Wrap",
          sender: bundler,
          address: verUsdc,
          args: {
            amount: assets,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: verUsdc,
          args: {
            amount: assets,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Blue_Supply",
          sender: bundler,
          address: morpho,
          args: {
            id: config.id,
            assets,
            onBehalf: signer.address,
          },
        },
      ]);

      const position = await blue.position(config.id, signer.address);

      expect(position.collateral).to.equal(0n);
      expect(position.supplyShares).to.equal(assets * 1_000000n);
      expect(position.borrowShares).to.equal(0n);
    });
  });
});
