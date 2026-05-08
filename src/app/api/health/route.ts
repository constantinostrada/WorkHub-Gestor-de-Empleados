/**
 * GET /api/health — lightweight health check
 *
 * Used by Docker / load balancers to confirm the app is alive.
 */

import { NextResponse } from 'next/server';

export async function GET(): Promise<Response> {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'WorkHub Gestor de Empleados',
  });
}
