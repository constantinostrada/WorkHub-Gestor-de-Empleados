import { Money } from '../value-objects/Money';
import { DomainValidationError } from '../errors/DomainValidationError';

describe('Money value object', () => {
  it('creates a valid money instance', () => {
    const m = Money.create(1500.50, 'EUR');
    expect(m.amount).toBe(1500.50);
    expect(m.currency).toBe('EUR');
  });

  it('defaults currency to EUR', () => {
    const m = Money.create(100);
    expect(m.currency).toBe('EUR');
  });

  it('throws for a negative amount', () => {
    expect(() => Money.create(-1)).toThrow(DomainValidationError);
  });

  it('adds two money values of the same currency', () => {
    const a = Money.create(100, 'EUR');
    const b = Money.create(50,  'EUR');
    expect(a.add(b).amount).toBe(150);
  });

  it('throws when adding different currencies', () => {
    const a = Money.create(100, 'EUR');
    const b = Money.create(100, 'USD');
    expect(() => a.add(b)).toThrow(DomainValidationError);
  });

  it('considers equal amounts and currencies as equal', () => {
    expect(Money.create(200, 'EUR').equals(Money.create(200, 'EUR'))).toBe(true);
  });
});
