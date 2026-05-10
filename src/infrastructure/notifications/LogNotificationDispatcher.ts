/**
 * LogNotificationDispatcher — Stub adapter (Infrastructure)
 *
 * Implements INotificationDispatcher by JSON-stringifying the event to
 * stdout. Default container binding until a real Email/Webhook adapter
 * is wired in.
 */

import type {
  INotificationDispatcher,
  NotificationEvent,
} from '@/application/ports/INotificationDispatcher';

export class LogNotificationDispatcher implements INotificationDispatcher {
  async dispatch(event: NotificationEvent): Promise<void> {
    console.log('[notification]', JSON.stringify(event));
  }
}
