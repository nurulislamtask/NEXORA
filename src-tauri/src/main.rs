// NEXORA desktop entry point. UNVERIFIED: never compiled (crates.io unreachable in the authoring environment).
use tauri_plugin_sql::{Builder as Sql, Migration, MigrationKind};

const SERVICE: &str = "app.nexora.productivity";

/// Read a small secret (the AES key that encrypts the saved login session) from the OS keychain.
#[tauri::command]
fn secret_get(name: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_set(name: String, value: String) -> Result<(), String> {
    keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())?.set_password(&value).map_err(|e| e.to_string())
}

fn main() {
    let migrations = vec![
        Migration { version: 1, description: "local_schema", sql: include_str!("../migrations/0001_local_schema.sql"), kind: MigrationKind::Up },
        Migration { version: 2, description: "sync_and_features", sql: include_str!("../migrations/0002_sync_and_features.sql"), kind: MigrationKind::Up },
    ];
    tauri::Builder::default()
        .plugin(Sql::default().add_migrations("sqlite:nexora.db", migrations).build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![secret_get, secret_set])
        .run(tauri::generate_context!())
        .expect("error while running NEXORA");
}
