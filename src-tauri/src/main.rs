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

/// Opens (or focuses) an independent always-on-top sticky-note window for one note. Desktop only. UNVERIFIED.
#[tauri::command]
async fn open_sticky(app: tauri::AppHandle, id: String, x: Option<i32>, y: Option<i32>, w: u32, h: u32, always_on_top: bool) -> Result<(), String> {
    use tauri::Manager;
    if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { return Err("invalid note id".into()); }
    let label = format!("sticky-{id}");
    if let Some(win) = app.get_webview_window(&label) { return win.set_focus().map_err(|e| e.to_string()); }
    let win = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(format!("index.html?sticky={id}").into()))
        .title("Sticky note").inner_size(300.0, 320.0).min_inner_size(160.0, 120.0).always_on_top(always_on_top)
        .build().map_err(|e| e.to_string())?;
    win.set_size(tauri::PhysicalSize::new(w, h)).map_err(|e| e.to_string())?;
    if let (Some(x), Some(y)) = (x, y) { win.set_position(tauri::PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?; }
    Ok(())
}

fn main() {
    let migrations = vec![
        Migration { version: 1, description: "local_schema", sql: include_str!("../migrations/0001_local_schema.sql"), kind: MigrationKind::Up },
        Migration { version: 2, description: "sync_and_features", sql: include_str!("../migrations/0002_sync_and_features.sql"), kind: MigrationKind::Up },
        Migration { version: 3, description: "habits_clipboard", sql: include_str!("../migrations/0003_habits_clipboard.sql"), kind: MigrationKind::Up },
    ];
    tauri::Builder::default()
        .plugin(Sql::default().add_migrations("sqlite:nexora.db", migrations).build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![secret_get, secret_set, open_sticky])
        .run(tauri::generate_context!())
        .expect("error while running NEXORA");
}
