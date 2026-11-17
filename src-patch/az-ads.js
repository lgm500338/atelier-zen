/* 멍때리는 아틀리에 — 인앱 광고 (AZAds) v2
 * - 멍때리기: 처음 2분, 이후 4분이 지나면 "다음 그림으로 넘어갈 때" 전면형 광고
 * - 컬러링: 새 도안 3장 무료, 그 뒤로는 보상형 광고를 보면 3장 더 (하루마다 무료 3장 다시 채움)
 * - 화면 하단 배너 (잠들기 모드에서는 숨김)
 * - 광고를 못 받아오면 1분 → 2분 → 4분 간격으로 최대 3번만 다시 요청, 그 뒤엔 꼭 필요할 때만
 * - 같은 광고를 동시에 두 번 요청하지 않음, 필요한 때가 가까워졌을 때만 미리 불러옴
 * - 잠들기 모드에서는 광고 없음, 광고 중에는 배경 음악·효과음 잠시 멈춤
 * - 토스 밖(웹 브라우저)이나 광고가 준비되지 않았으면 광고 없이 그대로 동작
 */
(function () {
  'use strict';

  var AD_IDS = {
    interstitial: 'ait.v2.live.03fbbfe641a7434e', // 멍때리기_전면형
    rewarded: 'ait.v2.live.e4344b2ea1e64c56',     // 새도안_보상형
    banner: ''                                    // 하단_배너 — 콘솔에서 배너 광고 그룹을 만든 뒤 ID를 넣어 주세요 (비어 있으면 배너 없음)
  };
  var FIRST_AD_MS = 2 * 60 * 1000;   // 첫 전면형까지 2분
  var NEXT_AD_MS = 4 * 60 * 1000;    // 그 뒤 4분 간격
  var PRELOAD_LEAD_MS = 30 * 1000;   // 보여줄 때 30초 전에 미리 불러오기
  var RETRY_MS = [60000, 120000, 240000]; // 못 받아오면 다시 요청하는 간격 (최대 3번)
  var MANUAL_GAP_MS = 5 * 60 * 1000; // 자동 재요청이 끝난 뒤, 필요할 때 다시 요청하는 최소 간격 (5분)
  var FREE_PER_ROUND = 3;            // 무료/보상 1회당 도안 3장
  var BANNER_H = 96;                 // 토스 권장 고정 배너 높이

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

  /* ---------- 전면형·보상형: 불러오기·보여주기 ---------- */
  function mk() { return { ready: false, loading: false, fails: 0, retryTimer: 0, lastTry: 0 }; }
  var S = { interstitial: mk(), rewarded: mk() };
  var showing = false;
  function sdk() { return window.__AZAdsSDK || null; }
  function supported() {
    var s = sdk();
    if (!s || !s.load || !s.show) return false;
    try { return s.load.isSupported() && s.show.isSupported(); } catch (e) { return false; }
  }

  // manual: 사용자 동작(다음 그림, 버튼)으로 필요해진 경우. 자동 재요청이 끝났어도 5분에 한 번은 허용.
  function preload(kind, manual) {
    var s = S[kind];
    if (!supported() || s.ready || s.loading) return;
    var now = Date.now();
    if (s.retryTimer) { if (!manual) return; clearTimeout(s.retryTimer); s.retryTimer = 0; }
    if (s.fails >= RETRY_MS.length && (!manual || now - s.lastTry < MANUAL_GAP_MS)) return;
    s.loading = true; s.lastTry = now;
    var settled = false;
    function fail() {
      if (settled) return; settled = true;
      s.loading = false; s.ready = false;
      var wait = RETRY_MS[s.fails];
      s.fails++;
      if (wait) s.retryTimer = setTimeout(function () { s.retryTimer = 0; preload(kind); }, wait);
    }
    try {
      sdk().load({
        options: { adGroupId: AD_IDS[kind] },
        onEvent: function (e) {
          if (e && e.type === 'loaded' && !settled) { settled = true; s.loading = false; s.ready = true; s.fails = 0; }
        },
        onError: fail
      });
    } catch (e) { fail(); }
  }

  function show(kind, done) {
    var s = S[kind];
    if (showing || !supported() || !s.ready) { preload(kind, true); done({ rewarded: false, skipped: true }); return; }
    var finished = false, rewarded = false;
    showing = true;
    s.ready = false; // 한 번 받아온 광고는 한 번만
    muteAll();
    function finish() {
      if (finished) return;
      finished = true; showing = false;
      unmuteAll(); done({ rewarded: rewarded });
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

  /* ---------- 멍때리기: 다음 그림으로 넘어갈 때만 전면형 ---------- */
  var startedAt = Date.now();
  var lastAdAt = 0;
  var preloadTimer = 0;
  function dueAt() { return lastAdAt ? lastAdAt + NEXT_AD_MS : startedAt + FIRST_AD_MS; }
  function schedulePreload() {
    clearTimeout(preloadTimer);
    var wait = Math.max(0, dueAt() - PRELOAD_LEAD_MS - Date.now());
    preloadTimer = setTimeout(function () { preload('interstitial'); }, wait);
  }

  var sleepingNow = false;
  window.__azNext = function (sleeping, next) {
    if (sleeping !== sleepingNow) { sleepingNow = sleeping; setTimeout(syncBanner, 0); }
    return function () {
      var args = arguments;
      var due = Date.now() >= dueAt();
      if (sleeping || !due || !supported()) { next.apply(null, args); return; }
      if (!S.interstitial.ready) { preload('interstitial', true); next.apply(null, args); return; }
      show('interstitial', function (r) {
        if (!r.skipped) { lastAdAt = Date.now(); schedulePreload(); }
        next.apply(null, args);
      });
    };
  };

  /* ---------- 하단 배너 ---------- */
  var banner = { inited: false, initing: false, slot: null, box: null, spacer: null, fails: 0, timer: 0 };
  function bsdk() { return window.__AZBanner || null; }
  function bannerSupported() {
    var b = bsdk();
    if (!AD_IDS.banner || !b) return false;
    try { return b.init.isSupported() && b.attach.isSupported(); } catch (e) { return false; }
  }
  function ensureBox() {
    if (banner.box) return;
    var sp = document.createElement('div'); // 내용이 배너에 가려지지 않게 아래 여백
    sp.setAttribute('aria-hidden', 'true');
    sp.style.cssText = 'height:0;transition:height .3s';
    document.body.appendChild(sp);
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:40;width:100%;background:#fafaf9;padding-bottom:env(safe-area-inset-bottom,0px);display:none';
    var slot = document.createElement('div');
    slot.style.cssText = 'width:100%;height:' + BANNER_H + 'px';
    box.appendChild(slot);
    document.body.appendChild(box);
    banner.box = box; banner.slotEl = slot; banner.spacer = sp;
  }
  function setVisible(on) {
    if (!banner.box) return;
    banner.box.style.display = on ? 'block' : 'none';
    banner.spacer.style.height = on ? 'calc(' + BANNER_H + 'px + env(safe-area-inset-bottom,0px))' : '0';
  }
  function dropBanner() {
    if (banner.slot) { try { banner.slot.destroy(); } catch (e) {} banner.slot = null; }
    if (banner.slotEl) banner.slotEl.innerHTML = '';
    setVisible(false);
  }
  function bannerFailed() {
    dropBanner();
    var wait = RETRY_MS[banner.fails];
    banner.fails++;
    if (wait) { clearTimeout(banner.timer); banner.timer = setTimeout(function () { banner.timer = 0; syncBanner(); }, wait); }
  }
  function attachBanner() {
    if (banner.slot || banner.timer || banner.fails > RETRY_MS.length) return;
    ensureBox();
    banner.slotEl.innerHTML = '';
    setVisible(true);
    try {
      banner.slot = bsdk().attach(AD_IDS.banner, banner.slotEl, {
        theme: 'light', tone: 'blackAndWhite', variant: 'expanded',
        callbacks: {
          onAdRendered: function () { banner.fails = 0; },
          onNoFill: bannerFailed,
          onAdFailedToRender: bannerFailed
        }
      });
    } catch (e) { bannerFailed(); }
  }
  function syncBanner() {
    if (!bannerSupported()) return;
    if (sleepingNow) { dropBanner(); return; } // 잠들기 모드에서는 배너 없음
    if (banner.inited) { attachBanner(); return; }
    if (banner.initing) return;
    banner.initing = true;
    try {
      bsdk().init({
        callbacks: {
          onInitialized: function () { banner.initing = false; banner.inited = true; syncBanner(); },
          onInitializationFailed: function () { banner.initing = false; }
        }
      });
    } catch (e) { banner.initing = false; }
  }

  function boot() { schedulePreload(); syncBanner(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 500); });
  else setTimeout(boot, 500);

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
    if (st.allow - st.opened.length <= 1) preload('rewarded'); // 무료 도안이 1장 이하 남았을 때만 미리 불러오기
    if (open) return J.jsx(Inner, props);

    var canAd = S.rewarded.ready;
    function watch() {
      if (isBusy) return;
      setBusy(true);
      show('rewarded', function (r) {
        setBusy(false);
        if (r.rewarded) { st.allow += FREE_PER_ROUND; persist(); }
        force(function (n) { return n + 1; });
      });
    }
    function retry() {
      preload('rewarded', true);
      setTimeout(function () { force(function (n) { return n + 1; }); }, 1500);
    }
    return J.jsx('div', {
      className: 'w-full max-w-xl mx-auto px-4 py-10',
      children: J.jsxs('div', {
        className: 'rounded-2xl border border-amber-200/80 bg-amber-50/60 px-6 py-8 text-center space-y-3',
        children: [
          J.jsx('div', { className: 'font-serif text-lg text-stone-800', children: '오늘의 무료 도안을 모두 칠했어요' }),
          J.jsx('p', { className: 'text-xs text-stone-500 leading-relaxed', children: '짧은 광고를 보면 새 도안 ' + FREE_PER_ROUND + '장을 더 칠할 수 있어요. 내일이 되면 무료 도안이 다시 채워져요.' }),
          J.jsx('button', {
            onClick: canAd ? watch : retry,
            style: { marginTop: 8, padding: '12px 22px', borderRadius: 14, fontSize: 14, fontWeight: 600, color: '#fff', background: canAd ? '#047857' : '#a8a29e', border: 0 },
            children: canAd ? (isBusy ? '광고 여는 중…' : '광고 보고 도안 ' + FREE_PER_ROUND + '장 더 받기') : '광고 준비 중이에요 · 잠시 후 다시 눌러 주세요'
          }),
          props.onBackToTimelapse ? J.jsx('div', { children: J.jsx('button', { onClick: props.onBackToTimelapse, style: { marginTop: 6, fontSize: 12, color: '#78716c', textDecoration: 'underline', background: 'none', border: 0 }, children: '멍때리기로 돌아가기' }) }) : null
        ]
      })
    });
  };
})();
