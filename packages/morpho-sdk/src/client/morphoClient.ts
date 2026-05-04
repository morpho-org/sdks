import { type MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import {
  MorphoMarketV1,
  MorphoVaultV1,
  MorphoVaultV2,
} from "../entities/index.js";
import {
  MarketIdMismatchError,
  type Metadata,
  type MorphoClientType,
} from "../types/index.js";

export class MorphoClient implements MorphoClientType {
  readonly options: {
    readonly supportSignature: boolean;
    readonly supportDeployless?: boolean;
    readonly metadata?: Metadata;
  };

  constructor(
    public readonly viemClient: Client,
    readonly _options?: {
      readonly supportSignature?: boolean;
      readonly supportDeployless?: boolean;
      readonly metadata?: Metadata;
    },
  ) {
    this.options = {
      ..._options,
      supportSignature: _options?.supportSignature ?? false,
      supportDeployless: _options?.supportDeployless,
    };
  }

  public vaultV1(vault: Address, chainId: number) {
    return new MorphoVaultV1(this, vault, chainId);
  }

  public vaultV2(vault: Address, chainId: number) {
    return new MorphoVaultV2(this, vault, chainId);
  }

  public marketV1(marketParams: MarketParams, chainId: number) {
    const derivedId = MarketUtils.getMarketId(marketParams);
    // Can happen with one-time/hardcoded/agent-written possibly inconsistent input market params.
    if (marketParams.id !== derivedId) {
      throw new MarketIdMismatchError(marketParams.id, derivedId);
    }
    return new MorphoMarketV1(this, marketParams, chainId);
  }
}
