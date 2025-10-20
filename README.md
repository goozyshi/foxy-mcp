# 🦊 Foxy MCP

**让 AI 助手无缝访问 Apifox 接口文档**

一个智能的 MCP (Model Context Protocol) 服务器，专为 Cursor 打造，支持：

- ✅ 读取 Apifox 接口文档（OpenAPI 3.1 规范）
- ✅ 智能缓存系统（混合内存+磁盘持久化）
- ✅ Mock 数据生成（支持真实数据混合）
- ✅ HTTP / CLI 双模式运行
- ✅ 交互式初始化向导

---

## 🚀 快速开始

### 一键初始化（推荐）

```bash
# 1. 克隆并安装
git clone <repo-url>
cd foxy-mcp
pnpm install

# 2. 构建项目
pnpm build

# 3. 运行交互式向导
pnpm intro
```

**向导会自动完成：**

- 选择鉴权方式（API Key / Cookie Token）
- 配置默认项目 ID
- 选择运行模式（HTTP 常驻服务 / CLI 自动管理）
- 生成 `.env` 配置文件
- 输出 MCP 配置（手动复制到 `~/.cursor/mcp.json`）

**示例流程：**

```
🦊 Foxy MCP 初始化向导

? 选择鉴权方式: API Key（Apifox 开发者令牌，需要 apifox 权限管理员以上）
? 请输入 Apifox API Key: ••••••••
? 是否配置默认项目ID？ Yes
? 请输入项目ID: 31890xx
? 选择运行模式: HTTP模式（团队共享，常驻后台）
? 服务端口: 3000

✅ 配置已保存到 .env

📋 复制以下配置到 ~/.cursor/mcp.json:
{
  "mcpServers": {
    "foxy-mcp": {
      "url": "http://localhost:3000/sse"
    }
  }
}

🚀 下一步:
  1. 启动服务: pnpm start
  2. 复制配置到 ~/.cursor/mcp.json
  3. 重启 Cursor
```

---

### 手动配置（可选）

<details>
<summary><strong>方式 A：CLI 模式（Cursor 自动管理）</strong></summary>

**特点**：

- 无需后台服务，Cursor 自动启动和关闭进程
- 适合个人使用

**步骤**：

1. 配置 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "foxy-mcp": {
      "command": "node",
      "args": ["/path/to/foxy-mcp/build/index.js", "--local"],
      "env": {
        "APIFOX_API_KEY": "APS-xxx",
        "PROJECT_ID": "31890xx"
      }
    }
  }
}
```

2. 重启 Cursor

</details>

<details>
<summary><strong>方式 B：HTTP 模式（团队共享）</strong></summary>
**特点**：

- 常驻后台服务，支持多个 Cursor 实例共享
- 适合团队协作
- 可能相对频繁启停服务

**步骤**：

1. 创建 `.env` 文件：

```bash
APIFOX_API_KEY=APS-xxx
PROJECT_ID=31890xx
PORT=3000
```

2. 启动服务：

```bash
pnpm start
```

3. 配置 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "foxy-mcp": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

4. 重启 Cursor

</details>

---

## 🛠️ 核心功能

### 1. 接口文档获取

**工具：`get-api-by-url`**

通过 Apifox 链接直接获取接口详情（OpenAPI 3.1 规范）

**使用示例：**

```
@foxy-mcp 这个接口的详情 https://app.apifox.com/link/project/3189010/apis/api-362821568

@foxy-mcp 分析登录接口的请求参数 https://app.apifox.com/link/project/xxx/apis/api-xxx
```

**特点：**

- ✅ 自动解析 Apifox URL
- ✅ 智能缓存（内存+磁盘持久化）
- ✅ 缓存命中提示（💾 内存 / 💿 磁盘）

---

**工具：`get-openapi-doc`**

获取整个文件夹的 OpenAPI 文档

**使用示例：**

```
@foxy-mcp 获取文件夹 123456 的接口文档

@foxy-mcp 导出用户模块的所有接口
```

---

### 2. 缓存管理

#### `cache-stats` - 查看缓存统计

```
@foxy-mcp 查看缓存统计
```

**输出示例：**

```
📊 缓存统计:

内存缓存: 15/200 个接口
磁盘缓存: 42/500 个接口

内存命中率: 78.5% (156 hits / 199 total)
磁盘命中率: 21.5% (43 hits / 199 total)
```

---

#### `refresh-cache` - 刷新单个接口缓存

清除旧缓存并立即获取最新数据（一步到位）

**使用示例：**

```
@foxy-mcp 获取最新协议 https://app.apifox.com/link/project/4519605/apis/api-175889154

@foxy-mcp 刷新缓存 https://app.apifox.com/link/project/4519605/apis/api-175889154
```

---

#### `clear-cache` - 清空缓存

```
@foxy-mcp 清空缓存

