const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

// أضف رابط Hugging Face Space النهائي إلى Secret ALLOWED_ORIGINS في Supabase، مثل:
// https://your-username-vibefit.hf.space

function getAllowedOrigins(): string[] {
  const fromSecret = Deno.env.get('ALLOWED_ORIGINS');
  const extraOrigins = fromSecret
    ? fromSecret.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];

  return [...LOCAL_ORIGINS, ...extraOrigins];
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin =
    origin && allowedOrigins.includes(origin) ? origin : LOCAL_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
