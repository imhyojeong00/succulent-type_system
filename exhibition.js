// ================================================================
// EXHIBITION MODE — 전시용 자동 타이핑 (script.js 다음에 로드)
//
// · 아무도 치지 않을 때: A→Z를 사람이 치듯 불규칙한 리듬으로 타이핑
//   → 그동안 오리지널 ↔ X-ray가 일정 시간마다 번갈아 바뀜 → Z까지 치면 잠시 머문 뒤 지우고 다시 A부터
// · 관람자가 키를 누르거나 화면을 누르는 순간: 화면을 모두 비우고 시작점으로 돌아가
//   오리지널 상태에서 원래 기능 그대로 타이핑
// · 관람자가 일정 시간 아무것도 하지 않으면: 다시 자동 타이핑으로 돌아감
//
// 끄고 싶을 때: 주소 뒤에 ?demo=off  (예: .../succulent-type_system/?demo=off)
// ================================================================

const EXHIBIT = {
  LETTERS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  START_DELAY_MS: 1400,      // 화면이 비워진 뒤 첫 글자가 나오기까지
  ORIGINAL_MS: 4500,         // 오리지널(원 사물)이 보이는 시간
  XRAY_MS: 4500,             // X-ray가 보이는 시간 (둘이 계속 번갈아 반복)
  PHASE_JITTER_MS: 600,      // 매번 똑같은 박자로 바뀌지 않게 주는 약간의 차이
  BASE_MS: 260,              // 글자 사이 기본 간격 (작을수록 빠름)
  JITTER_MS: 70,             // 간격의 흔들림 폭 (사람 손 정도의 미세한 차이)
  HESITATE_CHANCE: 0.07,     // 아주 가끔 숨 고르듯 쉬는 확률
  HESITATE_MS: [220, 480],   // 그때 추가로 쉬는 시간
  HOLD_AFTER_Z_MS: 6000,     // Z까지 다 친 뒤 그 화면을 보여주는 시간
  IDLE_RETURN_MS: 20000,     // 관람자가 마지막으로 친 뒤 리셋되어 자동 타이핑으로 돌아가기까지
  CAMERA_FOLLOW: 4.2,        // 카메라가 따라가는 부드러움 (작을수록 느긋하게 미끄러짐)
  PRELOAD_MAX_MS: 15000      // 첫 시작 전 이미지 로딩을 기다리는 최대 시간
};

const exhibitEnabled = !/[?&]demo=off\b/i.test(location.search);

let exhibitMode = "demo";    // "demo" | "user"
let exhibitTimer = null;
let exhibitIdleTimer = null;
let exhibitIndex = 0;
let exhibitToken = 0;        // 리셋될 때마다 증가 → 예전 타이머가 늦게 실행돼도 무시됨
let exhibitPhaseTimer = null;

window.addEventListener("DOMContentLoaded", () => {
  if (!exhibitEnabled || typeof input === "undefined" || !input) return;

  // 관람자의 실제 입력만 감지 (자동 타이핑은 isTrusted가 아님)
  window.addEventListener("keydown", onVisitorKey, true);
  window.addEventListener("pointerdown", onVisitorPointer, true);

  // 입력창이 항상 포커스를 갖고 있어야 관람자가 바로 칠 수 있음
  window.addEventListener("focus", keepInputFocus);
  document.addEventListener("pointerup", () => setTimeout(keepInputFocus, 0));

  installSmoothCamera();
  installSeamlessXray();
  waitForImages().then(() => { if (exhibitMode === "demo") startDemo(); });
  exhibitClearAll();
});

// 첫 사이클이 이미지 로딩 전에 시작되면 글자가 비거나 늦게 튀어나옴
// → 이미지 캐시가 더 이상 늘지 않을 때까지(또는 최대 15초) 기다렸다가 시작
function waitForImages() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = -1, still = 0;
    const poll = () => {
      const n = Object.keys(imageCache).length;
      const loading = typeof splitLayerLoading !== "undefined" ? Object.keys(splitLayerLoading).length : 0;
      still = (n === last && loading === 0 && n > 0) ? still + 1 : 0;
      last = n;
      if (still >= 4 || performance.now() - t0 > EXHIBIT.PRELOAD_MAX_MS) return resolve();
      setTimeout(poll, 250);
    };
    poll();
  });
}

// ---------- 부드러운 카메라 ----------
// 원래는 글자마다 화면이 순간이동(뚝뚝 끊김) → 목표 지점을 향해 미끄러지듯 따라감
let camTarget = null;
let camRaf = null;
let camLastT = 0;
let camX = 0, camY = 0;

function installSmoothCamera() {
  camX = window.scrollX; camY = window.scrollY;
  moveCamera = function (x, y) {
    camTarget = { x: x - window.innerWidth / 2, y: y - window.innerHeight * 0.35 };
    if (camRaf === null) {
      camX = window.scrollX; camY = window.scrollY;
      camLastT = performance.now();
      camRaf = requestAnimationFrame(camFrame);
    }
  };
}

