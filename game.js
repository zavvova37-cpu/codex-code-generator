const CHARACTER_POOL = [
  { id: "calm_blue_a", name: "Тихон", color: "#5ca4ff", accent: "#b8e5ff" },
  { id: "urban_dark_a", name: "Грей", color: "#2b2b35", accent: "#d35b5b" },
  { id: "ego_striker_a", name: "Рокет", color: "#5a85ff", accent: "#ffffff" },
  { id: "extra_pose_a", name: "Флэш", color: "#a674ff", accent: "#7affcb" },
  { id: "adventurer_a", name: "Искра", color: "#4fbf66", accent: "#ffd752" },
];

const BOT_PRESETS = {
  easy: { reactionMs: 260, shotError: 0.2, jumpChance: 0.25 },
  medium: { reactionMs: 170, shotError: 0.12, jumpChance: 0.45 },
  hard: { reactionMs: 100, shotError: 0.06, jumpChance: 0.65 },
};

const cfg = {
  matchSeconds: 75,
  gravity: 0.5,
  floorY: 484,
  playerRadius: 18,
  playerSpeed: 3.8,
  jumpPower: 10.8,
  ballRadius: 10,
};

const ui = {
  hudTop: document.getElementById("hudTop"),
  canvas: document.getElementById("gameCanvas"),
  screens: {
    main: document.getElementById("screenMain"),
    mode: document.getElementById("screenMode"),
    difficulty: document.getElementById("screenDifficulty"),
    skins: document.getElementById("screenSkins"),
    settings: document.getElementById("screenSettings"),
    howto: document.getElementById("screenHowto"),
    legal: document.getElementById("screenLegal"),
    game: document.getElementById("screenGame"),
    results: document.getElementById("screenResults"),
  },
  resultsText: document.getElementById("resultsText"),
  pauseBtn: document.getElementById("pauseBtn"),
  backToMenuBtn: document.getElementById("backToMenuBtn"),
  rematchBtn: document.getElementById("rematchBtn"),
  skinP1: document.getElementById("skinP1"),
  skinP2: document.getElementById("skinP2"),
  musicToggle: document.getElementById("musicToggle"),
  sfxToggle: document.getElementById("sfxToggle"),
  mobileScheme: document.getElementById("mobileScheme"),
  mobileUI: document.getElementById("mobileUI"),
  controlLeft: document.getElementById("controlLeft"),
  controlRight: document.getElementById("controlRight"),
};

const ctx = ui.canvas.getContext("2d");
const keyboard = new Set();
const state = {
  mode: "local",
  difficulty: "medium",
  paused: false,
  yandexPaused: false,
  running: false,
  scoreA: 0,
  scoreB: 0,
  timeLeft: cfg.matchSeconds,
  p1Skin: CHARACTER_POOL[0].id,
  p2Skin: CHARACTER_POOL[1].id,
  players: [],
  ball: null,
  hasReadyCalled: false,
  ysdk: null,
  gameplayStarted: false,
};

const mobileState = [
  { active: false, dx: 0 },
  { active: false, dx: 0 },
];
const actionState = [
  { jump: false, shoot: false },
  { jump: false, shoot: false },
];

function initSkinsUI() {
  CHARACTER_POOL.forEach((ch) => {
    const opt1 = document.createElement("option");
    opt1.value = ch.id;
    opt1.textContent = ch.name;
    ui.skinP1.append(opt1);

    const opt2 = document.createElement("option");
    opt2.value = ch.id;
    opt2.textContent = ch.name;
    ui.skinP2.append(opt2);
  });
  ui.skinP1.value = state.p1Skin;
  ui.skinP2.value = state.p2Skin;
}

function showScreen(id) {
  Object.entries(ui.screens).forEach(([key, node]) => node.classList.toggle("hidden", key !== id));
  if (!state.hasReadyCalled && ["main", "mode", "skins", "settings", "howto", "legal"].includes(id)) {
    callGameReady();
  }
}

function callGameReady() {
  if (state.hasReadyCalled) return;
  state.hasReadyCalled = true;
  try {
    if (state.ysdk?.features?.LoadingAPI?.ready) state.ysdk.features.LoadingAPI.ready();
    if (window.YaGames?.LoadingAPI?.ready) window.YaGames.LoadingAPI.ready();
  } catch (error) {
    console.warn("LoadingAPI.ready() failed", error);
  }
}

