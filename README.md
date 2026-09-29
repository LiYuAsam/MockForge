# MockForge

[简体中文](README.zh-CN.md) | English

> An in-browser API mocking, traffic-monitoring, and AI debugging assistant.

MockForge is a Manifest V3 Chrome extension for creating local Mock responses for a page's `fetch` and `XMLHttpRequest` traffic. It is useful when frontend and backend work are not yet connected, when reproducing unusual responses, or when adjusting API data quickly.

## Features

- Configure local Mock responses for `fetch` and XHR, including URL matching, HTTP methods, query parameters, request bodies, status codes, headers, response bodies, and delays.
- Use a selected local file or create a text file in the extension as a response body. Files can be up to 20 MB and are removed after their last rule reference is deleted.
- Organize rules in folders. A rule takes effect only when it and all of its parent folders are enabled.
- Monitor recent page traffic and create a Mock rule directly from a captured request.
- Work from a floating page panel, Chrome Side Panel, or standalone workspace.
- Connect an OpenAI Chat Completions-compatible model service to inspect rules, analyze traffic, and create or update Mock drafts with AI.
- Keep rules, conversations, and model configuration in local Chrome storage.

## Getting started

### Prerequisites

- Node.js 24, managed with nvm
- Google Chrome

### Install and build

```powershell
nvm use 24.14.1
npm ci
npm run build
```

The production extension is emitted to `dist/`.

### Load the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist/` directory.

For development, run the following command and load the generated `dist/` directory after the first build:

```powershell
nvm use 24.14.1
npm run dev
```

## Usage

1. Open the extension workspace. Create a rule in **Mock Rules**, or create one from **Traffic Monitoring**.
2. Set the request URL, match mode, HTTP method, and response data, then enable the rule. Response types include JSON, text, empty, and file.
3. Reload or interact with the target page. Matching `fetch` and XHR calls receive the local Mock response.
4. To use the AI assistant, configure a model endpoint, model name, and API key under **Settings**. The model service must support OpenAI-compatible `tools` / Function Calling.

## URL match modes

- `exact`: matches the full URL.
- `prefix`: matches a URL prefix.
- `wildcard`: matches using wildcards.
- `regex`: matches with a regular expression.

If several rules match, MockForge chooses one based on URL specificity, rule priority, and last update time.

## Scope and privacy

- By default, MockForge handles only `fetch` and `XMLHttpRequest` calls from the page's main world. WebSocket, navigations, and static resources are not intercepted by default.
- Rules, model configuration, and conversations stay in local browser storage. This project does not provide server-side synchronization.
- Local response files are selected through the extension and stored in extension storage; pages cannot read arbitrary paths from the user's disk directly.
- The AI assistant sends the current conversation, explicitly referenced rules or folders, and required tool results to the model service you configure. Please review that provider's data-handling policy.

## Commands

```powershell
# Type check
npm run typecheck

# Production build
npm run build

# Development mode
npm run dev
```

## Tech stack

- React 19 + TypeScript
- Vite + CRXJS
- Chrome Extension Manifest V3
- IndexedDB / Chrome Storage

## License

This project is licensed under the [MIT License](LICENSE).
