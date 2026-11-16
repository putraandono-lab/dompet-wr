/* Dompet WR - logika inti (murni, tanpa DOM). Dipakai di browser dan di tes Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WRCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var EXP_CATS = ['Makan', 'Transport', 'Tagihan', 'Belanja', 'Hiburan', 'Online', 'QRIS', 'Lainnya'];
  var INC_CATS = ['Gaji', 'Bonus', 'Usaha', 'Hadiah', 'Investasi', 'Lainnya'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(y, m, d) {
    var dt = new Date(Date.UTC(y, m, d));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }
  function parse(s) { var p = String(s).split('-'); return [+p[0], +p[1] - 1, +p[2]]; }
  function addDays(s, n) { var a = parse(s); return ymd(a[0], a[1], a[2] + n); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function clampDay(r) { r = parseInt(r, 10); if (!r || r < 1) r = 1; return r > 28 ? 28 : r; }

  function periodLabel(start, end, r) {
    var a = parse(start), b = parse(end);
    if (r === 1) return MONTHS[a[1]] + ' ' + a[0];
    return a[2] + ' ' + MON3[a[1]] + ' – ' + b[2] + ' ' + MON3[b[1]] + ' ' + b[0];
  }

  // Periode anggaran/laporan. resetDay=1 -> bulan kalender. resetDay=25 -> 25 s.d. 24 bulan berikutnya.
  function periodOf(dateStr, resetDay) {
    var r = clampDay(resetDay);
    var a = parse(dateStr);
    var sm = a[2] >= r ? a[1] : a[1] - 1;
    var start = ymd(a[0], sm, r);
    var next = ymd(a[0], sm + 1, r);
    var end = addDays(next, -1);
    var sp = parse(start);
    return { start: start, end: end, key: start, label: periodLabel(start, end, r), short: r === 1 ? MON3[sp[1]] : sp[2] + ' ' + MON3[sp[1]] };
  }
  function shiftPeriod(p, delta, resetDay) {
    var a = parse(p.start);
    return periodOf(ymd(a[0], a[1] + delta, clampDay(resetDay)), resetDay);
  }

  function fmtNum(n) { return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmtRp(n) { return (n < 0 ? '−' : '') + 'Rp ' + fmtNum(n); }
  function parseNum(s) { return parseInt(String(s == null ? '' : s).replace(/\D/g, ''), 10) || 0; }

  function walletBalances(dompet, tx) {
    var bal = {};
    (dompet || []).forEach(function (w) { bal[w.id] = Number(w.saldoAwal) || 0; });
    (tx || []).forEach(function (t) {
      var n = Number(t.nominal) || 0;
      if (t.jenis === 'masuk') { if (t.dompet in bal) bal[t.dompet] += n; }
      else if (t.jenis === 'keluar') { if (t.dompet in bal) bal[t.dompet] -= n; }
      else if (t.jenis === 'transfer') {
        if (t.dompet in bal) bal[t.dompet] -= n;
        if (t.tujuan in bal) bal[t.tujuan] += n;
      }
    });
    return bal;
  }
  function totalBalance(dompet, bal) {
    var s = 0;
    (dompet || []).forEach(function (w) { if (Number(w.hitung) !== 0 && w.hitung !== false) s += bal[w.id] || 0; });
    return s;
  }

  // Rekap satu periode. Transfer tidak dihitung.
  function summarize(tx, period) {
    var out = { masuk: 0, keluar: 0, count: 0, perDompet: {}, kat: {}, katMasuk: {} };
    (tx || []).forEach(function (t) {
      if (t.tanggal < period.start || t.tanggal > period.end) return;
      if (t.jenis !== 'keluar' && t.jenis !== 'masuk') return;
      var n = Number(t.nominal) || 0;
      var pd = out.perDompet[t.dompet] || (out.perDompet[t.dompet] = { masuk: 0, keluar: 0 });
      out.count++;
      if (t.jenis === 'keluar') {
        out.keluar += n; pd.keluar += n;
        var k = out.kat[t.kategori] || (out.kat[t.kategori] = { total: 0, perDompet: {} });
        k.total += n;
        k.perDompet[t.dompet] = (k.perDompet[t.dompet] || 0) + n;
      } else {
        out.masuk += n; pd.masuk += n;
        out.katMasuk[t.kategori] = (out.katMasuk[t.kategori] || 0) + n;
      }
    });
    return out;
  }

  // Baris anggaran per kategori. rollover: sisa periode lalu (kategori sama) menambah batas.
  function budgetRows(anggaran, sum, prevSum, rollover) {
    var rows = [];
    EXP_CATS.forEach(function (cat) {
      var batas = Number((anggaran || {})[cat]) || 0;
      if (batas <= 0) return;
      var k = sum.kat[cat] || { total: 0, perDompet: {} };
      var used = k.total;
      var limit = batas;
      if (rollover && prevSum) {
        var pu = (prevSum.kat[cat] || { total: 0 }).total;
        limit += Math.max(0, batas - pu);
      }
      var pct = Math.round(used / limit * 100);
      var status = used > limit ? 'over' : (pct >= 80 ? 'warn' : 'ok');
      var scale = Math.max(limit, used);
      var segs = [];
      Object.keys(k.perDompet).forEach(function (wid) { segs.push({ dompet: wid, pct: k.perDompet[wid] / scale * 100 }); });
      rows.push({ kategori: cat, used: used, limit: limit, batas: batas, pct: pct, status: status, sisa: limit - used, segs: segs });
    });
    return rows;
  }

  function trend(tx, resetDay, endPeriod, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var p = shiftPeriod(endPeriod, -i, resetDay);
      var s = summarize(tx, p);
      out.push({ label: p.short, key: p.key, masuk: s.masuk, keluar: s.keluar });
    }
    return out;
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCSV(tx, wmap) {
    var rows = [['Tanggal', 'Jenis', 'Dompet', 'Dompet tujuan', 'Kategori', 'Nominal', 'Catatan', 'Dicatat oleh']];
    (tx || []).forEach(function (t) {
      rows.push([t.tanggal, t.jenis, (wmap[t.dompet] || {}).nama || t.dompet, t.tujuan ? ((wmap[t.tujuan] || {}).nama || t.tujuan) : '', t.kategori || '', t.nominal, t.catatan || '', t.oleh || '']);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() {
    var abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', s = '', i;
    var cr = (typeof self !== 'undefined' && self.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (cr && cr.getRandomValues) {
      var a = new Uint8Array(16); cr.getRandomValues(a);
      for (i = 0; i < 16; i++) s += abc[a[i] % abc.length];
    } else { for (i = 0; i < 16; i++) s += abc[Math.floor(Math.random() * abc.length)]; }
    return s;
  }

  // Terapkan operasi ke salinan data lokal (optimistic update).
  function applyOp(D, op, me) {
    if (!D) return D;
    if (op.op === 'addTx') {
      if (!D.transaksi.some(function (t) { return t.id === op.tx.id; })) {
        var t = clone(op.tx); t.oleh = (me && me.peran) || ''; t.pending = true; D.transaksi.push(t);
      }
    } else if (op.op === 'delTx') {
      D.transaksi = D.transaksi.filter(function (t) { return t.id !== op.id; });
    } else if (op.op === 'addDompet') {
      if (!D.dompet.some(function (w) { return w.id === op.dompet.id; })) {
        var w = clone(op.dompet); w.pemilik = w.tipe === 'pribadi' ? ((me && me.peran) || '') : ''; w.pending = true; D.dompet.push(w);
      }
    } else if (op.op === 'setAnggaran') {
      if (Number(op.batas) > 0) D.anggaran[op.kategori] = Number(op.batas); else delete D.anggaran[op.kategori];
    } else if (op.op === 'setPengaturan') {
      D.pengaturan[op.kunci] = op.nilai;
    }
    return D;
  }

  return {
    MONTHS: MONTHS, MON3: MON3, EXP_CATS: EXP_CATS, INC_CATS: INC_CATS,
    today: today, addDays: addDays, periodOf: periodOf, shiftPeriod: shiftPeriod, clampDay: clampDay,
    fmtRp: fmtRp, fmtNum: fmtNum, parseNum: parseNum,
    walletBalances: walletBalances, totalBalance: totalBalance, summarize: summarize,
    budgetRows: budgetRows, trend: trend, toCSV: toCSV, clone: clone, uid: uid, applyOp: applyOp
  };
});
