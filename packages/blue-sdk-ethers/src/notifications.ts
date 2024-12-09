import type {
  Signature,
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
} from "ethers";
import {
  type Observable,
  type Observer,
  ReplaySubject,
  lastValueFrom,
} from "rxjs";

import type { SignatureMessage } from "./signatures/types.js";

export enum NotificationStatus {
  signing = "signing",
  success = "success",
  error = "error",
  pending = "pending",
}

export enum NotificationTopic {
  tx = "tx",
  signature = "signature",
}

export interface NotificationContext {
  [NotificationTopic.tx]: {
    [NotificationStatus.signing]: {
      tx: TransactionRequest;
    };
    [NotificationStatus.pending]: {
      // biome-ignore lint/suspicious/noExplicitAny: old code
      args: Record<PropertyKey, any>;
      tx: TransactionRequest;
      response?: TransactionResponse;
    };
    [NotificationStatus.success]: {
      // biome-ignore lint/suspicious/noExplicitAny: old code
      args: Record<PropertyKey, any>;
      tx: TransactionRequest;
      response?: TransactionResponse;
      receipt: TransactionReceipt | null;
    };
    [NotificationStatus.error]: {
      // biome-ignore lint/suspicious/noExplicitAny: old code
      args: Record<PropertyKey, any>;
      tx: TransactionRequest;
      response?: TransactionResponse;
      error: Error;
    };
  };
  [NotificationTopic.signature]: {
    [NotificationStatus.signing]: never;
    [NotificationStatus.pending]: {
      message: SignatureMessage;
      // biome-ignore lint/suspicious/noExplicitAny: old code
      args: Record<PropertyKey, any>;
    };
    [NotificationStatus.success]: {
      message: SignatureMessage;
      // biome-ignore lint/suspicious/noExplicitAny: old code
      args: Record<PropertyKey, any>;
      signature: Signature;
    };
    [NotificationStatus.error]: {
      message: SignatureMessage;
      // biome-ignore lint/suspicious/noExplicitAny: old code
      args: Record<PropertyKey, any>;
      error: Error;
    };
  };
}

export interface NotificationBody<
  Topic extends NotificationTopic = NotificationTopic,
  Status extends NotificationStatus = NotificationStatus,
> {
  id: string;
  topic: Topic;
  status: Status;
}

export type Notifications = {
  [Topic in NotificationTopic]: {
    [Status in NotificationStatus]: NotificationBody<Topic, Status> &
      (NotificationContext[Topic][Status] extends never
        ? unknown
        : { context: NotificationContext[Topic][Status] });
  };
};

export type TxNotification =
  Notifications[NotificationTopic.tx][NotificationStatus];
export type SignatureNotification =
  Notifications[NotificationTopic.signature][NotificationStatus];
export type Notification = Notifications[NotificationTopic][NotificationStatus];

export type NotificationsWithoutTopic = {
  [Topic in NotificationTopic]: {
    [Status in NotificationStatus]: Omit<
      NotificationBody<Topic, Status>,
      "topic"
    > &
      (NotificationContext[Topic][Status] extends never
        ? unknown
        : { context: NotificationContext[Topic][Status] });
  };
};

export interface NotificationConsumer<Topic extends NotificationTopic> {
  notifications$: Observable<Notifications[Topic][NotificationStatus]>;
  wait: (
    observerOrNext?:
      | Partial<Observer<Notifications[Topic][NotificationStatus]>>
      | ((value: Notifications[Topic][NotificationStatus]) => void),
  ) => Promise<
    Notifications[Topic][NotificationStatus.success | NotificationStatus.error]
  >;
}

/**
 * MUST receive a success or error notification at some point to ensure the result promise resolves.
 */
export class NotificationProducer<Topic extends NotificationTopic> {
  protected readonly _notifications$ = new ReplaySubject<
    Notifications[Topic][NotificationStatus]
  >(Number.POSITIVE_INFINITY);
  public readonly notifications$ = this._notifications$.asObservable();

  protected readonly _result = lastValueFrom(this._notifications$);

  public readonly consumer: NotificationConsumer<Topic> = {
    notifications$: this.notifications$,
    wait: this.wait.bind(this),
  };

  /**
   * Creates a notification producer.
   * MUST receive a success or error notification at some point to ensure the result promise resolves.
   * @param topic The notification topic to populate each notification with.
   */
  constructor(public readonly topic: Topic) {}

  public async wait(
    observerOrNext?:
      | Partial<Observer<Notifications[Topic][NotificationStatus]>>
      | ((value: Notifications[Topic][NotificationStatus]) => void),
  ) {
    const subscription = this.notifications$.subscribe(observerOrNext);

    const notification = (await this._result) as unknown as Promise<
      Notifications[Topic][
        | NotificationStatus.success
        | NotificationStatus.error]
    >;

    subscription.unsubscribe();

    return notification;
  }

  public next(
    notification: NotificationsWithoutTopic[Topic][NotificationStatus],
  ) {
    this._notifications$.next({
      ...notification,
      topic: this.topic,
    } as unknown as Notifications[Topic][NotificationStatus]);

    if (
      notification.status === NotificationStatus.success ||
      notification.status === NotificationStatus.error
    )
      this._notifications$.complete();
  }
}