function camFrame(t) {
  const dt = Math.min(0.05, (t - camLastT) / 1000);
  camLastT = t;
  const k = 1 - Math.exp(-EXHIBIT.CAMERA_FOLLOW * dt);
  camX += (camTarget.x - camX) * k;
  camY += (camTarget.y - camY) * k;
  window.scrollTo(camX, camY);
  if (Math.abs(camTarget.x - camX) < 0.5 && Math.abs(camTarget.y - camY) < 0.5) {
    window.scrollTo(camTarget.x, camTarget.y);
    camRaf = null;
    return;
  }
  camRaf = requestAnimationFrame(camFrame);
}

// 리셋할 때는 미끄러지지 않고 시작점으로 바로
function cameraSnap(x, y) {
  if (camRaf !== null) { cancelAnimationFrame(camRaf); camRaf = null; }
  camTarget = null;
  camX = x - window.innerWidth / 2;
  camY = y - window.innerHeight * 0.35;
  window.scrollTo(camX, camY);
}

function keepInputFocus() {
  if (!input) return;
  const panelOpen = document.activeElement && document.activeElement.closest &&
    document.activeElement.closest("#receipt-panel, #growth-map-panel");
  if (!panelOpen) input.focus({ preventScroll: true });
}

// ---------- 화면 전체 비우기 ----------

function exhibitClearAll() {
  exhibitToken += 1;
  clearTimeout(exhibitTimer);
  exhibitTimer = null;
  clearTimeout(window.rebuildDelay);
  if (rebuildFrameId !== null) { cancelAnimationFrame(rebuildFrameId); rebuildFrameId = null; }

  // 입력 상태 초기화
  input.value = "";
  committedSequence = "";
  currentInputSnapshot = "";
  lastVisualSequence = "";
  animatedTokenIndex = -1;

  // X-ray 끄고 오리지널 상태로
  clearTimeout(exhibitPhaseTimer);
  exhibitPhaseTimer = null;
  document.body.classList.remove("exhibit-original");
  exhibitSetXray(false);
  if (stage && stage.classList.contains("only-mutant-view") && typeof toggleMutantOnly === "function") {
    toggleMutantOnly();
  }

  // 다육이·숫자·동반종 모두 제거
  resetRuntimeState();
  drawGlobalGrowthBranch();

  // 떨어진 꽃, 날리는 꽃까지 모두 치움
  if (typeof petalAir !== "undefined") {
    petalAir = [];
    petalLanded = [];
    petalGust = 0;
    petalLift = 0;
    petalGroundY = PETAL_GROUND_DEFAULT;
    if (petalPileCtx) petalPlacePile();
    if (petalAirCtx) {
      petalAirCtx.setTransform(1, 0, 0, 1, 0, 0);
      petalAirCtx.clearRect(0, 0, petalAirCanvas.width, petalAirCanvas.height);
    }
  }

  updateDataLog(0, 90, false);
  if (typeof distLog !== "undefined" && distLog) distLog.innerText = "-";
  if (typeof angleLog !== "undefined" && angleLog) angleLog.innerText = "-";
  if (typeof updateReceiptIfOpen === "function") updateReceiptIfOpen();

  cameraSnap(START_X, START_Y + window.innerHeight * 0.2);
}

function exhibitSetXray(on) {
  const isOn = document.body.classList.contains("xray-active");
  if (isOn !== on && typeof toggleGrowthXray === "function") toggleGrowthXray();
}

// ---------- 자동 타이핑 ----------

function startDemo() {
  exhibitMode = "demo";
  clearTimeout(exhibitIdleTimer);
  exhibitClearAll();
  exhibitIndex = 0;
  input.placeholder = "";
  const token = exhibitToken;
  // X-ray는 처음부터 뒤에서 함께 그려두고(보이지만 않게), 보여줄 쪽만 바꿈
  // → 바뀔 때마다 X-ray 전체를 새로 그리느라 화면이 멈칫하던 문제 없음
  exhibitSetXray(true);
  setPhase("original", token);
  exhibitTimer = setTimeout(() => demoStep(token), EXHIBIT.START_DELAY_MS);
}

function demoStep(token) {
  if (token !== exhibitToken || exhibitMode !== "demo") return;

  if (exhibitIndex >= EXHIBIT.LETTERS.length) {
    // Z까지 끝 → 잠시 그 화면에 머문 뒤 처음부터
    exhibitTimer = setTimeout(() => {
      if (token === exhibitToken && exhibitMode === "demo") startDemo();
    }, EXHIBIT.HOLD_AFTER_Z_MS);
    return;
  }

  const ch = EXHIBIT.LETTERS[exhibitIndex];
  exhibitIndex += 1;

  // 실제 입력과 똑같은 경로로 넣음 (소리·꽃·X-ray 갱신 모두 원래 기능 그대로)
  input.value += ch;
  handleInput({ target: input });
  // 코드로 넣은 글자는 입력창이 끝으로 따라가지 않아 T 이후가 안 보였음 → 항상 마지막 글자가 보이게
  input.setSelectionRange(input.value.length, input.value.length);
  input.scrollLeft = input.scrollWidth;

  exhibitTimer = setTimeout(() => demoStep(token), nextDelay());
}

