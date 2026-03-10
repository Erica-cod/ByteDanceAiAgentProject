type CrossTabEvent =
  | {
      type: 'conversation_updated';
      conversationId: string;
      version: number;
      sourceTabId: string;
      at: number;
    }
  | {
      type: 'conversation_list_updated';
      version: number;
      sourceTabId: string;
      at: number;
    };

const STORAGE_EVENT_KEY = 'ai_agent_cross_tab_event';
const CHANNEL_NAME = 'ai_agent_cross_tab_channel';

function createTabId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = sessionStorage.getItem('ai_agent_tab_id');
  if (existing) return existing;
  const generated = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  sessionStorage.setItem('ai_agent_tab_id', generated);
  return generated;
}

export const crossTabTabId = createTabId();

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function publishConversationUpdated(conversationId: string): void {
  if (typeof window === 'undefined' || !conversationId) return;

  const event: CrossTabEvent = {
    type: 'conversation_updated',
    conversationId,
    version: Date.now(),
    sourceTabId: crossTabTabId,
    at: Date.now(),
  };

  const bc = getChannel();
  if (bc) {
    bc.postMessage(event);
    return;
  }

  try {
    localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(event));
  } catch (error) {
    console.warn('跨 tab 通知发送失败（storage fallback）:', error);
  }
}

export function publishConversationListUpdated(): void {
  if (typeof window === 'undefined') return;

  const event: CrossTabEvent = {
    type: 'conversation_list_updated',
    version: Date.now(),
    sourceTabId: crossTabTabId,
    at: Date.now(),
  };

  const bc = getChannel();
  if (bc) {
    bc.postMessage(event);
    return;
  }

  try {
    localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(event));
  } catch (error) {
    console.warn('跨 tab 会话列表通知发送失败（storage fallback）:', error);
  }
}

export function subscribeCrossTabEvents(
  handler: (event: CrossTabEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onBroadcastMessage = (message: MessageEvent<CrossTabEvent>) => {
    const event = message.data;
    if (!event || event.sourceTabId === crossTabTabId) return;
    handler(event);
  };

  const onStorage = (storageEvent: StorageEvent) => {
    if (storageEvent.key !== STORAGE_EVENT_KEY || !storageEvent.newValue) return;
    try {
      const event = JSON.parse(storageEvent.newValue) as CrossTabEvent;
      if (!event || event.sourceTabId === crossTabTabId) return;
      handler(event);
    } catch (error) {
      console.warn('解析跨 tab 通知失败:', error);
    }
  };

  const bc = getChannel();
  if (bc) {
    bc.addEventListener('message', onBroadcastMessage as EventListener);
  }

  window.addEventListener('storage', onStorage);

  return () => {
    if (bc) {
      bc.removeEventListener('message', onBroadcastMessage as EventListener);
    }
    window.removeEventListener('storage', onStorage);
  };
}
