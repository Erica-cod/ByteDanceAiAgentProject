/**
 * 工具注册中心
 *
 * 职责：
 * - 自动发现和注册工具插件
 * - 生成 Function Calling Schema
 * - 提供工具查询接口
 */

import type { ToolPlugin, FunctionSchema, ToolMetadata } from '../types.js';

export class ToolRegistry {
  private tools: Map<string, ToolPlugin> = new Map();
  private initialized: boolean = false;

  /**
   * 注册单个工具
   */
  register(plugin: ToolPlugin): void {
    const { name } = plugin.metadata;

    // 验证工具定义
    this.validatePlugin(plugin);

    // 如果已存在，发出警告
    if (this.tools.has(name)) {
      console.warn(`⚠️  工具 "${name}" 已存在，将被覆盖`);
    }

    // 注册工具
    this.tools.set(name, plugin);
    console.log(`✅ 工具 "${name}" 已注册 (v${plugin.metadata.version})`);

    // 调用初始化钩子
    if (plugin.onInit) {
      const result = plugin.onInit();
      if (result && typeof (result as any).catch === 'function') {
        (result as any).catch((error: any) => {
          console.error(`❌ 工具 "${name}" 初始化失败:`, error);
        });
      }
    }
  }

  /**
   * 批量注册工具
   */
  registerAll(plugins: ToolPlugin[]): void {
    plugins.forEach(plugin => this.register(plugin));
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    const plugin = this.tools.get(name);

    if (!plugin) {
      console.warn(`⚠️  工具 "${name}" 不存在`);
      return false;
    }

    // 调用销毁钩子
    if (plugin.onDestroy) {
      const result = plugin.onDestroy();
      if (result && typeof (result as any).catch === 'function') {
        (result as any).catch((error: any) => {
          console.error(`❌ 工具 "${name}" 销毁失败:`, error);
        });
      }
    }

    this.tools.delete(name);
    console.log(`✅ 工具 "${name}" 已注销`);
    return true;
  }

  /**
   * 获取工具插件
   */
  get(name: string): ToolPlugin | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具名称
   */
  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取所有工具元数据
   */
  getAllMetadata(): ToolMetadata[] {
    return Array.from(this.tools.values()).map(plugin => plugin.metadata);
  }

  /**
   * 获取所有工具的 Function Calling Schema
   * 用于传递给 OpenAI API
   */
  getAllSchemas(): Array<{ type: 'function'; function: FunctionSchema }> {
    return Array.from(this.tools.values())
      .filter(plugin => plugin.metadata.enabled !== false)
      .map(plugin => ({
        type: 'function' as const,
        function: plugin.schema,
      }));
  }

  /**
   * 根据用户消息内容筛选可能相关的工具 schema，减少发给远程模型的 token。
   *
   * 三层分类策略：
   *   Layer 1 — 闲聊检测：短消息+闲聊模式 → 返回空数组
   *   Layer 2 — 意图模式匹配：命中特定工具组 → 返回匹配工具（始终附带基础工具集）
   *   Layer 3 — 兜底：search_web + get_current_time（模型时间认知停留在训练截止日期）
   */
  getRelevantSchemas(userMessage: string): Array<{ type: 'function'; function: FunctionSchema }> {
    const text = userMessage.toLowerCase().trim();

    // ── Layer 1: 闲聊检测 → 不需要任何工具 ──
    const NO_TOOLS = /^(你好|hi|hello|hey|嗨|早上好|晚上好|下午好|谢谢|thanks|thank you|ok|好的|嗯|再见|bye|拜拜|晚安|早安|哈哈|666|收到|明白|懂了|对的|是的|没错|好吧|不用了|可以|行|没问题)\s*[!！。.？?~，,]*$/i;
    if (text.length < 20 && NO_TOOLS.test(text)) {
      console.log('🔧 [ToolRegistry] Layer1 闲聊检测: 不传递工具');
      return [];
    }

    // ── Layer 2: 意图模式匹配 ──
    const matched = new Set<string>();

    // 时间工具（收窄：只匹配明确的时间意图，"今天/明天" 太泛不再触发）
    if (/现在几点|什么时间|当前时间|日期计算|时间差|时区转换|多少天后|多少天前|周几$|星期几$|几号$/.test(text)) {
      matched.add('get_current_time');
      matched.add('calculate_date');
      matched.add('parse_natural_date');
      matched.add('compare_dates');
    }

    // 搜索工具（扩展：覆盖隐含搜索意图）
    if (/搜索|搜一下|查找|查询|查一下|查一查|帮我查|帮我搜|帮我找|看一下|看看|了解一下|最新|新闻|天气|热点|热搜|百度|谷歌|google|bing|search|实时|怎么样|价格|多少钱|发布|上市|评测|测评|推荐|排名|排行|教程|攻略|指南|怎么做|如何做|哪里|哪个好|对比|区别/.test(text)) {
      matched.add('search_web');
    }

    // 计划工具
    if (/计划|任务|学习计划|项目计划|制定|安排|进度|plan|todo|待办|日程/.test(text)) {
      matched.add('create_plan');
      matched.add('update_plan');
      matched.add('get_plan');
      matched.add('list_plans');
    }

    // 基础工具集：search_web + get_current_time 始终附带（模型需要感知真实时间）
    const BASE_TOOLS = ['search_web', 'get_current_time'];
    for (const t of BASE_TOOLS) matched.add(t);

    const allEnabled = Array.from(this.tools.values())
      .filter(plugin => plugin.metadata.enabled !== false);

    const relevant = allEnabled
      .filter(plugin => matched.has(plugin.schema.name))
      .map(plugin => ({
        type: 'function' as const,
        function: plugin.schema,
      }));

    console.log(`🔧 [ToolRegistry] 工具瘦身: ${allEnabled.length} → ${relevant.length} (匹配: ${Array.from(matched).join(', ')})`);
    return relevant;
  }