// ---------- 오리지널 ↔ X-ray 번갈아 보이기 ----------

function setPhase(phase, token) {
  if (token !== exhibitToken || exhibitMode !== "demo") return;
  const original = phase === "original";
  document.body.classList.toggle("exhibit-original", original);
  const btn = document.getElementById("growth-xray-btn");
  if (btn) btn.classList.toggle("active", !original);
  const base = original ? EXHIBIT.ORIGINAL_MS : EXHIBIT.XRAY_MS;
  const wait = base + (Math.random() - 0.5) * 2 * EXHIBIT.PHASE_JITTER_MS;
  clearTimeout(exhibitPhaseTimer);
  exhibitPhaseTimer = setTimeout(() => setPhase(original ? "xray" : "original", token), wait);
}

// body.xray-active(그리기는 계속) + exhibit-original(보이는 건 원 사물)
function installSeamlessXray() {
  const css = document.createElement("style");
  css.textContent = `
    body.xray-active.exhibit-original .succulent-node { display: flex !important; opacity: 1 !important; visibility: visible !important; }
    body.xray-active.exhibit-original .succulent-node.jungle-overgrowth { opacity: 0.9 !important; }
    body.xray-active.exhibit-original .succulent-node img { display: block !important; opacity: 1 !important; visibility: visible !important; }
    body.xray-active.exhibit-original .succulent-node .jungle-blossom.fallen { visibility: hidden !important; }
    body.xray-active.exhibit-original #growth-branch-layer { display: none !important; }
    body.xray-active.exhibit-original #petal-air,
    body.xray-active.exhibit-original #petal-pile,
    body.xray-active.exhibit-original #canopy-shade { display: block !important; }
  `;
  document.head.appendChild(css);

  // 원 사물이 보이는 동안에는 꽃도 원래처럼 떨어지게
  if (typeof petalVisibleUnits === "function") {
    const originalPetalVisibleUnits = petalVisibleUnits;
    petalVisibleUnits = function () {
      if (!document.body.classList.contains("exhibit-original")) return originalPetalVisibleUnits();
      const now = performance.now();
      const out = [];
      petalPlants.forEach((pl) => {
        if (!pl.node.isConnected || now - pl.born < PETAL_MATURE_MS) return;
        pl.units.forEach((u) => {
          if (!u.attached) return;
          const r = u.el.getBoundingClientRect();
          if (r.width < 2 || r.bottom < -60 || r.top > petalVH + 60 || r.right < -60 || r.left > petalVW + 60) return;
          out.push({ unit: u, rect: r });
        });
      });
      return out;
    };
  }
}

// 사람 손의 리듬: 매번 다른 간격 + 가끔 멈칫
function nextDelay() {
  let d = EXHIBIT.BASE_MS + (Math.random() - 0.5) * 2 * EXHIBIT.JITTER_MS;
  if (Math.random() < EXHIBIT.HESITATE_CHANCE) {
    const [a, b] = EXHIBIT.HESITATE_MS;
    d += a + Math.random() * (b - a);
  }
  return Math.max(150, d);
}

// ---------- 관람자 입력 ----------

function isIgnoredKey(e) {
  // 운영자용 단축키(새로고침·전체화면 등)는 리셋하지 않음
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  if (/^F\d+$/.test(e.key)) return true;
  if (e.key === "Escape" || e.key === "Tab") return true;
  return false;
}

function onVisitorKey(e) {
  if (!e.isTrusted || isIgnoredKey(e)) return;
  // 한글 자판 상태여도 입력이 들어가도록 입력창으로 포커스
  if (document.activeElement !== input) input.focus({ preventScroll: true });
  enterUserMode();
  armIdleReturn();
  // 여기서 막지 않으므로, 방금 누른 글자는 비워진 입력창에 그대로 들어가 첫 글자가 됨
}

function onVisitorPointer(e) {
  if (!e.isTrusted) return;
  // 버튼·패널(엑스레이, 영수증 등)은 원래 기능 그대로 → 화면을 지우지 않음
  if (e.target.closest && e.target.closest("button, #receipt-panel, #growth-map-panel")) {
    if (exhibitMode === "user") armIdleReturn();
    return;
  }
  enterUserMode();
  armIdleReturn();
}

function enterUserMode() {
  if (exhibitMode === "user") return;
  exhibitMode = "user";
  exhibitClearAll();
  input.placeholder = "TYPE A-Z / 0-9";
}

function armIdleReturn() {
  clearTimeout(exhibitIdleTimer);
  exhibitIdleTimer = setTimeout(() => {
    if (exhibitMode === "user") startDemo();
  }, EXHIBIT.IDLE_RETURN_MS);
}