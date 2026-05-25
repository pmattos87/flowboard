use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../../migrations/001_initial_schema.sql"),
        kind: MigrationKind::Up,
    }]
}
