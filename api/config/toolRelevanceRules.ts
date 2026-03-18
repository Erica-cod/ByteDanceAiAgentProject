/**
 * 工具注册中心 — 意图匹配规则配置
 *
 * 定义 getRelevantSchemas 中使用的：
 *   - 闲聊检测正则
 *   - 意图→工具名映射
 *   - 默认基础工具集
 *
 * 新增工具意图只需在此文件添加一条规则即可。
 */

/** 闲聊检测：短于 20 字符且匹配此正则 → 不附带任何工具 */
export const CHAT_NO_TOOLS_PATTERN =
  /^(你好|hi|hello|hey|嗨|早上好|晚上好|下午好|谢谢|thanks|thank you|ok|好的|嗯|再见|bye|拜拜|晚安|早安|哈哈|666|收到|明白|懂了|对的|是的|没错|好吧|不用了|可以|行|没问题)\s*[!！。.？?~，,]*$/i;

export const CHAT_NO_TOOLS_MAX_LENGTH = 20;

/** 意图规则：正则匹配 → 映射到一组工具名 */
export interface IntentRule {
  pattern: RegExp;
  tools: string[];
}

export const INTENT_RULES: IntentRule[] = [
  {
    pattern: /现在几点|什么时间|当前时间|日期计算|时间差|时区转换|多少天后|多少天前|周几$|星期几$|几号$/,
    tools: ['get_current_time', 'calculate_date', 'parse_natural_date', 'compare_dates'],
  },
  {
    pattern: /搜索|搜一下|查找|查询|查一下|查一查|帮我查|帮我搜|帮我找|看一下|看看|了解一下|最新|新闻|天气|热点|热搜|百度|谷歌|google|bing|search|实时|怎么样|价格|多少钱|发布|上市|评测|测评|推荐|排名|排行|教程|攻略|指南|怎么做|如何做|哪里|哪个好|对比|区别/,
    tools: ['search_web'],
  },
  {
    pattern: /计划|任务|学习计划|项目计划|制定|安排|进度|plan|todo|待办|日程/,
    tools: ['create_plan', 'update_plan', 'get_plan', 'list_plans'],
  },
];

/** 始终附带的基础工具集（模型需要感知真实时间） */
export const BASE_TOOLS: string[] = ['search_web', 'get_current_time'];
