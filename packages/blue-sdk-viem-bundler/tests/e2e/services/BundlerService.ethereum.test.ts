import { expect } from "chai";
import { MaxUint256, ZeroAddress, parseEther, parseUnits } from "ethers";
import { MetaMorpho__factory, PublicAllocator__factory } from "ethers-types";
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";
import _omit from "lodash/omit";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { BlueService, ChainService } from "@morpho-org/blue-core-sdk";
import { MetaMorphoService } from "@morpho-org/blue-metamorpho-sdk";
import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketConfig,
  MarketUtils,
  MathLib,
  NATIVE_ADDRESS,
  addresses,
} from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/lib/tests/mocks/markets";
import {
  Erc20Errors,
  SimulationService,
} from "@morpho-org/blue-simulation-sdk";
import {
  ERC20__factory,
  Morpho__factory,
} from "@morpho-org/morpho-blue-bundlers/types";
import {
  assertApproxEqAbs,
  assertApproxEqRel,
  mine,
  reset,
} from "@morpho-org/morpho-test";

import { BundlerService } from "../../../src";
import { bbETH, bbUSDT, bbUsdc, re7WETH, steakUsdc } from "../fixtures";
import { donate, setupBundle } from "../helpers";

const {
  morpho,
  bundler,
  publicAllocator,
  permit2,
  usdc,
  stEth,
  wNative,
  wstEth,
} = addresses[ChainId.EthMainnet];
const usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

