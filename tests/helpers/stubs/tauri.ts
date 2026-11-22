// Stand-ins so UI bundles can be server-rendered in Node without the Tauri/Supabase packages. TEST ONLY.
const Database = { load: async () => { throw new Error('stub'); } };
export default Database;
export const invoke = async (): Promise<null> => null;
export const createClient = (): never => { throw new Error('stub'); };
