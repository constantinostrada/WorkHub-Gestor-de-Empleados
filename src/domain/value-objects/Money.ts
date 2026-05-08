/**
 * Money — Value Object
 *
 * Represents a monetary amount with an ISO-4217 currency code.
 * Arithmetic returns new instances (immutable).
 */

import { DomainValidationError } from '../errors/DomainValidationError';

export class Money {
  private readonly _amount: number;
  private readonly _currency: string;

  private constructor(amount: number, currency: string) {
    this._amount = amount;
    this._currency = currency;
  }

  static create(amount: number, currency = 'EUR'): Money {
    if (!Number.isFinite(amount)) {
      throw new DomainValidationError('Money amount must be a finite number.');
    }
    if (amount < 0) {
      throw new DomainValidationError('Money amount cannot be negative.');
    }
    const normalised = currency.trim().toUpperCase();
    if (normalised.length !== 3) {
      throw new DomainValidationError(`"${currency}" is not a valid ISO-4217 currency code.`);
    }
    return new Money(Math.round(amount * 100) / 100, normalised);
  }

  get amount(): number { return this._amount; }
  get currency(): string { return this._currency; }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.create(this._amount + other._amount, this._currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.create(this._amount - other._amount, this._currency);
  }

  equals(other: Money): boolean {
    return this._amount === other._amount && this._currency === other._currency;
  }

  toString(): string {
    return `${this._amount.toFixed(2)} ${this._currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new DomainValidationError(
        `Cannot operate on different currencies: ${this._currency} vs ${other._currency}.`,
      );
    }
  }
}
