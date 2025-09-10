// --- IndexedDB (idb簡易) ---
const DB_NAME = 'wplace-db';
const STORE = 'accounts';
let db;
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'email' });
  r.onsuccess = () => { db = r.result; res(); };
  r.onerror = () => rej(r.error);
});
const put = (obj) => new Promise((res, rej) => {
  const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(obj);
  tx.oncomplete = res; tx.onerror = () => rej(tx.error);
});
const all = () => new Promise((res, rej) => {
  const tx = db.transaction(STORE); const req = tx.objectStore(STORE).getAll();
  req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
});
const del = (email) => new Promise((res, rej) => {
  const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(email);
  tx.oncomplete = res; tx.onerror = () => rej(tx.error);
});

// --- PWA登録 ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// --- OneSignal: 購読をタグで識別（emailやアカ名で絞り込み送信する用） ---
const tagSubscriber = async (acc) => {
  if (!window.OneSignal) return;
  const OneSignal = window.OneSignal;
  await OneSignal.setConsentGiven(true);
  await OneSignal.login(acc.email); // external_id としてメールを使う
  await OneSignal.sendTag("account_name", acc.name);
};

// --- 通知時刻計算 ---
const minutesToMs = (m) => Math.max(0, Math.round(m * 60 * 1000));
const calcSchedules = (acc) => {
  const { cap, cur } = acc;
  const fullMin = (cap - cur) / 2; // 2 paint/min
  const out = [];
  if (acc.notif_full) out.push({ kind: 'full', inMin: fullMin });

  const mb = Number(acc.notif_full_minutes_before || 0);
  if (mb > 0) out.push({ kind: 'full_minus_minutes', inMin: fullMin - mb });

  const pb = Number(acc.notif_full_percent_before || 0);
  if (pb > 0) {
    const target = Math.floor(cap * (1 - pb/100));
    const inMin = (cap - cur)/2 - (cap - target)/2;
    out.push({ kind: 'full_minus_percent', inMin });
  }
  const tp = Number(acc.notif_target_paint || 0);
  if (tp > cur) out.push({ kind: 'target_paint', inMin: (tp - cur)/2 });

  // 未来だけに限定
  const now = Date.now();
  return out
    .filter(s => s.inMin > 0)
    .map(s => ({ ...s, fireAt: new Date(now + minutesToMs(s.inMin)).toISOString() }))
    .sort((a,b) => new Date(a.fireAt) - new Date(b.fireAt));
};

// --- UI ---
const listEl = document.getElementById('list');
const drawList = async () => {
  const items = await all();
  listEl.innerHTML = '';
  items.forEach(acc => {
    const li = document.createElement('li');
    li.textContent = `${acc.name} / ${acc.email} / Level: ${acc.level} / Droplets: ${acc.droplets} / cap=${acc.cap} cur=${acc.cur}`;
    const bDel = document.createElement('button');
    bDel.textContent = '削除';
    bDel.onclick = async () => { await del(acc.email); drawList(); };
    const bSched = document.createElement('button');
    bSched.textContent = '通知スケジュール送信';
    bSched.onclick = async () => {
      const schedules = calcSchedules(acc);
      alert(`通知数: ${schedules.length}\n最初: ${schedules[0]?.fireAt || 'なし'}`);
      await tagSubscriber(acc);
      // OneSignal への予約: このサンプルでは「端末側では計算のみ」。
      // 実運用はサーバ(API)から OneSignal REST で send_after を使って予約します（下記参照）。
      console.log('schedules', schedules);
    };
    li.append(' ', bDel, ' ', bSched);
    listEl.appendChild(li);
  });
};

document.getElementById('accountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const acc = {
    email: f.get('email'),
    name: f.get('name'),
    level: f.get('level') || '',
    droplets: Number(f.get('droplets') || 0),
    cap: Number(f.get('cap')),
    cur: Number(f.get('cur')),
    notif_full: !!f.get('notif_full'),
    notif_full_minutes_before: f.get('notif_full_minutes_before'),
    notif_full_percent_before: f.get('notif_full_percent_before'),
    notif_target_paint: f.get('notif_target_paint'),
  };
  await openDB();
  await put(acc);
  await drawList();
  e.target.reset();
});

openDB().then(drawList);
