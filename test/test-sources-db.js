/**
 * 测试脚本：检查数据库中的 sources 字段
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testSourcesInDB() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ MONGODB_URI 未配置');
    return;
  }

  console.log('🔗 连接数据库:', uri);
  
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ 数据库连接成功');
    
    const db = client.db('ai-chat');
    const collection = db.collection('messages');
    
    // 查询最近的 10 条消息
    const messages = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    console.log('\n📋 最近的 10 条消息：');
    console.log('='.repeat(80));
    
    messages.forEach((msg, index) => {
      console.log(`\n消息 ${index + 1}:`);
      console.log(`  角色: ${msg.role}`);
      console.log(`  内容预览: ${msg.content.substring(0, 50)}...`);
      console.log(`  有 thinking: ${!!msg.thinking}`);
      console.log(`  有 sources: ${!!msg.sources}`);
      
      if (msg.sources) {
        console.log(`  sources 数量: ${msg.sources.length}`);
        console.log(`  sources 内容:`, JSON.stringify(msg.sources, null, 2));
      }
      
      console.log(`  时间: ${msg.timestamp}`);
    });
    
    // 统计有 sources 的消息数量
    const messagesWithSources = await collection.countDocuments({ 
      sources: { $exists: true, $ne: null, $not: { $size: 0 } } 
    });
    
    const totalMessages = await collection.countDocuments({});
    
    console.log('\n📊 统计信息:');
    console.log('='.repeat(80));
    console.log(`  总消息数: ${totalMessages}`);
    console.log(`  有 sources 的消息数: ${messagesWithSources}`);
    
  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await client.close();
    console.log('\n✅ 数据库连接已关闭');
  }
}

testSourcesInDB();

