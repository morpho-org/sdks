import { OperatorFunction, map } from "rxjs";

import { isDefined } from "../../utils";

export function getLast<T>(array: [T, ...(T | null | undefined)[]]): T;
export function getLast<T>(array: T[]): T | undefined;
export function getLast<T>(array: T[]) {
  return array[array.length - 1];
}

export function filterDefined<T>(array: [T, ...(T | null | undefined)[]]): [T, ...T[]];
export function filterDefined<T>(array: (T | null | undefined)[]): T[];
export function filterDefined<T>(array: T[]) {
  return array.filter(isDefined);
}

export function getLastDefined<T>(array: [T, ...(T | null | undefined)[]]): T;
export function getLastDefined<T>(array: (T | null | undefined)[]): T | undefined;
export function getLastDefined<T>(array: T[]) {
  return getLast(filterDefined(array));
}

export function mapLastDefined<T>(): OperatorFunction<[T, ...(T | null | undefined)[]], T>;
export function mapLastDefined<T>(): OperatorFunction<T[], T | undefined>;
export function mapLastDefined() {
  return map(getLastDefined);
}
