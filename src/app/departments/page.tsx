/**
 * Departments Page — Server Component
 */

import Link from 'next/link';

import type { DepartmentResponseDto } from '@/application/dtos/department.dto';

async function fetchDepartments(): Promise<DepartmentResponseDto[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/departments`, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error('Failed to fetch departments');
  }

  return res.json() as Promise<DepartmentResponseDto[]>;
}

export default async function DepartmentsPage(): Promise<JSX.Element> {
  let departments: DepartmentResponseDto[];

  try {
    departments = await fetchDepartments();
  } catch {
    return (
      <main className="container">
        <h1>Departments</h1>
        <p className="error">Could not load departments. Please ensure the database is running.</p>
        <Link href="/" className="btn">← Back to Home</Link>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="page-header">
        <h1>🏢 Departments</h1>
        <span className="badge">{departments.length} total</span>
      </div>

      {departments.length === 0 ? (
        <p>No departments found. Seed the database to get started.</p>
      ) : (
        <ul className="dept-list">
          {departments.map((dept) => (
            <li key={dept.id} className="dept-card">
              <h2>{dept.name}</h2>
              {dept.description && <p>{dept.description}</p>}
              <small>Created: {new Date(dept.createdAt).toLocaleDateString()}</small>
            </li>
          ))}
        </ul>
      )}

      <Link href="/" className="btn btn--secondary">
        ← Back to Home
      </Link>
    </main>
  );
}
