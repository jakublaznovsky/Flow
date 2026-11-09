/// Starts Windows voice typing in the focused field by pressing Win+H (the dictation button).
#[tauri::command]
fn start_dictation() -> Result<(), String> {
    #[cfg(windows)]
    {
        dictation::press_win_h()
    }
    #[cfg(not(windows))]
    {
        Err("dictation needs Windows voice typing".into())
    }
}

#[cfg(windows)]
mod dictation {
    use std::mem::size_of;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_LWIN,
    };

    const VK_H: u16 = 0x48;

    fn key(vk: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    pub fn press_win_h() -> Result<(), String> {
        let inputs = [key(VK_LWIN, false), key(VK_H, false), key(VK_H, true), key(VK_LWIN, true)];
        // SAFETY: a valid array of fully initialised INPUT structs and its exact size.
        let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32) };
        if sent as usize == inputs.len() {
            Ok(())
        } else {
            Err(format!("SendInput sent {sent} of {} key events", inputs.len()))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Remembers folders granted via the folder picker (e.g. on D:) across restarts. Must come after fs.
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![start_dictation])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