function setupNav() {
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.nav));
  });

  document.getElementById("soloBtn").addEventListener("click", () => {
    state.mode = "solo";
    applyModeUi();
    showScreen("difficulty");
  });
  document.getElementById("localBtn").addEventListener("click", () => {
    state.mode = "local";
    applyModeUi();
    startMatch();
  });

  document.querySelectorAll("[data-diff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.difficulty = btn.dataset.diff;
      startMatch();
    });
  });

  ui.pauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    if (state.paused) stopGameplay();
    else if (!state.yandexPaused && state.running) startGameplay();
    ui.pauseBtn.textContent = state.paused ? "Продолжить" : "Пауза";
  });

  ui.backToMenuBtn.addEventListener("click", () => {
    state.running = false;
    stopGameplay();
    showScreen("main");
  });

  ui.rematchBtn.addEventListener("click", startMatch);
  ui.skinP1.addEventListener("change", () => (state.p1Skin = ui.skinP1.value));
  ui.skinP2.addEventListener("change", () => (state.p2Skin = ui.skinP2.value));
}

function buildPlayer(team, x, skinId) {
  const skin = CHARACTER_POOL.find((x) => x.id === skinId) ?? CHARACTER_POOL[0];
  return {
    team,
    x,
    y: cfg.floorY,
    vx: 0,
    vy: 0,
    hasBall: false,
    color: team === "A" ? skin.color : shadeColor(skin.color, -20),
    accent: skin.accent,
    name: skin.name,
    controls:
      team === "A"
        ? { left: "KeyA", right: "KeyD", jump: "KeyW", shoot1: "KeyS", shoot2: "KeyF" }
        : { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", shoot1: "ArrowDown", shoot2: "KeyL" },
  };
}

function resetEntities() {
  state.players = [
    buildPlayer("A", 190, state.p1Skin),
    buildPlayer("B", ui.canvas.width - 190, state.p2Skin),
  ];
  state.ball = {
    x: ui.canvas.width / 2,
    y: 160,
    vx: 0,
    vy: 0,
    owner: null,
    lastY: 160,
  };
}

function startMatch() {
  state.scoreA = 0;
  state.scoreB = 0;
  state.timeLeft = cfg.matchSeconds;
  state.paused = false;
  state.running = true;
  ui.pauseBtn.textContent = "Пауза";
  resetEntities();
  startGameplay();
  showScreen("game");
}

function maybeAttachBall(p) {
  const d = Math.hypot(state.ball.x - p.x, state.ball.y - (p.y - 8));
  if (!state.ball.owner && d < cfg.playerRadius + cfg.ballRadius + 4) {
    state.ball.owner = p.team;
    p.hasBall = true;
  }
}

function jumpIfNeeded(p, idx) {
  const jumpPressed = keyboard.has(p.controls.jump) || actionState[idx].jump;
  if (jumpPressed && Math.abs(p.y - cfg.floorY) < 0.2) {
    p.vy = -cfg.jumpPower;
  }
  actionState[idx].jump = false;
}

function shootIfNeeded(p, idx) {
  const pressed = keyboard.has(p.controls.shoot1) || keyboard.has(p.controls.shoot2) || actionState[idx].shoot;
  if (!pressed || !p.hasBall) return;
  p.hasBall = false;
  state.ball.owner = null;
  const hoopX = p.team === "A" ? ui.canvas.width - 92 : 92;
  const dx = hoopX - p.x;
  const dy = 190 - p.y;
  state.ball.vx = dx / 32;
  state.ball.vy = dy / 32 - 5.8;
  actionState[idx].shoot = false;
}

function updatePlayer(p, idx, dt) {
  let axisX = 0;
  if (!(state.mode === "solo" && idx === 1)) {
    if (keyboard.has(p.controls.left)) axisX -= 1;
    if (keyboard.has(p.controls.right)) axisX += 1;
  }
  if (mobileState[idx].active) axisX = mobileState[idx].dx;
  p.vx = axisX * cfg.playerSpeed;

  jumpIfNeeded(p, idx);
  shootIfNeeded(p, idx);

  p.vy += cfg.gravity * dt * 0.06;
  p.x = clamp(p.x + p.vx * dt * 0.06, 22, ui.canvas.width - 22);
  p.y += p.vy * dt * 0.06;
  if (p.y > cfg.floorY) {
    p.y = cfg.floorY;
    p.vy = 0;
  }

  if (!p.hasBall) maybeAttachBall(p);
}

function updateBot(dt, now) {
  if (state.mode !== "solo") return;
  const p = state.players[1];
  const preset = BOT_PRESETS[state.difficulty];
  if (now % preset.reactionMs > 16) return;

  const targetX = p.hasBall ? 700 : state.ball.x;
  mobileState[1] = { active: true, dx: Math.sign(targetX - p.x) * (1 - preset.shotError) };

  if (Math.random() < preset.jumpChance * 0.015) actionState[1].jump = true;
  if (p.hasBall && Math.abs(p.x - 700) < 80 && p.y < cfg.floorY - 20) actionState[1].shoot = true;
}

function updateBall(dt) {
  state.ball.lastY = state.ball.y;
  if (state.ball.owner) {
    const p = state.players[state.ball.owner === "A" ? 0 : 1];
    state.ball.x = p.x + (p.team === "A" ? 12 : -12);
    state.ball.y = p.y - 26;
    state.ball.vx = p.vx;
    state.ball.vy = p.vy;
    return;
  }

  state.ball.vy += cfg.gravity * dt * 0.06;
  state.ball.x += state.ball.vx * dt * 0.06;
  state.ball.y += state.ball.vy * dt * 0.06;

  if (state.ball.x < cfg.ballRadius || state.ball.x > ui.canvas.width - cfg.ballRadius) {
    state.ball.vx *= -0.75;
    state.ball.x = clamp(state.ball.x, cfg.ballRadius, ui.canvas.width - cfg.ballRadius);
  }
  if (state.ball.y > cfg.floorY - 2) {
    state.ball.y = cfg.floorY - 2;
    state.ball.vy *= -0.72;
    state.ball.vx *= 0.96;
  }
}

function checkScore() {
  const leftHoop = { x: 92, y: 192, w: 48, h: 6 };
  const rightHoop = { x: ui.canvas.width - 140, y: 192, w: 48, h: 6 };

  const crossFromTop = state.ball.lastY < leftHoop.y && state.ball.y >= leftHoop.y;
  const inLeft = state.ball.x > leftHoop.x && state.ball.x < leftHoop.x + leftHoop.w;
  if (crossFromTop && inLeft) {
    state.scoreB += 2;
    resetAfterScore("B");
  }

  const crossRight = state.ball.lastY < rightHoop.y && state.ball.y >= rightHoop.y;
  const inRight = state.ball.x > rightHoop.x && state.ball.x < rightHoop.x + rightHoop.w;
  if (crossRight && inRight) {
    state.scoreA += 2;
    resetAfterScore("A");
  }
}

function resetAfterScore(lastScorer) {
  resetEntities();
  if (lastScorer === "A") state.players[1].hasBall = true;
  if (lastScorer === "B") state.players[0].hasBall = true;
  state.ball.owner = lastScorer === "A" ? "B" : "A";
}

function finishMatch() {
  state.running = false;
  stopGameplay();
  showScreen("results");
  const result = state.scoreA === state.scoreB ? "Ничья" : state.scoreA > state.scoreB ? "Победа игрока 1" : "Победа игрока 2";
  ui.resultsText.textContent = `${result}. Финальный счёт: ${state.scoreA} : ${state.scoreB}.`;
}

function drawCourt() {
  ctx.fillStyle = "#182544";
  ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

  ctx.fillStyle = "#c7772f";
  ctx.fillRect(0, 230, ui.canvas.width, 310);

  ctx.strokeStyle = "#f9d5a8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ui.canvas.width / 2, 230);
  ctx.lineTo(ui.canvas.width / 2, ui.canvas.height);
  ctx.stroke();

  drawHoop(92, 170);
  drawHoop(ui.canvas.width - 92, 170);
}

function drawHoop(x, y) {
  ctx.fillStyle = "#d9e6ff";
  ctx.fillRect(x - 8, y - 24, 14, 42);
  ctx.fillStyle = "#fc6f3f";
  ctx.fillRect(x, y + 20, 48, 6);
}

function drawPlayers() {
  state.players.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 26, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.accent;
    ctx.fillRect(p.x - 10, p.y - 18, 20, 30);
    ctx.fillStyle = "#1d1d28";
    ctx.fillRect(p.x - 10, p.y + 12, 7, 16);
    ctx.fillRect(p.x + 3, p.y + 12, 7, 16);
  });
}

