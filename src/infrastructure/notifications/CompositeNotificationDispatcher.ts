/**
 * CompositeNotificationDispatcher — fans out a single NotificationEvent to
 * every wrapped dispatcher in parallel. Each child failure is swallowed so
 * one bad child cannot block the others.
 */

import type {
  INotificationDispatcher,
  NotificationEvent,
} from '@/application/ports/INotificationDispatcher';

export class CompositeNotificationDispatcher implements INotificationDispatcher {
  constructor(private readonly children: INotificationDispatcher[]) {}

  async dispatch(event: NotificationEvent): Promise<void> {
    await Promise.all(
      this.children.map((c) =>
        c.dispatch(event).catch((err) => {
          console.warn('[notification] child dispatcher failed', err);
        }),
      ),
    );
  }
}