@foxy-mcp 清空项目 3189010 的缓存
```

---

### 3. Mock 数据生成

#### `generate-mock-data` - 生成 Mock 数据

基于 OpenAPI Schema 本地生成，无需依赖 Apifox Mock 服务

**参数：**

- `url` - Apifox 接口链接
- `type` - `request`（请求体）或 `response`（响应体）
- `statusCode` - 响应状态码（可选，默认 200）

**使用示例：**

```
@foxy-mcp 生成登录接口的请求体示例 https://app.apifox.com/link/project/xxx/apis/api-xxx

@foxy-mcp 生成用户详情接口的响应体 https://app.apifox.com/link/project/xxx/apis/api-xxx

@foxy-mcp 生成 401 错误响应 https://app.apifox.com/link/project/xxx/apis/api-xxx
```

**特点：**

- ✅ 使用 `@faker-js/faker` 生成真实感数据
- ✅ 智能字段识别（email、phone、avatar、userId 等）
- ✅ **优先使用真实数据池**（混合真实值）
- ✅ 自动复用缓存的接口文档

---

### 4. 真实数据池管理

#### `add-real-data` - 添加真实数据

将真实 API 响应数据添加到数据池，提升 Mock 真实感

**参数：**

- `data` - JSON 格式字符串
- `scope` - `global`（全局）或 `project`（项目级）
- `projectId` - 项目 ID（scope=project 时必需）

**使用示例：**

```
@foxy-mcp 添加真实数据到全局池：
{
  "uid": "313012040519936",
  "nickname": "测试用户",
  "avatar": "https://example.com/avatar.jpg",
  "token": "real_token_abc123"
}

@foxy-mcp 为项目 3189010 添加真实数据：
{
  "userId": ["12345", "67890"],
  "email": ["test@example.com", "user@test.com"]
}
```

**工作原理：**

1. 用户粘贴真实 API 响应（任意嵌套结构）
2. 系统递归提取所有字段值
3. 存储到数据池（全局或项目级）
4. 生成 Mock 时优先使用这些真实值

**特点：**

- ✅ **零格式限制**（递归提取所有字段）
- ✅ 自动去重合并
- ✅ 支持全局/项目级隔离
- ✅ 项目数据优先于全局数据

---

#### `list-real-data` - 查看数据池

```
@foxy-mcp 查看数据池

@foxy-mcp 查看全局数据池

@foxy-mcp 查看项目 3189010 的数据池
```

---

#### `clear-real-data` - 清空数据池

```
@foxy-mcp 清空全局数据池

@foxy-mcp 清空项目 3189010 的数据池

