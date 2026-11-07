export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_KEY = 'overlap:theme';

/**
 * Runs synchronously in <head> before first paint (no flash). Reads the saved preference,
 * resolves 'system' via matchMedia, and toggles the .dark class on <html>.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=t}catch(e){}})()`;
