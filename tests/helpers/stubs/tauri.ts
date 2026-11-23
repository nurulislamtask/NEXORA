// Stand-ins so UI bundles can be server-rendered in Node without the Tauri/Supabase packages. TEST ONLY.
const Database = { load: async () => { throw new Error('stub'); } };
export default Database;
export const invoke = async (): Promise<null> => null;
export const createClient = (): never => { throw new Error('stub'); };
export const getCurrentWindow = (): never => { throw new Error('stub'); };
export const emit = async (): Promise<void> => {};
export const listen = async (): Promise<() => void> => () => {};
export const isPermissionGranted = async (): Promise<boolean> => false;
export const requestPermission = async (): Promise<string> => 'denied';
export const sendNotification = (): void => {};
export const readText = async (): Promise<string> => '';