@foxy-mcp 清空所有数据池
```

**注意：**

- ⚠️ 此操作**不影响接口缓存**
- ⚠️ 清空后 Mock 生成将回退到 Faker

---

## ⚙️ 配置说明

### 鉴权方式

| 方式             | 获取方式                                                                                                 | 适用场景 | 稳定性      |
| ---------------- | -------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| **API Key**      | Apifox → 个人设置 → 开发者令牌 \| 参考[Apifox开放API-鉴权](https://apifox-openapi.apifox.cn/doc-4296599) | 生产环境 | ✅ 稳定     |
| **Cookie Token** | 浏览器 F12 → Cookies → Authorization                                                                     | 临时调试 | ⚠️ 会话过期 |

> ⚠️ **API Key 权限要求**：需要 Apifox 权限管理员及以上
>
> 💡 **Cookie Token 获取**：从浏览器 DevTools 的 Cookies 中复制 `Authorization` 字段

---

### 环境变量

| 变量                        | 必需 | 默认值  | 说明                    |
| --------------------------- | ---- | ------- | ----------------------- |
| `APIFOX_API_KEY`            | ⚠️   | -       | Apifox API 密钥（推荐） |
| `APIFOX_COOKIE_TOKEN`       | ⚠️   | -       | Cookie Token（调试用）  |
| `PROJECT_ID`                | ❌   | -       | 默认项目 ID             |
| `PORT`                      | ❌   | 3000    | HTTP 模式端口           |
| `CACHE_ENABLED`             | ❌   | true    | 是否启用缓存            |
| `CACHE_PERSISTENT`          | ❌   | true    | 是否启用磁盘持久化      |
| `CACHE_TTL`                 | ❌   | 3600000 | 缓存过期时间（毫秒）    |
| `CACHE_MAX_SIZE`            | ❌   | 200     | 内存缓存最大数量        |
| `CACHE_PERSISTENT_MAX_SIZE` | ❌   | 500     | 磁盘缓存最大数量        |
| `CACHE_SYNC_INTERVAL`       | ❌   | 30000   | 缓存同步间隔（毫秒）    |

> ⚠️ **至少提供一种鉴权方式**：`APIFOX_API_KEY` 或 `APIFOX_COOKIE_TOKEN`

---

## 📦 技术架构

### 混合缓存系统-减少接口调用

**架构：** 内存 LRU + 磁盘持久化

- **内存缓存（热数据）**：毫秒级响应，默认 200 个接口
- **磁盘持久化（冷数据）**：服务重启后仍有效，默认 500 个接口
- **自动同步**：每 30 秒异步写入磁盘（非阻塞）
- **多维索引**：支持 URL、接口名、路径快速查找
- **过期管理**：默认 1 小时 TTL，自动清理

**缓存位置：**

- **macOS**: `~/Library/Preferences/foxy-mcp/config.json`
- **Linux**: `~/.config/foxy-mcp/config.json`
- **Windows**: `%APPDATA%\foxy-mcp\config.json`

**存储结构：**

```json
{
  "cache": {
    "apis": {}, // 接口缓存数据
    "urlIndex": {}, // URL 索引
    "nameIndex": {}, // 接口名索引
    "pathIndex": {} // 路径索引
  },
  "mockDataPool": {
    "global": {}, // 全局真实数据池
    "projects": {} // 项目级真实数据池
  }
}
```

**数据隔离：**

- ✅ 清空缓存**不影响** Mock 数据池
- ✅ 清空数据池**不影响**接口缓存

---

### Mock 数据生成

**技术栈：**

- `openapi-sampler` - 基于 Schema 生成基础结构
- `@faker-js/faker` - 生成真实感数据（中文语言包）
- 自定义数据池 - 混合用户提供的真实值

**生成策略：**

1. 优先从数据池获取（项目级 > 全局）
2. 其次使用智能字段识别（email、phone、avatar 等）
3. 最后回退到 Faker 随机生成

**智能字段识别：**

| 字段名模式             | 生成逻辑                       |
| ---------------------- | ------------------------------ |
| `email`, `mail`        | faker.internet.email()         |
| `phone`, `mobile`      | faker.phone.number()           |
| `avatar`, `profilePic` | faker.image.avatar()           |
| `userId`, `uid`, `id`  | faker.string.numeric(15)       |
| `nickname`, `username` | faker.internet.username()      |
| `token`, `accessToken` | faker.string.alphanumeric(32)  |
| `url`, `link`          | faker.internet.url()           |
| `address`              | faker.location.streetAddress() |

---

## 🔧 命令行工具

### 可用命令

```bash
# 查看帮助
node build/cli.js --help

# 运行初始化向导
pnpm intro
node build/cli.js intro

# 启动服务（HTTP 模式）
pnpm start
node build/cli.js start

