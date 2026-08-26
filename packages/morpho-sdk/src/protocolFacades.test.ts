import {
  blueMarketParamsAbi,
  midnightEcrecoverRatifierAbi,
} from "@morpho-org/morpho-sdk/abis";
import { addresses } from "@morpho-org/morpho-sdk/addresses";
import { marketParamsAbi as rawBlueMarketParamsAbi } from "@morpho-org/morpho-sdk/blue/abis";
import { addresses as rawBlueAddresses } from "@morpho-org/morpho-sdk/blue/addresses";
import {
  ERC20_ALLOWANCE_RECIPIENTS as rawBlueErc20AllowanceRecipients,
  LIQUIDATION_CURSOR as rawBlueLiquidationCursor,
} from "@morpho-org/morpho-sdk/blue/constants";
import { Market as RawBlueMarket } from "@morpho-org/morpho-sdk/blue/entities";
import {
  DivisionByZeroError as RawBlueDivisionByZeroError,
  InvalidBitLengthError as RawBlueInvalidBitLengthError,
  InvalidMarketParamsError as RawBlueInvalidMarketParamsError,
  InvalidPermitDomainChainIdError as RawBlueInvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError as RawBlueInvalidPermitDomainVerifyingContractError,
  RegistryValueAlreadyRegisteredError as RawBlueRegistryValueAlreadyRegisteredError,
  UnknownMarketAllocationError as RawBlueUnknownMarketAllocationError,
  UnsupportedPermitDomainExtensionsError as RawBlueUnsupportedPermitDomainExtensionsError,
  getUnsupportedVaultV2Adapter as rawGetBlueUnsupportedVaultV2Adapter,
  isUnknownOfFactoryError as rawIsBlueUnknownOfFactoryError,
} from "@morpho-org/morpho-sdk/blue/errors";
import { fetchPosition as rawFetchBluePosition } from "@morpho-org/morpho-sdk/blue/fetch";
import type {
  AuthorizationArgs as RawBlueAuthorizationArgs,
  DaiPermitArgs as RawBlueDaiPermitArgs,
  DeploylessFetchParameters as RawBlueDeploylessFetchParameters,
  FetchParameters as RawBlueFetchParameters,
  InputAllocation as RawBlueInputAllocation,
  MarketId as RawBlueMarketId,
  MetaMorphoCall as RawBlueMetaMorphoCall,
  Permit2PermitArgs as RawBluePermit2PermitArgs,
  Permit2TransferFromArgs as RawBluePermit2TransferFromArgs,
  PermitArgs as RawBluePermitArgs,
} from "@morpho-org/morpho-sdk/blue/types";
import {
  MarketUtils as RawBlueMarketUtils,
  MetaMorphoAction as RawBlueMetaMorphoAction,
  defaultPreLiquidationParamsRegistry as rawBlueDefaultPreLiquidationParamsRegistry,
  getDefaultPreLiquidationParams as rawGetBlueDefaultPreLiquidationParams,
  getDaiPermitTypedData as rawGetDaiPermitTypedData,
} from "@morpho-org/morpho-sdk/blue/utils";
import {
  BLUE_LIQUIDATION_CURSOR,
  ERC20_ALLOWANCE_RECIPIENTS,
  MIDNIGHT_CBP,
} from "@morpho-org/morpho-sdk/constants";
import {
  BlueMarket,
  Market as LegacyBlueMarket,
  MidnightMarket,
} from "@morpho-org/morpho-sdk/entities";
import {
  DivisionByZeroError,
  getBlueUnsupportedVaultV2Adapter,
  InvalidBitLengthError,
  InvalidBlueMarketParamsError,
  InvalidMidnightOfferGroupError,
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  isBlueUnknownOfFactoryError,
  NegativeValueError,
  RegistryValueAlreadyRegisteredError,
  UnknownMarketAllocationError,
  UnsupportedPermitDomainExtensionsError,
} from "@morpho-org/morpho-sdk/errors";
import {
  fetchBluePosition,
  fetchMidnightPosition,
} from "@morpho-org/morpho-sdk/fetch";
import { ecrecoverRatifierAbi as rawMidnightEcrecoverRatifierAbi } from "@morpho-org/morpho-sdk/midnight/abis";
import { CBP as rawMidnightCbp } from "@morpho-org/morpho-sdk/midnight/constants";
import { Market as RawMidnightMarket } from "@morpho-org/morpho-sdk/midnight/entities";
import { InvalidOfferGroupError as RawMidnightInvalidOfferGroupError } from "@morpho-org/morpho-sdk/midnight/errors";
import { fetchPosition as rawFetchMidnightPosition } from "@morpho-org/morpho-sdk/midnight/fetch";
import type {
  DeploylessFetchParameters as RawMidnightDeploylessFetchParameters,
  RatifierInfo as RawMidnightRatifierInfo,
} from "@morpho-org/morpho-sdk/midnight/types";
import { MarketUtils as RawMidnightMarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import type {
  BlueAuthorizationTypedDataArgs,
  BlueDeploylessFetchParameters,
  BlueFetchParameters,
  BlueInputAllocation,
  BlueMarketId,
  BlueMetaMorphoCall,
  DaiPermitArgs,
  MidnightDeploylessFetchParameters,
  MidnightRatifierInfo,
  Permit2PermitArgs,
  Permit2TransferFromArgs,
  PermitTypedDataArgs,
} from "@morpho-org/morpho-sdk/types";
import {
  BlueMarketUtils,
  BlueMetaMorphoAction,
  blueDefaultPreLiquidationParamsRegistry,
  getBlueDefaultPreLiquidationParams,
  getDaiPermitTypedData,
  MidnightMarketUtils,
} from "@morpho-org/morpho-sdk/utils";
import { NegativeValueError as RawNegativeValueError } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

describe("protocol facades", () => {
  test.each([
    [blueMarketParamsAbi, rawBlueMarketParamsAbi],
    [addresses, rawBlueAddresses],
    [BLUE_LIQUIDATION_CURSOR, rawBlueLiquidationCursor],
    [ERC20_ALLOWANCE_RECIPIENTS, rawBlueErc20AllowanceRecipients],
    [BlueMarket, RawBlueMarket],
    [LegacyBlueMarket, RawBlueMarket],
    [InvalidBlueMarketParamsError, RawBlueInvalidMarketParamsError],
    [DivisionByZeroError, RawBlueDivisionByZeroError],
    [InvalidBitLengthError, RawBlueInvalidBitLengthError],
    [InvalidPermitDomainChainIdError, RawBlueInvalidPermitDomainChainIdError],
    [
      InvalidPermitDomainVerifyingContractError,
      RawBlueInvalidPermitDomainVerifyingContractError,
    ],
    [getBlueUnsupportedVaultV2Adapter, rawGetBlueUnsupportedVaultV2Adapter],
    [isBlueUnknownOfFactoryError, rawIsBlueUnknownOfFactoryError],
    [NegativeValueError, RawNegativeValueError],
    [
      RegistryValueAlreadyRegisteredError,
      RawBlueRegistryValueAlreadyRegisteredError,
    ],
    [UnknownMarketAllocationError, RawBlueUnknownMarketAllocationError],
    [
      UnsupportedPermitDomainExtensionsError,
      RawBlueUnsupportedPermitDomainExtensionsError,
    ],
    [fetchBluePosition, rawFetchBluePosition],
    [
      blueDefaultPreLiquidationParamsRegistry,
      rawBlueDefaultPreLiquidationParamsRegistry,
    ],
    [getBlueDefaultPreLiquidationParams, rawGetBlueDefaultPreLiquidationParams],
    [getDaiPermitTypedData, rawGetDaiPermitTypedData],
    [BlueMarketUtils, RawBlueMarketUtils],
    [BlueMetaMorphoAction, RawBlueMetaMorphoAction],
    [midnightEcrecoverRatifierAbi, rawMidnightEcrecoverRatifierAbi],
    [MIDNIGHT_CBP, rawMidnightCbp],
    [MidnightMarket, RawMidnightMarket],
    [InvalidMidnightOfferGroupError, RawMidnightInvalidOfferGroupError],
    [fetchMidnightPosition, rawFetchMidnightPosition],
    [MidnightMarketUtils, RawMidnightMarketUtils],
  ])("preserves runtime identity", (facade, raw) => {
    expect(facade).toBe(raw);
  });

  test("preserves type identities", () => {
    const blue: Equal<BlueMarketId, RawBlueMarketId> = true;
    const midnight: Equal<MidnightRatifierInfo, RawMidnightRatifierInfo> = true;
    const blueFetch: Equal<BlueFetchParameters, RawBlueFetchParameters> = true;
    const blueDeployless: Equal<
      BlueDeploylessFetchParameters,
      RawBlueDeploylessFetchParameters
    > = true;
    const midnightDeployless: Equal<
      MidnightDeploylessFetchParameters,
      RawMidnightDeploylessFetchParameters
    > = true;
    const blueAuthorization: Equal<
      BlueAuthorizationTypedDataArgs,
      RawBlueAuthorizationArgs
    > = true;
    const blueInputAllocation: Equal<
      BlueInputAllocation,
      RawBlueInputAllocation
    > = true;
    const blueMetaMorphoCall: Equal<BlueMetaMorphoCall, RawBlueMetaMorphoCall> =
      true;
    const permit: Equal<PermitTypedDataArgs, RawBluePermitArgs> = true;
    const daiPermit: Equal<DaiPermitArgs, RawBlueDaiPermitArgs> = true;
    const permit2: Equal<Permit2PermitArgs, RawBluePermit2PermitArgs> = true;
    const permit2Transfer: Equal<
      Permit2TransferFromArgs,
      RawBluePermit2TransferFromArgs
    > = true;

    expect({
      blue,
      midnight,
      blueFetch,
      blueDeployless,
      midnightDeployless,
      blueAuthorization,
      blueInputAllocation,
      blueMetaMorphoCall,
      permit,
      daiPermit,
      permit2,
      permit2Transfer,
    }).toEqual({
      blue: true,
      midnight: true,
      blueFetch: true,
      blueDeployless: true,
      midnightDeployless: true,
      blueAuthorization: true,
      blueInputAllocation: true,
      blueMetaMorphoCall: true,
      permit: true,
      daiPermit: true,
      permit2: true,
      permit2Transfer: true,
    });
  });
});
