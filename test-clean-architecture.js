/**
 * 测试 Clean Architecture 实现
 * 测试新旧两种架构的 Conversation API
 */

const BASE_URL = 'http://localhost:8080/api';

// 生成测试用户 ID
const testUserId = `test_user_${Date.now()}`;

/**
 * 测试创建对话
 */
async function testCreateConversation() {
  console.log('\n📝 测试创建对话...');
  
  const response = await fetch(`${BASE_URL}/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: testUserId,
      title: '测试对话 - Clean Architecture'
    })
  });

  const data = await response.json();
  
  if (data.success) {
    console.log('✅ 创建成功:', data.data.conversation.conversationId);
    return data.data.conversation;
  } else {
    console.error('❌ 创建失败:', data.error);
    return null;
  }
}

/**
 * 测试获取对话列表
 */
async function testGetConversations() {
  console.log('\n📋 测试获取对话列表...');
  
  const response = await fetch(
    `${BASE_URL}/conversations?userId=${testUserId}&limit=10&skip=0`
  );

  const data = await response.json();
  
  if (data.success) {
    console.log(`✅ 获取成功: 共 ${data.data.total} 个对话`);
    data.data.conversations.forEach((conv, index) => {
      console.log(`  ${index + 1}. ${conv.title} (${conv.conversationId})`);
    });
    return data.data;
  } else {
    console.error('❌ 获取失败:', data.error);
    return null;
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('🚀 开始测试 Conversation API');
  console.log(`📌 测试用户: ${testUserId}`);
  
  const useCleanArch = process.env.USE_CLEAN_ARCH === 'true';
  console.log(`📌 使用架构: ${useCleanArch ? '🆕 Clean Architecture' : '✅ Legacy Service'}`);
  
  try {
    // 测试创建对话
    const conversation = await testCreateConversation();
    if (!conversation) {
      throw new Error('创建对话失败');
    }

    // 测试获取对话列表
    const list = await testGetConversations();
    if (!list) {
      throw new Error('获取对话列表失败');
    }

    // 验证创建的对话在列表中
    const found = list.conversations.find(
      c => c.conversationId === conversation.conversationId
    );
    
    if (found) {
      console.log('\n✅✅✅ 所有测试通过！');
    } else {
      console.error('\n❌ 测试失败：创建的对话不在列表中');
    }
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
main();

