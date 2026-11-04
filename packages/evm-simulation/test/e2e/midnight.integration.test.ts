import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { midnightAbi } from "@morpho-org/morpho-sdk/midnight/abis";
import { Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
import { MarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import { type E2eScenario, getE2eAsset } from "@morpho-org/morpho-test";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { ethAddress, isAddressEqual, maxUint256, parseEther } from "viem";
import { expect } from "vitest";
import {
  E2eMidnightSimulationMismatchError,
  sendE2eMidnightSimulated,
} from "./midnight.js";
import { describeE2e } from "./setup.js";

const scenario: E2eScenario = {
  name: "midnightMultiWalletSimulation",
  requires: ["midnight", "midnightBundlesV2", "setterRatifier"],
};

describeE2e(scenario, (test, { chainId }) => {
  for (const mode of ["erc20", "native", "divergence"] as const) {
    test(`${mode === "native" ? "native where fork fees are reconstructable" : mode}: both wallets' tracked changes match the entire simulated bundle`, async ({
      client,
    }) => {
      const maker = E2E_MIDNIGHT_WALLETS.A;
      const taker = E2E_MIDNIGHT_WALLETS.B;
      const units = parseEther("1");
      const collateralAssets = parseEther("10");
      const { params, marketData } = await createE2eMidnightMarket(
        client,
        chainId,
      );
      await fundE2eMidnightWallets(client, {
        market: params,
        wallets: { A: { collateralAssets }, B: { loanAssets: units } },
      });
      const wallets = [maker, taker];
      const oracleCode =
        mode === "native"
          ? await client.getCode({
              address: "0x420000000000000000000000000000000000000F",
            })
          : undefined;
      // OP-stack Anvil fees are absent from receipts and getL1Fee does not reproduce them.
      const trackNative =
        mode === "native" &&
        !getE2eAsset(chainId).requiresInstall &&
        (oracleCode == null || oracleCode === "0x");
      const tokens = [
        params.loanToken,
        params.collateralParams[0]!.token,
        ...(trackNative ? [ethAddress] : []),
      ];
      const midnight = client
        .extend(morphoViemExtension({ supportSignature: false }))
        .morpho.midnight(chainId);
      const supply = midnight.supplyCollateral({
        accountAddress: maker,
        marketData,
        collateralAssets,
      });
      const supplied = await sendE2eMidnightSimulated(client, {
        chainId,
        account: maker,
        output: supply,
        wallets,
        tokens,
        limits: { market: MarketUtils.toStruct(params) },
        gasPrice: mode === "native" ? 1n : undefined,
      });
      expect(supplied.result.simulationTxs.length).toBeGreaterThan(1);
      expect(
        supplied.result.simulationTxs.every((tx) =>
          isAddressEqual(tx.from, maker),
        ),
      ).toBe(true);
      const tree = Tree.create([
        Offer.create({
          market: params,
          buy: false,
          maker,
          expiry: params.maturity,
          tick: 5_000n,
          ratifier: getChainAddress(chainId, "setterRatifier"),
          maxUnits: 2n * units,
        }),
      ]);
      await postE2eSetterTree(client, { chainId, maker, tree });
      const take = midnight.takeLend({
        marketData,
        accountAddress: taker,
        target: { type: "units", units, maxBuyerAssets: units },
        takeableOffers: getE2eTakeableOffers({ tree, units }),
        maxContinuousFee: maxUint256,
        deadline: Time.timestamp() + 600n,
        ...(trackNative ? { nativeAmount: units } : {}),
      });
      const send = () =>
        sendE2eMidnightSimulated(client, {
          chainId,
          account: taker,
          output: take,
          wallets,
          tokens,
          gasPrice: mode === "native" ? 1n : undefined,
          beforeSend:
            mode === "divergence"
              ? async () => {
                  const token = params.collateralParams[0]!.token;
                  const amount = await client.balanceOf({
                    erc20: token,
                    owner: maker,
                  });
                  await client.deal({
                    erc20: token,
                    account: maker,
                    amount: amount + 1n,
                  });
                }
              : undefined,
        });
      if (mode === "divergence") {
        await expect(send()).rejects.toMatchObject({
          name: E2eMidnightSimulationMismatchError.name,
          mismatches: [
            {
              account: maker,
              token: params.collateralParams[0]!.token,
              expected: 0n,
              actual: 1n,
            },
          ],
        });
      } else {
        const { result, gasFees } = await send();
        expect(result.simulationTxs.length).toBeGreaterThan(1);
        expect(
          result.simulationTxs.every((tx) => isAddressEqual(tx.from, taker)),
        ).toBe(true);
        expect(result.verification.operations[0]?.operation).toBe(
          "midnightTakeLend",
        );
        if (trackNative) {
          expect(gasFees).toBeGreaterThan(0n);
          expect(
            result.assetChanges
              .find((entry) => isAddressEqual(entry.account, taker))
              ?.changes.some(
                (change) =>
                  isAddressEqual(change.token, ethAddress) && change.diff < 0n,
              ),
          ).toBe(true);
        }
      }
      await expect(
        client.readContract({
          address: getChainAddress(chainId, "midnight"),
          abi: midnightAbi,
          functionName: "credit",
          args: [MarketUtils.toId(params), taker],
        }),
      ).resolves.toBe(units);
    });
  }
});
