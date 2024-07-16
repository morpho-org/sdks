import { BehaviorSubject, ReplaySubject } from "rxjs";

export enum ValueState {
  added = "added",
  deleted = "deleted",
}

export interface ValueChange<T> {
  value: T;
  state: ValueState;
}

/**
 * Manages observables over a set of values:
 * - observable of any addition/deletion to the set, which emits the element added/deleted
 * - observable of the whole set, which emits the set of values anytime it is modified
 */
export class ObservableSet<T> {
  protected readonly _changesSubject$ = new ReplaySubject<ValueChange<T>>(Infinity); // Always replay all changes.
  /**
   * Warning: each value can be mutated down the observable stream, for all observers.
   */
  public readonly changes$ = this._changesSubject$.asObservable();

  protected readonly _valuesSubject$;
  /**
   * Warning: the set of values can be mutated down the observable stream, for all observers.
   */
  public readonly values$;

  constructor(values?: Iterable<T>) {
    const valueSet = new Set(values);

    this._valuesSubject$ = new BehaviorSubject<Set<T>>(valueSet);
    this.values$ = this._valuesSubject$.asObservable();

    valueSet.forEach((value) => this._changesSubject$.next({ value, state: ValueState.added }));
  }

  /**
   * Shallow copy of the current set of values registered.
   */
  get values() {
    return new Set(this._valuesSubject$.value);
  }

  protected _add(value: T) {
    const values = this._valuesSubject$.value;
    const has = values.has(value);

    if (!has) {
      values.add(value);

      this._changesSubject$.next({ value, state: ValueState.added });
    }

    return !has;
  }

  public add(...values: T[]) {
    const added: T[] = [];
    for (const value of values) {
      if (this._add(value)) added.push(value);
    }

    if (added.length > 0) this._valuesSubject$.next(this.values);

    return added;
  }

  public _delete(value: T) {
    const values = this._valuesSubject$.value;
    const deleted = values.delete(value);

    if (deleted) this._changesSubject$.next({ value, state: ValueState.deleted });

    return deleted;
  }

  public delete(...values: T[]) {
    const deleted: T[] = [];
    for (const value of values) {
      if (this._delete(value)) deleted.push(value);
    }

    if (deleted.length > 0) this._valuesSubject$.next(this.values);

    return deleted;
  }

  public close() {
    this._changesSubject$.complete();
    this._valuesSubject$.complete();
  }
}
