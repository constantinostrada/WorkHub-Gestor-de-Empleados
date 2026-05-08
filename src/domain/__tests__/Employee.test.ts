import { Employee } from '../entities/Employee';
import { Email } from '../value-objects/Email';
import { EmployeeStatus } from '../value-objects/EmployeeStatus';
import { Money } from '../value-objects/Money';
import { DomainValidationError } from '../errors/DomainValidationError';

function makeEmployee(overrides: Partial<Parameters<typeof Employee.create>[0]> = {}): Employee {
  const now = new Date();
  return Employee.create({
    id: 'emp-1',
    firstName: 'Ana',
    lastName: 'García',
    email: Email.create('ana@workhub.com'),
    phone: null,
    position: 'Engineer',
    salary: Money.create(3000, 'EUR'),
    status: EmployeeStatus.ACTIVE,
    hireDate: new Date('2022-01-01'),
    departmentId: 'dept-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Employee entity', () => {
  it('creates an active employee with correct full name', () => {
    const emp = makeEmployee();
    expect(emp.fullName).toBe('Ana García');
    expect(emp.isActive).toBe(true);
  });

  it('throws if firstName is blank', () => {
    expect(() => makeEmployee({ firstName: '  ' })).toThrow(DomainValidationError);
  });

  it('deactivates an active employee', () => {
    const emp = makeEmployee();
    const deactivated = emp.deactivate();
    expect(deactivated.status).toBe(EmployeeStatus.INACTIVE);
  });

  it('throws when deactivating an already inactive employee', () => {
    const emp = makeEmployee({ status: EmployeeStatus.INACTIVE });
    expect(() => emp.deactivate()).toThrow(DomainValidationError);
  });

  it('updates salary and returns a new immutable instance', () => {
    const emp = makeEmployee();
    const raised = emp.updateSalary(Money.create(3500, 'EUR'));
    expect(raised.salary.amount).toBe(3500);
    // original unchanged
    expect(emp.salary.amount).toBe(3000);
  });

  it('throws if hire date is in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(() => makeEmployee({ hireDate: future })).toThrow(DomainValidationError);
  });
});
