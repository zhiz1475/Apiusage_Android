// This tiny entry is bundled into the static WebView assets. Capacitor does
// not automatically expose npm plugins to an HTML page, so registering them
// here keeps the same mobile client usable in browser preview and Android.
import { Capacitor, CapacitorCookies, CapacitorHttp } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { App } from '@capacitor/app';

globalThis.Capacitor = Capacitor;
globalThis.CapacitorCookies = CapacitorCookies;
globalThis.CapacitorHttp = CapacitorHttp;
Capacitor.Plugins = Capacitor.Plugins || {};
Capacitor.Plugins.CapacitorHttp = CapacitorHttp;
Capacitor.Plugins.CapacitorCookies = CapacitorCookies;
Capacitor.Plugins.SecureStorage = SecureStorage;
globalThis.CapacitorApp = App;
