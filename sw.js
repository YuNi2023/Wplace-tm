self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());

// OneSignal 経由の push は OneSignalSDKWorker.js 側で処理されます。
// ここは最小のPWA動作用。任意で静的キャッシュ等を追加可能。
