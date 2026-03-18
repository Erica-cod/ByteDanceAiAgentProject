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
   * 根据用户消息内容筛选可能相关的工具 schema。
   * 通过关键词匹配判断哪些工具类别可能被用到，减少发给模型的 token。
   * 如果无法判断，返回全部（安全 fallback）。
   */
  getRelevantSchemas(userMessage: string): Array<{ type: 'function'; function: FunctionSchema }> {
    const text = userMessage.toLowerCase();
    const matched = new Set<string>();

    // 时间类关键词
    if (/时间|日期|几点|星期|周几|今天|明天|昨天|后天|时区|日历|多少天|多久/.test(text)) {
      matched.add('get_current_time');
      matched.add('calculate_date');
      matched.add('parse_natural_date');
      matched.add('compare_dates');
    }

    // 搜索类关键词
    if (/搜索|查找|查询|最新|新闻|网上|互联网|百度|谷歌|google|search|实时/.test(text)) {
      matched.add('search_web');
    }

    // 计划类关键词
    if (/计划|任务|学习计划|项目计划|制定|安排|进度|plan|todo|待办/.test(text)) {
      matched.add('create_plan');
      matched.add('update_plan');
      matched.add('get_plan');
      matched.add('list_plans');
    }

    // 无法确定相关性 → 返回全部（保守策略）
    if (matched.size === 0) {
      return this.getAllSchemas();
    }

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