# 查看版本
node build/cli.js --version
```

---

## ❓ 常见问题

<details>
<summary><strong>Q: 如何获取文件夹 ID？</strong></summary>

Apifox → 项目 → 左侧模块树 → 右键文件夹 → 复制文件夹 ID

</details>

<details>
<summary><strong>Q: API Key 在哪里生成？</strong></summary>

Apifox → 个人设置 → 开发者令牌 | 参考[Apifox开放API-鉴权](https://apifox-openapi.apifox.cn/doc-4296599)

⚠️ 需要**权限管理员**及以上权限

</details>

<details>
<summary><strong>Q: Cookie Token 如何获取？</strong></summary>

1. 打开[ Apifox 网页版](https://apifox.com/)并登录
2. 按 F12 打开开发者工具
3. 切换到 Application → Cookies
4. 复制 `Authorization` 字段的值

⚠️ Cookie 会随会话过期，适合临时调试

</details>

<details>
<summary><strong>Q: 遇到 401 鉴权失败怎么办？</strong></summary>
**API Key 鉴权失败**：

可能原因：

- API Key 已过期或被撤销
- API Key 格式错误
- 账号权限不足（需要管理员以上权限）

解决方案：

1. 前往 Apifox → 个人设置 → 开发者令牌
2. 重新生成 API Key
3. 更新 `.env` 文件中的 `APIFOX_API_KEY`
4. 重启服务

**Cookie Token 鉴权失败**：

可能原因：

- 浏览器会话已过期
- Cookie Token 格式错误
- 已在浏览器端登出

解决方案：

1. 重新登录 Apifox 网页版
2. 按 F12 打开开发者工具
3. Application → Cookies → 复制 `Authorization` 字段
4. 更新 `.env` 文件中的 `APIFOX_COOKIE_TOKEN`
5. 重启服务

💡 **建议**：生产环境请使用 API Key（稳定性更好）

</details>

<details>
<summary><strong>Q: 遇到 403 权限不足怎么办？</strong></summary>

可能原因：

- 当前账号没有访问此项目的权限
- API Key 权限级别不足（需要管理员以上）

解决方案：

1. 联系项目管理员添加访问权限
2. 或使用有权限的账号生成新的 API Key

</details>

<details>
<summary><strong>Q: 启动时提示未提供鉴权凭证？</strong></summary>

错误信息：

```
❌ 鉴权配置错误：未提供任何鉴权凭证
```

解决方案：

1. **使用交互式向导**（推荐）：

   ```bash
   pnpm intro
   ```

2. **手动配置 `.env` 文件**：

   ```bash
   # 方式 1：使用 API Key（推荐）
   APIFOX_API_KEY=APS-xxx

   # 方式 2：使用 Cookie Token
   APIFOX_COOKIE_TOKEN=Bearer xxx
   ```

3. 重启服务

</details>

<details>
<summary><strong>Q: 两种运行模式的区别？</strong></summary>

| 模式     | 进程管理        | 适用场景 | 共享性       |
| -------- | --------------- | -------- | ------------ |
| **CLI**  | Cursor 自动管理 | 个人使用 | 每个窗口独立 |
| **HTTP** | 后台常驻服务    | 团队协作 | 多个实例共享 |

</details>

<details>
<summary><strong>Q: HTTP 模式端口被占用？</strong></summary>

启动时会自动检测并提示：

**解决方案：**

1. 清理占用进程（macOS/Linux）：

   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

2. 换端口启动：

   ```bash
   PORT=3001 pnpm start
   ```

3. 等待几秒后重试（如刚关闭服务）

</details>

<details>
<summary><strong>Q: 如何优雅关闭 HTTP 服务？</strong></summary>

按 `Ctrl+C`，服务会自动：

1. 关闭所有 SSE 连接
2. 刷新缓存到磁盘
3. 释放端口

</details>

<details>
<summary><strong>Q: 缓存数据存在哪里？</strong></summary>

macOS: `~/Library/Preferences/foxy-mcp/config.json`

可以手动删除该文件清空所有缓存

</details>

<details>
<summary><strong>Q: 如何禁用持久化缓存？</strong></summary>

```bash
CACHE_PERSISTENT=false pnpm start
```

</details>

<details>
<summary><strong>Q: 如何调整缓存时长？</strong></summary>

```bash
# 24 小时缓存
CACHE_TTL=86400000 pnpm start

# 仅内存缓存（不持久化）
CACHE_PERSISTENT=false CACHE_TTL=600000 pnpm start
```

</details>

<details>
<summary><strong>Q: 修改代码后如何更新？</strong></summary>

两种模式都需要：

1. 重新构建：`pnpm build`
2. 重启服务：
   - CLI 模式：重启 Cursor
   - HTTP 模式：重启服务器

</details>

---

## 📊 功能总览

| 分类          | 工具                 | 功能                      |
| ------------- | -------------------- | ------------------------- |
| **接口文档**  | `get-api-by-url`     | 通过 URL 获取接口详情     |
|               | `get-openapi-doc`    | 获取文件夹的 OpenAPI 文档 |
| **缓存管理**  | `cache-stats`        | 查看缓存统计              |
|               | `refresh-cache`      | 刷新单个接口缓存          |
|               | `clear-cache`        | 清空缓存                  |
| **Mock 生成** | `generate-mock-data` | 生成请求体/响应体 Mock    |
| **数据池**    | `add-real-data`      | 添加真实数据              |
|               | `list-real-data`     | 查看数据池                |
|               | `clear-real-data`    | 清空数据池                |

**共 9 个工具** + 交互式初始化向导

---

## 🛡️ 稳定性保障

### HTTP 模式特性

- ✅ **连接管理** - 实时追踪、自动清理、错误恢复
- ✅ **超时保护** - 非 SSE 端点 30 秒超时，SSE 保持长连接
- ✅ **请求日志** - 记录所有请求便于调试
- ✅ **错误处理** - 全局错误捕获和 404 处理
- ✅ **优雅关闭** - SIGTERM/SIGINT 信号处理，自动刷新缓存到磁盘

### 健康检查

```bash
curl http://localhost:3000/health
```

---

## 📝 开发

```bash
# 开发模式（热重载）
pnpm dev

# 构建
pnpm build

# 启动 HTTP 服务器
pnpm start

# 运行初始化向导
pnpm intro
```

---

## 🔗 相关链接

- [Model Context Protocol (MCP) 文档](https://modelcontextprotocol.io/)
- [Apifox - 开放API](https://apifox-openapi.apifox.cn/)
- [Apifox -](https://docs.apifox.com/apifox-mcp-server)

---

**欢迎贡献和反馈！** 🦊✨
