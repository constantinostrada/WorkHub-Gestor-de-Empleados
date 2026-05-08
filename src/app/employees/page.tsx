/**
 * Employees Page — Server Component
 *
 * Fetches the employee list via the internal API and renders it.
 * Presentation only — no business logic.
 */

import Link from 'next/link';

import type { PaginatedEmployeesResponseDto } from '@/application/dtos/employee.dto';

async function fetchEmployees(): Promise<PaginatedEmployeesResponseDto> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/employees?pageSize=50`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Failed to fetch employees');
  }

  return res.json() as Promise<PaginatedEmployeesResponseDto>;
}

export default async function EmployeesPage(): Promise<JSX.Element> {
  let data: PaginatedEmployeesResponseDto;

  try {
    data = await fetchEmployees();
  } catch {
    return (
      <main className="container">
        <h1>Employees</h1>
        <p className="error">Could not load employees. Please ensure the database is running.</p>
        <Link href="/" className="btn">← Back to Home</Link>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="page-header">
        <h1>👥 Employees</h1>
        <span className="badge">{data.total} total</span>
      </div>

      {data.items.length === 0 ? (
        <p>No employees found. Seed the database to get started.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Position</th>
              <th>Area</th>
              <th>Status</th>
              <th>Salary</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((emp) => (
              <tr key={emp.id}>
                <td>{emp.fullName}</td>
                <td>{emp.email}</td>
                <td>{emp.position}</td>
                <td>{emp.areaId ?? '—'}</td>
                <td>
                  <span className={`status status--${emp.status.toLowerCase()}`}>
                    {emp.status}
                  </span>
                </td>
                <td>
                  {emp.salary.toLocaleString('en-US', {
                    style: 'currency',
                    currency: emp.currency,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pagination">
        <p>
          Page {data.page} of {data.totalPages}
        </p>
      </div>

      <Link href="/" className="btn btn--secondary">
        ← Back to Home
      </Link>
    </main>
  );
}
