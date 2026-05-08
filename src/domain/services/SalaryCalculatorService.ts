/**
 * SalaryCalculatorService — Domain Service
 *
 * Contains salary-related business logic that doesn't belong to a single entity.
 * Receives all dependencies through its constructor (no static calls).
 */

import { Money } from '../value-objects/Money';
import { DomainValidationError } from '../errors/DomainValidationError';

export interface AnnualCompensation {
  baseSalary: Money;
  bonus: Money;
  totalCost: Money;
}

export class SalaryCalculatorService {
  /**
   * Calculate the annual bonus as a percentage of the base monthly salary × 12.
   *
   * @param monthlySalary  The employee's current monthly salary.
   * @param bonusPercent   Bonus percentage (e.g. 10 means 10 %).
   */
  calculateAnnualCompensation(
    monthlySalary: Money,
    bonusPercent: number,
  ): AnnualCompensation {
    if (bonusPercent < 0 || bonusPercent > 100) {
      throw new DomainValidationError('Bonus percentage must be between 0 and 100.');
    }

    const annualBase = Money.create(monthlySalary.amount * 12, monthlySalary.currency);
    const bonus = Money.create(
      (annualBase.amount * bonusPercent) / 100,
      monthlySalary.currency,
    );
    const totalCost = annualBase.add(bonus);

    return { baseSalary: annualBase, bonus, totalCost };
  }

  /**
   * Apply a raise percentage to a salary and return the new monthly salary.
   */
  applyRaise(currentSalary: Money, raisePercent: number): Money {
    if (raisePercent < 0) {
      throw new DomainValidationError('Raise percentage cannot be negative.');
    }
    const increment = (currentSalary.amount * raisePercent) / 100;
    return currentSalary.add(Money.create(increment, currentSalary.currency));
  }
}
