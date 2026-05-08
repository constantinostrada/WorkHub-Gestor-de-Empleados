/**
 * Areas Page — Server Component
 */

import Link from 'next/link';

import type { AreaResponseDto } from '@/application/dtos/area.dto';

async function fetchAreas(): Promise<AreaResponseDto[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/areas`, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error('Failed to fetch areas');
  }

  return res.json() as Promise<AreaResponseDto[]>;
}

export default async function AreasPage(): Promise<JSX.Element> {
  let areas: AreaResponseDto[];

  try {
    areas = await fetchAreas();
  } catch {
    return (
      <main className="container">
        <h1>Areas</h1>
        <p className="error">Could not load areas. Please ensure the database is running.</p>
        <Link href="/" className="btn">← Back to Home</Link>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="page-header">
        <h1>🏢 Areas</h1>
        <span className="badge">{areas.length} total</span>
      </div>

      {areas.length === 0 ? (
        <p>No areas found. Seed the database to get started.</p>
      ) : (
        <ul className="dept-list">
          {areas.map((area) => (
            <li key={area.id} className="dept-card">
              <h2>{area.name}</h2>
              {area.description && <p>{area.description}</p>}
              <small>Created: {new Date(area.createdAt).toLocaleDateString()}</small>
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
