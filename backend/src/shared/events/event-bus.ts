type EventHandler = (payload: Record<string, unknown>) => Promise<void>;

class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  on(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  off(event: string, handler: EventHandler): void {
    const existing = this.handlers.get(event) || [];
    this.handlers.set(event, existing.filter((h) => h !== handler));
  }

  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    const handlers = this.handlers.get(event) || [];
    await Promise.allSettled(handlers.map((h) => h(payload)));
  }
}

export const eventBus = new EventBus();
