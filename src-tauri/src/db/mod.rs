pub mod migrations;

pub use migrations::migrations;

pub const DB_URL: &str = "sqlite:flowboard.db";
