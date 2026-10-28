import EventEmitter from 'node:events';

/** Local events shared by every entry point that opens a door. */
export const doorEvents = new EventEmitter<{ opened: [deviceId: number] }>();
