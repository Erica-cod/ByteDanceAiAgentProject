/**
 * 内置通信协议注册
 *
 * 说明：通过“导入即注册”的方式，避免在业务代码里到处手动 register。
 */

import { toolCallProtocolRegistry } from './protocol-registry.js';
import { ollamaProtocol } from './ollama-protocol.js';
import { volcengineProtocol } from './volcengine-protocol.js';

// 注册顺序很重要：更具体的协议放前面（先匹配 tool_calls 的 Ollama）
toolCallProtocolRegistry.register(ollamaProtocol);
toolCallProtocolRegistry.register(volcengineProtocol);


