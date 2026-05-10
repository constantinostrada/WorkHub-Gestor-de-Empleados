/**
 * INotificationDispatcher — Outbound Port (Application)
 *
 * Application use cases publish NotificationEvents through this port.
 * Concrete adapters live in infrastructure/notifications/ (e.g. log,
 * email, webhook). Use cases never know which adapter is bound.
 */

export interface VacationCreatedEvent {
  event_type: 'vacation.created';
  vacation_id: string;
  employee_id: string;
  employee_name: string;
  area_id: string;
  start_date: string;
  end_date: string;
  status: 'pending';
  created_at: string;
}

export interface VacationApprovedEvent {
  event_type: 'vacation.approved';
  vacation_id: string;
  employee_id: string;
  approver_id: string | null;
  start_date: string;
  end_date: string;
  decided_at: string;
}

export interface VacationRejectedEvent {
  event_type: 'vacation.rejected';
  vacation_id: string;
  employee_id: string;
  approver_id: string | null;
  start_date: string;
  end_date: string;
  decided_at: string;
  reason?: string;
}

export type NotificationEvent =
  | VacationCreatedEvent
  | VacationApprovedEvent
  | VacationRejectedEvent;

export interface INotificationDispatcher {
  dispatch(event: NotificationEvent): Promise<void>;
}
