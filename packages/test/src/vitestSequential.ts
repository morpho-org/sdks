import type { TestAPI } from "vitest";

/**
 * Keeps a Vitest API sequential after callers add more fixtures with `extend()`.
 *
 * @param testApi Vitest API whose cases must not overlap within a worker.
 * @returns A sequential API whose extended descendants retain that behavior.
 * @internal
 */
export const withSequentialTests = <context>(
  testApi: TestAPI<context>,
): TestAPI<context> => {
  const sequentialTestApi = testApi.sequential as TestAPI<context>;

  return new Proxy(sequentialTestApi, {
    // biome-ignore lint/complexity/useMaxParams: required Proxy handler signature
    get(target, property, receiver) {
      if (property !== "extend") return Reflect.get(target, property, receiver);

      return new Proxy(target.extend, {
        // biome-ignore lint/complexity/useMaxParams: required Proxy handler signature
        apply(extend, thisArgument, argumentsList) {
          const extendedTestApi = Reflect.apply(
            extend,
            thisArgument,
            argumentsList,
          ) as TestAPI<context>;
          return withSequentialTests(extendedTestApi);
        },
      });
    },
  });
};
