export {};

declare global {
  interface HuggingFaceVariables {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
    VITE_ROUTER_MODE?: string;
  }

  interface HuggingFaceContext {
    variables?: HuggingFaceVariables;
  }

  interface Window {
    huggingface?: HuggingFaceContext;
  }
}
