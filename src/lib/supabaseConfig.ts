export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

function normalizeEnvValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readViteSupabaseUrl(): string {
  return normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
}

function readViteSupabaseAnonKey(): string {
  return normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function readHfSupabaseUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return normalizeEnvValue(window.huggingface?.variables?.VITE_SUPABASE_URL);
  } catch {
    return '';
  }
}

function readHfSupabaseAnonKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return normalizeEnvValue(window.huggingface?.variables?.VITE_SUPABASE_ANON_KEY);
  } catch {
    return '';
  }
}

/** Vite build-time env first, Hugging Face runtime variables second. */
export function getSupabaseUrl(): string {
  const viteUrl = readViteSupabaseUrl();
  if (viteUrl) return viteUrl;
  return readHfSupabaseUrl();
}

/** Vite build-time env first, Hugging Face runtime variables second. */
export function getSupabaseAnonKey(): string {
  const viteAnonKey = readViteSupabaseAnonKey();
  if (viteAnonKey) return viteAnonKey;
  return readHfSupabaseAnonKey();
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null;
}

/** Safe production diagnostics — booleans only, no secret values. */
export function logConfigCheck(): void {
  console.info('[Config Check]', {
    hasViteUrl: Boolean(readViteSupabaseUrl()),
    hasViteAnonKey: Boolean(readViteSupabaseAnonKey()),
    hasHfUrl: typeof window !== 'undefined' && Boolean(readHfSupabaseUrl()),
    hasHfAnonKey: typeof window !== 'undefined' && Boolean(readHfSupabaseAnonKey()),
    routerMode: import.meta.env.VITE_ROUTER_MODE,
    configured: isSupabaseConfigured(),
  });
}
