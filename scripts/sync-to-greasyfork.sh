#!/usr/bin/env bash
set -euo pipefail
# ──────────────────────────────────────────────────────────────
# sync-to-greasyfork.sh — 对齐 GitHub 源码与 Greasyfork 发布版本
#
# 功能:
#   1. 检查 JS 文件 license 字段是否为 GPL-3.0
#   2. 检查 LICENSE 文件是否存在
#   3. 读取当前版本号，交互式 bump（patch/minor/major）
#   4. 更新 JS 文件中的 @version
#   5. 更新 README 中的版本引用（如果有）
#   6. git commit + tag + push
#   7. 输出 Greasyfork 更新指引
# ──────────────────────────────────────────────────────────────

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
JS_FILE="$REPO_DIR/discourse-read-boost.user.js"
LICENSE_FILE="$REPO_DIR/LICENSE"
README="$REPO_DIR/README.md"

cd "$REPO_DIR"

# ── 前置检查 ──

echo "==> 检查 LICENSE 文件..."
if [ ! -f "$LICENSE_FILE" ]; then
    echo "ERROR: LICENSE 文件不存在！请先创建 GPLv3 LICENSE 文件。"
    exit 1
fi

echo "==> 检查 JS 文件 license 声明..."
if grep -q '@license.*GPL-3.0' "$JS_FILE"; then
    echo "  OK: @license GPL-3.0"
else
    echo "ERROR: JS 文件中 @license 不是 GPL-3.0，请先更新 license 声明。"
    exit 1
fi

echo "==> 检查 Git 工作区状态..."
if ! git diff --quiet; then
    echo "WARN: 工作区有未提交的修改，建议先 commit 再执行同步。"
    git status --short
    read -rp "是否继续？(y/N) " cont
    if [[ ! "$cont" =~ ^[yY] ]]; then exit 1; fi
fi

# ── 读取当前版本 ──

CURRENT_VERSION=$(grep -oP '//\s*@version\s+\K\S+' "$JS_FILE")
if [ -z "$CURRENT_VERSION" ]; then
    echo "ERROR: 无法从 JS 文件中提取版本号"
    exit 1
fi
echo "  当前版本: v$CURRENT_VERSION"

# ── 选择版本 bump 类型 ──

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
: "${PATCH:=0}" "${MINOR:=0}" "${MAJOR:=0}"

echo ""
echo "选择版本更新类型:"
echo "  1) patch (v$MAJOR.$MINOR.$((PATCH + 1)))"
echo "  2) minor (v$MAJOR.$((MINOR + 1)).0)"
echo "  3) major (v$((MAJOR + 1)).0.0)"
echo "  4) 跳过版本更新"
read -rp "请选择 [1-4]: " bump_choice

case "$bump_choice" in
    1) NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
    2) NEW_VERSION="$MAJOR.$((MINOR + 1)).0" ;;
    3) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    4) echo "  跳过版本更新" ; NEW_VERSION="$CURRENT_VERSION" ;;
    *) echo "无效选择，跳过版本更新" ; NEW_VERSION="$CURRENT_VERSION" ;;
esac

# ── 更新版本号 ──

if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
    echo ""
    echo "==> 更新版本号: v$CURRENT_VERSION → v$NEW_VERSION"
    sed -i -E "s|^//[[:space:]]*@version[[:space:]]+$CURRENT_VERSION$|// @version      $NEW_VERSION|" "$JS_FILE"
    echo "  JS 版本已更新"
fi

# ── 最终确认 ──

echo ""
echo "============================================"
echo "  版本: v$NEW_VERSION"
echo "  许可证: GPLv3"
echo "  文件: $(basename "$JS_FILE")"
echo "============================================"
echo ""

git diff --stat

echo ""
read -rp "确认提交并推送？(y/N) " confirm
if [[ ! "$confirm" =~ ^[yY] ]]; then
    echo "已取消。变更保留在工作区。"
    exit 0
fi

# ── Git commit & tag & push ──

git add -A
git commit -m "chore: v$NEW_VERSION — bump version & align with Greasyfork"
git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION"

echo "==> 推送到 origin..."
if command -v GIT_SSH_COMMAND &>/dev/null; then
    GIT_SSH_COMMAND='ssh -p 443 -o StrictHostKeyChecking=accept-new' git push origin main --follow-tags
else
    # fallback: use the repo's configured remote
    GIT_SSH_COMMAND='ssh -p 443 -o StrictHostKeyChecking=accept-new' git push origin main --follow-tags 2>/dev/null || \
        git push origin main --follow-tags
fi

echo ""
echo "============================================"
echo "  ✅ 推送完成！"
echo ""
echo "  Greasyfork 同步指引:"
echo "    1. 打开 Discourse Read Boost 的 GreasyFork 脚本管理页"
echo "    2. 进入 Advanced → Update script from URL"
echo "    3. 填入:"
echo "       https://raw.githubusercontent.com/VKKKV/discourse-read-boost/main/discourse-read-boost.user.js"
echo "    4. 点击 Update"
echo ""
echo "  或手动上传新版本:"
echo "    1. 下载: curl -LO https://raw.githubusercontent.com/VKKKV/discourse-read-boost/main/discourse-read-boost.user.js"
echo "    2. 在 Greasyfork 上传该文件"
echo "============================================"
