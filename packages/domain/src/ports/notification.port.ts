export interface NotificationMessage {
  readonly type: 'win' | 'loss' | 'status' | 'error' | 'info' | 'success';
  readonly title: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
  readonly timestamp?: number;
}

export interface NotificationPort {
  send(message: NotificationMessage): Promise<void>;
}
