import { Email } from '../value-objects/Email';
import { DomainValidationError } from '../errors/DomainValidationError';

describe('Email value object', () => {
  it('creates a valid email and normalises to lower-case', () => {
    const email = Email.create('Ana.Garcia@WorkHub.COM');
    expect(email.value).toBe('ana.garcia@workhub.com');
  });

  it('throws DomainValidationError for an invalid address', () => {
    expect(() => Email.create('not-an-email')).toThrow(DomainValidationError);
  });

  it('considers two emails with the same address equal', () => {
    const a = Email.create('test@example.com');
    const b = Email.create('TEST@EXAMPLE.COM');
    expect(a.equals(b)).toBe(true);
  });

  it('considers two emails with different addresses not equal', () => {
    const a = Email.create('a@example.com');
    const b = Email.create('b@example.com');
    expect(a.equals(b)).toBe(false);
  });
});
