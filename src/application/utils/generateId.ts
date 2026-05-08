/**
 * generateId — Application-level utility
 *
 * Returns a UUID v4 string.
 * Kept here (not in domain) because the domain should not depend on
 * specific ID generation strategies.
 *
 * Node 20+ ships with `crypto.randomUUID()` — no extra dependency needed.
 */

import { randomUUID } from 'crypto';

export function generateId(): string {
  return randomUUID();
}
