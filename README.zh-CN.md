# MockForge

简体中文 | [English](README.md)

> 浏览器内的 API Mock、流量监控与 AI 调试助手。

MockForge 是一个基于 Manifest V3 的 Chrome 扩展。当前端等待后端接口、复现异常响应，或需要快速调整接口数据时，可以直接在浏览器中为页面的 `fetch` 和 `XMLHttpRequest` 请求配置本地 Mock 规则。

## 功能

- 为 `fetch` / XHR 配置本地 Mock 响应，支持 URL 匹配、请求方法、Query、请求体、状态码、响应头、响应体和延迟。
- 用文件夹整理规则；规则和所有父级文件夹均启用时才会生效。
- 记录近期页面请求，并可一键从流量创建 Mock 规则。
- 提供页面悬浮面板、Chrome Side Panel 与独立工作台三种入口。
- 可连接 OpenAI Chat Completions 兼容的模型服务，用 AI 读取规则、分析流量、生成或修改 Mock 草稿。
- 所有规则、对话与模型配置均保存在本机 Chrome 存储中。

## 快速开始

### 环境要求

- Node.js 24（通过 nvm 管理）
- Chrome 浏览器

### 安装依赖并构建

```powershell
nvm use 24.14.1
npm ci
npm run build
```

构建产物位于 `dist/`。

### 在 Chrome 中加载

1. 打开 `chrome://extensions`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `dist/` 目录。

开发时可运行下面的命令监听源文件变更；首次运行后，同样加载生成的 `dist/` 目录：

```powershell
nvm use 24.14.1
npm run dev
```

## 使用说明

1. 打开扩展工作台，在“Mock 规则”中创建规则或从“流量监听”中快速创建。
2. 设置请求 URL、匹配方式、请求方法与响应数据，并启用规则。
3. 刷新或操作目标页面，符合规则的 `fetch` / XHR 请求将返回本地 Mock 响应。
4. 如需使用 AI 助手，在“设置”中配置模型地址、模型名与 API Key。模型服务需要兼容 OpenAI 的 `tools` / Function Calling。

## 规则匹配

支持以下 URL 匹配模式：

- `exact`：完整 URL 一致。
- `prefix`：URL 以前缀匹配。
- `wildcard`：使用通配符匹配。
- `regex`：使用正则表达式匹配。

当多条规则均匹配时，插件会综合 URL 精确度、规则优先级和更新时间选择最终规则。

## 边界与隐私

- 默认仅 Mock 页面主环境中的 `fetch` 与 `XMLHttpRequest`；WebSocket、页面导航及静态资源不在默认拦截范围内。
- 规则、模型配置和对话记录仅保存在本机；项目不提供服务端同步。
- AI 功能会把当前对话、用户显式引用的规则或文件夹，以及必要的工具结果发送给你配置的模型服务。请自行确认模型服务的数据处理政策。

## 常用命令

```powershell
# 类型检查
npm run typecheck

# 生产构建
npm run build

# 开发模式
npm run dev
```

## 技术栈

- React 19 + TypeScript
- Vite + CRXJS
- Chrome Extension Manifest V3
- IndexedDB / Chrome Storage

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
