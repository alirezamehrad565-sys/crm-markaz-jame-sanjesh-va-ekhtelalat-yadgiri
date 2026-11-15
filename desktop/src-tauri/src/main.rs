// main.rs — نقطهٔ ورود پوستهٔ دسکتاپ؛ بدون پنجرهٔ کنسول در بیلد ریلیز ویندوز
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    center_desktop_lib::run();
}
