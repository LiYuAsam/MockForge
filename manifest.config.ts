import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Mock Forge',
  description: '本地 API Mock 与调试助手',
  version: '0.1.0',
  action: { default_title: '打开 Mock Forge' },
  icons: { 16: 'icons/api-mook-16.png', 32: 'icons/api-mook-32.png', 48: 'icons/api-mook-48.png', 128: 'icons/api-mook-128.png' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['storage', 'scripting', 'tabs', 'sidePanel'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/bridge.ts'],
      run_at: 'document_start',
    },
    {
      matches: ['<all_urls>'],
      js: ['src/main-world/index.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/main-world/index.ts', 'icons/*.png'],
      matches: ['<all_urls>'],
    },
  ],
  side_panel: { default_path: 'src/side-panel/index.html' },
})
