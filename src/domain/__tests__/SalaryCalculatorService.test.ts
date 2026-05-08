import { SalaryCalculatorService } from '../services/SalaryCalculatorService';
import { Money } from '../value-objects/Money';
import { DomainValidationError } from '../errors/DomainValidationError';

describe('SalaryCalculatorService', () => {
  const service = new SalaryCalculatorService();

  it('calculates annual compensation with 10 % bonus', () => {
    const monthly = Money.create(3000, 'EUR');
    const result  = service.calculateAnnualCompensation(monthly, 10);

    expect(result.baseSalary.amount).toBe(36000);
    expect(result.bonus.amount).toBeCloseTo(3600);
    expect(result.totalCost.amount).toBeCloseTo(39600);
  });

  it('returns no bonus when percent is 0', () => {
    const monthly = Money.create(2000, 'EUR');
    const result  = service.calculateAnnualCompensation(monthly, 0);
    expect(result.bonus.amount).toBe(0);
  });

  it('throws when bonus percent exceeds 100', () => {
    const monthly = Money.create(3000, 'EUR');
    expect(() => service.calculateAnnualCompensation(monthly, 101)).toThrow(
      DomainValidationError,
    );
  });

  it('applies a raise correctly', () => {
    const salary = Money.create(2000, 'EUR');
    const raised = service.applyRaise(salary, 10);
    expect(raised.amount).toBe(2200);
  });
});
