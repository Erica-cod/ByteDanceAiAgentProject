/**
 * 测试超长文本 Chunking 功能
 * 
 * 使用方法：
 * node test/test-chunking.js
 */

import fetch from 'node-fetch';

// 生成一个超长的计划文本（模拟真实场景）
function generateLongPlanText() {
  const sections = [];
  
  sections.push(`# 2024年产品研发计划

## 项目背景
本项目旨在开发一个创新的AI驱动的项目管理平台，帮助团队提高协作效率。

## 总体目标
1. 在Q2完成MVP版本开发
2. 在Q3获得1000个活跃用户
3. 在Q4实现盈亏平衡
4. 建立行业领先的AI辅助功能

## 第一阶段：需求分析与设计（Week 1-4）

### 里程碑1：需求文档完成
- 负责人：张三
- 截止时间：2024-02-15
- 依赖：市场调研完成

### 任务清单
1. 用户访谈（20+用户）
2. 竞品分析（5个主要竞品）
3. 功能优先级排序
4. 技术架构设计
5. UI/UX原型设计

### 风险
- 风险1：用户需求不明确
  - 缓解措施：增加用户访谈频次，建立用户反馈渠道
- 风险2：技术选型不当
  - 缓解措施：进行技术预研，邀请外部专家评审

## 第二阶段：核心功能开发（Week 5-12）

### 里程碑2：核心功能上线
- 负责人：李四
- 截止时间：2024-04-30
- 依赖：需求文档完成

### 功能模块
`);

  // 添加大量重复的详细内容
  for (let i = 1; i <= 20; i++) {
    sections.push(`
### 模块${i}：功能详细说明

#### 功能描述
这是第${i}个核心功能模块，包含以下子功能：
- 子功能${i}.1：数据采集与处理
- 子功能${i}.2：智能分析与推荐
- 子功能${i}.3：可视化展示
- 子功能${i}.4：导出与分享

#### 技术实现
- 前端：React + TypeScript + Ant Design
- 后端：Node.js + Express + MongoDB
- AI模型：GPT-4 API + 自研算法
- 部署：Docker + Kubernetes + AWS

#### 开发任务
1. 数据库表设计（2天）
2. API接口开发（5天）
3. 前端组件开发（7天）
4. 单元测试（3天）
5. 集成测试（2天）
6. 性能优化（2天）

#### 验收标准
- 功能完整性：100%
- 代码覆盖率：>80%
- 响应时间：<500ms
- 并发支持：1000+ QPS

#### 潜在问题
- 问题${i}.1：数据一致性如何保证？
- 问题${i}.2：高并发场景下的性能瓶颈？
- 问题${i}.3：AI模型的准确率如何提升？
`);
  }

  sections.push(`
## 第三阶段：测试与优化（Week 13-16）

### 里程碑3：Beta版本发布
- 负责人：王五
- 截止时间：2024-05-31
- 依赖：核心功能上线

### 测试计划
1. 单元测试（覆盖率>80%）
2. 集成测试（核心流程100%覆盖）
3. 性能测试（压力测试、负载测试）
4. 安全测试（漏洞扫描、渗透测试）
5. 用户验收测试（UAT）

### 优化方向
- 性能优化：数据库查询优化、缓存策略、CDN加速
- 体验优化：交互流程简化、响应速度提升、错误提示友好
- 稳定性优化：异常处理、日志监控、自动恢复

## 第四阶段：上线与运营（Week 17-20）

### 里程碑4：正式版上线
- 负责人：赵六
- 截止时间：2024-06-30
- 依赖：Beta版本发布

### 运营策略
1. 内容营销：技术博客、案例分享、白皮书
2. 社区运营：用户社群、在线活动、意见收集
3. 合作推广：行业合作、渠道分销、联合营销
4. 数据分析：用户行为分析、转化漏斗优化、A/B测试

### 关键指标（KPI）
- 用户增长：月活跃用户 >1000
- 用户留存：次日留存率 >40%，7日留存率 >20%
- 用户满意度：NPS >50
- 收入目标：月收入 >10万元

## 资源需求

### 人力资源
- 产品经理：2人
- 前端工程师：3人
- 后端工程师：3人
- AI工程师：2人
- 测试工程师：2人
- 运营人员：2人

### 预算
- 人力成本：150万/年
- 服务器成本：20万/年
- 第三方服务：10万/年
- 营销推广：30万/年
- 总计：210万/年

## 风险管理

### 技术风险
1. AI模型性能不达预期
2. 系统架构扩展性不足
3. 第三方服务稳定性问题

### 市场风险
1. 竞品快速跟进
2. 用户需求变化
3. 市场推广效果不佳

### 团队风险
1. 核心人员流失
2. 团队协作效率低
3. 技能储备不足

## 应急预案
- 技术预案：备用方案、降级策略、快速回滚
- 市场预案：策略调整、资源重新分配
- 团队预案：人员储备、知识传承、激励机制

## 总结
本计划覆盖了从需求分析到正式上线的完整流程，明确了各阶段的里程碑、任务、风险和应对措施。需要团队全员的共同努力和持续优化。
`);

  return sections.join('\n');
}

async function testChunking() {
  const longText = generateLongPlanText();
  
  console.log('='.repeat(60));
  console.log('📦 测试超长文本 Chunking 功能');
  console.log('='.repeat(60));
  console.log(`\n文本统计：`);
  console.log(`- 字符数：${longText.length}`);
  console.log(`- 行数：${longText.split('\n').length}`);
  console.log(`\n开始发送请求...\n`);
  
  try {
    const response = await fetch('http://localhost:8080/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: longText,
        modelType: 'volcano',
        userId: 'test-user-chunking',
        mode: 'single',
        longTextMode: 'plan_review',
        longTextOptions: {
          preferChunking: true,
          maxChunks: 10,
          includeCitations: false,
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log('✅ 连接成功，开始接收 SSE 流...\n');
    
    const reader = response.body;
    let buffer = '';
    
    reader.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          console.log('\n✅ 流式响应完成');
          process.exit(0);
        }
        
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.type === 'chunking_init') {
            console.log(`📦 初始化：共 ${parsed.totalChunks} 段，预计 ${parsed.estimatedSeconds} 秒`);
          } else if (parsed.type === 'chunking_progress') {
            const stage = parsed.stage;
            if (stage === 'map') {
              console.log(`🔍 分析第 ${parsed.chunkIndex + 1} 段...`);
            } else if (stage === 'reduce') {
              console.log(`🔄 合并分析结果...`);
            } else if (stage === 'final') {
              console.log(`📝 生成最终评审报告...\n`);
            }
          } else if (parsed.type === 'chunking_chunk') {
            console.log(`✅ 第 ${parsed.chunkIndex + 1} 段完成`);
          } else if (parsed.content) {
            process.stdout.write(parsed.content);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    });
    
    reader.on('error', (error) => {
      console.error('\n❌ 流读取错误:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
testChunking();

