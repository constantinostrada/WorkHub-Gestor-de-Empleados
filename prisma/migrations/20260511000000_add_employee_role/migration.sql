-- T10: Role-based permissions — add `role` column to employees + new enum.

-- 1. Create the new enum type used for employee.role
CREATE TYPE "employee_role" AS ENUM ('admin', 'manager', 'employee');

-- 2. Add the role column with default 'employee'. Existing rows pick up the default.
ALTER TABLE "employees"
  ADD COLUMN "role" "employee_role" NOT NULL DEFAULT 'employee';
