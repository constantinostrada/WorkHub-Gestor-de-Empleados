/**
 * withRole — HTTP middleware factory for role-based permissions (T10).
 *
 * Reads a JWT-stub `X-Role` header and rejects with HTTP 403 when the caller's
 * role is not in `allowedRoles`. The 403 body shape matches AC-11 exactly:
 *   { error: "forbidden", required_roles: ["admin"], your_role: "employee" }
 *
 * Usage:
 *
 *   export const POST = withRole(['admin'])(async (request, ctx) => {
 *     // ...handler body
 *   });
 *
 * The wrapper is transparent: it forwards the request and any subsequent
 * args (e.g. Next.js dynamic-segment context) untouched to the inner handler.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { isValidRole, type Role } from '@/domain/value-objects/Role';

export interface ForbiddenResponseBody {
  error: 'forbidden';
  required_roles: Role[];
  your_role: Role | null;
}

/**
 * Reads `X-Role` from the incoming request. Missing or unrecognised values
 * return null (the caller is treated as unauthenticated for role purposes).
 */
export function readRole(request: { headers: { get(name: string): string | null } }): Role | null {
  const raw = request.headers.get('x-role');
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return isValidRole(trimmed) ? trimmed : null;
}

/**
 * Builds the AC-11-shaped 403 response.
 */
export function forbiddenResponse(
  requiredRoles: readonly Role[],
  yourRole: Role | null,
): NextResponse {
  const body: ForbiddenResponseBody = {
    error: 'forbidden',
    required_roles: [...requiredRoles],
    your_role: yourRole,
  };
  return NextResponse.json(body, { status: 403 });
}

/**
 * Higher-order wrapper that gates a Next.js route handler behind a role list.
 * The inner generic `Args` is inferred from the handler signature so that
 * dynamic-segment context (e.g. `{ params: { id } }`) flows through without
 * the caller having to declare its shape twice.
 */
export function withRole(
  allowedRoles: readonly Role[],
) {
  if (allowedRoles.length === 0) {
    throw new Error('withRole requires a non-empty allowedRoles list.');
  }
  return function wrap<Args extends unknown[]>(
    handler: (request: NextRequest, ...rest: Args) => Promise<Response> | Response,
  ): (request: NextRequest, ...rest: Args) => Promise<Response> {
    return async (request: NextRequest, ...rest: Args) => {
      const role = readRole(request);
      if (role === null || !allowedRoles.includes(role)) {
        return forbiddenResponse(allowedRoles, role);
      }
      return handler(request, ...rest);
    };
  };
}
