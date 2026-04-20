# Lanzou MCP

一个基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的蓝奏云工具服务，提供登录、网盘列表、文件下载信息和分享页直链解析能力。

## 功能

- `lanzou_login`：登录蓝奏云并返回可复用的 `cookieHeader`
- `lanzou_get_mydisk_content`：按 `uid` 获取网盘文件列表（默认 `task=5`）
- `lanzou_get_file_link`：按 `file_id` 获取下载信息（`task=22`）
- `lanzou_get_direct_link`：支持无密码/带密码分享页，解析直链

## 环境要求

- Node.js 18+
- npm

## 安装

```bash
npm install
```

## 启动

```bash
npm start
```

服务入口：`src/server.js`

## MCP 客户端接入示例（Codex）

```bash
codex mcp add lanzou -- node C:/Users/16417/Desktop/lanzou/src/server.js
```

## 工具接口简表

### 1) `lanzou_login`

入参：

- `username`：账号
- `password`：密码

关键返回：

- `isLoginSuccess`
- `cookieHeader`
- `setCookies`

### 2) `lanzou_get_mydisk_content`

入参：

- `uid`
- `cookieHeader`
- `requestBody`（可选，默认 `task=5`）

关键返回：

- `zt` / `info`
- `totalFiles`
- `files[]`（包含 `id`、`name`、`size`、`downs` 等）

### 3) `lanzou_get_file_link`

入参：

- `fileId`
- `cookieHeader`
- `uid`（可选）

关键返回：

- `zt`
- `fId`
- `isNewd`
- `downloadUrl`

### 4) `lanzou_get_direct_link`

入参：

- `shareUrl`
- `cookieHeader`（可选）
- `password`（带密码分享页时必填）

关键返回：

- `mode`（`fn` 或 `share_password`）
- `directUrl`
- `telecomDownloadUrl`
- `unicomDownloadUrl`
- `normalDownloadUrl`

## 推荐调用顺序

1. `lanzou_login` 获取 `cookieHeader`
2. `lanzou_get_mydisk_content` 拉取文件列表
3. `lanzou_get_file_link` 获取分享地址
4. `lanzou_get_direct_link` 解析最终直链

## 项目结构

```text
.
├─ src/
│  └─ server.js
├─ package.json
└─ README.md
```

## 免责声明

本项目仅用于接口研究与自动化测试，请遵守蓝奏云服务条款及当地法律法规。
