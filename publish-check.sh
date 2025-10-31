#!/bin/bash

# NPM 发布前检查脚本
echo "🦊 Foxy MCP - NPM 发布准备检查"
echo "================================"
echo ""

# 检查 Node.js 版本
echo "📌 Node.js 版本:"
node --version
echo ""

# 检查必需文件
echo "📌 必需文件检查:"
files=(".npmignore" "LICENSE" "README.md" "package.json" "tsconfig.json")
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file (缺失)"
  fi
done
echo ""

# 检查 build 目录
echo "📌 Build 目录:"
if [ -d "build" ]; then
  echo "✅ build/ 目录存在"
  if [ -f "build/cli.js" ]; then
    echo "✅ build/cli.js 存在"
    # 检查 shebang
    first_line=$(head -n 1 build/cli.js)
    if [ "$first_line" = "#!/usr/bin/env node" ]; then
      echo "✅ build/cli.js 包含正确的 shebang"
    else
      echo "⚠️  build/cli.js 缺少 shebang"
    fi
  else
    echo "❌ build/cli.js 不存在"
  fi
  
  if [ -f "build/index.js" ]; then
    echo "✅ build/index.js 存在"
  else
    echo "❌ build/index.js 不存在"
  fi
else
  echo "❌ build/ 目录不存在，请运行: pnpm build"
fi
echo ""

# 预览将要发布的文件
echo "📌 将要发布的文件预览:"
echo "运行以下命令查看: npm pack --dry-run"
echo ""

# 测试 CLI 命令
echo "📌 CLI 命令测试:"
if [ -f "build/cli.js" ]; then
  echo "运行: node build/cli.js --help"
  node build/cli.js --help 2>&1 || echo "⚠️  CLI 执行失败"
else
  echo "⚠️  跳过（build/cli.js 不存在）"
fi
echo ""

echo "================================"
echo "✨ 准备发布步骤:"
echo ""
echo "1. 确保 Node.js >= 20.0.0"
echo "   当前版本: $(node --version)"
echo ""
echo "2. 重新构建:"
echo "   pnpm build"
echo ""
echo "3. 验证包内容:"
echo "   npm pack --dry-run"
echo ""
echo "4. 本地测试:"
echo "   npm pack"
echo "   npm install -g ./foxy-mcp-1.0.0.tgz"
echo "   foxy-mcp --help"
echo ""
echo "5. 检查包名是否可用:"
echo "   npm view foxy-mcp"
echo ""
echo "6. 登录 npm:"
echo "   npm login"
echo ""
echo "7. 发布:"
echo "   npm publish"
echo ""

