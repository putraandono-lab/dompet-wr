/* Dompet WR - aplikasi (vanilla JS, offline-first) */
(function () {
  'use strict';
  var C = window.WRCore, CFG = window.WR_CONFIG || {};
  var $app = document.getElementById('app'), $toast = document.getElementById('toast');
  var isDesk = function () { return window.matchMedia('(min-width:960px)').matches; };

  /* ---------- util ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var store = {
    get: function (k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var te = new TextEncoder(), td = new TextDecoder();
  function b64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function toast(msg) { $toast.textContent = msg; $toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.hidden = true; }, 2600); }

  var PAL = {
    biru: { c: '#5B84C4', t: '#E6EEF9', x: '#2F5A94' }, burgundy: { c: '#9C4A5F', t: '#F4E4E9', x: '#7A2E45' },
    emas: { c: '#B7791F', t: '#FBF1DC', x: '#8A5A00' }, teal: { c: '#0F8B8D', t: '#DDF3F3', x: '#0B6466' },
    ungu: { c: '#7C3AED', t: '#EDE5FD', x: '#5B21B6' }, hijau: { c: '#15803D', t: '#DCF3E3', x: '#166534' }, abu: { c: '#475569', t: '#E8ECF1', x: '#334155' }
  };
  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0"/></svg>',
    sync: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/></svg>',
    logo: '<svg viewBox="0 0 40 40"><rect x="4" y="9" width="32" height="24" rx="6" fill="#F4F1FA"/><rect x="21" y="17" width="15" height="8" rx="4" fill="#241F3A"/><circle cx="26" cy="21" r="2.6" fill="#5B84C4"/><circle cx="31.5" cy="21" r="2.6" fill="#9C4A5F"/><rect x="8" y="5" width="22" height="5" rx="2.5" fill="#B9C7E4"/></svg>'
  };

  /* ---------- state ---------- */
  var S = {
    screen: 'boot', route: 'beranda', token: null, me: null, base: null, D: null, queue: store.get('wr.queue') || [],
    syncing: false, syncErr: false, lastSync: store.get('wr.last') || 0,
    pin: { step: 1, val: '', first: '', msg: '' }, lockVal: '', lockMsg: '', loginMsg: '',
    pOff: 0, q: '', fw: 'all', open: null, form: null, nd: null, pair: null, bgAt: 0, busy: false
  };

  function rebuild() {
    if (!S.base) { S.D = null; return; }
    var D = C.clone({ dompet: S.base.dompet, transaksi: S.base.transaksi, anggaran: S.base.anggaran, pengaturan: S.base.pengaturan });
    S.queue.forEach(function (op) { C.applyOp(D, op, S.me); });
    D.dompet.sort(function (a, b) { return 0; });
    S.D = D;
  }
  function saveQ() { store.set('wr.queue', S.queue); }

  /* ---------- api & sync ---------- */
  function cfgOk() { return CFG.API_URL && /^https:\/\//.test(CFG.API_URL) && CFG.GOOGLE_CLIENT_ID && CFG.GOOGLE_CLIENT_ID.indexOf('ISI_') !== 0; }
  function api(body) {
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' }).then(function (r) { return r.json(); });
  }
  var syncTimer;
  function enqueue(op) {
    S.queue.push(op); saveQ(); C.applyOp(S.D, op, S.me);
    clearTimeout(syncTimer); syncTimer = setTimeout(sync, 800);
  }
  function sync(manual) {
    if (S.syncing || !S.token || !cfgOk()) return Promise.resolve();
    if (!navigator.onLine) { if (manual === true) toast('Sedang offline'); paintSync(); return Promise.resolve(); }
    S.syncing = true; paintSync();
    var ops = S.queue.slice(0, 100);
    return api({ action: 'sync', token: S.token, ops: ops }).then(function (r) {
      if (!r.ok) {
        if (r.error === 'auth') { wipeAuth(); S.loginMsg = 'Sesi berakhir, silakan masuk lagi.'; go('login'); return; }
        throw new Error(r.error || 'gagal');
      }
      S.queue.splice(0, ops.length); saveQ();
      var rej = r.rejected || []; delete r.rejected;
      S.base = r; S.me = r.me; store.set('wr.snap', r); store.set('wr.me', r.me);
      S.syncErr = false; S.lastSync = Date.now(); store.set('wr.last', S.lastSync);
      rebuild();
      if (rej.length) toast(rej.length + ' catatan ditolak server (data tidak valid)');
      if (manual === true) toast('Tersinkron');
    }).catch(function () { S.syncErr = true; if (manual === true) toast('Gagal sinkron, coba lagi nanti'); })
      .then(function () { S.syncing = false; if (S.screen === 'app') render(); else paintSync(); if (S.queue.length && !S.syncErr && S.token) sync(); });
  }
  function paintSync() {
    var el = document.querySelectorAll('.sync'); if (!el.length) return;
    var txt = !navigator.onLine ? 'Offline' : S.syncing ? 'Menyinkron…' : S.syncErr ? 'Gagal sinkron' : S.queue.length ? S.queue.length + ' menunggu' : 'Tersinkron';
    var cls = !navigator.onLine ? 'off' : S.syncErr ? 'err' : '';
    el.forEach(function (e) { e.className = 'sync ' + cls; e.innerHTML = '<b></b>' + txt; });
  }

  /* ---------- crypto: PIN & biometrik ---------- */
  function deriveKey(pin, salt) {
    return crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']).then(function (km) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encryptToken(pin, token) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(pin, salt).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, te.encode(token)); })
      .then(function (ct) { return { salt: b64(salt), iv: b64(iv), ct: b64(ct) }; });
  }
  function decryptToken(pin, o) {
    return deriveKey(pin, unb64(o.salt)).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, k, unb64(o.ct)); }).then(function (pt) { return td.decode(pt); });
  }
  function bioSupported() { return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create); }
  function bioRegister() {
    var id = crypto.getRandomValues(new Uint8Array(16));
    return navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Dompet WR' }, user: { id: id, name: 'dompet-' + S.me.peran, displayName: 'Dompet ' + S.me.peran }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60000 } })
      .then(function (cred) { store.set('wr.bio', { cred: b64(cred.rawId), token: S.token }); });
  }
  function bioVerify() {
    var b = store.get('wr.bio'); if (!b) return Promise.reject();
    return navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(b.cred) }], userVerification: 'required', timeout: 60000 } }).then(function () { return b.token; });
  }

  /* ---------- navigasi ---------- */
  function go(screen) { S.screen = screen; S.pin = { step: 1, val: '', first: '', msg: '' }; S.lockVal = ''; render(); }
  function nav(route) { S.route = route; S.open = null; if (route === 'catat') S.form = newForm('keluar'); if (route === 'dompet-baru') S.nd = { nama: '', warna: 'emas', tipe: 'bersama', saldo: '', hitung: true }; if (route === 'laporan') S.pOff = 0; if (location.hash !== '#' + route) history.replaceState(null, '', '#' + route); render(); window.scrollTo(0, 0); }
  function wipeAuth() { S.token = null; store.del('wr.lock'); store.del('wr.bio'); store.del('wr.session'); store.del('wr.fails'); }
  function afterLoginOK(token, me) {
    S.token = token; S.me = me; store.set('wr.me', me);
    if (isDesk()) { S.screen = 'pinchoice'; render(); } else go('pinsetup');
  }

  /* ---------- derived ---------- */
  function wmap() { var m = {}; (S.D.dompet || []).forEach(function (w) { m[w.id] = w; }); return m; }
  function wpal(w) { return PAL[(w && w.warna)] || PAL.abu; }
  function wicon(w, size) { var p = wpal(w); return '<span class="wi" style="background:' + p.t + ';color:' + p.x + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '">' + esc((w && w.huruf) || '?') + '</span>'; }
  var KI = {
    Makan: ['M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-4 4-4 8h4', 'emas'],
    Transport: ['M5 17h14M6 17V9l2-4h8l2 4v8M6 12h12M8 17v2M16 17v2', 'biru'],
    Tagihan: ['M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', 'burgundy'],
    Belanja: ['M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2', 'ungu'],
    Hiburan: ['M4 5h16v14H4zM4 9h16M8 5v4M16 5v4M10 13l4 2-4 2z', 'teal'],
    Online: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', 'biru'],
    QRIS: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2', 'abu'],
    Gaji: ['M3 7h18v12H3zM3 7l2-3h14l2 3M15 13h2', 'hijau'],
    Bonus: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', 'emas'],
    Usaha: ['M4 9l1-5h14l1 5M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 6 0 2.5 2.5 0 0 0 5 0M5 11v9h14v-9M10 20v-5h4v5', 'teal'],
    Hadiah: ['M4 8h16v4H4zM6 12v8h12v-8M12 8v12M12 8c-3 0-4-4-1-4 2 0 1 4 1 4zM12 8c3 0 4-4 1-4-2 0-1 4-1 4z', 'burgundy'],
    Investasi: ['M3 17l6-6 4 4 8-8M15 7h6v6', 'hijau'],
    Lainnya: ['M6 12h.01M12 12h.01M18 12h.01', 'abu'],
    _transfer: ['M4 8h14l-3-3M20 16H6l3 3', 'abu']
  };
  function catIcon(k, size) {
    var d = KI[k] || KI.Lainnya, p = PAL[d[1]], sz = size || 32;
    return '<span class="wi" style="background:' + p.t + ';color:' + p.x + ';width:' + sz + 'px;height:' + sz + 'px"><svg viewBox="0 0 24 24" width="' + Math.round(sz * .6) + '" height="' + Math.round(sz * .6) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + d[0] + '"/></svg></span>';
  }
  function curPeriod(off) { var rd = C.clampDay(S.D.pengaturan.resetDay); var p = C.periodOf(C.today(), rd); return off ? C.shiftPeriod(p, off, rd) : p; }
  function calc(off) {
    var D = S.D, rd = C.clampDay(D.pengaturan.resetDay), p = curPeriod(off), prev = C.shiftPeriod(p, -1, rd);
    var sum = C.summarize(D.transaksi, p), psum = C.summarize(D.transaksi, prev);
    return { p: p, sum: sum, rows: C.budgetRows(D.anggaran, sum, psum, Number(D.pengaturan.rollover) === 1), rd: rd };
  }
  function fmtDate(s) { var a = s.split('-'); return +a[2] + ' ' + C.MON3[+a[1] - 1] + ' ' + a[0]; }
  function dayLabel(s) { var t = C.today(); if (s === t) return 'Hari ini'; if (s === C.addDays(t, -1)) return 'Kemarin'; return fmtDate(s); }
  function newForm(j) { return { jenis: j, dompet: (S.D.dompet.filter(function (w) { return w.id === S.me.peran; })[0] || S.D.dompet[0] || {}).id, tujuan: '', kategori: j === 'masuk' ? 'Gaji' : 'Makan', nominal: '', tanggal: C.today(), catatan: '' }; }

  /* ---------- tampilan: layar non-app ---------- */
  function vBoot() { return '<div class="center"><div class="logo">' + ICON.logo + '</div><div class="mut">Memuat…</div></div>'; }
  function vConfig() {
    return '<div class="center"><div class="logo">' + ICON.logo + '</div><h2>Dompet WR belum disetel</h2><p class="mut" style="max-width:340px">Isi <b>API_URL</b> dan <b>GOOGLE_CLIENT_ID</b> di file <code>config.js</code>, lalu muat ulang. Langkahnya ada di README.md.</p></div>';
  }
  function vLogin() {
    return '<div class="center"><div class="logo">' + ICON.logo + '</div><h1>Dompet WR</h1><p class="mut" style="margin:0 0 6px">Catatan keuangan berdua</p>' +
      '<div id="gbtn" style="min-height:44px"></div>' +
      '<div class="err">' + esc(S.loginMsg) + '</div>' +
      '<div class="help" style="margin-top:6px">Tombol Google tidak muncul / macet di iPhone?<br>Pakai kode pasangan dari perangkat lain (Akun → Kode pasangan).</div>' +
      '<div style="display:flex;gap:8px;width:100%;max-width:320px"><input id="pairin" class="field" placeholder="Kode pasangan" autocapitalize="characters" autocomplete="off" maxlength="9" style="text-transform:uppercase"><button class="btn sec" data-act="pair-redeem">Masuk</button></div></div>';
  }
  function dots(n) { var s = ''; for (var i = 0; i < 6; i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return '<div class="dots" id="dots">' + s + '</div>'; }
  function keypad(extraLeft) {
    var h = '<div class="pad">';
    for (var i = 1; i <= 9; i++) h += '<button data-key="' + i + '">' + i + '</button>';
    h += (extraLeft || '<button class="ghost" disabled></button>') + '<button data-key="0">0</button><button class="ghost" data-key="del" aria-label="Hapus">⌫</button></div>';
    return h;
  }
  function vPinSetup() {
    var t = S.pin.step === 1 ? 'Buat PIN 6 digit' : 'Ulangi PIN';
    return '<div class="center"><div class="logo">' + ICON.logo + '</div><h2>' + t + '</h2><p class="mut" style="margin:0">PIN dipakai untuk membuka aplikasi di perangkat ini.</p>' + dots(S.pin.val.length) + '<div class="err" id="pinmsg">' + esc(S.pin.msg) + '</div>' + keypad() + '</div>';
  }
  function vPinChoice() {
    return '<div class="center"><div class="logo">' + ICON.logo + '</div><h2>Amankan perangkat ini</h2><p class="mut" style="max-width:340px">Di komputer pribadi kamu boleh melewati PIN. Di komputer bersama sebaiknya pakai PIN.</p><button class="btn" data-act="use-pin">Buat PIN</button><button class="btn sec" data-act="skip-pin">Lewati PIN di perangkat ini</button></div>';
  }
  function vLock() {
    var b = store.get('wr.bio'), left = b && bioSupported() ? '<button class="ghost" data-act="bio" aria-label="Face ID">Face ID</button>' : '';
    return '<div class="center"><div class="logo">' + ICON.logo + '</div><h2>Masukkan PIN</h2>' + dots(S.lockVal.length) + '<div class="err" id="pinmsg">' + esc(S.lockMsg) + '</div>' + keypad(left) + '<button class="help" data-act="forgot" style="margin-top:8px;text-decoration:underline">Lupa PIN? Masuk dengan Google</button></div>';
  }

  /* ---------- tampilan: app ---------- */
  function navItems() { return [['beranda', 'Beranda', 'home'], ['riwayat', 'Riwayat', 'list'], ['laporan', 'Laporan', 'chart'], ['anggaran', 'Anggaran', 'target'], ['akun', 'Akun', 'user']]; }
  function shell(inner) {
    var r = S.route, tab = ['catat', 'dompet-baru'].indexOf(r) >= 0 ? null : r;
    var side = '<aside class="side"><div class="brand"><div class="logo">' + ICON.logo + '</div>Dompet WR</div>' + navItems().map(function (n) { return '<button class="nv ' + (tab === n[0] ? 'on' : '') + '" data-go="' + n[0] + '">' + ICON[n[2]] + n[1] + '</button>'; }).join('') + '<div class="sp"></div><div class="sync"></div><button class="nv" data-act="quit-app">' + ICON.power + 'Keluar</button><button class="btn acc" data-go="catat">' + ICON.plus.replace('<svg', '<svg width="18" height="18"') + ' Catat transaksi</button></aside>';
    var top = '<div class="top"><div class="brand"><div class="logo">' + ICON.logo + '</div>Dompet WR</div><span class="sync"></span><span class="pill">Dompet ' + esc(S.me.peran) + '</span><button class="iconbtn" data-act="sync" aria-label="Sinkron">' + ICON.sync + '</button><button class="iconbtn" data-act="quit-app" aria-label="Keluar aplikasi">' + ICON.power + '</button></div>';
    var tabs = '<nav class="tabbar">' +
      '<button class="' + (tab === 'beranda' ? 'on' : '') + '" data-go="beranda">' + ICON.home + 'Beranda</button>' +
      '<button class="' + (tab === 'riwayat' ? 'on' : '') + '" data-go="riwayat">' + ICON.list + 'Riwayat</button>' +
      '<button class="fab" data-go="catat" aria-label="Catat">' + ICON.plus + '</button>' +
      '<button class="' + (tab === 'laporan' ? 'on' : '') + '" data-go="laporan">' + ICON.chart + 'Laporan</button>' +
      '<button class="' + (tab === 'akun' || tab === 'anggaran' ? 'on' : '') + '" data-go="akun">' + ICON.user + 'Akun</button></nav>';
    return '<div class="shell desk">' + side + '<main class="main">' + top + inner + '</main></div>' + tabs;
  }
  function vHero(bal) {
    var D = S.D, tot = C.totalBalance(D.dompet, bal), c = calc(0);
    return '<section class="hero"><svg class="wl" viewBox="0 0 40 40">' + ICON.logo.replace(/<\/?svg[^>]*>/g, '') + '</svg><div class="lbl">Total saldo</div><div class="big num">' + C.fmtRp(tot) + '</div><div class="sub"><span>▲ Masuk ' + C.fmtRp(c.sum.masuk) + '</span><span>▼ Keluar ' + C.fmtRp(c.sum.keluar) + '</span></div></section>';
  }
  function vWallets(bal) {
    var h = '<div class="wrow">';
    S.D.dompet.forEach(function (w) { h += '<div class="wc">' + wicon(w) + '<div class="n">' + esc(w.nama) + '</div><div class="v num ' + (bal[w.id] < 0 ? 'over' : '') + '">' + C.fmtRp(bal[w.id] || 0) + '</div></div>'; });
    return h + '<button class="wc add" data-go="dompet-baru">+ Dompet baru</button></div>';
  }
  function vSplit(sum, wm) {
    var total = sum.keluar || 0, h = '<div class="split">', lg = '<div class="legend">';
    Object.keys(sum.perDompet).forEach(function (id) { var v = sum.perDompet[id].keluar; if (!v) return; var w = wm[id] || {}; h += '<i style="width:' + (v / total * 100) + '%;background:' + wpal(w).c + '"></i>'; lg += '<span><b style="background:' + wpal(w).c + '"></b>' + esc(w.nama || id) + ' ' + C.fmtRp(v) + '</span>'; });
    return total ? h + '</div>' + lg + '</div>' : '<div class="split"></div><div class="legend">Belum ada pengeluaran periode ini</div>';
  }
  function barHtml(row, wm) {
    var h = '<div class="bar">'; row.segs.forEach(function (s) { h += '<i style="width:' + Math.min(100, s.pct) + '%;background:' + wpal(wm[s.dompet]).c + '"></i>'; }); return h + '</div>';
  }
  function vBudRows(rows, wm) {
    if (!rows.length) return '<div class="help">Belum ada anggaran. Atur di menu Anggaran.</div>';
    return rows.map(function (r) {
      var cl = r.status === 'over' ? 'over' : r.status === 'warn' ? 'amb' : 'mut';
      var msg = r.status === 'over' ? 'Lebih ' + C.fmtRp(r.used - r.limit) : r.status === 'warn' ? 'Hampir habis, sisa ' + C.fmtRp(r.sisa) : 'Sisa ' + C.fmtRp(r.sisa);
      return '<div class="bud"><div class="hd"><b style="display:flex;align-items:center;gap:8px">' + catIcon(r.kategori, 24) + esc(r.kategori) + '</b><span class="num">' + C.fmtRp(r.used) + ' <span class="mut">/ ' + C.fmtRp(r.limit) + '</span></span></div>' + barHtml(r, wm) + '<div class="alert ' + cl + '">' + msg + ' · ' + r.pct + '%</div></div>';
    }).join('');
  }
  function liHtml(t, wm, open) {
    var w = wm[t.dompet] || {}, tw = wm[t.tujuan] || {}, sign = t.jenis === 'masuk' ? '+' : t.jenis === 'keluar' ? '−' : '';
    var title = t.jenis === 'transfer' ? 'Transfer ke ' + esc(tw.nama || t.tujuan) : esc(t.kategori || '-');
    var h = '<div class="li" data-act="open" data-id="' + esc(t.id) + '">' + catIcon(t.jenis === 'transfer' ? '_transfer' : t.kategori) + '<div class="m"><b>' + title + '</b><small>' + esc(w.nama || t.dompet) + (t.catatan ? ' · ' + esc(t.catatan) : '') + (t.pending ? ' <span class="pend">• menunggu sinkron</span>' : '') + '</small></div><div class="a num ' + (t.jenis === 'masuk' ? 'inc' : '') + '">' + sign + C.fmtRp(t.nominal).replace('−', '') + '</div></div>';
    if (open) h += '<div class="xp"><span>' + fmtDate(t.tanggal) + ' · dicatat ' + esc(t.oleh || '-') + '</span><button class="btn sm danger" data-act="del" data-id="' + esc(t.id) + '">Hapus</button></div>';
    return h;
  }
  function sortedTx() { return S.D.transaksi.slice().sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (a.id < b.id ? 1 : -1); }); }
  function trendSvg(data, big) {
    var w = 640, h = big ? 220 : 180, pad = 26, mx = 1; data.forEach(function (d) { mx = Math.max(mx, d.masuk, d.keluar); });
    var bw = (w - pad) / data.length, s = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto" role="img" aria-label="Tren pemasukan dan pengeluaran">';
    data.forEach(function (d, i) {
      var x = pad + i * bw, hm = (h - 30) * d.masuk / mx, hk = (h - 30) * d.keluar / mx;
      s += '<rect x="' + (x + bw * .12) + '" y="' + (h - 20 - hm) + '" width="' + bw * .34 + '" height="' + hm + '" rx="3" fill="#0B7A5E" opacity=".85"/><rect x="' + (x + bw * .52) + '" y="' + (h - 20 - hk) + '" width="' + bw * .34 + '" height="' + hk + '" rx="3" fill="#241F3A" opacity=".85"/><text x="' + (x + bw / 2) + '" y="' + (h - 5) + '" font-size="11" text-anchor="middle" fill="#7A768A">' + esc(d.label) + '</text>';
    });
    return s + '</svg><div class="legend"><span><b style="background:#0B7A5E"></b>Masuk</span><span><b style="background:#241F3A"></b>Keluar</span></div>';
  }
  function vBeranda() {
    var D = S.D, wm = wmap(), bal = C.walletBalances(D.dompet, D.transaksi), c = calc(0), recent = sortedTx().slice(0, 5);
    var tr = C.trend(D.transaksi, c.rd, c.p, isDesk() ? 12 : 6);
    return '<div class="dash">' + vHero(bal) + '<div class="wallets"><div class="noprint">' + vWallets(bal) + '</div></div>' +
      '<div class="card recap"><h3>Rekap ' + esc(c.p.label) + '</h3><div class="two"><div><small>Pemasukan</small><strong class="num inc">' + C.fmtRp(c.sum.masuk) + '</strong></div><div><small>Pengeluaran</small><strong class="num">' + C.fmtRp(c.sum.keluar) + '</strong></div></div>' + vSplit(c.sum, wm) + '</div>' +
      '<div class="card trendc desk-only"><h3>Tren 12 periode</h3>' + trendSvg(C.trend(D.transaksi, c.rd, c.p, 12), true) + '</div>' +
      '<div class="card budc"><h3>Anggaran <button class="help" data-go="anggaran">Atur</button></h3>' + vBudRows(c.rows, wm) + '</div>' +
      '<div class="card recent"><h3>Terbaru <button class="help" data-go="riwayat">Semua</button></h3>' + (recent.length ? recent.map(function (t) { return liHtml(t, wm, false); }).join('') : '<div class="help">Belum ada transaksi. Tekan + untuk mencatat.</div>') + '</div></div>';
  }
  function vRiwayat() {
    var D = S.D, wm = wmap(), q = S.q.toLowerCase(), list = sortedTx().filter(function (t) {
      if (S.fw !== 'all' && t.dompet !== S.fw && t.tujuan !== S.fw) return false;
      if (!q) return true;
      return (t.kategori + ' ' + t.catatan + ' ' + (wm[t.dompet] || {}).nama + ' ' + t.nominal).toLowerCase().indexOf(q) >= 0;
    });
    var h = '<div class="page"><h2 style="margin-bottom:12px">Riwayat</h2><input class="field" id="q" placeholder="Cari kategori, catatan, nominal" value="' + esc(S.q) + '" style="margin-bottom:12px"><div class="chips"><button class="chip ' + (S.fw === 'all' ? 'on' : '') + '" data-act="fw" data-id="all">Semua</button>' +
      D.dompet.map(function (w) { return '<button class="chip ' + (S.fw === w.id ? 'on' : '') + '" data-act="fw" data-id="' + esc(w.id) + '">' + esc(w.nama) + '</button>'; }).join('') + '</div><div class="card" id="rwlist">';
    h += listBody(list, wm) + '</div></div>';
    return h;
  }
  function listBody(list, wm) {
    if (!list.length) return '<div class="help">Tidak ada transaksi.</div>';
    var last = '', h = '';
    list.slice(0, 300).forEach(function (t) { if (t.tanggal !== last) { h += '<div class="dayh">' + dayLabel(t.tanggal) + '</div>'; last = t.tanggal; } h += liHtml(t, wm, S.open === t.id); });
    return h;
  }
  function vLaporan() {
    var D = S.D, wm = wmap(), c = calc(S.pOff), tr = C.trend(D.transaksi, c.rd, c.p, 12);
    var kats = Object.keys(c.sum.kat).sort(function (a, b) { return c.sum.kat[b].total - c.sum.kat[a].total; });
    var pd = D.dompet.map(function (w) { var s = c.sum.perDompet[w.id] || { masuk: 0, keluar: 0 }; return '<tr><td>' + esc(w.nama) + '</td><td class="r num inc">' + C.fmtRp(s.masuk) + '</td><td class="r num">' + C.fmtRp(s.keluar) + '</td><td class="r num">' + C.fmtRp(s.masuk - s.keluar) + '</td></tr>'; }).join('');
    var kt = kats.map(function (k) { return '<tr><td><span style="display:inline-flex;align-items:center;gap:8px">' + catIcon(k, 24) + esc(k) + '</span></td><td class="r num">' + C.fmtRp(c.sum.kat[k].total) + '</td><td class="r num mut">' + (c.sum.keluar ? Math.round(c.sum.kat[k].total / c.sum.keluar * 100) : 0) + '%</td></tr>'; }).join('');
    var net = c.sum.masuk - c.sum.keluar;
    return '<div class="page wide"><div class="pnav noprint"><button class="iconbtn" data-act="pprev" aria-label="Sebelumnya">' + ICON.back + '</button><b>' + esc(c.p.label) + '</b><button class="iconbtn" data-act="pnext" ' + (S.pOff >= 0 ? 'disabled style="opacity:.4"' : '') + ' aria-label="Berikutnya" style="transform:scaleX(-1)">' + ICON.back + '</button></div>' +
      '<h2 style="display:none" class="printh">Laporan Dompet WR · ' + esc(c.p.label) + '</h2>' +
      '<div class="lap"><div class="card full"><h3>Ringkasan</h3><div class="two" style="grid-template-columns:repeat(3,1fr)"><div><small>Pemasukan</small><strong class="num inc">' + C.fmtRp(c.sum.masuk) + '</strong></div><div><small>Pengeluaran</small><strong class="num">' + C.fmtRp(c.sum.keluar) + '</strong></div><div><small>Selisih</small><strong class="num ' + (net < 0 ? 'over' : 'inc') + '">' + C.fmtRp(net) + '</strong></div></div>' + vSplit(c.sum, wm) + '</div>' +
      '<div class="card full"><h3>Tren 12 periode</h3>' + trendSvg(tr, true) + '</div>' +
      '<div class="card"><h3>Anggaran per kategori</h3>' + vBudRows(c.rows, wm) + '</div>' +
      '<div class="card"><h3>Pengeluaran per kategori</h3>' + (kt ? '<table class="tbl"><tbody>' + kt + '</tbody></table>' : '<div class="help">Belum ada data.</div>') + '</div>' +
      '<div class="card full"><h3>Per dompet</h3><table class="tbl"><thead><tr><th>Dompet</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Selisih</th></tr></thead><tbody>' + pd + '</tbody></table></div></div>' +
      '<div class="noprint" style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><button class="btn sec" data-act="csv-period">Ekspor CSV periode ini</button><button class="btn sec" data-act="csv-all">Ekspor CSV semua</button><button class="btn sec" data-act="print">Cetak / simpan PDF</button></div></div>';
  }
  function vAnggaran() {
    var D = S.D, h = '<div class="page"><button class="back" data-go="akun">' + ICON.back + ' Anggaran</button><div class="card"><h3>Batas per kategori (gabungan R + W / periode)</h3>';
    C.EXP_CATS.forEach(function (k) { h += '<div class="row"><b>' + k + '</b><input class="field" style="width:150px;height:42px;text-align:right" inputmode="numeric" data-bud="' + k + '" placeholder="0" value="' + (D.anggaran[k] ? C.fmtNum(D.anggaran[k]) : '') + '"></div>'; });
    h += '</div><div class="card"><div class="row"><div><b>Tanggal reset</b><div class="help">Periode anggaran dimulai tiap tanggal ini (1–28)</div></div><input class="field" id="rd" style="width:80px;height:42px;text-align:center" inputmode="numeric" value="' + C.clampDay(D.pengaturan.resetDay) + '"></div>' +
      '<div class="row"><div><b>Sisa dibawa ke periode berikut</b><div class="help">Sisa anggaran bulan lalu menambah batas bulan ini</div></div><button class="tg ' + (Number(D.pengaturan.rollover) === 1 ? 'on' : '') + '" data-act="rollover" aria-label="Rollover"></button></div></div></div>';
    return h;
  }
  function vAkun() {
    var D = S.D, bio = store.get('wr.bio'), hasLock = !!store.get('wr.lock');
    var members = (S.base.anggota || []).map(function (a) { return '<div class="row"><span>' + esc(a.nama || a.peran) + '</span><span class="pill" style="' + (a.peran === 'W' ? 'background:var(--wt);color:var(--wx)' : 'background:var(--rt);color:var(--rx)') + '">Dompet ' + esc(a.peran) + (a.peran === S.me.peran ? ' · kamu' : '') + '</span></div>'; }).join('');
    var h = '<div class="page"><h2 style="margin-bottom:12px">Akun</h2><div class="card"><h3>Keamanan</h3>' +
      '<div class="row"><div><b>Kunci PIN</b><div class="help">' + (hasLock ? 'Aktif di perangkat ini' : 'Tidak aktif (perangkat ini)') + '</div></div><button class="btn sm sec" data-act="' + (hasLock ? 'change-pin' : 'use-pin') + '">' + (hasLock ? 'Ganti PIN' : 'Buat PIN') + '</button></div>' +
      (bioSupported() && hasLock ? '<div class="row"><div><b>Face ID</b><div class="help">Pintasan buka kunci. PIN tetap jadi cadangan.</div></div><button class="tg ' + (bio ? 'on' : '') + '" data-act="bio-toggle" aria-label="Face ID"></button></div>' : '') +
      '<div class="row"><div><b>Kunci sekarang</b></div><button class="btn sm sec" data-act="lock-now"' + (hasLock ? '' : ' disabled') + '>Kunci</button></div></div>' +
      '<div class="card"><h3>Anggota</h3>' + members + '</div>' +
      '<div class="card"><h3>Data</h3><div class="row"><span>Pengaturan anggaran</span><button class="btn sm sec" data-go="anggaran">Buka</button></div><div class="row"><span>Google Sheet</span>' + (S.base.sheetUrl ? '<a class="btn sm sec" style="text-decoration:none" href="' + esc(S.base.sheetUrl) + '" target="_blank" rel="noopener">Buka</a>' : '') + '</div><div class="row"><span>Sinkron terakhir</span><span class="help">' + (S.lastSync ? new Date(S.lastSync).toLocaleString('id-ID') : '-') + '</span></div></div>' +
      '<div class="card"><h3>Kode pasangan</h3><div class="help">Untuk masuk di perangkat lain tanpa popup Google (misal iPhone). Berlaku 10 menit, sekali pakai.</div>' + (S.pair ? '<div class="code">' + esc(S.pair) + '</div>' : '') + '<button class="btn sm sec" data-act="pair-create">Buat kode</button></div>' +
      '<div class="card"><h3>Pasang di layar utama (iPhone)</h3><div class="help">Safari → tombol Bagikan → Tambah ke Layar Utama. Buka dari ikon itu supaya tampil seperti aplikasi.</div></div>' +
      '<button class="btn danger" data-act="logout" style="width:100%">Keluar dari perangkat ini</button></div>';
    return h;
  }
  function vCatat() {
    var F = S.form, D = S.D, wm = wmap(), cats = F.jenis === 'masuk' ? C.INC_CATS : C.EXP_CATS;
    var wsel = function (key, cur, exclude) { return '<div class="chips" style="flex-wrap:wrap;margin:0;padding:0;overflow:visible">' + D.dompet.filter(function (w) { return w.id !== exclude; }).map(function (w) { return '<button class="chip ' + (cur === w.id ? 'on' : '') + '" data-act="fset" data-k="' + key + '" data-v="' + esc(w.id) + '">' + esc(w.nama) + '</button>'; }).join('') + '</div>'; };
    var h = '<div class="page"><button class="back" data-go="beranda">' + ICON.back + ' Catat</button><div class="seg"><button class="' + (F.jenis === 'keluar' ? 'on' : '') + '" data-act="jenis" data-v="keluar">Pengeluaran</button><button class="' + (F.jenis === 'masuk' ? 'on' : '') + '" data-act="jenis" data-v="masuk">Pemasukan</button><button class="' + (F.jenis === 'transfer' ? 'on' : '') + '" data-act="jenis" data-v="transfer">Transfer</button></div>' +
      '<div class="card"><div class="mut" style="text-align:center;font-size:13px">Nominal</div><input class="amt num" id="nom" inputmode="numeric" placeholder="Rp 0" value="' + (F.nominal ? 'Rp ' + C.fmtNum(C.parseNum(F.nominal)) : '') + '">' +
      '<div class="lab">' + (F.jenis === 'transfer' ? 'Dari dompet' : 'Dompet') + '</div>' + wsel('dompet', F.dompet);
    if (F.jenis === 'transfer') h += '<div class="lab">Ke dompet</div>' + wsel('tujuan', F.tujuan, F.dompet);
    else {
      h += '<div class="lab">Kategori</div><div class="cats">' + cats.map(function (k) { return '<button class="chip ' + (F.kategori === k ? 'on' : '') + '" data-act="fset" data-k="kategori" data-v="' + k + '">' + catIcon(k, 20) + k + '</button>'; }).join('') + '</div>';
      if (F.jenis === 'keluar') {
        var row = calc(0).rows.filter(function (r) { return r.kategori === F.kategori; })[0];
        if (row) { var nom = C.parseNum(F.nominal); var after = row.sisa - nom; h += '<div class="alert ' + (after < 0 ? 'over' : 'mut') + '" style="margin-top:10px">Anggaran ' + esc(F.kategori) + ': sisa ' + C.fmtRp(row.sisa) + (nom ? ' → ' + C.fmtRp(after) + ' setelah ini' : '') + '</div>'; }
      }
    }
    h += '<div class="lab">Tanggal</div><input class="field" id="tgl" type="date" value="' + esc(F.tanggal) + '" max="' + C.addDays(C.today(), 1) + '"><div class="lab">Catatan (opsional)</div><input class="field" id="cat" maxlength="120" placeholder="mis. makan siang" value="' + esc(F.catatan) + '"></div>' +
      '<button class="btn acc" data-act="save-tx" style="width:100%">Simpan</button></div>';
    return h;
  }
  function vDompetBaru() {
    var N = S.nd, w = { huruf: (N.nama || '?').charAt(0).toUpperCase(), warna: N.warna };
    return '<div class="page"><button class="back" data-go="beranda">' + ICON.back + ' Dompet baru</button><div class="card"><div style="display:flex;gap:12px;align-items:center;margin-bottom:6px">' + wicon(w, 48) + '<div><b id="ndn">' + esc(N.nama || 'Nama dompet') + '</b><div class="help">' + (N.tipe === 'bersama' ? 'Bersama (kelihatan R dan W)' : 'Pribadi (hanya kamu)') + '</div></div></div>' +
      '<div class="lab">Nama</div><input class="field" id="ndnama" maxlength="24" placeholder="mis. Tabungan Emas" value="' + esc(N.nama) + '"><div class="lab">Warna</div><div class="sw">' + Object.keys(PAL).map(function (k) { return '<button class="' + (N.warna === k ? 'on' : '') + '" data-act="nd" data-k="warna" data-v="' + k + '" style="background:' + PAL[k].c + '" aria-label="' + k + '"></button>'; }).join('') + '</div>' +
      '<div class="lab">Jenis</div><div class="seg"><button class="' + (N.tipe === 'bersama' ? 'on' : '') + '" data-act="nd" data-k="tipe" data-v="bersama">Bersama</button><button class="' + (N.tipe === 'pribadi' ? 'on' : '') + '" data-act="nd" data-k="tipe" data-v="pribadi">Pribadi</button></div>' +
      '<div class="lab">Saldo awal</div><input class="field" id="ndsaldo" inputmode="numeric" placeholder="Rp 0" value="' + (N.saldo ? 'Rp ' + C.fmtNum(C.parseNum(N.saldo)) : '') + '">' +
      '<div class="row"><div><b>Hitung di total saldo</b><div class="help">Matikan untuk aset yang tidak ingin masuk total</div></div><button class="tg ' + (N.hitung ? 'on' : '') + '" data-act="nd-hitung" aria-label="Hitung"></button></div></div><button class="btn acc" data-act="save-dompet" style="width:100%">Simpan dompet</button></div>';
  }
  function vApp() {
    if (!S.D) return vBoot();
    var r = S.route, v = { beranda: vBeranda, riwayat: vRiwayat, laporan: vLaporan, anggaran: vAnggaran, akun: vAkun, catat: vCatat, 'dompet-baru': vDompetBaru }[r] || vBeranda;
    return shell(v());
  }

  /* ---------- render ---------- */
  function render() {
    if (S.screen === 'app' && S.D) document.body.className = 'role-' + S.me.peran; else document.body.className = 'role-' + ((store.get('wr.me') || {}).peran || 'R');
    var sc = S.screen, h;
    if (sc === 'config') h = vConfig(); else if (sc === 'login') h = vLogin(); else if (sc === 'pinsetup') h = vPinSetup(); else if (sc === 'pinchoice') h = vPinChoice(); else if (sc === 'lock') h = vLock(); else if (sc === 'app') h = vApp(); else h = vBoot();
    $app.innerHTML = h;
    if (sc === 'login') initGoogle();
    paintSync();
  }

  /* ---------- Google ---------- */
  function initGoogle() {
    if (!cfgOk()) return;
    var mount = function () {
      if (!window.google || !google.accounts) return;
      google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onGoogle, auto_select: false, ux_mode: 'popup' });
      var el = document.getElementById('gbtn'); if (el) google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 });
    };
    if (window.google && google.accounts) return mount();
    if (document.getElementById('gis')) return;
    var s = document.createElement('script'); s.id = 'gis'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = mount; s.onerror = function () { S.loginMsg = 'Tidak bisa memuat Google. Pakai kode pasangan.'; render(); }; document.head.appendChild(s);
  }
  function onGoogle(resp) {
    S.loginMsg = 'Memeriksa akun…'; var m = document.querySelector('.err'); if (m) m.textContent = S.loginMsg;
    api({ action: 'login', idToken: resp.credential, perangkat: navigator.platform || 'web' }).then(function (r) {
      if (!r.ok) { S.loginMsg = r.error === 'tidak_terdaftar' ? 'Akun Google ini tidak terdaftar di Dompet WR.' : 'Gagal masuk (' + (r.error || 'server') + ').'; render(); return; }
      S.loginMsg = ''; afterLoginOK(r.token, r.me);
    }).catch(function () { S.loginMsg = 'Tidak bisa terhubung. Periksa internet.'; render(); });
  }

  /* ---------- PIN ---------- */
  function finishAuth() {
    S.screen = 'app'; S.route = (location.hash || '#beranda').slice(1);
    if (['beranda', 'riwayat', 'laporan', 'anggaran', 'akun'].indexOf(S.route) < 0) S.route = 'beranda';
    rebuild();
    if (!S.D) { S.base = null; render(); sync(); return; }
    render(); sync();
  }
  function pinKey(k) {
    if (S.screen === 'pinsetup') {
      var p = S.pin; if (k === 'del') p.val = p.val.slice(0, -1); else if (p.val.length < 6) p.val += k;
      p.msg = ''; paintDots(p.val.length);
      if (p.val.length === 6) {
        if (p.step === 1) { p.first = p.val; p.val = ''; p.step = 2; setTimeout(render, 120); }
        else if (p.val !== p.first) { p.msg = 'PIN tidak sama, ulangi.'; p.step = 1; p.val = ''; p.first = ''; shake(); setTimeout(render, 450); }
        else {
          var pin = p.val;
          encryptToken(pin, S.token).then(function (o) { store.set('wr.lock', o); store.del('wr.session'); store.del('wr.fails'); toast('PIN aktif'); finishAuth(); });
        }
      }
    } else if (S.screen === 'lock') {
      if (S.busy) return;
      if (k === 'del') S.lockVal = S.lockVal.slice(0, -1); else if (S.lockVal.length < 6) S.lockVal += k;
      S.lockMsg = ''; paintDots(S.lockVal.length);
      if (S.lockVal.length === 6) {
        S.busy = true; var pin2 = S.lockVal;
        decryptToken(pin2, store.get('wr.lock')).then(function (tok) { S.busy = false; store.del('wr.fails'); S.token = tok; finishAuth(); }, function () {
          S.busy = false; var f = (store.get('wr.fails') || 0) + 1; store.set('wr.fails', f);
          if (f >= 5) { wipeAuth(); S.loginMsg = 'Terlalu banyak salah. Masuk lagi dengan Google.'; go('login'); return; }
          S.lockVal = ''; S.lockMsg = 'PIN salah. Sisa percobaan ' + (5 - f) + '.'; shake(); setTimeout(render, 450);
        });
      }
    }
  }
  function paintDots(n) { var d = document.querySelectorAll('#dots i'); d.forEach(function (e, i) { e.className = i < n ? 'on' : ''; }); var m = document.getElementById('pinmsg'); if (m) m.textContent = ''; }
  function shake() { var d = document.getElementById('dots'); if (d) { d.classList.add('shake'); } var m = document.getElementById('pinmsg'); if (m) m.textContent = (S.screen === 'lock' ? S.lockMsg : S.pin.msg); }
  function lockNow() { S.token = null; S.lockVal = ''; S.lockMsg = ''; S.screen = 'lock'; render(); }

  /* ---------- aksi ---------- */
  function download(name, text, mime) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: mime || 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function saveTx() {
    var F = S.form, nom = C.parseNum(F.nominal);
    if (!nom) return toast('Isi nominal dulu');
    if (!F.dompet) return toast('Pilih dompet');
    if (F.jenis === 'transfer' && (!F.tujuan || F.tujuan === F.dompet)) return toast('Pilih dompet tujuan');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(F.tanggal)) return toast('Tanggal tidak valid');
    enqueue({ op: 'addTx', tx: { id: C.uid(), tanggal: F.tanggal, jenis: F.jenis, dompet: F.dompet, tujuan: F.jenis === 'transfer' ? F.tujuan : '', kategori: F.jenis === 'transfer' ? '' : F.kategori, nominal: nom, catatan: F.catatan.trim() } });
    toast('Tersimpan'); nav('beranda');
  }
  function onClick(e) {
    var g = e.target.closest('[data-go]'); if (g) { nav(g.getAttribute('data-go')); return; }
    var k = e.target.closest('[data-key]'); if (k) { pinKey(k.getAttribute('data-key')); return; }
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.getAttribute('data-act'), id = el.getAttribute('data-id'), v = el.getAttribute('data-v'), kk = el.getAttribute('data-k');
    switch (a) {
      case 'sync': sync(true); break;
      case 'open': S.open = S.open === id ? null : id; if (S.route === 'riwayat') { var wm = wmap(), list = sortedTx(); render(); } else render(); break;
      case 'del': if (confirm('Hapus transaksi ini?')) { enqueue({ op: 'delTx', id: id }); S.open = null; toast('Dihapus'); render(); } break;
      case 'fw': S.fw = id; render(); break;
      case 'jenis': S.form = Object.assign(newForm(v), { nominal: S.form.nominal, catatan: S.form.catatan, tanggal: S.form.tanggal, dompet: S.form.dompet }); if (v === 'transfer') S.form.tujuan = ''; render(); break;
      case 'fset': S.form[kk] = v; if (kk === 'dompet' && S.form.tujuan === v) S.form.tujuan = ''; render(); break;
      case 'save-tx': saveTx(); break;
      case 'nd': S.nd[kk] = v; render(); break;
      case 'nd-hitung': S.nd.hitung = !S.nd.hitung; render(); break;
      case 'save-dompet':
        if (!S.nd.nama.trim()) return toast('Isi nama dompet');
        enqueue({ op: 'addDompet', dompet: { id: C.uid(), nama: S.nd.nama.trim(), warna: S.nd.warna, tipe: S.nd.tipe, saldoAwal: C.parseNum(S.nd.saldo), hitung: S.nd.hitung ? 1 : 0 } });
        toast('Dompet ditambahkan'); nav('beranda'); break;
      case 'rollover': enqueue({ op: 'setPengaturan', kunci: 'rollover', nilai: Number(S.D.pengaturan.rollover) === 1 ? 0 : 1 }); render(); break;
      case 'pprev': S.pOff--; render(); break;
      case 'pnext': if (S.pOff < 0) { S.pOff++; render(); } break;
      case 'csv-period': var c = calc(S.pOff); download('dompet-wr-' + c.p.start + '.csv', C.toCSV(sortedTx().filter(function (t) { return t.tanggal >= c.p.start && t.tanggal <= c.p.end; }), wmap())); break;
      case 'csv-all': download('dompet-wr-semua.csv', C.toCSV(sortedTx(), wmap())); break;
      case 'print': window.print(); break;
      case 'pair-create': api({ action: 'pairCreate', token: S.token }).then(function (r) { if (r.ok) { S.pair = r.code.slice(0, 4) + '-' + r.code.slice(4); render(); } else toast('Gagal membuat kode'); }).catch(function () { toast('Butuh internet'); }); break;
      case 'pair-redeem':
        var code = (document.getElementById('pairin').value || '').trim(); if (!code) return;
        api({ action: 'pairRedeem', code: code, perangkat: navigator.platform || 'web' }).then(function (r) { if (r.ok) { S.loginMsg = ''; afterLoginOK(r.token, r.me); } else { S.loginMsg = r.error === 'terlalu_banyak' ? 'Terlalu banyak percobaan, tunggu sebentar.' : 'Kode salah atau kedaluwarsa.'; render(); } }).catch(function () { S.loginMsg = 'Tidak bisa terhubung.'; render(); }); break;
      case 'use-pin': case 'change-pin': S.screen = 'pinsetup'; S.pin = { step: 1, val: '', first: '', msg: '' }; render(); break;
      case 'skip-pin': store.set('wr.session', S.token); finishAuth(); break;
      case 'lock-now': lockNow(); break;
      case 'quit-app': if (store.get('wr.lock')) lockNow(); else { toast('Buat PIN dulu agar aplikasi bisa dikunci'); nav('akun'); } break;
      case 'bio-toggle':
        if (store.get('wr.bio')) { store.del('wr.bio'); render(); } else bioRegister().then(function () { toast('Face ID aktif'); render(); }, function () { toast('Face ID tidak bisa diaktifkan'); }); break;
      case 'bio': bioVerify().then(function (tok) { S.token = tok; finishAuth(); }, function () { S.lockMsg = 'Face ID gagal, pakai PIN.'; render(); }); break;
      case 'forgot': if (confirm('Masuk ulang dengan Google? PIN di perangkat ini akan dihapus.')) { wipeAuth(); S.loginMsg = ''; go('login'); } break;
      case 'logout':
        if (confirm('Keluar dari perangkat ini? Catatan yang belum tersinkron akan hilang.')) { var t = S.token; (t ? api({ action: 'logout', token: t }).catch(function () {}) : Promise.resolve()).then(function () { wipeAuth(); store.del('wr.snap'); store.del('wr.queue'); store.del('wr.me'); S.queue = []; S.base = null; S.D = null; S.me = null; S.loginMsg = ''; go('login'); }); } break;
    }
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === 'nom') { var n = C.parseNum(t.value); S.form.nominal = String(n || ''); t.value = n ? 'Rp ' + C.fmtNum(n) : ''; }
    else if (t.id === 'cat') S.form.catatan = t.value;
    else if (t.id === 'tgl') S.form.tanggal = t.value;
    else if (t.id === 'ndnama') { S.nd.nama = t.value; var b = document.getElementById('ndn'); if (b) b.textContent = t.value || 'Nama dompet'; var wi = document.querySelector('.card .wi'); if (wi) wi.textContent = (t.value || '?').charAt(0).toUpperCase(); }
    else if (t.id === 'ndsaldo') { var m = C.parseNum(t.value); S.nd.saldo = String(m || ''); t.value = m ? 'Rp ' + C.fmtNum(m) : ''; }
    else if (t.id === 'q') { S.q = t.value; var wm = wmap(); document.getElementById('rwlist').innerHTML = listBody(sortedTx().filter(function (x) { var q = S.q.toLowerCase(); if (S.fw !== 'all' && x.dompet !== S.fw && x.tujuan !== S.fw) return false; return !q || (x.kategori + ' ' + x.catatan + ' ' + (wm[x.dompet] || {}).nama + ' ' + x.nominal).toLowerCase().indexOf(q) >= 0; }), wm); }
    else if (t.id === 'pairin') { /* biarkan */ }
  }
  function onChange(e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-bud')) { var v = C.parseNum(t.value); t.value = v ? C.fmtNum(v) : ''; enqueue({ op: 'setAnggaran', kategori: t.getAttribute('data-bud'), batas: v }); }
    else if (t.id === 'rd') { var r = C.clampDay(t.value); t.value = r; enqueue({ op: 'setPengaturan', kunci: 'resetDay', nilai: r }); }
  }
  function onKey(e) {
    if (S.screen !== 'pinsetup' && S.screen !== 'lock') return;
    if (/^[0-9]$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('del');
  }

  /* ---------- lifecycle ---------- */
  function boot() {
    document.addEventListener('click', onClick); document.addEventListener('input', onInput); document.addEventListener('change', onChange); document.addEventListener('keydown', onKey);
    window.addEventListener('online', function () { paintSync(); sync(); }); window.addEventListener('offline', paintSync);
    window.addEventListener('hashchange', function () { var r = (location.hash || '').slice(1); if (S.screen === 'app' && r && r !== S.route) { S.route = r; render(); } });
    window.matchMedia('(min-width:960px)').addEventListener && window.matchMedia('(min-width:960px)').addEventListener('change', function () { if (S.screen === 'app') render(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { S.bgAt = Date.now(); return; }
      if (S.screen === 'app' && store.get('wr.lock') && S.bgAt && Date.now() - S.bgAt > 60000) { lockNow(); return; }
      sync();
    });
    setInterval(function () { if (!document.hidden && S.screen === 'app') sync(); }, 60000);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});

    S.base = store.get('wr.snap'); S.me = store.get('wr.me');
    if (!cfgOk()) { S.screen = 'config'; return render(); }
    var lock = store.get('wr.lock'), sess = store.get('wr.session');
    if (lock) { S.screen = 'lock'; return render(); }
    if (sess) { S.token = sess; return finishAuth(); }
    S.screen = 'login'; render();
  }
  boot();
})();