function drawBall() {
  ctx.fillStyle = "#ffb13c";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, cfg.ballRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#7c4200";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, cfg.ballRadius - 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHud() {
  ui.hudTop.textContent = `Счёт ${state.scoreA}:${state.scoreB} · Время ${Math.max(0, Math.ceil(state.timeLeft))}с · ${
    state.mode === "solo" ? `Соло (${state.difficulty})` : "2 игрока"
  }`;
}

let lastTs = performance.now();
function loop(ts) {
  const dt = ts - lastTs;
  lastTs = ts;

  if (state.running && !state.paused && !state.yandexPaused) {
    state.timeLeft -= dt / 1000;
    if (state.timeLeft <= 0) {
      finishMatch();
    } else {
      updateBot(dt, ts);
      updatePlayer(state.players[0], 0, dt);
      updatePlayer(state.players[1], 1, dt);
      updateBall(dt);
      checkScore();
      drawCourt();
      drawPlayers();
      drawBall();
      drawHud();
    }
  } else if (state.running) {
    drawCourt();
    drawPlayers();
    drawBall();
  }

  requestAnimationFrame(loop);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const r = clamp((num >> 16) + amt, 0, 255);
  const g = clamp(((num >> 8) & 0x00ff) + amt, 0, 255);
  const b = clamp((num & 0x0000ff) + amt, 0, 255);
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

window.addEventListener("keydown", (e) => keyboard.add(e.code));
window.addEventListener("keyup", (e) => keyboard.delete(e.code));
window.addEventListener("keydown", (e) => {
  if ([ "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space" ].includes(e.code)) {
    e.preventDefault();
  }
});

function initJoystick(root, idx) {
  const stick = root.querySelector(".stick");
  let rect = null;
  let pid = null;

  const reset = () => {
    mobileState[idx] = { active: false, dx: 0 };
    stick.style.left = "34px";
    stick.style.top = "34px";
    pid = null;
  };

  root.addEventListener("pointerdown", (e) => {
    rect = root.getBoundingClientRect();
    pid = e.pointerId;
    root.setPointerCapture(pid);
    handleMove(e);
  });

  const handleMove = (e) => {
    if (pid !== e.pointerId || !rect) return;
    const cx = rect.left + rect.width / 2;
    const dx = e.clientX - cx;
    const mag = Math.min(1, Math.abs(dx) / 42);
    const vx = Math.sign(dx) * mag;
    mobileState[idx] = { active: true, dx: vx };
    stick.style.left = `${34 + vx * 28}px`;
  };

  root.addEventListener("pointermove", handleMove);
  root.addEventListener("pointerup", reset);
  root.addEventListener("pointercancel", reset);
}

function holdButton(id, cbDown, cbUp = () => {}) {
  const b = document.getElementById(id);
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    cbDown();
  });
  b.addEventListener("pointerup", cbUp);
  b.addEventListener("pointercancel", cbUp);
  b.addEventListener("pointerleave", cbUp);
}

