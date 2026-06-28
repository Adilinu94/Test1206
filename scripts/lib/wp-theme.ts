/**
 * scripts/lib/wp-theme.ts  —  v1.0.0
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_DIR = '.framer-export-cache';

const THEMES_WITH_FULL_CUSTOM_CSS = new Set([
  'astra', 'generatepress', 'oceanwp', 'kadence', 'blocksy', 'neve',
  'twentytwentyfour', 'twentytwentythree', 'twentytwentytwo',
  'twenty twenty-one', 'twentytwentyone',
]);

const THEMES_WITH_LIMITED_CUSTOM_CSS = new Set([
  'hello-elementor', 'hello elementor',
]);

export interface ThemeEnv {
  name: string;
  version: string;
  slug: string;
  template?: string;
  is_child?: boolean;
  template_engine: string;
  supports_custom_css?: boolean;
  _source?: string;
  _cache?: string;
  classification?: ThemeClassification;
  recommended_css_strategy?: CssStrategy;
}

export interface ThemeClassification {
  tier: string;
  risk: string;
  description: string;
}

export interface CssStrategy {
  primary: string;
  fallback: string;
  reason: string;
}

interface McpBridgeLike {
  call(ability: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export async function detectActiveTheme({ mcpBridge = null, siteId = 'default', cacheRoot = process.cwd() }: {
  mcpBridge?: McpBridgeLike | null;
  siteId?: string;
  cacheRoot?: string;
} = {}): Promise<ThemeEnv> {
  const cachePath = join(cacheRoot, CACHE_DIR, `wp-theme-${siteId}.json`);
  const cached = readCache(cachePath);
  if (cached) {
    return { ...cached, _cache: 'hit' };
  }

  let env: ThemeEnv;
  if (mcpBridge) {
    env = await detectViaMcp(mcpBridge);
  } else {
    env = {
      name: 'unknown',
      version: '0.0.0',
      slug: 'unknown',
      template_engine: 'classic',
      supports_custom_css: false,
      _source: 'fallback',
    };
  }

  env.classification = classifyTheme(env);
  env.recommended_css_strategy = recommendCssStrategy(env);

  writeCache(cachePath, env);
  return { ...env, _cache: 'miss' };
}

async function detectViaMcp(mcpBridge: McpBridgeLike): Promise<ThemeEnv> {
  try {
    const res = await mcpBridge.call('novamira/execute-php', {
      code: `
        $t = wp_get_theme();
        return [
          'name' => $t->get('Name'),
          'version' => $t->get('Version'),
          'slug' => $t->get_stylesheet(),
          'template' => $t->get_template(),
          'is_child' => $t->parent() !== false,
          'template_engine' => function_exists('wp_is_block_theme') && wp_is_block_theme() ? 'block' : 'classic',
        ];
      `,
    });
    const data = (res?.return_value || res?.data || res) as Record<string, unknown>;
    return {
      name: (data.name as string) || 'unknown',
      version: (data.version as string) || '0.0.0',
      slug: (data.slug as string) || 'unknown',
      template: (data.template as string) || '',
      is_child: !!(data.is_child as boolean),
      template_engine: (data.template_engine as string) || 'classic',
      _source: 'mcp:execute-php+wp_get_theme',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`detectActiveTheme: execute-php failed — ${msg}`);
  }
}

function classifyTheme(env: ThemeEnv): ThemeClassification {
  const normalized = (env.name || '').toLowerCase().trim();
  const slugNormalized = (env.slug || '').toLowerCase().trim();

  if (THEMES_WITH_FULL_CUSTOM_CSS.has(normalized) || THEMES_WITH_FULL_CUSTOM_CSS.has(slugNormalized)) {
    return {
      tier: 'full-css',
      risk: 'low',
      description: `Theme ${env.name} unterstuetzt volles Custom-CSS via Appearance > Customize`,
    };
  }
  if (THEMES_WITH_LIMITED_CUSTOM_CSS.has(normalized) || THEMES_WITH_LIMITED_CUSTOM_CSS.has(slugNormalized)) {
    return {
      tier: 'limited-css',
      risk: 'medium',
      description: `Theme ${env.name} hat eingeschraenktes Custom-CSS — Workaround-Layer empfohlen`,
    };
  }
  return {
    tier: 'unknown',
    risk: 'medium',
    description: `Theme ${env.name} ist nicht in der Liste — conservative Workaround-Strategie`,
  };
}

function recommendCssStrategy(env: ThemeEnv): CssStrategy {
  if (env.classification!.tier === 'full-css') {
    return {
      primary: 'elementor-page-settings',
      fallback: 'wp-css-injector',
      reason: 'Elementor Custom-CSS via Page-Settings funktioniert zuverlaessig',
    };
  }
  if (env.classification!.tier === 'limited-css') {
    return {
      primary: 'wp-css-injector',
      fallback: 'mu-plugin',
      reason: 'Hello Elementor speichert Custom-CSS nicht persistent — externe Injection notwendig',
    };
  }
  return {
    primary: 'wp-css-injector',
    fallback: 'mu-plugin',
    reason: 'Unbekanntes Theme — conservative: externe Injection',
  };
}

function readCache(path: string): ThemeEnv | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as ThemeEnv & { _cached_at?: number };
    if (Date.now() - (raw._cached_at || 0) > CACHE_TTL_MS) return null;
    delete raw._cached_at;
    return raw;
  } catch {
    return null;
  }
}

function writeCache(path: string, env: ThemeEnv): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...env, _cached_at: Date.now() }, null, 2));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[wp-theme] cache-write failed: ${msg}\n`);
  }
}

export function clearThemeCache({ cacheRoot = process.cwd(), siteId = 'default' }: {
  cacheRoot?: string;
  siteId?: string;
} = {}): void {
  const path = join(cacheRoot, CACHE_DIR, `wp-theme-${siteId}.json`);
  if (existsSync(path)) {
    try {
      writeFileSync(path, '{}');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[wp-theme] cache-clear failed: ${msg}\n`);
    }
  }
}
