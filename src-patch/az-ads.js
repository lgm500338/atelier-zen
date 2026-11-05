/* 멍때리는 아틀리에 — 인앱 광고 (AZAds)
 * - 멍때리기: 처음 3분, 이후 5분이 지나면 "다음 그림으로 넘어갈 때" 전면형 광고
 * - 컬러링: 새 도안 3장 무료, 그 뒤로는 보상형 광고를 보면 3장 더 (하루마다 무료 3장 다시 채움)
 * - 잠들기 모드에서는 광고 없음, 광고 중에는 배경 음악·효과음 잠시 멈춤
 * - 토스 밖(웹 브라우저)이나 광고가 준비되지 않았으면 광고 없이 그대로 동작
 */
(function () {
  'use strict';

  /* 지금은 테스트용 ID. 출시 전에 콘솔의 '멍때리는 아틀리에' 앱에서 발급받은 ID로 바꿔 주세요. */
  var AD_IDS = {
    interstitial: 'ait.v2.live.03fbbfe641a7434e', // 멍때리기_전면형
    rewarded: 'ait.v2.live.e4344b2ea1e64c56'      // 새도안_보상형
  };
  var FIRST_AD_MS = 3 * 60 * 1000; // 첫 광고까지 3분
  var NEXT_AD_MS = 5 * 60 * 1000;  // 그 뒤 5분 간격
  var FREE_PER_ROUND = 3;          // 무료/보상 1회당 도안 3장

  function load(k, f) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- 소리: 광고 중 모든 Web Audio 잠시 멈춤 ---------- */
  var contexts = [];
  ['AudioContext', 'webkitAudioContext'].forEach(function (name) {
    var Orig = window[name];
    if (!Orig) return;
    var Wrapped = function () { var c = new (Function.prototype.bind.apply(Orig, [null].concat([].slice.call(arguments))))(); contexts.push(c); return c; };
    Wrapped.prototype = Orig.prototype;
    window[name] = Wrapped;
  });
  var paused = [];
  function muteAll() { paused = contexts.filter(function (c) { return c.state === 'running'; }); paused.forEach(function (c) { try { c.suspend(); } catch (e) {} }); }
  function unmuteAll() { paused.forEach(function (c) { try { c.resume(); } catch (e) {} }); paused = []; }

  /* ---------- 광고 불러오기·보여주기 (SDK는 번들 안에서 window.__AZAdsSDK로 연결) ---------- */
  var ready = { interstitial: false, rewarded: false };
  var showing = false;
  function sdk() { return window.__AZAdsSDK || null; }
  function supported() {
    var s = sdk();
    if (!s) return false;
    try { return s.load.isSupported() && s.show.isSupported(); } catch (e) { return false; }
  }
  function preload(kind) {
    if (!supported() || ready[kind]) return;
    try {
      sdk().load({
        options: { adGroupId: AD_IDS[kind] },
        onEvent: function (e) { if (e && e.type === 'loaded') ready[kind] = true; },
        onError: function () { ready[kind] = false; setTimeout(function () { preload(kind); }, 30000); }
      });
    } catch (e) {}
  }
  function show(kind, done) {
    if (showing || !supported() || !ready[kind]) { preload(kind); done({ rewarded: false, skipped: true }); return; }
    var finished = false, rewarded = false;
    showing = true;
    muteAll();
    function finish() {
      if (finished) return;
      finished = true; showing = false; ready[kind] = false;
      unmuteAll(); preload(kind); done({ rewarded: rewarded });
    }
    try {
      sdk().show({
        options: { adGroupId: AD_IDS[kind] },
        onEvent: function (e) {
          if (!e) return;
          if (e.type === 'userEarnedReward') rewarded = true; // 보상은 이 이벤트가 왔을 때만
          if (e.type === 'dismissed' || e.type === 'failedToShow') finish();
        },
        onError: finish
      });
    } catch (e) { finish(); }
  }
  function boot() { preload('interstitial'); preload('rewarded'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 500); });
  else setTimeout(boot, 500);

  /* ---------- 멍때리기: 다음 그림으로 넘어갈 때만 ---------- */
  var startedAt = Date.now();
  var lastAdAt = 0;
  window.__azNext = function (sleeping, next) {
    return function () {
      var args = arguments;
      var now = Date.now();
      var due = lastAdAt ? now - lastAdAt >= NEXT_AD_MS : now - startedAt >= FIRST_AD_MS;
      if (sleeping || !due || !ready.interstitial || !supported()) { next.apply(null, args); return; }
      show('interstitial', function (r) {
        if (!r.skipped) lastAdAt = Date.now();
        next.apply(null, args);
      });
    };
  };

  /* ---------- 컬러링: 새 도안 3장마다 보상형 광고 ---------- */
  var today = new Date().toISOString().slice(0, 10);
  var st = load('az_color_quota_v1', null);
  if (!st || st.day !== today) st = { day: today, allow: FREE_PER_ROUND, opened: [] };
  function persist() { save('az_color_quota_v1', st); }
  persist();
  function exempt(id) { return !id || String(id).indexOf('custom-sketch-') === 0 || String(id).indexOf('saved-') === 0; } // 내 사진 도안·보관함 작품은 무료

  // 컬러링 스튜디오(Pa)를 감싸는 컴포넌트. 열 수 있으면 원래 화면, 아니면 "광고 보고 3장 더" 안내.
  window.__AZGate = function (props, React, J, Inner) {
    var art = props.artwork || {};
    var id = art.id;
    var force = React.useState(0)[1];
    var busy = React.useState(false), isBusy = busy[0], setBusy = busy[1];
    var open = exempt(id) || !supported() || st.opened.indexOf(id) >= 0;
    if (!open && st.opened.length < st.allow) { st.opened.push(id); persist(); open = true; }
    if (open) return J.jsx(Inner, props);

    var canAd = ready.rewarded;
    function watch() {
      if (isBusy) return;
      setBusy(true);
      show('rewarded', function (r) {
        setBusy(false);
        if (r.rewarded) { st.allow += FREE_PER_ROUND; persist(); }
        force(function (n) { return n + 1; });
      });
    }
    return J.jsx('div', {
      className: 'w-full max-w-xl mx-auto px-4 py-10',
      children: J.jsxs('div', {
        className: 'rounded-2xl border border-amber-200/80 bg-amber-50/60 px-6 py-8 text-center space-y-3',
        children: [
          J.jsx('div', { className: 'font-serif text-lg text-stone-800', children: '오늘의 무료 도안을 모두 칠했어요' }),
          J.jsx('p', { className: 'text-xs text-stone-500 leading-relaxed', children: '짧은 광고를 보면 새 도안 ' + FREE_PER_ROUND + '장을 더 칠할 수 있어요. 내일이 되면 무료 도안이 다시 채워져요.' }),
          J.jsx('button', {
            onClick: canAd ? watch : function () { preload('rewarded'); setTimeout(function () { force(function (n) { return n + 1; }); }, 800); },
            style: { marginTop: 8, padding: '12px 22px', borderRadius: 14, fontSize: 14, fontWeight: 600, color: '#fff', background: canAd ? '#047857' : '#a8a29e', border: 0 },
            children: canAd ? (isBusy ? '광고 여는 중…' : '광고 보고 도안 ' + FREE_PER_ROUND + '장 더 받기') : '광고 준비 중이에요 · 다시 눌러 주세요'
          }),
          props.onBackToTimelapse ? J.jsx('div', { children: J.jsx('button', { onClick: props.onBackToTimelapse, style: { marginTop: 6, fontSize: 12, color: '#78716c', textDecoration: 'underline', background: 'none', border: 0 }, children: '멍때리기로 돌아가기' }) }) : null
        ]
      })
    });
  };
})();
