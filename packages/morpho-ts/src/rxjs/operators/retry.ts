import { retry, timer } from "rxjs";

export const retryExpBackoff = <T>(retryDelay: number, maxRetries: number, onError?: (error: any) => void) =>
  retry<T>({
    count: maxRetries,
    delay: (error, retryCount) => {
      onError?.(error);

      return timer(retryDelay * 2 ** (retryCount - 1));
    },
  });
