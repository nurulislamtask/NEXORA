// Desktop entry point; the app itself lives in lib.rs so Android can reuse it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nexora_lib::run()
}
