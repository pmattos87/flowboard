mod commands;
pub mod db;
pub mod factory;
#[cfg(test)]
mod test_support;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_pool(&handle)
                    .await
                    .expect("failed to initialize sqlite pool");
                handle.manage(pool);
            });

            // Live refresh: runs only after init_pool has migrated, off the setup thread.
            match db::db_path(app.handle()) {
                Ok(path) => {
                    let handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        db::watch::run(&path, move || {
                            if let Err(e) = handle.emit("db-changed", ()) {
                                eprintln!("failed to emit db-changed: {e}");
                            }
                        })
                        .await;
                    });
                }
                Err(e) => eprintln!("db watcher disabled: {e}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            commands::projects::reorder_projects,
            commands::people::create_person,
            commands::people::list_people,
            commands::people::get_person,
            commands::people::update_person,
            commands::people::delete_person,
            commands::sprints::create_sprint,
            commands::sprints::list_sprints,
            commands::sprints::get_sprint,
            commands::sprints::update_sprint,
            commands::sprints::delete_sprint,
            commands::sprints::complete_sprint,
            commands::releases::list_releases,
            commands::releases::get_release,
            commands::releases::create_release,
            commands::releases::pick_release_story,
            commands::releases::remove_release_story,
            commands::stories::get_story,
            commands::stories::get_story_trail,
            commands::stories::restart_run,
            commands::stories::list_active_runs,
            commands::tasks::create_task,
            commands::tasks::list_tasks,
            commands::tasks::get_task,
            commands::tasks::update_task,
            commands::comments::create_comment,
            commands::comments::list_comments,
            commands::comments::update_comment,
            commands::comments::delete_comment,
            commands::time_logs::create_time_log,
            commands::time_logs::list_time_logs,
            commands::time_logs::delete_time_log,
            commands::attachments::create_attachment,
            commands::attachments::list_attachments,
            commands::attachments::delete_attachment,
            commands::attachments::open_attachment,
            commands::activity_log::create_activity_log,
            commands::activity_log::list_activity_log,
            commands::activity_log::list_activity_log_by_sprint,
            commands::activity_log::list_all_activity_log,
            commands::dev::seed_demo_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
