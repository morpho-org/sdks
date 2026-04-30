import type { Address } from "@morpho-org/blue-sdk";
import { fetchToken, getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { Time, deepFreeze } from "@morpho-org/morpho-ts";
import { type Client, verifyTypedData } from "viem";
import { signTypedData } from "viem/actions";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  InvalidSignatureError,
  MissingClientPropertyError,
  type PermitAction,
  type Requirement,
} from "../../../types/index.js";

interface EncodeErc20PermitParams {
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: number;
  nonce: bigint;
  supportDeployless?: boolean;
}

export const encodeErc20Permit = async (
  viemClient: Client,
  params: EncodeErc20PermitParams,
): Promise<Requirement> => {
  const { token, spender, amount, chainId, nonce, supportDeployless } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const tokenData = await fetchToken(token, viemClient, {
    deployless: supportDeployless,
  });

  const action: PermitAction = {
    type: "permit",
    args: {
      spender,
      amount,
      deadline,
    },
  };

  return {
    action,
    async sign(client: Client, userAddress: Address) {
      if (!client.account?.address) {
        throw new MissingClientPropertyError("client.account.address");
      }
      if (client.account.address !== userAddress) {
        throw new AddressMismatchError(client.account.address, userAddress);
      }
      const typedData = getPermitTypedData(
        {
          erc20: tokenData,
          owner: userAddress,
          spender,
          allowance: amount,
          nonce,
          deadline,
        },
        chainId,
      );

      const signature = await signTypedData(client, {
        ...typedData,
        account: client.account,
      });

      const isValid = await verifyTypedData({
        ...typedData,
        address: userAddress, // Verify against the permit's owner.
        signature,
      });

      if (!isValid) {
        throw new InvalidSignatureError();
      }

      return deepFreeze({
        args: {
          owner: userAddress,
          signature,
          deadline,
          amount,
          asset: token,
          nonce,
        },
        action,
      });
    },
  };
};
