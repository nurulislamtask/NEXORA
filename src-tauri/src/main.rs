mod sync;
use tauri_plugin_sql::{Builder as Sql, Migration, MigrationKind};

fn main() {
    let migrations = vec![Migration { version: 1, description: "local_schema",
        sql: include_str!("../migrations/0001_local_schema.sql"), kind: MigrationKind::Up }];
    tauri::Builder::default()
        .plugin(Sql::default().add_migrations("sqlite:nexora.db", migrations).build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running NEXORA");
}
