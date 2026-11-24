import type { WindowCloseMode, WindowInstance } from './types';

export type WindowBusMessage =
  | { type: 'WINDOW_ATTACH_REQUEST'; id: string }
  | { type: 'WINDOW_STATE_SYNC'; id: string; data: Record<string, unknown> }
  | { type: 'WINDOW_ACTION_CLOSE'; id: string; mode: WindowCloseMode }
  | { type: 'WINDOW_ACTION_DUPLICATE'; id: string }
  | { type: 'WINDOW_PIN_TOGGLE'; id: string; isAlwaysOnTop: boolean }
  | { type: 'WINDOW_NATIVE_CLOSED'; id: string }
  | { type: 'WINDOW_REQUEST_SYNC'; id: string }
  | { type: 'WINDOW_SYNC_INSTANCE'; instance: WindowInstance };

const CHANNEL_NAME = 'worklens:window-bus';

let channelInstance: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channelInstance) {
    try {
      channelInstance = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return channelInstance;
}

/**
 * Broadcasts a window event to all other windows (main window and detached windows).
 */
export function broadcastWindowEvent(message: WindowBusMessage): void {
  const channel = getChannel();
  if (channel) {
    try {
      channel.postMessage(message);
    } catch {
      // Ignore serialization/posting errors
    }
  }
}

/**
 * Subscribes to window events emitted by any window.
 * Returns an unsubscription callback.
 */
export function subscribeToWindowBus(handler: (msg: WindowBusMessage) => void): () => void {
  const channel = getChannel();
  if (!channel) return () => {};

  const onMessage = (event: MessageEvent<WindowBusMessage>) => {
    if (event.data && typeof event.data.type === 'string') {
      handler(event.data);
    }
  };

  channel.addEventListener('message', onMessage);
  return () => {
    channel.removeEventListener('message', onMessage);
  };
}
