import {
  Signer,
  TransactionRequest,
  TransactionResponse,
  parseUnits,
} from "ethers";

import { ChainId, MathLib } from "@morpho-org/blue-sdk";

import {
  NotificationProducer,
  NotificationStatus,
  NotificationTopic,
} from "./notifications";
import { SignatureUtils } from "./signatures";
import { SignatureMessage } from "./signatures/types";

export interface NotificationOptions<Topic extends NotificationTopic> {
  producer: NotificationProducer<Topic>;
  id: string;
  args: Record<PropertyKey, any>;
}

/**
 * Sends a transaction via the provided signer, optionnally waiting for the corresponding transaction receipt.
 * @param signer The signer to send the tx with.
 * @param tx The transaction request.
 * @param wait Whether to wait for the transaction receipt. Defaults to true.
 * @param notificationOptions The optional notification options. Warning: if `wait` is set to true, the provided topic will never complete.
 */
export const sendTransactionWithProducer = async (
  signer: Signer,
  req: TransactionRequest,
  defaultGasLimit?: bigint,
  confirms = 1,
  notificationOptions?: NotificationOptions<NotificationTopic.tx>,
) => {
  let response: TransactionResponse | undefined;

  try {
    let gasLimit: bigint;
    try {
      gasLimit = MathLib.wMulUp(
        await signer.estimateGas(req),
        parseUnits("1.1"),
      );
    } catch (error: any) {
      console.error(error);
      if (defaultGasLimit == null) throw error;

      gasLimit = defaultGasLimit;
    }

    const tx = { ...req, gasLimit };

    notificationOptions?.producer.next({
      id: notificationOptions.id,
      status: NotificationStatus.signing,
      context: { tx },
    });

    response = await signer.sendTransaction(tx);

    notificationOptions?.producer.next({
      id: notificationOptions.id,
      status: NotificationStatus.pending,
      context: { args: notificationOptions.args, tx, response },
    });

    const receipt = await response.wait(confirms);

    notificationOptions?.producer.next({
      id: notificationOptions.id,
      status: NotificationStatus.success,
      context: { args: notificationOptions.args, tx, response, receipt },
    });
  } catch (error: any) {
    notificationOptions?.producer.next({
      id: notificationOptions.id,
      status: NotificationStatus.error,
      context: { args: notificationOptions.args, tx: req, response, error },
    });
  }
};

/**
 * Sends a transaction via the provided signer, optionnally waiting for the corresponding transaction receipt.
 * @param signer The signer to send the tx with.
 * @param tx The transaction request.
 * @param wait Whether to wait for the transaction receipt. Defaults to true.
 * @param topic The type of notifications to emit.
 * @param args The optional notification arguments.
 * @return The notification consumer which receives the transaction notifications.
 */
export const sendTransaction = (
  signer: Signer,
  tx: TransactionRequest,
  defaultGasLimit?: bigint,
  confirms?: number,
  args: Record<PropertyKey, any> = {},
) => {
  const producer = new NotificationProducer(NotificationTopic.tx);

  sendTransactionWithProducer(signer, tx, defaultGasLimit, confirms, {
    producer,
    id: Date.now().toString(),
    args,
  });

  return producer.consumer;
};

export const signMessageWithProducer = async (
  signer: Signer,
  message: SignatureMessage,
  notificationOptions?: NotificationOptions<NotificationTopic.signature>,
) => {
  notificationOptions?.producer.next({
    id: notificationOptions.id,
    status: NotificationStatus.signing,
  });

  try {
    const signature = await SignatureUtils.safeSignTypedData(
      signer,
      message.data.domain,
      message.data.types,
      message.data.value,
    );

    SignatureUtils.verifySignature(
      signature,
      message.hash,
      await signer.getAddress(),
    );

    notificationOptions?.producer.next({
      id: notificationOptions.id,
      status: NotificationStatus.success,
      context: { message, args: notificationOptions.args, signature },
    });
  } catch (error: any) {
    notificationOptions?.producer.next({
      id: notificationOptions.id,
      status: NotificationStatus.error,
      context: { message, args: notificationOptions.args, error },
    });
  }
};

/**
 * Sends a signature request to the provided signer.
 * @param signer The signer to send the approval with.
 * @param args The approval parameters.
 * @param encodeMessage The approval encoder to pass the approval parameters to get the approval transactions.
 * @return The notification consumer which receives the transaction notifications.
 */
export const signMessage = <T extends object>(
  signer: Signer,
  args: T,
  encodeMessage: (args: T, chainId: ChainId) => SignatureMessage,
  chainId: ChainId,
) => {
  const producer = new NotificationProducer(NotificationTopic.signature);

  signMessageWithProducer(signer, encodeMessage(args, chainId), {
    producer,
    id: Date.now().toString(),
    args,
  });

  return producer.consumer;
};