  /**
   * 根据标签筛选工具
   */
  getByTags(tags: string[]): ToolPlugin[] {
    return Array.from(this.tools.values()).filter(plugin => {
      const pluginTags = plugin.metadata.tags || [];
      return tags.some(tag => pluginTags.includes(tag));
    });
  }

  /**
   * 获取启用的工具数量
   */
  getEnabledCount(): number {
    return Array.from(this.tools.values()).filter(plugin => plugin.metadata.enabled !== false).length;
  }

  /**
   * 验证工具插件定义
   */
  private validatePlugin(plugin: ToolPlugin): void {
    const { metadata, schema, execute } = plugin;

    // 验证元数据
    if (!metadata.name || typeof metadata.name !== 'string') {
      throw new Error('工具元数据缺少有效的 name 字段');
    }

    if (!metadata.description || typeof metadata.description !== 'string') {
      throw new Error(`工具 "${metadata.name}" 缺少 description 字段`);
    }

    if (!metadata.version || typeof metadata.version !== 'string') {
      throw new Error(`工具 "${metadata.name}" 缺少 version 字段`);
    }

    // 验证 schema
    if (!schema.name || schema.name !== metadata.name) {
      throw new Error(`工具 "${metadata.name}" 的 schema.name 必须与 metadata.name 一致`);
    }

    if (!schema.description) {
      throw new Error(`工具 "${metadata.name}" 的 schema 缺少 description 字段`);
    }

    if (!schema.parameters || typeof schema.parameters !== 'object') {
      throw new Error(`工具 "${metadata.name}" 的 schema 缺少 parameters 定义`);
    }

    // 验证执行函数
    if (typeof execute !== 'function') {
      throw new Error(`工具 "${metadata.name}" 缺少 execute 函数`);
    }

    // 验证限流配置
    if (plugin.rateLimit) {
      const { maxConcurrent, maxPerMinute, timeout } = plugin.rateLimit;

      if (typeof maxConcurrent !== 'number' || maxConcurrent <= 0) {
        throw new Error(`工具 "${metadata.name}" 的 rateLimit.maxConcurrent 必须是正整数`);
      }

      if (typeof maxPerMinute !== 'number' || maxPerMinute <= 0) {
        throw new Error(`工具 "${metadata.name}" 的 rateLimit.maxPerMinute 必须是正整数`);
      }

      if (typeof timeout !== 'number' || timeout <= 0) {
        throw new Error(`工具 "${metadata.name}" 的 rateLimit.timeout 必须是正整数`);
      }
    }
  }

  /**
   * 打印注册表摘要
   */
  printSummary(): void {
    console.log('\n📦 工具注册表摘要');
    console.log('═'.repeat(50));
    console.log(`总数: ${this.tools.size}`);
    console.log(`启用: ${this.getEnabledCount()}`);
    console.log('─'.repeat(50));

    Array.from(this.tools.values()).forEach(plugin => {
      const { name, version, enabled = true } = plugin.metadata;
      const status = enabled ? '✅' : '❌';
      console.log(`${status} ${name} (v${version})`);
    });

    console.log('═'.repeat(50));
  }
}

// 单例实例
export const toolRegistry = new ToolRegistry();


