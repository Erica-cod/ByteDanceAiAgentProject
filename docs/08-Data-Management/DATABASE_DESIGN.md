# MongoDB Database Design

## Collections

### 1. users (用户集合)
```json
{
  "_id": "ObjectId",
  "userId": "string (unique, indexed)", // 用户唯一标识（自动生成或浏览器指纹）
  "username": "string (optional)",      // 用户名（可选）
  "createdAt": "Date",
  "lastActiveAt": "Date",
  "metadata": {
    "userAgent": "string",
    "firstIp": "string"
  }
}
```

### 2. conversations (对话会话集合)
```json
{
  "_id": "ObjectId",
  "conversationId": "string (unique, indexed)", // 对话ID（UUID）
  "userId": "string (indexed)",                 // 所属用户ID
  "title": "string",                            // 对话标题（第一条消息摘要）
  "createdAt": "Date",
  "updatedAt": "Date",
  "messageCount": "number",                     // 消息数量
  "isActive": "boolean"                         // 是否活跃
}
```

### 3. messages (消息集合)
```json
{
  "_id": "ObjectId",
  "messageId": "string (unique, indexed)",      // 消息ID（UUID）
  "conversationId": "string (indexed)",         // 所属对话ID
  "userId": "string (indexed)",                 // 所属用户ID
  "role": "string (user|assistant)",            // 消息角色
  "content": "string",                          // 消息内容
  "thinking": "string (optional)",              // AI思考过程（仅assistant）
  "modelType": "string (local|volcano)",        // 使用的模型
  "timestamp": "Date",                          // 消息时间戳
  "metadata": {
    "tokens": "number (optional)",
    "duration": "number (optional)"
  }
}
```

## Indexes

### users
- `userId` (unique)
- `createdAt`

### conversations
- `conversationId` (unique)
- `userId` + `updatedAt` (compound, for user's conversation list)
- `userId` + `isActive` (compound, for active conversations)

### messages
- `messageId` (unique)
- `conversationId` + `timestamp` (compound, for conversation messages)
- `userId` (for user's all messages)

## Security Considerations

1. **User Isolation**: All queries MUST include userId filter
2. **Data Encryption**: Consider encrypting sensitive message content
3. **Rate Limiting**: Implement per-user rate limits
4. **Data Retention**: Consider implementing data expiration policies

## API Endpoints

### User Management
- `POST /api/user/register` - Create or get user ID
- `GET /api/user/profile` - Get user profile

### Conversation Management
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations` - List user's conversations
- `GET /api/conversations/:id` - Get conversation details
- `DELETE /api/conversations/:id` - Delete conversation

### Message Management
- `POST /api/conversations/:id/messages` - Add message to conversation
- `GET /api/conversations/:id/messages` - Get conversation messages

