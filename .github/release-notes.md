## NEXORA preview

An offline-first workspace: **tasks, notes, pages, projects, calendar, habits, clipboard history, sticky notes, reminders** in English and বাংলা. Works with no internet and no account.

> **Preview build, not a stable release.** Files are unsigned and built by GitHub Actions. The code passes 69 automated tests and compiles on all four platforms, but the installed app has not yet been run on a real device.

### Which file do I download?

| You have | Download | Notes |
|---|---|---|
| Windows 10/11 | `NEXORA_0.1.0_x64-setup.exe` (or `.msi`) | SmartScreen warning: **More info → Run anyway** |
| Android phone (7.0+, 64-bit) | `app-universal-debug.apk` | Allow "install unknown apps" for the app you open it with |
| Mac (Apple Silicon) | `NEXORA_0.1.0_aarch64.dmg` | First launch: right-click → Open |
| Linux | `NEXORA_0.1.0_amd64.AppImage` or `.deb` | `chmod +x` the AppImage, or `sudo apt install ./file.deb` |

### What you get
- **Tasks**: priorities, due dates, repeats, subtasks, labels, My Day, drag/↑↓ ordering, bulk actions
- **Notes and sticky notes** (floating windows on desktop), **Pages** with blocks and sub-pages
- **Projects** with progress, **Calendar** with repeating events, **Habits** with streaks
- **Clipboard history** (off by default, never synced), **reminders** with snooze and system notifications
- **Ctrl/⌘ + K** search and commands, backup/restore, 14 themes + custom theme editor, English/বাংলা

### Please know
- These builds contain **no cloud backend**, so they are local-only. Sign-in and sync need a build made with your own Supabase settings (see the README).
- Android: you must sign in again after each restart, and sticky windows are desktop-only.
- No automatic updates yet; **Settings → Updates** checks GitHub and links to the download.
- Not done: Google sign-in, password-reset completion, avatar upload.

### Tested vs not tested
- **Tested in CI:** 69 unit/integration tests (data, sync, auth, i18n, screens), TypeScript, build, Rust compile, database security tests.
- **Not tested:** running the installed app, notifications, clipboard polling, drag-and-drop in a real window, Android layout.

Found a problem? [Open an issue](https://github.com/nurulislamtask/NEXORA/issues/new) with your platform and what happened. Full details: [docs/STATUS.md](https://github.com/nurulislamtask/NEXORA/blob/migrate/tauri-react/docs/STATUS.md) · [Changelog](https://github.com/nurulislamtask/NEXORA/blob/migrate/tauri-react/CHANGELOG.md)