describe("BundlerService (ethereum)", () => {
  let signer: SignerWithAddress;
  let donator: SignerWithAddress;

  let bundlerService: BundlerService;

  before(async () => {
    const signers = await ethers.getSigners();

    signer = signers[0]!;
    donator = signers[1]!;
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

  describe("with signer", () => {
    beforeEach(() => {
      bundlerService = new BundlerService(
        new SimulationService(
          new MetaMorphoService(
            new BlueService(new ChainService(signer), {
              users: [signer.address, donator.address],
            }),
          ),
        ),
      );
    });

    it("should fail if balance exceeded", async () => {
      const id = MAINNET_MARKETS.eth_wstEth.id;
      bundlerService.simulationService.metaMorphoService.addMarkets(id);

      const wBalance = parseUnits("5000");
      const balance = await ethers.provider.getBalance(signer.address);
      await deal(wNative, signer.address, wBalance);
      await mine();

      const assets = balance + wBalance + 1n;

      await expect(
        setupBundle(bundlerService, signer, [
          {
            type: "Blue_Supply",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets,
              onBehalf: signer.address,
            },
          },
        ]),
      ).to.be.rejectedWith(
        new Erc20Errors.InsufficientBalance(wNative, signer.address).message,
      );
    });

    it("should wrap + skim stETH if required with less wstETH than expected slippage", async () => {
      const id = MAINNET_MARKETS.eth_wstEth.id;
      bundlerService.simulationService.metaMorphoService.addMarkets(id);

      const blue = Morpho__factory.connect(morpho, signer);
      const erc20 = ERC20__factory.connect(stEth, signer);

      const wBalance = parseUnits("0.0005");
      // Dealing stETH does not work.
      await signer.sendTransaction({
        to: stEth,
        value: (await ethers.provider.getBalance(signer.address)) / 2n,
      });
      await deal(wstEth, signer.address, wBalance);
      await mine();

      const { value: data } = await bundlerService.simulationService.data;

      const { balance } = data.getHolding(signer.address, stEth);
      const { balance: bundlerBalance } = data.getHolding(bundler, stEth);

      const wstEthToken = data.getWrappedToken(wstEth);
      const assets =
        wstEthToken.toWrappedExactAmountIn(
          balance,
          DEFAULT_SLIPPAGE_TOLERANCE,
        ) + wBalance;

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "Erc20_Wrap",
          sender: signer.address,
          address: wstEth,
          args: {
            amount: balance,
            owner: bundler,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: signer.address,
          address: morpho,
          args: {
            id,
            assets,
            onBehalf: signer.address,
          },
        },
      ]);

      expect(operations.length).to.equal(8);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(2);

      expect(operations).to.eql([
        {
          type: "Erc20_Approve",
          sender: signer.address,
          address: stEth,
          args: {
            amount: MathLib.MAX_UINT_160,
            spender: permit2,
          },
        },
        {
          type: "Erc20_Permit",
          sender: signer.address,
          address: wstEth,
          args: {
            amount: wBalance,
            spender: bundler,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Permit2",
          sender: signer.address,
          address: stEth,
          args: {
            amount: balance - bundlerBalance,
            spender: bundler,
            expiration: MathLib.MAX_UINT_48,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: wstEth,
          args: {
            amount: wBalance,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Erc20_Transfer2",
          sender: bundler,
          address: stEth,
          args: {
            amount: balance - bundlerBalance,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Erc20_Wrap",
          sender: bundler,
          address: wstEth,
          args: {
            amount: balance,
            owner: bundler,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets,
            onBehalf: signer.address,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: wstEth,
          args: {
            amount: MaxUint256,
            from: bundler,
            to: signer.address,
          },
        },
      ]);

      const position = await blue.position(id, signer.address);

      assertApproxEqAbs(await erc20.balanceOf(signer.address), 0n, 10n);
      expect(position.collateral).to.equal(assets);
      expect(position.supplyShares).to.equal(0);
      expect(position.borrowShares).to.equal(0);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(
        MathLib.MAX_UINT_160 - (balance - bundlerBalance),
      );
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, steakUsdc.address)).to.equal(
        0,
      );
    });

    it("should borrow with already enough collateral", async () => {
      const id = MAINNET_MARKETS.usdc_wstEth.id;
      bundlerService.simulationService.metaMorphoService.addMarkets(id);

      const blue = Morpho__factory.connect(morpho, signer);
      const erc20 = ERC20__factory.connect(wstEth, signer);

      const collateral = parseUnits("50");
      const assets = parseUnits("13000", 6);
      await deal(wstEth, signer.address, collateral);
      await erc20.approve(morpho, MaxUint256);
      await blue.supplyCollateral(
        MAINNET_MARKETS.usdc_wstEth,
        collateral,
        signer.address,
        "0x",
      );
      await mine();

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "Blue_Borrow",
          sender: signer.address,
          address: morpho,
          args: {
            id,
            assets,
            onBehalf: signer.address,
            receiver: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);

      expect(operations.length).to.equal(2);
      expect(bundle.requirements.txs.length).to.equal(0);
      expect(bundle.requirements.signatures.length).to.equal(1);

      expect(operations[0]).to.eql({
        type: "Blue_SetAuthorization",
        sender: bundler,
        address: morpho,
        args: {
          owner: signer.address,
          isBundlerAuthorized: true,
        },
      });
      expect(operations[1]).to.eql({
        type: "Blue_Borrow",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets,
          onBehalf: signer.address,
          receiver: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });

      const market = await blue.market(id);
      const position = await blue.position(id, signer.address);

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      expect(position.collateral).to.equal(collateral);
      expect(position.supplyShares).to.equal(0);
      expect(
        MarketUtils.toBorrowAssets(position.borrowShares, market),
      ).to.equal(assets + 1n);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, steakUsdc.address)).to.equal(
        0,
      );
    });

    it("should deposit steakUSDC via permit", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        steakUsdc.address,
      );

      const erc20 = ERC20__factory.connect(usdc, signer);
      const erc4626 = MetaMorpho__factory.connect(steakUsdc.address, signer);

      const amount = parseUnits("1000000", 6);
      await deal(usdc, signer.address, amount);
      await mine();

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "MetaMorpho_Deposit",
          sender: signer.address,
          address: steakUsdc.address,
          args: {
            assets: amount,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);

      expect(operations.length).to.equal(3);
      expect(bundle.requirements.txs.length).to.equal(0);
      expect(bundle.requirements.signatures.length).to.equal(1);

      expect(operations[0]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: usdc,
        args: {
          amount,
          spender: bundler,
          nonce: 1n,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: usdc,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[2]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: steakUsdc.address,
        args: {
          assets: amount,
          owner: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      expect(await erc4626.maxWithdraw(signer.address)).to.equal(amount - 1n);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, steakUsdc.address)).to.equal(
        0,
      );
    });

    it("should deposit bbUSDT via permit2", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbUSDT.address,
      );

      const erc20 = ERC20__factory.connect(usdt, signer);
      const erc4626 = MetaMorpho__factory.connect(bbUSDT.address, signer);

      const amount = parseUnits("1000000", 6);
      await deal(usdt, signer.address, amount);
      await mine();

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "MetaMorpho_Deposit",
          sender: signer.address,
          address: bbUSDT.address,
          args: {
            assets: amount,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);

      expect(operations.length).to.equal(4);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(1);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: usdt,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: usdt,
        args: {
          amount,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: usdt,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[3]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: bbUSDT.address,
        args: {
          assets: amount,
          owner: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      expect(await erc4626.maxWithdraw(signer.address)).to.equal(amount - 1n);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(
        MathLib.MAX_UINT_160 - amount,
      );
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, bbUSDT.address)).to.equal(0);
    });

    it("should simulate bbUSDT deposit into supply max collateral without skim", async () => {
      const blue = Morpho__factory.connect(morpho, signer);
      const erc20 = ERC20__factory.connect(usdt, signer);
      const erc4626 = MetaMorpho__factory.connect(bbUSDT.address, signer);

      const amount = parseUnits("1000000", 6);
      const expectedShares = await erc4626.convertToShares(amount);
      await deal(usdt, signer.address, amount);

      const marketConfig = new MarketConfig({
        loanToken: ZeroAddress,
        collateralToken: bbUSDT.address,
        lltv: 0n,
        oracle: ZeroAddress,
        irm: ZeroAddress,
      });
      await blue.createMarket(marketConfig);

      bundlerService.simulationService.metaMorphoService.addMarkets(
        marketConfig.id,
      );
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbUSDT.address,
      );

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "MetaMorpho_Deposit",
          sender: signer.address,
          address: bbUSDT.address,
          args: {
            assets: amount,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: signer.address,
          address: morpho,
          args: {
            id: marketConfig.id,
            assets: MaxUint256,
            onBehalf: signer.address,
          },
        },
      ]);

      expect(operations.length).to.equal(5);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(1);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: usdt,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: usdt,
        args: {
          amount,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: usdt,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[3]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: bbUSDT.address,
        args: {
          assets: amount,
          owner: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id: marketConfig.id,
          assets: MaxUint256,
          onBehalf: signer.address,
        },
      });

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      expect(await erc4626.balanceOf(signer.address)).to.equal(0);

      const { collateral } = await blue.position(
        marketConfig.id,
        signer.address,
      );
      assertApproxEqAbs(collateral, expectedShares, parseUnits("0.1"));

      expect(await erc20.allowance(signer.address, permit2)).to.equal(
        MathLib.MAX_UINT_160 - amount,
      );
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, bbUSDT.address)).to.equal(0);
    });

    it("should simulate bbUSDT deposit into supply collateral with skim", async () => {
      const blue = Morpho__factory.connect(morpho, signer);
      const erc20 = ERC20__factory.connect(usdt, signer);
      const erc4626 = MetaMorpho__factory.connect(bbUSDT.address, signer);

      const amount = parseUnits("1000000", 6);
      const shares = parseEther("500000");
      const expectedShares = await erc4626.convertToShares(amount);
      await deal(usdt, signer.address, amount);

      const marketConfig = new MarketConfig({
        loanToken: ZeroAddress,
        collateralToken: bbUSDT.address,
        lltv: 0n,
        oracle: ZeroAddress,
        irm: ZeroAddress,
      });
      await blue.createMarket(marketConfig);

      bundlerService.simulationService.metaMorphoService.addMarkets(
        marketConfig.id,
      );
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbUSDT.address,
      );

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "MetaMorpho_Deposit",
          sender: signer.address,
          address: bbUSDT.address,
          args: {
            assets: amount,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: signer.address,
          address: morpho,
          args: {
            id: marketConfig.id,
            assets: shares,
            onBehalf: signer.address,
          },
        },
      ]);

      expect(operations.length).to.equal(6);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(1);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: usdt,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: usdt,
        args: {
          amount,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: usdt,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[3]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: bbUSDT.address,
        args: {
          assets: amount,
          owner: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id: marketConfig.id,
          assets: shares,
          onBehalf: signer.address,
        },
      });
      expect(operations[5]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: bbUSDT.address,
        args: {
          amount: MaxUint256,
          from: bundler,
          to: signer.address,
        },
      });

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      assertApproxEqAbs(
        await erc4626.balanceOf(signer.address),
        expectedShares - shares,
        parseUnits("0.1"),
      );

      const { collateral } = await blue.position(
        marketConfig.id,
        signer.address,
      );
      expect(collateral).to.equal(shares);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(
        MathLib.MAX_UINT_160 - amount,
      );
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, bbUSDT.address)).to.equal(0);
    });

    it("should simulate bbETH mint on behalf with slippage & unwrap remaining WETH", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbETH.address,
      );

      const erc20 = ERC20__factory.connect(wNative, signer);
      const erc4626 = MetaMorpho__factory.connect(bbETH.address, signer);

      const shares = parseUnits("99");
      const assets = await erc4626.previewMint(shares);
      await deal(wNative, signer.address, assets + parseUnits("10"));

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: bbETH.address,
            args: {
              shares,
              owner: donator.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          onBundleTx: donate(
            donator,
            wNative,
            parseUnits("1"),
            bbETH.address,
            morpho,
          ),
        },
      );

      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(1);

      expect(operations).to.eql([
        {
          type: "Erc20_Approve",
          sender: signer.address,
          address: wNative,
          args: {
            amount: MathLib.MAX_UINT_160,
            spender: permit2,
          },
        },
        {
          type: "Erc20_Permit2",
          sender: signer.address,
          address: wNative,
          args: {
            amount: expect.bigint,
            spender: bundler,
            expiration: expect.bigint,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer2",
          sender: bundler,
          address: wNative,
          args: {
            amount: expect.bigint,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "MetaMorpho_Deposit",
          sender: bundler,
          address: bbETH.address,
          args: {
            shares,
            owner: donator.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Erc20_Transfer",
          address: wNative,
          sender: bundler,
          args: {
            amount: MaxUint256,
            from: bundler,
            to: signer.address,
          },
        },
      ]);

      expect(await erc20.balanceOf(bundler)).to.equal(0);
      expect(await erc20.balanceOf(donator.address)).to.equal(0);
      expect(await erc4626.maxWithdraw(signer.address)).to.equal(0);
      assertApproxEqRel(
        await erc4626.maxWithdraw(donator.address),
        assets - 1n,
        DEFAULT_SLIPPAGE_TOLERANCE,
      );
      assertApproxEqAbs(
        await erc20.balanceOf(signer.address),
        parseUnits("10"),
        parseUnits("0.025"),
      );

      expect(await erc20.allowance(signer.address, permit2)).not.to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, bbETH.address)).to.equal(0);
    });

    it("should fail bbETH mint on behalf with slippage exceeded", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbETH.address,
      );

      const erc4626 = MetaMorpho__factory.connect(bbETH.address, signer);

      const shares = parseUnits("99");
      const assets = await erc4626.previewMint(shares);
      await deal(wNative, signer.address, assets + parseUnits("10"));

      await expect(
        setupBundle(
          bundlerService,
          signer,
          [
            {
              type: "MetaMorpho_Deposit",
              sender: signer.address,
              address: bbETH.address,
              args: {
                shares,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ],
          {
            onBundleTx: donate(
              donator,
              wNative,
              parseUnits("10"),
              bbETH.address,
              morpho,
            ),
          },
        ),
      ).to.be.reverted;
    });

    it("should borrow USDC against wstETH into steakUSDC half deposit on behalf with slippage & unwrap remaining wstETH", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        steakUsdc.address,
      );

      const { value: startData } = await bundlerService.simulationService.data;

      const collateral = ERC20__factory.connect(wstEth, signer);
      const loan = ERC20__factory.connect(usdc, signer);
      const erc4626 = MetaMorpho__factory.connect(steakUsdc.address, signer);

      const id = MAINNET_MARKETS.usdc_wstEth.id;
      const market = startData.getMarket(id);

      const collateralAssets = parseUnits("100");
      const loanShares = parseUnits("50000", 12);
      const loanAssets = market.toBorrowAssets(loanShares);
      await deal(wstEth, signer.address, collateralAssets);
      await mine();

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "Blue_SupplyCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: signer.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              shares: loanShares,
              onBehalf: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: steakUsdc.address,
            args: {
              assets: loanAssets / 2n,
              owner: donator.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          unwrapTokens: new Set([wstEth]),
          onBundleTx: donate(
            donator,
            usdc,
            parseUnits("1000", 6),
            steakUsdc.address,
            morpho,
          ),
        },
      );

      expect(operations.length).to.equal(7);
      expect(bundle.requirements.txs.length).to.equal(0);
      expect(bundle.requirements.signatures.length).to.equal(2);

      expect(operations[0]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: wstEth,
        args: {
          amount: collateralAssets,
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: wstEth,
        args: {
          amount: collateralAssets,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[2]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: collateralAssets,
          onBehalf: signer.address,
        },
      });
      expect(operations[3]).to.eql({
        type: "Blue_SetAuthorization",
        sender: bundler,
        address: morpho,
        args: {
          owner: signer.address,
          isBundlerAuthorized: true,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_Borrow",
        sender: bundler,
        address: morpho,
        args: {
          id,
          shares: loanShares,
          onBehalf: signer.address,
          receiver: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[5]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: steakUsdc.address,
        args: {
          assets: loanAssets / 2n,
          owner: donator.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[6]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: usdc,
        args: {
          amount: MaxUint256,
          from: bundler,
          to: signer.address,
        },
      });

      expect(await collateral.balanceOf(signer.address)).to.equal(0);
      assertApproxEqRel(
        await loan.balanceOf(signer.address),
        loanAssets / 2n,
        DEFAULT_SLIPPAGE_TOLERANCE,
      );
      expect(await collateral.balanceOf(donator.address)).to.equal(0);
      expect(await loan.balanceOf(donator.address)).to.equal(0);
      expect(await erc4626.maxWithdraw(signer.address)).to.equal(0);
      assertApproxEqRel(
        await erc4626.maxWithdraw(donator.address),
        loanAssets / 2n,
        DEFAULT_SLIPPAGE_TOLERANCE,
      );

      expect(await collateral.allowance(signer.address, permit2)).to.equal(0);
      expect(await collateral.allowance(signer.address, bundler)).to.equal(0);
      expect(
        await collateral.allowance(signer.address, bbETH.address),
      ).to.equal(0);
      expect(await loan.allowance(signer.address, permit2)).to.equal(0);
      expect(await loan.allowance(signer.address, bundler)).to.equal(0);
      expect(await loan.allowance(signer.address, bbETH.address)).to.equal(0);
    });

    it("should redeem all bbETH with slippage + wstETH leverage into bbETH deposit & unwrap remaining WETH", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbETH.address,
      );

      const id = MAINNET_MARKETS.eth_wstEth.id;
      const loan = ERC20__factory.connect(wNative, signer);
      const collateral = ERC20__factory.connect(wstEth, signer);
      const erc4626 = MetaMorpho__factory.connect(bbETH.address, signer);

      const collateralAssets = parseUnits("100");
      const loanAssets = parseUnits("95");

      await deal(wstEth, signer.address, collateralAssets);
      await deal(wNative, signer.address, loanAssets);
      await collateral.approve(morpho, collateralAssets);
      await loan.approve(bbETH.address, loanAssets);
      await erc4626.deposit(loanAssets, signer.address);

      const { value: startData } = await bundlerService.simulationService.data;

      const shares = startData.getHolding(
        signer.address,
        bbETH.address,
      ).balance;

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "MetaMorpho_Withdraw",
            sender: signer.address,
            address: bbETH.address,
            args: {
              shares,
              owner: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_SupplyCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: signer.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: loanAssets,
              onBehalf: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: bbETH.address,
            args: {
              assets: loanAssets,
              owner: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          unwrapTokens: new Set([wstEth, wNative]),
          onBundleTx: donate(
            donator,
            wNative,
            parseUnits("1"),
            bbETH.address,
            morpho,
          ),
        },
      );

      expect(operations.length).to.equal(10);
      expect(bundle.requirements.txs.length).to.equal(0);
      expect(bundle.requirements.signatures.length).to.equal(3);

      expect(operations[0]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: bbETH.address,
        args: {
          amount: shares,
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: wstEth,
        args: {
          amount: collateralAssets,
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: wstEth,
        args: {
          amount: collateralAssets,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[3]).to.eql({
        type: "MetaMorpho_Withdraw",
        sender: bundler,
        address: bbETH.address,
        args: {
          shares,
          owner: signer.address,
          receiver: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: collateralAssets,
          onBehalf: signer.address,
        },
      });
      expect(operations[5]).to.eql({
        type: "Blue_SetAuthorization",
        sender: bundler,
        address: morpho,
        args: {
          owner: signer.address,
          isBundlerAuthorized: true,
        },
      });
      expect(operations[6]).to.eql({
        type: "Blue_Borrow",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: loanAssets,
          onBehalf: signer.address,
          receiver: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[7]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: bbETH.address,
        args: {
          assets: loanAssets,
          owner: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[8]).to.eql({
        type: "Erc20_Unwrap",
        sender: bundler,
        address: wNative,
        args: {
          amount: MaxUint256,
          receiver: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[9]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: NATIVE_ADDRESS,
        args: {
          amount: MaxUint256,
          from: bundler,
          to: signer.address,
        },
      });
    });

    it("should deleverage wstETH into MetaMorpho bbETH -> re7WETH arbitrage with slippage", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbETH.address,
        re7WETH.address,
      );

      const id = MAINNET_MARKETS.eth_wstEth.id;
      const blue = Morpho__factory.connect(morpho, signer);
      const loan = ERC20__factory.connect(wNative, signer);
      const collateral = ERC20__factory.connect(wstEth, signer);
      const erc4626 = MetaMorpho__factory.connect(bbETH.address, signer);

      const collateralAssets = parseUnits("100");
      const loanAssets = parseUnits("95");

      await deal(wstEth, signer.address, collateralAssets);
      await deal(wNative, signer.address, loanAssets);
      await collateral.approve(morpho, collateralAssets);
      await loan.approve(bbETH.address, loanAssets);
      await erc4626.deposit(loanAssets, signer.address);

      await blue.supplyCollateral(
        MAINNET_MARKETS.eth_wstEth,
        collateralAssets,
        signer.address,
        "0x",
      );
      await blue.borrow(
        MAINNET_MARKETS.eth_wstEth,
        loanAssets,
        0n,
        signer.address,
        signer.address,
      );

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "Blue_Repay",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: loanAssets / 2n,
              onBehalf: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_WithdrawCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets / 2n,
              onBehalf: signer.address,
              receiver: signer.address,
            },
          },
          {
            type: "MetaMorpho_Withdraw",
            sender: signer.address,
            address: bbETH.address,
            args: {
              assets: loanAssets / 2n,
              owner: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_Repay",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: loanAssets / 4n,
              onBehalf: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: re7WETH.address,
            args: {
              assets: loanAssets / 4n,
              owner: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          unwrapTokens: new Set([wNative]),
          onBundleTx: async (data) => {
            await donate(
              donator,
              wNative,
              parseUnits("0.5"),
              bbETH.address,
              morpho,
            )(data);
            await donate(
              signer,
              wNative,
              parseUnits("0.5"),
              re7WETH.address,
              morpho,
            )(data);
          },
        },
      );

      expect(operations.length).to.equal(10);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(3);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: wNative,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(_omit(operations[1], "args.amount")).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: bbETH.address,
        args: {
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: wNative,
        args: {
          amount: loanAssets / 2n,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[3]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: wNative,
        args: {
          amount: loanAssets / 2n,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_Repay",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: loanAssets / 2n,
          onBehalf: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[5]).to.eql({
        type: "Blue_SetAuthorization",
        sender: bundler,
        address: morpho,
        args: {
          owner: signer.address,
          isBundlerAuthorized: true,
        },
      });
      expect(operations[6]).to.eql({
        type: "Blue_WithdrawCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: collateralAssets / 2n,
          onBehalf: signer.address,
          receiver: signer.address,
        },
      });
      expect(operations[7]).to.eql({
        type: "MetaMorpho_Withdraw",
        sender: bundler,
        address: bbETH.address,
        args: {
          assets: loanAssets / 2n,
          owner: signer.address,
          receiver: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[8]).to.eql({
        type: "Blue_Repay",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: loanAssets / 4n,
          onBehalf: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[9]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: re7WETH.address,
        args: {
          assets: loanAssets / 4n,
          owner: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
    });

    it("should borrow USDC with shared liquidity and reallocation fee + unwrap remaining WETH", async () => {
      const steakUsdcMm = MetaMorpho__factory.connect(
        steakUsdc.address,
        signer,
      );
      const bbUsdcMm = MetaMorpho__factory.connect(bbUsdc.address, signer);
      const bbEthMm = MetaMorpho__factory.connect(bbETH.address, signer);

      const steakUsdcOwner = await ethers.getImpersonatedSigner(
        await steakUsdcMm.owner(),
      );
      const bbUsdcOwner = await ethers.getImpersonatedSigner(
        await bbUsdcMm.owner(),
      );

      const publicAllocatorContract = PublicAllocator__factory.connect(
        publicAllocator,
        signer,
      );

      await publicAllocatorContract
        .connect(steakUsdcOwner)
        .setFlowCaps(steakUsdc.address, [
          {
            id: MAINNET_MARKETS.usdc_wstEth.id,
            caps: {
              maxIn: parseUnits("10000", 6),
              maxOut: 0n,
            },
          },
          {
            id: MAINNET_MARKETS.usdc_wbtc.id,
            caps: {
              maxIn: 0n,
              maxOut: parseUnits("20000", 6), // Less than bbUsdc but more than maxIn.
            },
          },
        ]);

      const bbUsdcFee = parseEther("0.002");

      await publicAllocatorContract
        .connect(bbUsdcOwner)
        .setFee(bbUsdc.address, bbUsdcFee);
      await publicAllocatorContract
        .connect(bbUsdcOwner)
        .setFlowCaps(bbUsdc.address, [
          {
            id: MAINNET_MARKETS.usdc_wstEth.id,
            caps: {
              maxIn: parseUnits("1000000", 6),
              maxOut: 0n,
            },
          },
          {
            id: MAINNET_MARKETS.usdc_wbtc.id,
            caps: {
              maxIn: 0n,
              maxOut: parseUnits("100000", 6),
            },
          },
        ]);

      bundlerService.simulationService.metaMorphoService.addVaults(
        steakUsdc.address,
        bbUsdc.address,
        bbETH.address,
      );

      const { value: startData } = await bundlerService.simulationService.data;

      const collateral = ERC20__factory.connect(wstEth, signer);
      const loan = ERC20__factory.connect(usdc, signer);

      const id = MAINNET_MARKETS.usdc_wstEth.id;

      const collateralAssets = parseUnits("50000");
      const loanAssets = startData
        .getMarketPublicReallocations(id)
        .data.getMarket(id).liquidity;
      const depositAssets = parseUnits("50");
      await deal(wstEth, signer.address, collateralAssets);
      await deal(wNative, signer.address, depositAssets);
      await mine();

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: bbETH.address,
            args: {
              assets: depositAssets,
              owner: donator.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_SupplyCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: signer.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: loanAssets,
              onBehalf: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],

        {
          unwrapTokens: new Set([wNative]),
        },
      );

      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(3);

      expect(operations).to.eql([
        {
          type: "Erc20_Approve",
          sender: signer.address,
          address: wNative,
          args: {
            amount: MathLib.MAX_UINT_160,
            spender: permit2,
          },
        },
        {
          type: "Erc20_Permit",
          sender: signer.address,
          address: wstEth,
          args: {
            amount: collateralAssets,
            spender: bundler,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Permit2",
          sender: signer.address,
          address: wNative,
          args: {
            amount: depositAssets,
            spender: bundler,
            expiration: expect.bigint,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: wstEth,
          args: {
            amount: collateralAssets,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: signer.address,
          address: NATIVE_ADDRESS,
          args: {
            amount: bbUsdcFee,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Erc20_Transfer2",
          sender: bundler,
          address: wNative,
          args: {
            amount: depositAssets,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "MetaMorpho_Deposit",
          sender: bundler,
          address: bbETH.address,
          args: {
            assets: depositAssets,
            owner: donator.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets: collateralAssets,
            onBehalf: signer.address,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: bundler,
          address: morpho,
          args: {
            owner: signer.address,
            isBundlerAuthorized: true,
          },
        },
        {
          type: "MetaMorpho_PublicReallocate",
          sender: bundler,
          address: bbUsdc.address,
          args: {
            withdrawals: [
              {
                id: MAINNET_MARKETS.usdc_wbtc.id,
                assets: parseUnits("100000", 6),
              },
            ],
            supplyMarketId: id,
          },
        },
        {
          type: "MetaMorpho_PublicReallocate",
          sender: bundler,
          address: steakUsdc.address,
          args: {
            withdrawals: [
              {
                id: MAINNET_MARKETS.usdc_wbtc.id,
                assets: parseUnits("10000", 6),
              },
            ],
            supplyMarketId: id,
          },
        },
        {
          type: "Blue_Borrow",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets: loanAssets,
            onBehalf: signer.address,
            receiver: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);

      expect(await collateral.balanceOf(signer.address)).to.equal(0);
      expect(await loan.balanceOf(signer.address)).to.equal(loanAssets);
      expect(await collateral.balanceOf(donator.address)).to.equal(0);
      expect(await loan.balanceOf(donator.address)).to.equal(0);
      expect(await bbEthMm.maxWithdraw(signer.address)).to.equal(0);
      expect(await bbEthMm.maxWithdraw(donator.address)).to.equal(
        depositAssets - 1n,
      );

      expect(await collateral.allowance(signer.address, permit2)).to.equal(0);
      expect(await collateral.allowance(signer.address, bundler)).to.equal(0);
      expect(
        await collateral.allowance(signer.address, bbETH.address),
      ).to.equal(0);
      expect(await loan.allowance(signer.address, permit2)).to.equal(0);
      expect(await loan.allowance(signer.address, bundler)).to.equal(0);
      expect(await loan.allowance(signer.address, bbETH.address)).to.equal(0);
    });

    it("should close a WETH/wstETH position + unwrap wstEth + skim WETH", async () => {
      const market = MAINNET_MARKETS.eth_wstEth;
      bundlerService.simulationService.metaMorphoService.addMarkets(market.id);

      const blue = Morpho__factory.connect(morpho, signer);

      const collateralAmount = parseUnits("1");
      const borrowAmount = parseUnits("0.5");

      const wstEthContract = ERC20__factory.connect(wstEth, signer);
      const stEthContract = ERC20__factory.connect(stEth, signer);
      const wEthContract = ERC20__factory.connect(wNative, signer);

      await deal(wstEth, signer.address, collateralAmount);
      await deal(stEth, signer.address, 0n);

      await wstEthContract.approve(blue, MaxUint256);
      await blue.supplyCollateral(
        market,
        collateralAmount,
        signer.address,
        "0x",
      );

      await blue.borrow(
        market,
        borrowAmount,
        0n,
        signer.address,
        signer.address,
      );

      const extraWethAmount = parseEther("0.1");

      await deal(wNative, signer.address, borrowAmount + extraWethAmount);

      const { value: data } = await bundlerService.simulationService.data;

      const position = data.getAccrualPosition(signer.address, market.id);

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "Blue_Repay",
            sender: signer.address,
            address: morpho,
            args: {
              id: market.id,
              shares: position.borrowShares,
              onBehalf: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_WithdrawCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id: market.id,
              assets: position.collateral,
              receiver: signer.address,
              onBehalf: signer.address,
            },
          },
        ],
        { unwrapTokens: new Set([wstEth]) },
      );

      const repayAmount = MathLib.wMulUp(
        position.borrowAssets,
        MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
      );

      expect(operations.length).to.equal(9);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(2);
      expect(operations).eql([
        {
          type: "Erc20_Approve",
          sender: signer.address,
          address: wNative,
          args: {
            amount: MathLib.MAX_UINT_160,
            spender: permit2,
          },
        },
        {
          type: "Erc20_Permit2",
          sender: signer.address,
          address: wNative,
          args: {
            amount: repayAmount,
            spender: bundler,
            expiration: expect.bigint,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer2",
          sender: bundler,
          address: wNative,
          args: {
            amount: repayAmount,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Blue_Repay",
          sender: bundler,
          address: morpho,
          args: {
            id: market.id,
            shares: position.borrowShares,
            onBehalf: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: bundler,
          address: morpho,
          args: {
            owner: signer.address,
            isBundlerAuthorized: true,
          },
        },
        {
          type: "Blue_WithdrawCollateral",
          sender: bundler,
          address: morpho,
          args: {
            id: market.id,
            assets: position.collateral,
            receiver: bundler,
            onBehalf: signer.address,
          },
        },
        {
          type: "Erc20_Unwrap",
          address: wstEth,
          sender: bundler,
          args: {
            amount: MaxUint256,
            receiver: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Erc20_Transfer",
          address: wNative,
          sender: bundler,
          args: {
            amount: MaxUint256,
            from: bundler,
            to: signer.address,
          },
        },
        {
          type: "Erc20_Transfer",
          address: stEth,
          sender: bundler,
          args: {
            amount: MaxUint256,
            from: bundler,
            to: signer.address,
          },
        },
      ]);

      const chainPosition = await blue.position(market.id, signer.address);

      const [
        bundlerWstEthBalance,
        bundlerStEthBalance,
        bundlerWEthBalance,
        userStEthBalance,
        userWstEthBalance,
        userWEthBalance,
      ] = await Promise.all([
        wstEthContract.balanceOf(bundler),
        stEthContract.balanceOf(bundler),
        wEthContract.balanceOf(bundler),
        stEthContract.balanceOf(signer),
        wstEthContract.balanceOf(signer),
        wEthContract.balanceOf(signer),
      ]);

      const wstEthToken = data.getWrappedToken(wstEth);

      const latestBlock = (await signer.provider.getBlock("latest"))!;

      const accruedInterests =
        position.accrueInterest(BigInt(latestBlock.timestamp)).borrowAssets -
        borrowAmount;

      expect(chainPosition.collateral).to.equal(0);
      expect(chainPosition.supplyShares).to.equal(0);
      expect(chainPosition.borrowShares).to.equal(0);

      expect(bundlerWstEthBalance).to.equal(0);
      expect(bundlerStEthBalance).to.equal(1n); // 1 stETH is always remaining in the bundler
      expect(bundlerWEthBalance).to.equal(0);

      expect(userStEthBalance).to.approximately(
        wstEthToken.toUnwrappedExactAmountIn(collateralAmount, 0n),
        1n,
      );
      expect(userWstEthBalance).to.equal(0);
      expect(userWEthBalance).to.equal(extraWethAmount - accruedInterests); // we normally didn't experienced any slippage
    });
  });

  describe("with provider + address", () => {
    beforeEach(() => {
      bundlerService = new BundlerService(
        new SimulationService(
          new MetaMorphoService(
            new BlueService(new ChainService(ethers.provider), {
              users: [signer.address, donator.address],
            }),
          ),
        ),
      );
    });

    it("should fail if balance exceeded", async () => {
      const id = MAINNET_MARKETS.eth_wstEth.id;
      bundlerService.simulationService.metaMorphoService.addMarkets(id);

      const wBalance = parseUnits("5000");
      const balance = await ethers.provider.getBalance(signer.address);
      await deal(wNative, signer.address, wBalance);
      await mine();

      const assets = balance + wBalance + 1n;

      await expect(
        setupBundle(bundlerService, signer, [
          {
            type: "Blue_Supply",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets,
              onBehalf: signer.address,
            },
          },
        ]),
      ).to.be.rejectedWith(
        new Erc20Errors.InsufficientBalance(wNative, signer.address).message,
      );
    });

    it("should wrap + skim stETH if required with less wstETH than expected slippage", async () => {
      const id = MAINNET_MARKETS.eth_wstEth.id;
      bundlerService.simulationService.metaMorphoService.addMarkets(id);

      const blue = Morpho__factory.connect(morpho, signer);
      const erc20 = ERC20__factory.connect(stEth, signer);

      const wBalance = parseUnits("0.0005");
      // Dealing stETH does not work.
      await signer.sendTransaction({
        to: stEth,
        value: (await ethers.provider.getBalance(signer.address)) / 2n,
      });
      await deal(wstEth, signer.address, wBalance);
      await mine();

      const { value: data } = await bundlerService.simulationService.data;

      const { balance } = data.getHolding(signer.address, stEth);
      const { balance: bundlerBalance } = data.getHolding(bundler, stEth);

      const wstEthToken = data.getWrappedToken(wstEth);
      const assets =
        wstEthToken.toWrappedExactAmountIn(
          balance,
          DEFAULT_SLIPPAGE_TOLERANCE,
        ) + wBalance;

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "Erc20_Wrap",
          sender: signer.address,
          address: wstEth,
          args: {
            amount: balance,
            owner: bundler,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: signer.address,
          address: morpho,
          args: {
            id,
            assets,
            onBehalf: signer.address,
          },
        },
      ]);

      expect(operations.length).to.equal(8);
      expect(bundle.requirements.signatures).to.eql([]);

      expect(bundle.requirements.txs).to.eql([
        {
          type: "erc20Approve",
          tx: {
            to: wstEth,
            data: expect.string,
          },
          args: [wstEth, bundler, wBalance],
        },
        {
          type: "erc20Approve",
          tx: {
            to: stEth,
            data: expect.string,
          },
          args: [stEth, bundler, balance - bundlerBalance],
        },
      ]);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: stEth,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: wstEth,
        args: {
          amount: wBalance,
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: stEth,
        args: {
          amount: balance - bundlerBalance,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[3]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: wstEth,
        args: {
          amount: wBalance,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[4]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: stEth,
        args: {
          amount: balance - bundlerBalance,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[5]).to.eql({
        type: "Erc20_Wrap",
        sender: bundler,
        address: wstEth,
        args: {
          amount: balance,
          owner: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[6]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets,
          onBehalf: signer.address,
        },
      });
      expect(operations[7]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: wstEth,
        args: {
          amount: MaxUint256,
          from: bundler,
          to: signer.address,
        },
      });

      const position = await blue.position(id, signer.address);

      assertApproxEqAbs(await erc20.balanceOf(signer.address), 0n, 10n);
      expect(position.collateral).to.equal(assets);
      expect(position.supplyShares).to.equal(0);
      expect(position.borrowShares).to.equal(0);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, steakUsdc.address)).to.equal(
        0,
      );
    });

    it("should borrow with already enough collateral", async () => {
      const id = MAINNET_MARKETS.usdc_wstEth.id;
      bundlerService.simulationService.metaMorphoService.addMarkets(id);

      const blue = Morpho__factory.connect(morpho, signer);
      const erc20 = ERC20__factory.connect(wstEth, signer);

      const collateral = parseUnits("50");
      const assets = parseUnits("13000", 6);
      await deal(wstEth, signer.address, collateral);
      await erc20.approve(morpho, MaxUint256);
      await blue.supplyCollateral(
        MAINNET_MARKETS.usdc_wstEth,
        collateral,
        signer.address,
        "0x",
      );
      await mine();

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "Blue_Borrow",
          sender: signer.address,
          address: morpho,
          args: {
            id,
            assets,
            onBehalf: signer.address,
            receiver: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);

      expect(operations.length).to.equal(2);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(bundle.requirements.txs[0]!.type).to.equal(
        "morphoSetAuthorization",
      );
      expect(bundle.requirements.txs[0]!.args).to.eql([bundler, true]);

      expect(operations[0]).to.eql({
        type: "Blue_SetAuthorization",
        sender: bundler,
        address: morpho,
        args: {
          owner: signer.address,
          isBundlerAuthorized: true,
        },
      });
      expect(operations[1]).to.eql({
        type: "Blue_Borrow",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets,
          onBehalf: signer.address,
          receiver: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });

      const market = await blue.market(id);
      const position = await blue.position(id, signer.address);

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      expect(position.collateral).to.equal(collateral);
      expect(position.supplyShares).to.equal(0);
      expect(
        MarketUtils.toBorrowAssets(position.borrowShares, market),
      ).to.equal(assets + 1n);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, steakUsdc.address)).to.equal(
        0,
      );
    });

    it("should deposit steakUSDC via permit", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        steakUsdc.address,
      );

      const amount = parseUnits("1000000", 6);
      await deal(usdc, signer.address, amount);
      await mine();

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "MetaMorpho_Deposit",
          sender: signer.address,
          address: steakUsdc.address,
          args: {
            assets: amount,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);

      expect(operations.length).to.equal(3);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(bundle.requirements.txs[0]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[0]!.args).to.eql([usdc, bundler, amount]);

      expect(operations[0]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: usdc,
        args: {
          amount,
          spender: bundler,
          nonce: 1n,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: usdc,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[2]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: steakUsdc.address,
        args: {
          assets: amount,
          owner: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });

      const erc20 = ERC20__factory.connect(usdc, signer);
      const erc4626 = MetaMorpho__factory.connect(steakUsdc.address, signer);

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      expect(await erc4626.maxWithdraw(signer.address)).to.equal(amount - 1n);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, steakUsdc.address)).to.equal(
        0,
      );
    });

    it("should deposit bbUSDT via permit2", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbUSDT.address,
      );

      const erc20 = ERC20__factory.connect(usdt, signer);
      const erc4626 = MetaMorpho__factory.connect(bbUSDT.address, signer);

      const amount = parseUnits("1000000", 6);
      await deal(usdt, signer.address, amount);
      await erc20.approve(bundler, 1n);
      await mine();

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "MetaMorpho_Deposit",
          sender: signer.address,
          address: bbUSDT.address,
          args: {
            assets: amount,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);

      expect(operations.length).to.equal(4);
      expect(bundle.requirements.txs.length).to.equal(2);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(bundle.requirements.txs[0]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[0]!.args).to.eql([usdt, bundler, 0n]);
      expect(bundle.requirements.txs[1]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[1]!.args).to.eql([usdt, bundler, amount]);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: usdt,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: usdt,
        args: {
          amount,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: usdt,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[3]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: bbUSDT.address,
        args: {
          assets: amount,
          owner: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      expect(await erc4626.maxWithdraw(signer.address)).to.equal(amount - 1n);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, bbUSDT.address)).to.equal(0);
    });

    it("should simulate bbUSDT deposit into supply max collateral without skim", async () => {
      const blue = Morpho__factory.connect(morpho, signer);
      const erc20 = ERC20__factory.connect(usdt, signer);
      const erc4626 = MetaMorpho__factory.connect(bbUSDT.address, signer);

      const amount = parseUnits("1000000", 6);
      const expectedShares = await erc4626.convertToShares(amount);
      await deal(usdt, signer.address, amount);

      const marketConfig = new MarketConfig({
        loanToken: ZeroAddress,
        collateralToken: bbUSDT.address,
        lltv: 0n,
        oracle: ZeroAddress,
        irm: ZeroAddress,
      });
      await blue.createMarket(marketConfig);

      bundlerService.simulationService.metaMorphoService.addMarkets(
        marketConfig.id,
      );
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbUSDT.address,
      );

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "MetaMorpho_Deposit",
          sender: signer.address,
          address: bbUSDT.address,
          args: {
            assets: amount,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: signer.address,
          address: morpho,
          args: {
            id: marketConfig.id,
            assets: MaxUint256,
            onBehalf: signer.address,
          },
        },
      ]);

      expect(operations.length).to.equal(5);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(bundle.requirements.txs[0]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[0]!.args).to.eql([usdt, bundler, amount]);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: usdt,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: usdt,
        args: {
          amount,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: usdt,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[3]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: bbUSDT.address,
        args: {
          assets: amount,
          owner: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id: marketConfig.id,
          assets: MaxUint256,
          onBehalf: signer.address,
        },
      });

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      expect(await erc4626.balanceOf(signer.address)).to.equal(0);

      const { collateral } = await blue.position(
        marketConfig.id,
        signer.address,
      );
      assertApproxEqAbs(collateral, expectedShares, parseUnits("0.1"));

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, bbUSDT.address)).to.equal(0);
    });

    it("should simulate bbUSDT deposit into supply collateral with skim", async () => {
      const blue = Morpho__factory.connect(morpho, signer);
      const erc20 = ERC20__factory.connect(usdt, signer);
      const erc4626 = MetaMorpho__factory.connect(bbUSDT.address, signer);

      const amount = parseUnits("1000000", 6);
      const shares = parseEther("500000");
      const expectedShares = await erc4626.convertToShares(amount);
      await deal(usdt, signer.address, amount);

      const marketConfig = new MarketConfig({
        loanToken: ZeroAddress,
        collateralToken: bbUSDT.address,
        lltv: 0n,
        oracle: ZeroAddress,
        irm: ZeroAddress,
      });
      await blue.createMarket(marketConfig);

      bundlerService.simulationService.metaMorphoService.addMarkets(
        marketConfig.id,
      );
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbUSDT.address,
      );

      const { operations, bundle } = await setupBundle(bundlerService, signer, [
        {
          type: "MetaMorpho_Deposit",
          sender: signer.address,
          address: bbUSDT.address,
          args: {
            assets: amount,
            owner: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: signer.address,
          address: morpho,
          args: {
            id: marketConfig.id,
            assets: shares,
            onBehalf: signer.address,
          },
        },
      ]);

      expect(operations.length).to.equal(6);
      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(bundle.requirements.txs[0]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[0]!.args).to.eql([usdt, bundler, amount]);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: usdt,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: usdt,
        args: {
          amount,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: usdt,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[3]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: bbUSDT.address,
        args: {
          assets: amount,
          owner: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id: marketConfig.id,
          assets: shares,
          onBehalf: signer.address,
        },
      });
      expect(operations[5]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: bbUSDT.address,
        args: {
          amount: MaxUint256,
          from: bundler,
          to: signer.address,
        },
      });

      expect(await erc20.balanceOf(signer.address)).to.equal(0);
      assertApproxEqAbs(
        await erc4626.balanceOf(signer.address),
        expectedShares - shares,
        parseUnits("0.1"),
      );

      const { collateral } = await blue.position(
        marketConfig.id,
        signer.address,
      );
      expect(collateral).to.equal(shares);

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, bbUSDT.address)).to.equal(0);
    });

    it("should simulate bbETH mint on behalf with slippage & unwrap remaining WETH", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbETH.address,
      );

      const erc20 = ERC20__factory.connect(wNative, signer);
      const erc4626 = MetaMorpho__factory.connect(bbETH.address, signer);

      const shares = parseUnits("99");
      const assets = await erc4626.previewMint(shares);
      await deal(wNative, signer.address, assets + parseUnits("10"));

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: bbETH.address,
            args: {
              shares,
              owner: donator.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],

        {
          onBundleTx: donate(
            donator,
            wNative,
            parseUnits("1"),
            bbETH.address,
            morpho,
          ),
        },
      );

      expect(bundle.requirements.txs.length).to.equal(1);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(operations).to.eql([
        {
          type: "Erc20_Approve",
          sender: signer.address,
          address: wNative,
          args: {
            amount: MathLib.MAX_UINT_160,
            spender: permit2,
          },
        },
        {
          type: "Erc20_Permit2",
          sender: signer.address,
          address: wNative,
          args: {
            amount: expect.bigint,
            spender: bundler,
            expiration: expect.bigint,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer2",
          sender: bundler,
          address: wNative,
          args: {
            amount: expect.bigint,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "MetaMorpho_Deposit",
          sender: bundler,
          address: bbETH.address,
          args: {
            shares,
            owner: donator.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: wNative,
          args: {
            amount: MaxUint256,
            from: bundler,
            to: signer.address,
          },
        },
      ]);

      expect(await erc20.balanceOf(donator.address)).to.equal(0);
      expect(await erc20.balanceOf(bundler)).to.equal(0);
      expect(await erc4626.maxWithdraw(signer.address)).to.equal(0);
      assertApproxEqRel(
        await erc4626.maxWithdraw(donator.address),
        assets - 1n,
        DEFAULT_SLIPPAGE_TOLERANCE,
      );
      assertApproxEqAbs(
        await erc20.balanceOf(signer.address),
        parseUnits("10"),
        parseUnits("0.025"),
      );

      expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
      expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
      expect(await erc20.allowance(signer.address, bbETH.address)).to.equal(0);
    });

    it("should fail bbETH mint on behalf with slippage exceeded", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbETH.address,
      );

      const erc4626 = MetaMorpho__factory.connect(bbETH.address, signer);

      const shares = parseUnits("99");
      const assets = await erc4626.previewMint(shares);
      await deal(wNative, signer.address, assets + parseUnits("10"));

      await expect(
        setupBundle(
          bundlerService,
          signer,
          [
            {
              type: "MetaMorpho_Deposit",
              sender: signer.address,
              address: bbETH.address,
              args: {
                shares,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ],

          {
            unwrapTokens: new Set([wNative]),
            onBundleTx: donate(
              donator,
              wNative,
              parseUnits("10"),
              bbETH.address,
              morpho,
            ),
          },
        ),
      ).to.be.reverted;
    });

    it("should borrow USDC against wstETH into steakUSDC half deposit on behalf with slippage & unwrap remaining wstETH", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        steakUsdc.address,
      );

      const { value: startData } = await bundlerService.simulationService.data;

      const collateral = ERC20__factory.connect(wstEth, signer);
      const loan = ERC20__factory.connect(usdc, signer);
      const erc4626 = MetaMorpho__factory.connect(steakUsdc.address, signer);

      const id = MAINNET_MARKETS.usdc_wstEth.id;
      const market = startData.getMarket(id);

      const collateralAssets = parseUnits("100");
      const loanShares = parseUnits("50000", 12);
      const loanAssets = market.toBorrowAssets(loanShares);
      await deal(wstEth, signer.address, collateralAssets);
      await mine();

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "Blue_SupplyCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: signer.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              shares: loanShares,
              onBehalf: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: steakUsdc.address,
            args: {
              assets: loanAssets / 2n,
              owner: donator.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          unwrapTokens: new Set([wstEth]),
          onBundleTx: donate(
            donator,
            usdc,
            parseUnits("1000", 6),
            steakUsdc.address,
            morpho,
          ),
        },
      );

      expect(operations.length).to.equal(7);
      expect(bundle.requirements.txs.length).to.equal(2);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(bundle.requirements.txs[0]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[0]!.args).to.eql([
        wstEth,
        bundler,
        collateralAssets,
      ]);
      expect(bundle.requirements.txs[1]!.type).to.equal(
        "morphoSetAuthorization",
      );
      expect(bundle.requirements.txs[1]!.args).to.eql([bundler, true]);

      expect(operations[0]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: wstEth,
        args: {
          amount: collateralAssets,
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: wstEth,
        args: {
          amount: collateralAssets,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[2]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: collateralAssets,
          onBehalf: signer.address,
        },
      });
      expect(operations[3]).to.eql({
        type: "Blue_SetAuthorization",
        sender: bundler,
        address: morpho,
        args: {
          owner: signer.address,
          isBundlerAuthorized: true,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_Borrow",
        sender: bundler,
        address: morpho,
        args: {
          id,
          shares: loanShares,
          onBehalf: signer.address,
          receiver: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[5]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: steakUsdc.address,
        args: {
          assets: loanAssets / 2n,
          owner: donator.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[6]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: usdc,
        args: {
          amount: MaxUint256,
          from: bundler,
          to: signer.address,
        },
      });

      expect(await collateral.balanceOf(signer.address)).to.equal(0);
      assertApproxEqRel(
        await loan.balanceOf(signer.address),
        loanAssets / 2n,
        DEFAULT_SLIPPAGE_TOLERANCE,
      );
      expect(await collateral.balanceOf(donator.address)).to.equal(0);
      expect(await loan.balanceOf(donator.address)).to.equal(0);
      expect(await erc4626.maxWithdraw(signer.address)).to.equal(0);
      assertApproxEqRel(
        await erc4626.maxWithdraw(donator.address),
        loanAssets / 2n,
        DEFAULT_SLIPPAGE_TOLERANCE,
      );

      expect(await collateral.allowance(signer.address, permit2)).to.equal(0);
      expect(await collateral.allowance(signer.address, bundler)).to.equal(0);
      expect(
        await collateral.allowance(signer.address, bbETH.address),
      ).to.equal(0);
      expect(await loan.allowance(signer.address, permit2)).to.equal(0);
      expect(await loan.allowance(signer.address, bundler)).to.equal(0);
      expect(await loan.allowance(signer.address, bbETH.address)).to.equal(0);
    });

    it("should redeem all bbETH with slippage + wstETH leverage into bbETH deposit & unwrap remaining WETH", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbETH.address,
      );

      const id = MAINNET_MARKETS.eth_wstEth.id;
      const loan = ERC20__factory.connect(wNative, signer);
      const collateral = ERC20__factory.connect(wstEth, signer);
      const erc4626 = MetaMorpho__factory.connect(bbETH.address, signer);

      const collateralAssets = parseUnits("100");
      const loanAssets = parseUnits("95");

      await deal(wstEth, signer.address, collateralAssets);
      await deal(wNative, signer.address, loanAssets);
      await collateral.approve(morpho, collateralAssets);
      await loan.approve(bbETH.address, loanAssets);
      await erc4626.deposit(loanAssets, signer.address);

      const { value: startData } = await bundlerService.simulationService.data;

      const shares = startData.getHolding(
        signer.address,
        bbETH.address,
      ).balance;

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "MetaMorpho_Withdraw",
            sender: signer.address,
            address: bbETH.address,
            args: {
              shares,
              owner: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_SupplyCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: signer.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: loanAssets,
              onBehalf: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: bbETH.address,
            args: {
              assets: loanAssets,
              owner: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          unwrapTokens: new Set([wstEth, wNative]),
          onBundleTx: donate(
            donator,
            wNative,
            parseUnits("1"),
            bbETH.address,
            morpho,
          ),
        },
      );

      expect(operations.length).to.equal(10);
      expect(bundle.requirements.txs.length).to.equal(3);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(bundle.requirements.txs[0]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[0]!.args).to.eql([
        bbETH.address,
        bundler,
        shares,
      ]);
      expect(bundle.requirements.txs[1]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[1]!.args).to.eql([
        wstEth,
        bundler,
        collateralAssets,
      ]);
      expect(bundle.requirements.txs[2]!.type).to.equal(
        "morphoSetAuthorization",
      );
      expect(bundle.requirements.txs[2]!.args).to.eql([bundler, true]);

      expect(operations[0]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: bbETH.address,
        args: {
          amount: shares,
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[1]).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: wstEth,
        args: {
          amount: collateralAssets,
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: wstEth,
        args: {
          amount: collateralAssets,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[3]).to.eql({
        type: "MetaMorpho_Withdraw",
        sender: bundler,
        address: bbETH.address,
        args: {
          shares,
          owner: signer.address,
          receiver: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_SupplyCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: collateralAssets,
          onBehalf: signer.address,
        },
      });
      expect(operations[5]).to.eql({
        type: "Blue_SetAuthorization",
        sender: bundler,
        address: morpho,
        args: {
          owner: signer.address,
          isBundlerAuthorized: true,
        },
      });
      expect(operations[6]).to.eql({
        type: "Blue_Borrow",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: loanAssets,
          onBehalf: signer.address,
          receiver: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[7]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: bbETH.address,
        args: {
          assets: loanAssets,
          owner: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[8]).to.eql({
        type: "Erc20_Unwrap",
        sender: bundler,
        address: wNative,
        args: {
          amount: MaxUint256,
          receiver: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[9]).to.eql({
        type: "Erc20_Transfer",
        sender: bundler,
        address: NATIVE_ADDRESS,
        args: {
          amount: MaxUint256,
          from: bundler,
          to: signer.address,
        },
      });
    });

    it("should deleverage wstETH into MetaMorpho bbETH -> re7WETH arbitrage with slippage", async () => {
      bundlerService.simulationService.metaMorphoService.addVaults(
        bbETH.address,
        re7WETH.address,
      );

      const id = MAINNET_MARKETS.eth_wstEth.id;
      const blue = Morpho__factory.connect(morpho, signer);
      const loan = ERC20__factory.connect(wNative, signer);
      const collateral = ERC20__factory.connect(wstEth, signer);
      const erc4626 = MetaMorpho__factory.connect(bbETH.address, signer);

      const collateralAssets = parseUnits("100");
      const loanAssets = parseUnits("95");

      await deal(wstEth, signer.address, collateralAssets);
      await deal(wNative, signer.address, loanAssets);
      await collateral.approve(morpho, collateralAssets);
      await loan.approve(bbETH.address, loanAssets);
      await erc4626.deposit(loanAssets, signer.address);

      await blue.supplyCollateral(
        MAINNET_MARKETS.eth_wstEth,
        collateralAssets,
        signer.address,
        "0x",
      );
      await blue.borrow(
        MAINNET_MARKETS.eth_wstEth,
        loanAssets,
        0n,
        signer.address,
        signer.address,
      );
      await mine();

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "Blue_Repay",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: loanAssets / 2n,
              onBehalf: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_WithdrawCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets / 2n,
              onBehalf: signer.address,
              receiver: signer.address,
            },
          },
          {
            type: "MetaMorpho_Withdraw",
            sender: signer.address,
            address: bbETH.address,
            args: {
              assets: loanAssets / 2n,
              owner: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_Repay",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: loanAssets / 4n,
              onBehalf: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: re7WETH.address,
            args: {
              assets: loanAssets / 4n,
              owner: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          unwrapTokens: new Set([wNative]),
          onBundleTx: async (data) => {
            await donate(
              donator,
              wNative,
              parseUnits("0.5"),
              bbETH.address,
              morpho,
            )(data);
            await donate(
              signer,
              wNative,
              parseUnits("0.5"),
              re7WETH.address,
              morpho,
            )(data);
          },
        },
      );

      expect(operations.length).to.equal(10);
      expect(bundle.requirements.txs.length).to.equal(3);
      expect(bundle.requirements.signatures.length).to.equal(0);

      expect(bundle.requirements.txs[0]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[0]!.args).to.eql([
        bbETH.address,
        bundler,
        expect.bigint,
      ]);
      expect(bundle.requirements.txs[1]!.type).to.equal("erc20Approve");
      expect(bundle.requirements.txs[1]!.args).to.eql([
        wNative,
        bundler,
        loanAssets / 2n,
      ]);
      expect(bundle.requirements.txs[2]!.type).to.equal(
        "morphoSetAuthorization",
      );
      expect(bundle.requirements.txs[2]!.args).to.eql([bundler, true]);

      expect(operations[0]).to.eql({
        type: "Erc20_Approve",
        sender: signer.address,
        address: wNative,
        args: {
          amount: MathLib.MAX_UINT_160,
          spender: permit2,
        },
      });
      expect(_omit(operations[1], "args.amount")).to.eql({
        type: "Erc20_Permit",
        sender: signer.address,
        address: bbETH.address,
        args: {
          spender: bundler,
          nonce: 0n,
        },
      });
      expect(operations[2]).to.eql({
        type: "Erc20_Permit2",
        sender: signer.address,
        address: wNative,
        args: {
          amount: loanAssets / 2n,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      });
      expect(operations[3]).to.eql({
        type: "Erc20_Transfer2",
        sender: bundler,
        address: wNative,
        args: {
          amount: loanAssets / 2n,
          from: signer.address,
          to: bundler,
        },
      });
      expect(operations[4]).to.eql({
        type: "Blue_Repay",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: loanAssets / 2n,
          onBehalf: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[5]).to.eql({
        type: "Blue_SetAuthorization",
        sender: bundler,
        address: morpho,
        args: {
          owner: signer.address,
          isBundlerAuthorized: true,
        },
      });
      expect(operations[6]).to.eql({
        type: "Blue_WithdrawCollateral",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: collateralAssets / 2n,
          onBehalf: signer.address,
          receiver: signer.address,
        },
      });
      expect(operations[7]).to.eql({
        type: "MetaMorpho_Withdraw",
        sender: bundler,
        address: bbETH.address,
        args: {
          assets: loanAssets / 2n,
          owner: signer.address,
          receiver: bundler,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[8]).to.eql({
        type: "Blue_Repay",
        sender: bundler,
        address: morpho,
        args: {
          id,
          assets: loanAssets / 4n,
          onBehalf: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
      expect(operations[9]).to.eql({
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: re7WETH.address,
        args: {
          assets: loanAssets / 4n,
          owner: signer.address,
          slippage: DEFAULT_SLIPPAGE_TOLERANCE,
        },
      });
    });

    it("should borrow USDC with shared liquidity and reallocation fee + unwrap remaining WETH", async () => {
      const steakUsdcMm = MetaMorpho__factory.connect(
        steakUsdc.address,
        signer,
      );
      const bbUsdcMm = MetaMorpho__factory.connect(bbUsdc.address, signer);
      const bbEthMm = MetaMorpho__factory.connect(bbETH.address, signer);

      const steakUsdcOwner = await ethers.getImpersonatedSigner(
        await steakUsdcMm.owner(),
      );
      const bbUsdcOwner = await ethers.getImpersonatedSigner(
        await bbUsdcMm.owner(),
      );

      const publicAllocatorContract = PublicAllocator__factory.connect(
        publicAllocator,
        signer,
      );

      await publicAllocatorContract
        .connect(steakUsdcOwner)
        .setFlowCaps(steakUsdc.address, [
          {
            id: MAINNET_MARKETS.usdc_wstEth.id,
            caps: {
              maxIn: parseUnits("10000", 6),
              maxOut: 0n,
            },
          },
          {
            id: MAINNET_MARKETS.usdc_wbtc.id,
            caps: {
              maxIn: 0n,
              maxOut: parseUnits("20000", 6), // Less than bbUsdc but more than maxIn.
            },
          },
        ]);

      const bbUsdcFee = parseEther("0.002");

      await publicAllocatorContract
        .connect(bbUsdcOwner)
        .setFee(bbUsdc.address, bbUsdcFee);
      await publicAllocatorContract
        .connect(bbUsdcOwner)
        .setFlowCaps(bbUsdc.address, [
          {
            id: MAINNET_MARKETS.usdc_wstEth.id,
            caps: {
              maxIn: parseUnits("1000000", 6),
              maxOut: 0n,
            },
          },
          {
            id: MAINNET_MARKETS.usdc_wbtc.id,
            caps: {
              maxIn: 0n,
              maxOut: parseUnits("100000", 6),
            },
          },
        ]);

      bundlerService.simulationService.metaMorphoService.addVaults(
        steakUsdc.address,
        bbUsdc.address,
        bbETH.address,
      );

      const { value: startData } = await bundlerService.simulationService.data;

      const collateral = ERC20__factory.connect(wstEth, signer);
      const loan = ERC20__factory.connect(usdc, signer);

      const id = MAINNET_MARKETS.usdc_wstEth.id;

      const collateralAssets = parseUnits("50000");
      const loanAssets = startData
        .getMarketPublicReallocations(id)
        .data.getMarket(id).liquidity;
      const depositAssets = parseUnits("50");
      await deal(wstEth, signer.address, collateralAssets);
      await deal(wNative, signer.address, depositAssets);
      await mine();

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "MetaMorpho_Deposit",
            sender: signer.address,
            address: bbETH.address,
            args: {
              assets: depositAssets,
              owner: donator.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_SupplyCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: signer.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: signer.address,
            address: morpho,
            args: {
              id,
              assets: loanAssets,
              onBehalf: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        { unwrapTokens: new Set([wNative]) },
      );

      expect(bundle.requirements).to.eql({
        txs: [
          {
            type: "erc20Approve",
            args: [wstEth, bundler, collateralAssets],
            tx: expect.anything,
          },
          {
            type: "erc20Approve",
            args: [wNative, bundler, depositAssets],
            tx: expect.anything,
          },
          {
            type: "morphoSetAuthorization",
            args: [bundler, true],
            tx: expect.anything,
          },
        ],
        signatures: [],
      });

      expect(operations).to.eql([
        {
          type: "Erc20_Approve",
          sender: signer.address,
          address: wNative,
          args: {
            amount: MathLib.MAX_UINT_160,
            spender: permit2,
          },
        },
        {
          type: "Erc20_Permit",
          sender: signer.address,
          address: wstEth,
          args: {
            amount: collateralAssets,
            spender: bundler,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Permit2",
          sender: signer.address,
          address: wNative,
          args: {
            amount: depositAssets,
            spender: bundler,
            expiration: expect.bigint,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: wstEth,
          args: {
            amount: collateralAssets,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: signer.address,
          address: NATIVE_ADDRESS,
          args: {
            amount: bbUsdcFee,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Erc20_Transfer2",
          sender: bundler,
          address: wNative,
          args: {
            amount: depositAssets,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "MetaMorpho_Deposit",
          sender: bundler,
          address: bbETH.address,
          args: {
            assets: depositAssets,
            owner: donator.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets: collateralAssets,
            onBehalf: signer.address,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: bundler,
          address: morpho,
          args: {
            owner: signer.address,
            isBundlerAuthorized: true,
          },
        },
        {
          type: "MetaMorpho_PublicReallocate",
          sender: bundler,
          address: bbUsdc.address,
          args: {
            withdrawals: [
              {
                id: MAINNET_MARKETS.usdc_wbtc.id,
                assets: parseUnits("100000", 6),
              },
            ],
            supplyMarketId: id,
          },
        },
        {
          type: "MetaMorpho_PublicReallocate",
          sender: bundler,
          address: steakUsdc.address,
          args: {
            withdrawals: [
              {
                id: MAINNET_MARKETS.usdc_wbtc.id,
                assets: parseUnits("10000", 6),
              },
            ],
            supplyMarketId: id,
          },
        },
        {
          type: "Blue_Borrow",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets: loanAssets,
            onBehalf: signer.address,
            receiver: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);

      expect(await collateral.balanceOf(signer.address)).to.equal(0);
      expect(await loan.balanceOf(signer.address)).to.equal(loanAssets);
      expect(await collateral.balanceOf(donator.address)).to.equal(0);
      expect(await loan.balanceOf(donator.address)).to.equal(0);
      expect(await bbEthMm.maxWithdraw(signer.address)).to.equal(0);
      expect(await bbEthMm.maxWithdraw(donator.address)).to.equal(
        depositAssets - 1n,
      );

      expect(await collateral.allowance(signer.address, permit2)).to.equal(0);
      expect(await collateral.allowance(signer.address, bundler)).to.equal(0);
      expect(
        await collateral.allowance(signer.address, bbETH.address),
      ).to.equal(0);
      expect(await loan.allowance(signer.address, permit2)).to.equal(0);
      expect(await loan.allowance(signer.address, bundler)).to.equal(0);
      expect(await loan.allowance(signer.address, bbETH.address)).to.equal(0);
    });

    it("should close a WETH/wstETH position + unwrap wstEth + skim WETH", async () => {
      const market = MAINNET_MARKETS.eth_wstEth;
      bundlerService.simulationService.metaMorphoService.addMarkets(market.id);

      const blue = Morpho__factory.connect(morpho, signer);

      const collateralAmount = parseUnits("1");
      const borrowAmount = parseUnits("0.5");

      const wstEthContract = ERC20__factory.connect(wstEth, signer);
      const stEthContract = ERC20__factory.connect(stEth, signer);
      const wEthContract = ERC20__factory.connect(wNative, signer);

      await deal(wstEth, signer.address, collateralAmount);
      await deal(stEth, signer.address, 0n);

      await wstEthContract.approve(blue, MaxUint256);
      await blue.supplyCollateral(
        market,
        collateralAmount,
        signer.address,
        "0x",
      );

      await blue.borrow(
        market,
        borrowAmount,
        0n,
        signer.address,
        signer.address,
      );

      const extraWethAmount = parseEther("0.1");

      await deal(wNative, signer.address, borrowAmount + extraWethAmount);

      const { value: data } = await bundlerService.simulationService.data;

      const position = data.getAccrualPosition(signer.address, market.id);

      const { operations, bundle } = await setupBundle(
        bundlerService,
        signer,
        [
          {
            type: "Blue_Repay",
            sender: signer.address,
            address: morpho,
            args: {
              id: market.id,
              shares: position.borrowShares,
              onBehalf: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Blue_WithdrawCollateral",
            sender: signer.address,
            address: morpho,
            args: {
              id: market.id,
              assets: position.collateral,
              receiver: signer.address,
              onBehalf: signer.address,
            },
          },
        ],
        { unwrapTokens: new Set([wstEth]) },
      );

      const repayAmount = MathLib.wMulUp(
        position.borrowAssets,
        MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
      );

      expect(operations.length).to.equal(9);
      expect(bundle.requirements.txs.length).to.equal(2);
      expect(bundle.requirements.signatures.length).to.equal(0);
      expect(operations).eql([
        {
          type: "Erc20_Approve",
          sender: signer.address,
          address: wNative,
          args: {
            amount: MathLib.MAX_UINT_160,
            spender: permit2,
          },
        },
        {
          type: "Erc20_Permit2",
          sender: signer.address,
          address: wNative,
          args: {
            amount: repayAmount,
            spender: bundler,
            expiration: expect.bigint,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer2",
          sender: bundler,
          address: wNative,
          args: {
            amount: repayAmount,
            from: signer.address,
            to: bundler,
          },
        },
        {
          type: "Blue_Repay",
          sender: bundler,
          address: morpho,
          args: {
            id: market.id,
            shares: position.borrowShares,
            onBehalf: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: bundler,
          address: morpho,
          args: {
            owner: signer.address,
            isBundlerAuthorized: true,
          },
        },
        {
          type: "Blue_WithdrawCollateral",
          sender: bundler,
          address: morpho,
          args: {
            id: market.id,
            assets: position.collateral,
            receiver: bundler,
            onBehalf: signer.address,
          },
        },
        {
          type: "Erc20_Unwrap",
          address: wstEth,
          sender: bundler,
          args: {
            amount: MaxUint256,
            receiver: signer.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
        {
          type: "Erc20_Transfer",
          address: wNative,
          sender: bundler,
          args: {
            amount: MaxUint256,
            from: bundler,
            to: signer.address,
          },
        },
        {
          type: "Erc20_Transfer",
          address: stEth,
          sender: bundler,
          args: {
            amount: MaxUint256,
            from: bundler,
            to: signer.address,
          },
        },
      ]);

      const chainPosition = await blue.position(market.id, signer.address);

      const [
        bundlerWstEthBalance,
        bundlerStEthBalance,
        bundlerWEthBalance,
        userStEthBalance,
        userWstEthBalance,
        userWEthBalance,
      ] = await Promise.all([
        wstEthContract.balanceOf(bundler),
        stEthContract.balanceOf(bundler),
        wEthContract.balanceOf(bundler),
        stEthContract.balanceOf(signer),
        wstEthContract.balanceOf(signer),
        wEthContract.balanceOf(signer),
      ]);

      const wstEthToken = data.getWrappedToken(wstEth);

      const latestBlock = (await signer.provider.getBlock("latest"))!;

      const accruedInterests =
        position.accrueInterest(BigInt(latestBlock.timestamp)).borrowAssets -
        borrowAmount;

      expect(chainPosition.collateral).to.equal(0);
      expect(chainPosition.supplyShares).to.equal(0);
      expect(chainPosition.borrowShares).to.equal(0);

      expect(bundlerWstEthBalance).to.equal(0);
      expect(bundlerStEthBalance).to.equal(1n); // 1 stETH is always remaining in the bundler
      expect(bundlerWEthBalance).to.equal(0);

      expect(userStEthBalance).to.approximately(
        wstEthToken.toUnwrappedExactAmountIn(collateralAmount, 0n),
        1n,
      );
      expect(userWstEthBalance).to.equal(0);
      expect(userWEthBalance).to.equal(extraWethAmount - accruedInterests); // we normally didn't experienced any slippage
    });
  });
});
