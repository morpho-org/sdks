import {
  blueMarketParamsAbi,
  midnightAdapterAbi,
  midnightAdapterFactoryAbi,
  midnightAdapterPriceRatifierV1Abi,
  midnightAdapterRateRatifierV1Abi,
  midnightBlueBuyCallbackFactoryAbi,
  midnightEcrecoverRatifierAbi,
  midnightPriceRatifierV1Abi,
  midnightRateRatifierV1Abi,
} from "@morpho-org/morpho-sdk/abis";
import { addresses } from "@morpho-org/morpho-sdk/addresses";
import {
  marketParamsAbi as rawBlueMarketParamsAbi,
  midnightAdapterAbi as rawMidnightAdapterAbi,
  midnightAdapterFactoryAbi as rawMidnightAdapterFactoryAbi,
  midnightAdapterPriceRatifierV1Abi as rawMidnightAdapterPriceRatifierV1Abi,
  midnightAdapterRateRatifierV1Abi as rawMidnightAdapterRateRatifierV1Abi,
} from "@morpho-org/morpho-sdk/blue/abis";
import { addresses as rawBlueAddresses } from "@morpho-org/morpho-sdk/blue/addresses";
import {
  ERC20_ALLOWANCE_RECIPIENTS as rawBlueErc20AllowanceRecipients,
  LIQUIDATION_CURSOR as rawBlueLiquidationCursor,
} from "@morpho-org/morpho-sdk/blue/constants";
import type {
  IAccrualVaultV2MidnightAdapter as RawIAccrualVaultV2MidnightAdapter,
  IVaultV2MidnightAdapter as RawIVaultV2MidnightAdapter,
  IVaultV2MidnightAdapterAccrualMarket as RawIVaultV2MidnightAdapterAccrualMarket,
  IVaultV2MidnightAdapterCollateralParams as RawIVaultV2MidnightAdapterCollateralParams,
  IVaultV2MidnightAdapterMarket as RawIVaultV2MidnightAdapterMarket,
  IVaultV2MidnightAdapterMarketData as RawIVaultV2MidnightAdapterMarketData,
  VaultV2MidnightAdapterAccrualMarket as RawVaultV2MidnightAdapterAccrualMarket,
  VaultV2MidnightAdapterMarketData as RawVaultV2MidnightAdapterMarketData,
  IVaultV2MidnightAdapterMarketState as RawVaultV2MidnightAdapterMarketState,
  IVaultV2MidnightAdapterPosition as RawVaultV2MidnightAdapterPosition,
} from "@morpho-org/morpho-sdk/blue/entities";
import {
  AccrualVaultV2MidnightAdapter as RawAccrualVaultV2MidnightAdapter,
  Market as RawBlueMarket,
  VaultV2MidnightAdapter as RawVaultV2MidnightAdapter,
} from "@morpho-org/morpho-sdk/blue/entities";
import {
  DivisionByZeroError as RawBlueDivisionByZeroError,
  InvalidAddressError as RawBlueInvalidAddressError,
  InvalidBitLengthError as RawBlueInvalidBitLengthError,
  InvalidMarketParamsError as RawBlueInvalidMarketParamsError,
  InvalidNumberError as RawBlueInvalidNumberError,
  InvalidPermitDomainChainIdError as RawBlueInvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError as RawBlueInvalidPermitDomainVerifyingContractError,
  InvalidPositionAccrualStateError as RawBlueInvalidPositionAccrualStateError,
  InvalidPositionLossFactorError as RawBlueInvalidPositionLossFactorError,
  MarketParamsIdMismatchError as RawBlueMarketParamsIdMismatchError,
  NonTupleReturnValueError as RawBlueNonTupleReturnValueError,
  RegistryValueAlreadyRegisteredError as RawBlueRegistryValueAlreadyRegisteredError,
  UnknownAbiFunctionError as RawBlueUnknownAbiFunctionError,
  UnknownDataError as RawBlueUnknownDataError,
  UnknownFactory as RawBlueUnknownFactory,
  UnknownMarketAllocationError as RawBlueUnknownMarketAllocationError,
  UnknownOfFactory as RawBlueUnknownOfFactory,
  UnknownTokenError as RawBlueUnknownTokenError,
  UnknownTokenPriceError as RawBlueUnknownTokenPriceError,
  UnknownVaultConfigError as RawBlueUnknownVaultConfigError,
  UnnamedAbiOutputsError as RawBlueUnnamedAbiOutputsError,
  UnresolvedBlockNumberError as RawBlueUnresolvedBlockNumberError,
  UnsupportedMarketIrmError as RawBlueUnsupportedMarketIrmError,
  UnsupportedPermitDomainExtensionsError as RawBlueUnsupportedPermitDomainExtensionsError,
  UnsupportedVaultV2AdapterError as RawBlueUnsupportedVaultV2AdapterError,
  InvalidVaultV2MidnightAdapterMarketsError as RawInvalidVaultV2MidnightAdapterMarketsError,
  getUnsupportedVaultV2Adapter as rawGetBlueUnsupportedVaultV2Adapter,
  isUnknownOfFactoryError as rawIsBlueUnknownOfFactoryError,
} from "@morpho-org/morpho-sdk/blue/errors";
import { fetchPosition as rawFetchBluePosition } from "@morpho-org/morpho-sdk/blue/fetch";
import type {
  AuthorizationArgs as RawBlueAuthorizationArgs,
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
  VaultV2MidnightAdapterUtils as RawVaultV2MidnightAdapterUtils,
  defaultPreLiquidationParamsRegistry as rawBlueDefaultPreLiquidationParamsRegistry,
  getDefaultPreLiquidationParams as rawGetBlueDefaultPreLiquidationParams,
  getPermit2PermitTypedData as rawGetPermit2PermitTypedData,
} from "@morpho-org/morpho-sdk/blue/utils";
import {
  BLUE_LIQUIDATION_CURSOR,
  ERC20_ALLOWANCE_RECIPIENTS,
  MIDNIGHT_CBP,
  MIDNIGHT_MAX_TREE_HEIGHT,
  MIDNIGHT_PRICE_RATIFIER_V1_OFFER_TYPEHASH,
  MIDNIGHT_RATE_RATIFIER_V1_OFFER_TYPEHASH,
} from "@morpho-org/morpho-sdk/constants";
import type {
  IAccrualVaultV2MidnightAdapter,
  IVaultV2MidnightAdapter,
  IVaultV2MidnightAdapterAccrualMarket,
  IVaultV2MidnightAdapterCollateralParams,
  IVaultV2MidnightAdapterMarket,
  IVaultV2MidnightAdapterMarketData,
  IVaultV2MidnightAdapterMarketState,
  IVaultV2MidnightAdapterPosition,
  VaultV2MidnightAdapterAccrualMarket,
  VaultV2MidnightAdapterMarketData,
} from "@morpho-org/morpho-sdk/entities";
import {
  AccrualVaultV2MidnightAdapter,
  BlueMarket,
  MidnightMarket,
  VaultV2MidnightAdapter,
} from "@morpho-org/morpho-sdk/entities";
import {
  BlueMarketParamsIdMismatchError,
  BlueUnresolvedBlockNumberError,
  DivisionByZeroError,
  getBlueUnsupportedVaultV2Adapter,
  InvalidAddressError,
  InvalidBitLengthError,
  InvalidBlueMarketParamsError,
  InvalidBlueVaultV2MidnightAdapterMarketsError,
  InvalidMidnightOfferGroupError,
  InvalidMidnightPositionAccrualStateError,
  InvalidMidnightPositionAccrualTimestampError,
  InvalidMidnightPositionLossFactorError,
  InvalidMidnightRateRatifierV1RateError,
  InvalidMidnightRateRatifierV1TickError,
  InvalidMidnightRateRatifierV1TimeError,
  InvalidMidnightRatifierV1AddressError,
  InvalidNumberError,
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  InvalidPositionAccrualStateError,
  InvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError,
  isBlueUnknownOfFactoryError,
  MidnightRateRatifierV1BoundOverflowError,
  MidnightRatifierV1TakerNotAllowedError,
  NegativeValueError,
  NonTupleReturnValueError,
  RegistryValueAlreadyRegisteredError,
  UnknownAbiFunctionError,
  UnknownBlueDataError,
  UnknownBlueFactory,
  UnknownBlueMarketAllocationError,
  UnknownBlueOfFactory,
  UnknownBlueTokenError,
  UnknownBlueTokenPriceError,
  UnknownBlueVaultConfigError,
  UnnamedAbiOutputsError,
  UnsupportedBlueMarketIrmError,
  UnsupportedBlueVaultV2AdapterError,
  UnsupportedPermitDomainExtensionsError,
} from "@morpho-org/morpho-sdk/errors";
import {
  fetchBluePosition,
  fetchMidnightPosition,
} from "@morpho-org/morpho-sdk/fetch";
import {
  blueBuyCallbackFactoryAbi as rawMidnightBlueBuyCallbackFactoryAbi,
  ecrecoverRatifierAbi as rawMidnightEcrecoverRatifierAbi,
  priceRatifierV1Abi as rawMidnightPriceRatifierV1Abi,
  rateRatifierV1Abi as rawMidnightRateRatifierV1Abi,
} from "@morpho-org/morpho-sdk/midnight/abis";
import {
  CBP as rawMidnightCbp,
  MAX_TREE_HEIGHT as rawMidnightMaxTreeHeight,
  PRICE_RATIFIER_V1_OFFER_TYPEHASH as rawMidnightPriceRatifierV1OfferTypehash,
  RATE_RATIFIER_V1_OFFER_TYPEHASH as rawMidnightRateRatifierV1OfferTypehash,
} from "@morpho-org/morpho-sdk/midnight/constants";
import { Market as RawMidnightMarket } from "@morpho-org/morpho-sdk/midnight/entities";
import {
  InvalidOfferGroupError as RawMidnightInvalidOfferGroupError,
  InvalidPositionAccrualStateError as RawMidnightInvalidPositionAccrualStateError,
  InvalidPositionAccrualTimestampError as RawMidnightInvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError as RawMidnightInvalidPositionLossFactorError,
  InvalidRateRatifierV1RateError as RawMidnightInvalidRateRatifierV1RateError,
  InvalidRateRatifierV1TickError as RawMidnightInvalidRateRatifierV1TickError,
  InvalidRateRatifierV1TimeError as RawMidnightInvalidRateRatifierV1TimeError,
  InvalidRatifierV1AddressError as RawMidnightInvalidRatifierV1AddressError,
  RateRatifierV1BoundOverflowError as RawMidnightRateRatifierV1BoundOverflowError,
  RatifierV1TakerNotAllowedError as RawMidnightRatifierV1TakerNotAllowedError,
} from "@morpho-org/morpho-sdk/midnight/errors";
import { fetchPosition as rawFetchMidnightPosition } from "@morpho-org/morpho-sdk/midnight/fetch";
import type {
  DeploylessFetchParameters as RawMidnightDeploylessFetchParameters,
  RateRatifierV1Leaf as RawMidnightRateRatifierV1Leaf,
  RatifierInfo as RawMidnightRatifierInfo,
} from "@morpho-org/morpho-sdk/midnight/types";
import {
  EcrecoverRatifier as RawMidnightEcrecoverRatifier,
  EcrecoverRatifierUtils as RawMidnightEcrecoverRatifierUtils,
  MarketUtils as RawMidnightMarketUtils,
  PriceRatifierV1 as RawMidnightPriceRatifierV1,
  PriceRatifierV1Utils as RawMidnightPriceRatifierV1Utils,
  RateRatifierV1 as RawMidnightRateRatifierV1,
  RateRatifierV1Utils as RawMidnightRateRatifierV1Utils,
  Ratifier as RawMidnightRatifier,
  RatifierUtils as RawMidnightRatifierUtils,
  SetterRatifier as RawMidnightSetterRatifier,
  SetterRatifierUtils as RawMidnightSetterRatifierUtils,
} from "@morpho-org/morpho-sdk/midnight/utils";
import type {
  BlueAuthorizationTypedDataArgs,
  BlueDeploylessFetchParameters,
  BlueFetchParameters,
  BlueInputAllocation,
  BlueMarketId,
  BlueMetaMorphoCall,
  MidnightDeploylessFetchParameters,
  MidnightRateRatifierV1Leaf,
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
  getPermit2PermitTypedData,
  MidnightEcrecoverRatifier,
  MidnightEcrecoverRatifierUtils,
  MidnightMarketUtils,
  MidnightPositionLib,
  MidnightPriceRatifierV1,
  MidnightPriceRatifierV1Utils,
  MidnightRateRatifierV1,
  MidnightRateRatifierV1Utils,
  MidnightRatifier,
  MidnightRatifierUtils,
  MidnightSetterRatifier,
  MidnightSetterRatifierUtils,
  VaultV2MidnightAdapterUtils,
} from "@morpho-org/morpho-sdk/utils";
import {
  InvalidPositionAccrualStateError as RawInvalidPositionAccrualStateError,
  InvalidPositionAccrualTimestampError as RawInvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError as RawInvalidPositionLossFactorError,
  MidnightPositionLib as RawMidnightPositionLib,
  NegativeValueError as RawNegativeValueError,
} from "@morpho-org/morpho-ts";
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
    [VaultV2MidnightAdapter, RawVaultV2MidnightAdapter],
    [AccrualVaultV2MidnightAdapter, RawAccrualVaultV2MidnightAdapter],
    [InvalidBlueMarketParamsError, RawBlueInvalidMarketParamsError],
    [
      InvalidBlueVaultV2MidnightAdapterMarketsError,
      RawInvalidVaultV2MidnightAdapterMarketsError,
    ],
    [DivisionByZeroError, RawBlueDivisionByZeroError],
    [InvalidAddressError, RawBlueInvalidAddressError],
    [InvalidBitLengthError, RawBlueInvalidBitLengthError],
    [InvalidNumberError, RawBlueInvalidNumberError],
    [InvalidPermitDomainChainIdError, RawBlueInvalidPermitDomainChainIdError],
    [
      InvalidPermitDomainVerifyingContractError,
      RawBlueInvalidPermitDomainVerifyingContractError,
    ],
    [
      RawBlueInvalidPositionAccrualStateError,
      RawInvalidPositionAccrualStateError,
    ],
    [RawBlueInvalidPositionLossFactorError, RawInvalidPositionLossFactorError],
    [BlueMarketParamsIdMismatchError, RawBlueMarketParamsIdMismatchError],
    [BlueUnresolvedBlockNumberError, RawBlueUnresolvedBlockNumberError],
    [UnknownAbiFunctionError, RawBlueUnknownAbiFunctionError],
    [NonTupleReturnValueError, RawBlueNonTupleReturnValueError],
    [UnnamedAbiOutputsError, RawBlueUnnamedAbiOutputsError],
    [getBlueUnsupportedVaultV2Adapter, rawGetBlueUnsupportedVaultV2Adapter],
    [isBlueUnknownOfFactoryError, rawIsBlueUnknownOfFactoryError],
    [NegativeValueError, RawNegativeValueError],
    [InvalidPositionAccrualStateError, RawInvalidPositionAccrualStateError],
    [
      InvalidPositionAccrualTimestampError,
      RawInvalidPositionAccrualTimestampError,
    ],
    [InvalidPositionLossFactorError, RawInvalidPositionLossFactorError],
    [MidnightPositionLib, RawMidnightPositionLib],
    [
      RegistryValueAlreadyRegisteredError,
      RawBlueRegistryValueAlreadyRegisteredError,
    ],
    [UnknownBlueMarketAllocationError, RawBlueUnknownMarketAllocationError],
    [UnknownBlueDataError, RawBlueUnknownDataError],
    [UnknownBlueFactory, RawBlueUnknownFactory],
    [UnknownBlueOfFactory, RawBlueUnknownOfFactory],
    [UnknownBlueTokenError, RawBlueUnknownTokenError],
    [UnknownBlueTokenPriceError, RawBlueUnknownTokenPriceError],
    [UnknownBlueVaultConfigError, RawBlueUnknownVaultConfigError],
    [UnsupportedBlueMarketIrmError, RawBlueUnsupportedMarketIrmError],
    [UnsupportedBlueVaultV2AdapterError, RawBlueUnsupportedVaultV2AdapterError],
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
    [getPermit2PermitTypedData, rawGetPermit2PermitTypedData],
    [BlueMarketUtils, RawBlueMarketUtils],
    [VaultV2MidnightAdapterUtils, RawVaultV2MidnightAdapterUtils],
    [BlueMetaMorphoAction, RawBlueMetaMorphoAction],
    [midnightAdapterAbi, rawMidnightAdapterAbi],
    [midnightAdapterFactoryAbi, rawMidnightAdapterFactoryAbi],
    [midnightAdapterPriceRatifierV1Abi, rawMidnightAdapterPriceRatifierV1Abi],
    [midnightAdapterRateRatifierV1Abi, rawMidnightAdapterRateRatifierV1Abi],
    [midnightBlueBuyCallbackFactoryAbi, rawMidnightBlueBuyCallbackFactoryAbi],
    [midnightEcrecoverRatifierAbi, rawMidnightEcrecoverRatifierAbi],
    [midnightPriceRatifierV1Abi, rawMidnightPriceRatifierV1Abi],
    [midnightRateRatifierV1Abi, rawMidnightRateRatifierV1Abi],
    [MIDNIGHT_CBP, rawMidnightCbp],
    [MIDNIGHT_MAX_TREE_HEIGHT, rawMidnightMaxTreeHeight],
    [
      MIDNIGHT_PRICE_RATIFIER_V1_OFFER_TYPEHASH,
      rawMidnightPriceRatifierV1OfferTypehash,
    ],
    [
      MIDNIGHT_RATE_RATIFIER_V1_OFFER_TYPEHASH,
      rawMidnightRateRatifierV1OfferTypehash,
    ],
    [MidnightMarket, RawMidnightMarket],
    [InvalidMidnightOfferGroupError, RawMidnightInvalidOfferGroupError],
    [
      InvalidMidnightRateRatifierV1RateError,
      RawMidnightInvalidRateRatifierV1RateError,
    ],
    [
      InvalidMidnightRateRatifierV1TickError,
      RawMidnightInvalidRateRatifierV1TickError,
    ],
    [
      InvalidMidnightRateRatifierV1TimeError,
      RawMidnightInvalidRateRatifierV1TimeError,
    ],
    [
      InvalidMidnightRatifierV1AddressError,
      RawMidnightInvalidRatifierV1AddressError,
    ],
    [
      MidnightRatifierV1TakerNotAllowedError,
      RawMidnightRatifierV1TakerNotAllowedError,
    ],
    [
      MidnightRateRatifierV1BoundOverflowError,
      RawMidnightRateRatifierV1BoundOverflowError,
    ],
    [fetchMidnightPosition, rawFetchMidnightPosition],
    [MidnightMarketUtils, RawMidnightMarketUtils],
    [MidnightEcrecoverRatifier, RawMidnightEcrecoverRatifier],
    [MidnightSetterRatifier, RawMidnightSetterRatifier],
    [MidnightRatifier, MidnightRatifierUtils],
    [MidnightEcrecoverRatifierUtils, RawMidnightEcrecoverRatifierUtils],
    [MidnightSetterRatifierUtils, RawMidnightSetterRatifierUtils],
    [MidnightRatifierUtils, RawMidnightRatifierUtils],
    [MidnightPriceRatifierV1, RawMidnightPriceRatifierV1],
    [MidnightRateRatifierV1, RawMidnightRateRatifierV1],
    [MidnightRatifier, RawMidnightRatifier],
    [MidnightPriceRatifierV1, MidnightPriceRatifierV1Utils],
    [MidnightRateRatifierV1, MidnightRateRatifierV1Utils],
    [MidnightPriceRatifierV1Utils, RawMidnightPriceRatifierV1Utils],
    [MidnightRateRatifierV1Utils, RawMidnightRateRatifierV1Utils],
  ])("preserves runtime identity", (facade, raw) => {
    expect(facade).toBe(raw);
  });

  test("preserves type identities", () => {
    const blue: Equal<BlueMarketId, RawBlueMarketId> = true;
    const vaultV2MidnightAdapterAccrual: Equal<
      IAccrualVaultV2MidnightAdapter,
      RawIAccrualVaultV2MidnightAdapter
    > = true;
    const vaultV2MidnightAdapter: Equal<
      IVaultV2MidnightAdapter,
      RawIVaultV2MidnightAdapter
    > = true;
    const vaultV2MidnightAdapterAccrualMarket: Equal<
      VaultV2MidnightAdapterAccrualMarket,
      RawVaultV2MidnightAdapterAccrualMarket
    > = true;
    const vaultV2MidnightAdapterPosition: Equal<
      IVaultV2MidnightAdapterPosition,
      RawVaultV2MidnightAdapterPosition
    > = true;
    const vaultV2MidnightAdapterMarketState: Equal<
      IVaultV2MidnightAdapterMarketState,
      RawVaultV2MidnightAdapterMarketState
    > = true;
    const vaultV2MidnightAdapterAccrualInput: Equal<
      IVaultV2MidnightAdapterAccrualMarket,
      RawIVaultV2MidnightAdapterAccrualMarket
    > = true;
    const vaultV2MidnightAdapterCollateralParams: Equal<
      IVaultV2MidnightAdapterCollateralParams,
      RawIVaultV2MidnightAdapterCollateralParams
    > = true;
    const vaultV2MidnightAdapterMarket: Equal<
      IVaultV2MidnightAdapterMarket,
      RawIVaultV2MidnightAdapterMarket
    > = true;
    const vaultV2MidnightAdapterMarketDataInput: Equal<
      IVaultV2MidnightAdapterMarketData,
      RawIVaultV2MidnightAdapterMarketData
    > = true;
    const vaultV2MidnightAdapterMarketData: Equal<
      VaultV2MidnightAdapterMarketData,
      RawVaultV2MidnightAdapterMarketData
    > = true;
    const midnight: Equal<MidnightRatifierInfo, RawMidnightRatifierInfo> = true;
    const midnightRateLeaf: Equal<
      MidnightRateRatifierV1Leaf,
      RawMidnightRateRatifierV1Leaf
    > = true;
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
    const permit2: Equal<Permit2PermitArgs, RawBluePermit2PermitArgs> = true;
    const permit2Transfer: Equal<
      Permit2TransferFromArgs,
      RawBluePermit2TransferFromArgs
    > = true;

    expect({
      blue,
      vaultV2MidnightAdapterAccrual,
      vaultV2MidnightAdapter,
      vaultV2MidnightAdapterAccrualMarket,
      vaultV2MidnightAdapterPosition,
      vaultV2MidnightAdapterMarketState,
      vaultV2MidnightAdapterAccrualInput,
      midnight,
      midnightRateLeaf,
      vaultV2MidnightAdapterCollateralParams,
      vaultV2MidnightAdapterMarket,
      vaultV2MidnightAdapterMarketDataInput,
      vaultV2MidnightAdapterMarketData,
      blueFetch,
      blueDeployless,
      midnightDeployless,
      blueAuthorization,
      blueInputAllocation,
      blueMetaMorphoCall,
      permit,
      permit2,
      permit2Transfer,
    }).toEqual({
      blue: true,
      vaultV2MidnightAdapterAccrual: true,
      vaultV2MidnightAdapter: true,
      vaultV2MidnightAdapterAccrualMarket: true,
      vaultV2MidnightAdapterPosition: true,
      vaultV2MidnightAdapterMarketState: true,
      vaultV2MidnightAdapterAccrualInput: true,
      midnight: true,
      midnightRateLeaf: true,
      vaultV2MidnightAdapterCollateralParams: true,
      vaultV2MidnightAdapterMarket: true,
      vaultV2MidnightAdapterMarketDataInput: true,
      vaultV2MidnightAdapterMarketData: true,
      blueFetch: true,
      blueDeployless: true,
      midnightDeployless: true,
      blueAuthorization: true,
      blueInputAllocation: true,
      blueMetaMorphoCall: true,
      permit: true,
      permit2: true,
      permit2Transfer: true,
    });
  });

  test("keeps Midnight accrual error aliases identical across facades", () => {
    expect(InvalidMidnightPositionAccrualStateError).toBe(
      RawMidnightInvalidPositionAccrualStateError,
    );
    expect(InvalidMidnightPositionAccrualStateError).toBe(
      RawInvalidPositionAccrualStateError,
    );
    expect(InvalidMidnightPositionAccrualTimestampError).toBe(
      RawMidnightInvalidPositionAccrualTimestampError,
    );
    expect(InvalidMidnightPositionAccrualTimestampError).toBe(
      RawInvalidPositionAccrualTimestampError,
    );
    expect(InvalidMidnightPositionLossFactorError).toBe(
      RawMidnightInvalidPositionLossFactorError,
    );
    expect(InvalidMidnightPositionLossFactorError).toBe(
      RawInvalidPositionLossFactorError,
    );
  });
});
