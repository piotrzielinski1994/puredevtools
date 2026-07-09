import type { Target } from '../shared/types';

type ManifestBackground =
  | { service_worker: string; type?: 'module' }
  | { scripts: string[]; type?: 'module' };

export type ContentScript = {
  matches: string[];
  js: string[];
  run_at: 'document_start';
  world?: 'MAIN' | 'ISOLATED';
  all_frames?: boolean;
};

export type Manifest = {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  host_permissions: string[];
  background: ManifestBackground;
  action: { default_popup: string };
  options_ui: { page: string; open_in_tab: boolean };
  content_scripts: ContentScript[];
  devtools_page: string;
  browser_specific_settings?: { gecko: { id: string; strict_min_version: string } };
};

const PAGE_MAIN_ENTRY = 'src/content/page-main.ts';
const BRIDGE_ENTRY = 'src/content/bridge.ts';

const CONTENT_SCRIPTS: ContentScript[] = [
  { matches: ['<all_urls>'], js: [PAGE_MAIN_ENTRY], run_at: 'document_start', world: 'MAIN', all_frames: true },
  { matches: ['<all_urls>'], js: [BRIDGE_ENTRY], run_at: 'document_start', world: 'ISOLATED', all_frames: true },
];

const SHARED = {
  manifest_version: 3,
  name: 'ReqHook',
  version: '0.1.0',
  description:
    'Intercept, rewrite, and mock HTTP requests and responses directly in the browser.',
  host_permissions: ['<all_urls>'],
  action: { default_popup: 'src/ui/popup/index.html' },
  options_ui: { page: 'src/ui/options/index.html', open_in_tab: true },
  content_scripts: CONTENT_SCRIPTS,
  devtools_page: 'src/devtools/devtools.html',
} satisfies Partial<Manifest>;

const BACKGROUND_ENTRY = 'src/background/index.ts';
const GECKO_ID = 'reqhook@reqhook.dev';

const byTarget: Record<Target, Pick<Manifest, 'permissions' | 'background'> & Partial<Manifest>> = {
  chrome: {
    permissions: ['declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'storage'],
    background: { service_worker: BACKGROUND_ENTRY, type: 'module' },
  },
  firefox: {
    permissions: ['webRequest', 'webRequestBlocking', 'webRequestFilterResponse', 'storage'],
    background: { scripts: [BACKGROUND_ENTRY], type: 'module' },
    browser_specific_settings: {
      gecko: { id: GECKO_ID, strict_min_version: '128.0' },
    },
  },
};

export const buildManifest = (target: Target): Manifest => ({
  ...SHARED,
  ...byTarget[target],
});
