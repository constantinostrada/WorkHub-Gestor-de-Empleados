/**
 * Home Page — WorkHub Gestor de Empleados
 *
 * Server Component (default in Next.js App Router).
 * Links to main application sections.
 */

import Link from 'next/link';

export default function HomePage(): JSX.Element {
  return (
    <main className="container">
      <header className="hero">
        <h1>WorkHub</h1>
        <p className="subtitle">Gestor de Empleados</p>
        <p className="description">
          A production-ready employee management platform built with Next.js,
          TypeScript, Prisma and PostgreSQL following Clean Architecture principles.
        </p>
      </header>

      <section className="card-grid">
        <article className="card">
          <h2>👥 Employees</h2>
          <p>Create, search, update and manage your workforce.</p>
          <Link href="/employees" className="btn">
            View Employees
          </Link>
        </article>

        <article className="card">
          <h2>🏢 Areas</h2>
          <p>Organise teams and area structure.</p>
          <Link href="/areas" className="btn">
            View Areas
          </Link>
        </article>

        <article className="card">
          <h2>📡 REST API</h2>
          <p>Full RESTful API powering the frontend.</p>
          <Link href="/api/health" className="btn" target="_blank">
            API Health Check
          </Link>
        </article>
      </section>

      <footer className="footer">
        <p>WorkHub-Gestor-de-EmpleadosOR &mdash; Clean Architecture &bull; Next.js 14 &bull; Prisma &bull; PostgreSQL</p>
      </footer>
    </main>
  );
}
