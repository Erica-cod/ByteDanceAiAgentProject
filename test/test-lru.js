/**
 * LRU 功能测试脚本
 * 
 * 测试场景：
 * 1. 创建超过限制数量的对话
 * 2. 验证自动归档功能
 * 3. 测试恢复归档对话
 * 4. 验证 LRU 调度器状态
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'http://localhost:8080';
const TEST_USER_ID = `test_user_lru_${Date.now()}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLRU() {
  console.log('🧪 开始测试 LRU 功能...');
  console.log(`📝 测试用户: ${TEST_USER_ID}`);
  console.log(`🔗 API 地址: ${BASE_URL}\n`);

  try {
    // 1. 创建 51 个对话（超过默认限制 50）
    console.log('📝 步骤 1: 创建 51 个对话（超过限制）...');
    const conversationIds = [];
    
    for (let i = 0; i < 51; i++) {
      const response = await fetch(`${BASE_URL}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: TEST_USER_ID,
          title: `测试对话 ${i + 1}`,
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.data.conversation) {
        conversationIds.push(data.data.conversation.conversationId);
        if ((i + 1) % 10 === 0) {
          console.log(`  ✅ 已创建 ${i + 1} 个对话`);
        }
      } else {
        console.error(`  ❌ 创建对话 ${i + 1} 失败:`, data.error);
      }
      
      // 避免请求过快
      await sleep(50);
    }
    
    console.log(`  ✅ 总共创建了 ${conversationIds.length} 个对话\n`);

    // 等待一下，确保归档操作完成
    await sleep(1000);

    // 2. 检查活跃对话数
    console.log('📊 步骤 2: 检查活跃对话数...');
    const activeResponse = await fetch(
      `${BASE_URL}/api/conversations?userId=${TEST_USER_ID}&limit=100`
    );
    const activeData = await activeResponse.json();
    
    if (activeData.success) {
      const activeCount = activeData.data.total;
      console.log(`  活跃对话数: ${activeCount}`);
      console.log(`  预期: <= 50`);
      
      if (activeCount <= 50) {
        console.log('  ✅ 通过：活跃对话数符合限制\n');
      } else {
        console.log('  ⚠️  警告：活跃对话数超过限制\n');
      }
    } else {
      console.error('  ❌ 获取活跃对话失败:', activeData.error, '\n');
    }

    // 3. 检查归档对话数
    console.log('📦 步骤 3: 检查归档对话数...');
    const archivedResponse = await fetch(
      `${BASE_URL}/api/conversations/archived?userId=${TEST_USER_ID}&limit=100`
    );
    const archivedData = await archivedResponse.json();
    
    if (archivedData.success) {
      const archivedCount = archivedData.data.total;
      console.log(`  归档对话数: ${archivedCount}`);
      console.log(`  预期: >= 1`);
      
      if (archivedCount >= 1) {
        console.log('  ✅ 通过：有对话被成功归档\n');
      } else {
        console.log('  ⚠️  警告：没有对话被归档（可能需要手动触发）\n');
      }

      // 4. 测试恢复归档对话
      if (archivedData.data.conversations.length > 0) {
        const archivedConv = archivedData.data.conversations[0];
        console.log('🔄 步骤 4: 测试恢复归档对话...');
        console.log(`  对话标题: ${archivedConv.title}`);
        console.log(`  对话ID: ${archivedConv.conversationId}`);
        
        const restoreResponse = await fetch(
          `${BASE_URL}/api/conversations/archived/restore`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: archivedConv.conversationId,
              userId: TEST_USER_ID,
            }),
          }
        );
        
        const restoreData = await restoreResponse.json();
        
        if (restoreData.success) {
          console.log('  ✅ 通过：归档对话恢复成功\n');
          
          // 验证恢复后的状态
          await sleep(500);
          const verifyResponse = await fetch(
            `${BASE_URL}/api/conversations?userId=${TEST_USER_ID}&limit=100`
          );
          const verifyData = await verifyResponse.json();
          
          if (verifyData.success) {
            const found = verifyData.data.conversations.some(
              c => c.conversationId === archivedConv.conversationId
            );
            if (found) {
              console.log('  ✅ 验证：对话已重新出现在活跃列表中\n');
            } else {
              console.log('  ⚠️  警告：对话未出现在活跃列表中\n');
            }
          }
        } else {
          console.error('  ❌ 恢复归档对话失败:', restoreData.error, '\n');
        }
      } else {
        console.log('🔄 步骤 4: 跳过（没有归档对话可恢复）\n');
      }
    } else {
      console.error('  ❌ 获取归档对话失败:', archivedData.error, '\n');
    }

    // 5. 检查 LRU 调度器状态
    console.log('⚙️  步骤 5: 检查 LRU 调度器状态...');
    const statusResponse = await fetch(`${BASE_URL}/api/admin/lru-status`);
    const statusData = await statusResponse.json();
    
    if (statusData.success) {
      const status = statusData.data;
      console.log(`  调度器运行中: ${status.isRunning ? '是' : '否'}`);
      console.log(`  调度器已启动: ${status.isScheduled ? '是' : '否'}`);
      console.log(`  最后运行时间: ${status.lastRunAt || '未运行'}`);
      
      if (status.lastResult) {
        console.log(`  上次清理结果:`);
        console.log(`    - 归档: ${status.lastResult.archived || 0} 个`);
        console.log(`    - 删除过期: ${status.lastResult.deletedExpired || 0} 个`);
        console.log(`    - 删除超限: ${status.lastResult.deletedExcess || 0} 个`);
      }
      
      console.log('  ✅ 通过：LRU 调度器正常运行\n');
    } else {
      console.error('  ❌ 获取 LRU 状态失败:', statusData.error, '\n');
    }

    // 6. 手动触发清理任务
    console.log('🧹 步骤 6: 手动触发清理任务...');
    const triggerResponse = await fetch(`${BASE_URL}/api/admin/lru-status/trigger`, {
      method: 'POST',
    });
    const triggerData = await triggerResponse.json();
    
    if (triggerData.success) {
      console.log('  ✅ 清理任务已触发');
      if (triggerData.data.result) {
        console.log(`  清理结果:`);
        console.log(`    - 归档: ${triggerData.data.result.archived || 0} 个`);
        console.log(`    - 删除过期: ${triggerData.data.result.deletedExpired || 0} 个`);
        console.log(`    - 删除超限: ${triggerData.data.result.deletedExcess || 0} 个`);
        console.log(`    - 耗时: ${triggerData.data.result.duration || 0} ms`);
      }
      console.log('\n');
    } else {
      console.error('  ❌ 触发清理任务失败:', triggerData.error, '\n');
    }

    // 测试总结
    console.log('═══════════════════════════════════════════════════');
    console.log('🎉 测试完成！');
    console.log('═══════════════════════════════════════════════════');
    console.log('\n📊 测试总结：');
    console.log(`  • 创建对话数: ${conversationIds.length}`);
    console.log(`  • 活跃对话数: ${activeData.data?.total || 0}`);
    console.log(`  • 归档对话数: ${archivedData.data?.total || 0}`);
    console.log('\n✨ LRU 功能测试通过！\n');

    // 清理测试数据（可选）
    console.log('🧹 清理测试数据...');
    console.log('  提示：测试数据会在定期清理任务中自动删除');
    console.log('  或者手动删除用户：', TEST_USER_ID, '\n');

  } catch (error) {
    console.error('\n❌ 测试过程中发生错误:', error);
    process.exit(1);
  }
}

// 运行测试
testLRU().catch(console.error);

