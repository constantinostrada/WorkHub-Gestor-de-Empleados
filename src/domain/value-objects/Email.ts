/**
 * Email — Value Object
 *
 * Immutable. Equality is by value (the address string).
 * Encapsulates format validation so no other layer needs to repeat it.
 */

import { DomainValidationError } from '../errors/DomainValidationError';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static create(raw: string): Email {
    const trimmed = raw.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      throw new DomainValidationError(`"${raw}" is not a valid e-mail address.`);
    }
    return new Email(trimmed);
  }

  get value(): string {
    return this._value;
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
