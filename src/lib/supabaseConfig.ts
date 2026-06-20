export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

function readHuggingFaceVariable(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  try {
    const value = window.huggingface?.variables?.[name];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * يقرأ إعدادات Supabase العامة (URL + anon key) من Vite env أو Hugging Face Space variables.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey };
  }

  const hfUrl = readHuggingFaceVariable('VITE_SUPABASE_URL');
  const hfKey = readHuggingFaceVariable('VITE_SUPABASE_ANON_KEY');

  if (hfUrl && hfKey) {
    return { url: hfUrl, anonKey: hfKey };
  }

  return null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null;
}
