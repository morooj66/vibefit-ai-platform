import type { PostgrestError } from '@supabase/supabase-js';

export function logSupabaseError(
  context: string,
  error: PostgrestError | null | undefined,
): void {
  if (!import.meta.env.DEV || !error) return;

  console.error(`[Supabase:${context}]`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}
