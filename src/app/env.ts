export const SUPABASE_URL: string = import.meta.env['VITE_SUPABASE_URL'] ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env['VITE_SUPABASE_ANON_KEY'] ?? '';
export const CLOUD_CONFIGURED = /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
export const APP_VERSION = '0.1.0';
