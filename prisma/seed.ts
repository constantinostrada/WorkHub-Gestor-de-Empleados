/**
 * Prisma Seed Script
 *
 * Run with:  npm run prisma:seed
 *
 * This script lives outside Clean Architecture layers on purpose —
 * it is a dev-time utility, not production application code.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding database …');

  // ── Departments ──────────────────────────────────────────────────────────
  const engineering = await prisma.department.upsert({
    where: { name: 'Engineering' },
    update: {},
    create: { name: 'Engineering', description: 'Software Engineering department' },
  });

  const hr = await prisma.department.upsert({
    where: { name: 'Human Resources' },
    update: {},
    create: { name: 'Human Resources', description: 'HR and People Operations' },
  });

  // ── Employees ─────────────────────────────────────────────────────────────
  await prisma.employee.upsert({
    where: { email: 'ana.garcia@workhub.com' },
    update: {},
    create: {
      firstName: 'Ana',
      lastName: 'García',
      email: 'ana.garcia@workhub.com',
      phone: '+34 600 111 222',
      position: 'Senior Engineer',
      salary: 72000,
      status: 'ACTIVE',
      hireDate: new Date('2021-03-15'),
      departmentId: engineering.id,
    },
  });

  await prisma.employee.upsert({
    where: { email: 'carlos.lopez@workhub.com' },
    update: {},
    create: {
      firstName: 'Carlos',
      lastName: 'López',
      email: 'carlos.lopez@workhub.com',
      phone: '+34 600 333 444',
      position: 'HR Manager',
      salary: 58000,
      status: 'ACTIVE',
      hireDate: new Date('2020-06-01'),
      departmentId: hr.id,
    },
  });

  console.log('✅ Seed completed.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
