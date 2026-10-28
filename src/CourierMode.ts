import { openDoor } from './Evo/DoorPhone.js';

/** One-shot permissions are intentionally kept in memory, never restored on startup. */
export class CourierMode {
  private readonly waiting = new Set<number>();

  constructor(private readonly open: (deviceId: number) => Promise<unknown>) {}

  isWaiting(deviceId: number): boolean {
    return this.waiting.has(deviceId);
  }

  setWaiting(deviceId: number, enabled: boolean): void {
    if (enabled) {
      this.waiting.add(deviceId);
    } else {
      this.waiting.delete(deviceId);
    }
  }

  async handleCall(deviceId: number): Promise<void> {
    // Consume synchronously, including while the opening request is pending or fails.
    if (!this.waiting.delete(deviceId)) {
      return;
    }
    await this.open(deviceId);
  }
}

export const courierMode = new CourierMode(deviceId => openDoor(deviceId, 1));
