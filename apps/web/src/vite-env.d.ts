/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_LOCAL_AUTO_SIGN_IN?: string;
  readonly VITE_LOCAL_DEMO_EMAIL?: string;
  readonly VITE_LOCAL_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
