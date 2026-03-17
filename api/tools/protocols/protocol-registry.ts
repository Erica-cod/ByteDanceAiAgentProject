/**
 * 通信协议注册表（可插拔）
 */

import type { ToolCallProtocol } from './types.js';

export class ToolCallProtocolRegistry {
  private protocols = new Map<string, ToolCallProtocol>();

  register(protocol: ToolCallProtocol): void {
    if (!protocol?.name) {
      throw new Error('协议缺少 name 字段');
    }
    this.protocols.set(protocol.name, protocol);
  }

  get(name: string): ToolCallProtocol | undefined {
    return this.protocols.get(name);
  }

  /**
   * 根据输入自动选择协议
   */
  detect(toolCall: any): ToolCallProtocol | undefined {
    for (const protocol of this.protocols.values()) {
      try {
        if (protocol.canHandle(toolCall)) return protocol;
      } catch {
        // ignore: 某些协议的 canHandle 可能会抛错，视为不匹配
      }
    }
    return undefined;
  }

  list(): string[] {
    return Array.from(this.protocols.keys());
  }
}

export const toolCallProtocolRegistry = new ToolCallProtocolRegistry();


