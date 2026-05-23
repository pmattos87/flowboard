# Environments & Release Workflow

## Overview

FlowBoard is a local-first desktop app — there is no server to deploy to. "Production" means a compiled installer on your machine, and "staging" means a separate build profile with its own isolated data directory.

---

## How Environment Isolation Works

Tauri uses the app's `identifier` (defined in `tauri.conf.json`) to determine where app data is stored — including the SQLite database and file attachments. By defining two identifiers, you get two completely separate data directories that can never interfere with each other.

| Profile | Identifier | App Data Path |
|---|---|---|
| Production | `com.flowboard.app` | `%APPDATA%\com.flowboard.app\` |
| Staging | `com.flowboard.staging` | `%APPDATA%\com.flowboard.staging\` |

---

## Setup

### 1. Config files

- `tauri.conf.json` — production (the existing file)
- `tauri.staging.conf.json` — staging copy with `identifier` set to `com.flowboard.staging` and `productName` set to `FlowBoard Staging`

### 2. npm scripts

```json
"scripts": {
  "dev": "tauri dev",
  "dev:staging": "tauri dev --config tauri.staging.conf.json",
  "build": "tauri build",
  "build:staging": "tauri build --config tauri.staging.conf.json"
}
```

### 3. Optional: staging indicator

Add a `VITE_APP_ENV` variable to a `.env.staging` file and render a small banner in the UI so you can always tell which build is running.

---

## Release Workflow

### First production release (after Phase 4)

1. Merge Phase X into `main` and tag `v0.X-tasks`.
2. Run `npm run build` — produces an `.msi` / `.exe` installer under `src-tauri/target/release/bundle/`.
3. Install it. This is your production copy. It uses the production identifier and its own isolated data directory.

### For every subsequent phase

1. Work on the feature branch as normal.
2. Test using `npm run dev:staging` (or install a staging build). All test data goes to the staging app data path — production data is untouched.
3. When the phase is merged and tagged, rebuild production with `npm run build` and reinstall.

---

## Testing Strategy

Unit and integration tests (Vitest + React Testing Library) run entirely in Node — no Tauri runtime required, no data collision risk. These cover logic regressions between releases.

The staging config above covers **manual regression testing**, letting you freely explore and break things without affecting your real data.

---

## Summary

| Concern | Solution |
|---|---|
| Isolate test data from real data | Separate Tauri `identifier` per profile |
| Run staging builds locally | `npm run dev:staging` |
| Ship a production release | `npm run build` → install the output `.msi` |
| Prevent logic regressions | Vitest unit/integration tests (no Tauri needed) |
