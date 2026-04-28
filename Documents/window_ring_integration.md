# Window Ring Integration

## Storage

- DexHub settings store (app data):
  - `window_ring_settings.json` in the DexHub Tauri app-data directory.
- Hammerspoon-readable mirror:
  - `~/.hammerspoon/dexhub_window_ring_settings.json`
- Format:
  - JSON object with fields:
    - `enabled` (boolean)
    - `border_width` (integer)
    - `border_padding` (integer)
    - `default_color` (`{ red, green, blue, alpha }`, each `0.0..1.0`)
    - `app_colors` (map of app name to RGBA object)

## Apply Flow

1. User edits **Settings → Window Ring** inside the existing DexHub pull panel window.
2. `Save / Apply` sends settings to Tauri command `apply_window_ring_settings`.
3. Tauri writes JSON to both app data and `~/.hammerspoon/dexhub_window_ring_settings.json`.
4. If Hammerspoon is running, DexHub triggers:
   - `hammerspoon://reloadConfig`
5. On reload, `window_ring/init.lua` reads `~/.hammerspoon/dexhub_window_ring_settings.json` at startup and applies values.

## Troubleshooting

- Status shows **Installed but not running**:
  - Use **Launch / Retry Apply** in the Window Ring panel.
- Status shows **Hammerspoon not detected**:
  - Install Hammerspoon, ensure it can handle `hammerspoon://` URLs, then retry apply.
- Apply reports failure:
  - Open Hammerspoon manually once and confirm it has Accessibility permissions.
  - Retry `Save / Apply` from DexHub.
- Borders not updating:
  - Confirm `~/.hammerspoon/dexhub_window_ring_settings.json` exists and has valid JSON.
  - Run Hammerspoon config reload manually, then verify window events with moving/resizing/focusing windows.
