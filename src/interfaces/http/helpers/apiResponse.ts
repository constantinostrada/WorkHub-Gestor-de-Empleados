/**
 * API Response Helpers
 *
 * Thin utilities to build consistent JSON responses from Next.js Route Handlers.
 * HTTP concerns stay here — no domain or application logic.
 */

import { NextResponse } from 'next/server';

import { DomainConflictError } from '@/domain/errors/DomainConflictError';
import { DomainNotFoundError } from '@/domain/errors/DomainNotFoundError';
import { DomainValidationError } from '@/domain/errors/DomainValidationError';

export interface ApiErrorBody {
  error: string;
  code: string;
  details?: unknown;
}

export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function createdResponse<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function errorResponse(
  message: string,
  code: string,
  status: number,
  details?: unknown,
): NextResponse {
  const body: ApiErrorBody = { error: message, code, details };
  return NextResponse.json(body, { status });
}

/**
 * Maps known domain errors to appropriate HTTP responses.
 * Any unrecognised error becomes a 500.
 */
export function handleError(err: unknown): NextResponse {
  if (err instanceof DomainValidationError) {
    return errorResponse(err.message, 'VALIDATION_ERROR', 400);
  }
  if (err instanceof DomainNotFoundError) {
    return errorResponse(err.message, 'NOT_FOUND', 404);
  }
  if (err instanceof DomainConflictError) {
    return errorResponse(err.message, 'CONFLICT', 409);
  }

  // Unexpected errors — do not leak internals
  console.error('[API] Unhandled error:', err);
  return errorResponse('An unexpected error occurred.', 'INTERNAL_ERROR', 500);
}