function initMobileControls() {
  initJoystick(document.getElementById("joyA"), 0);
  initJoystick(document.getElementById("joyB"), 1);
  holdButton("jumpA", () => (actionState[0].jump = true));
  holdButton("jumpB", () => (actionState[1].jump = true));
  holdButton("shootA", () => (actionState[0].shoot = true), () => (actionState[0].shoot = false));
  holdButton("shootB", () => (actionState[1].shoot = true), () => (actionState[1].shoot = false));
}

function initYandexSdkHooks() {
  const onPause = () => {
    state.yandexPaused = true;
    stopGameplay();
  };
  const onResume = () => {
    state.yandexPaused = false;
    if (state.running && !state.paused) startGameplay();
  };
  window.addEventListener("game_api_pause", onPause);
  window.addEventListener("game_api_resume", onResume);
  document.addEventListener("game_api_pause", onPause);
  document.addEventListener("game_api_resume", onResume);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onPause();
    else onResume();
  });
}

function applyMobileScheme() {
  const useStick = ui.mobileScheme.value === "stick";
  document.querySelectorAll(".joystick").forEach((node) => {
    node.style.display = useStick ? "block" : "none";
  });
}

function applyModeUi() {
  const isSolo = state.mode === "solo";
  ui.controlRight.style.opacity = isSolo ? "0.5" : "1";
  ui.controlRight.style.pointerEvents = isSolo ? "none" : "auto";
}

function startGameplay() {
  if (state.gameplayStarted) return;
  state.gameplayStarted = true;
  try {
    state.ysdk?.features?.GameplayAPI?.start?.();
  } catch (error) {
    console.warn("GameplayAPI.start() failed", error);
  }
}

function stopGameplay() {
  if (!state.gameplayStarted) return;
  state.gameplayStarted = false;
  try {
    state.ysdk?.features?.GameplayAPI?.stop?.();
  } catch (error) {
    console.warn("GameplayAPI.stop() failed", error);
  }
}

async function initYandexSdk() {
  if (!window.YaGames?.init) return;
  try {
    state.ysdk = await window.YaGames.init();
  } catch (error) {
    console.warn("YaGames.init() failed", error);
  }
}

initSkinsUI();
setupNav();
initMobileControls();
initYandexSdkHooks();
ui.mobileScheme.addEventListener("change", applyMobileScheme);
applyMobileScheme();
applyModeUi();
showScreen("main");
initYandexSdk();
requestAnimationFrame(loop);
