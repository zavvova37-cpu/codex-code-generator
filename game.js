const CHARACTER_POOL = [
  { id: "calm_blue_a", name: "Кайне", color: "#5ca4ff", accent: "#b8e5ff" },
  { id: "urban_dark_a", name: "Аоми", color: "#2b2b35", accent: "#d35b5b" },
  { id: "ego_striker_a", name: "Акар", color: "#5a85ff", accent: "#ffffff" },
  { id: "extra_pose_a", name: "Тока", color: "#a674ff", accent: "#7affcb" },
  { id: "adventurer_a", name: "Киро", color: "#4fbf66", accent: "#ffd752" },
];

const BOT_PRESETS = {
  easy: { reactionMs: 260, shotError: 0.2, jumpChance: 0.25 },
  medium: { reactionMs: 170, shotError: 0.12, jumpChance: 0.45 },
  hard: { reactionMs: 100, shotError: 0.06, jumpChance: 0.65 },
};
const BUILD_VERSION = "build-2026-04-05-r4";

const cfg = {
  matchSeconds: 75,
  gravity: 0.5,
  floorY: 472,
  playerRadius: 30,
  playerSpeed: 3.8,
  jumpPower: 11.2,
  ballRadius: 20,
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
  buildInfo: document.getElementById("buildInfo"),
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
  audioUnlocked: false,
  musicInterval: null,
  swishTimerL: 0,
  swishTimerR: 0,
  scorePopTimer: 0,
};

const mobileState = [
  { active: false, dx: 0 },
  { active: false, dx: 0 },
];
const actionState = [
  { jump: false, shoot: false, shootQueued: false },
  { jump: false, shoot: false, shootQueued: false },
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
    lastActionAt: 0,
    color: team === "A" ? skin.color : shadeColor(skin.color, -20),
    accent: skin.accent,
    name: skin.name,
    controls:
      team === "A"
        ? { left: "KeyA", right: "KeyD", jump: "KeyW", shoot1: "KeyS", shoot2: "KeyF", shoot3: "Space" }
        : { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", shoot1: "ArrowDown", shoot2: "KeyL", shoot3: "Numpad0" },
  };
}

function resetEntities() {
  state.players = [
    buildPlayer("A", 190, state.p1Skin),
    buildPlayer("B", ui.canvas.width - 190, state.p2Skin),
  ];
  state.ball = {
    x: state.players[0].x + 10,
    y: state.players[0].y - 26,
    vx: 0,
    vy: 0,
    owner: "A",
    lastY: state.players[0].y - 26,
    noPickupUntil: 0,
    lastReleasedBy: null,
    spin: 0,
    angle: 0,
  };
  state.players[0].hasBall = true;
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

function maybeAttachBall(p, now) {
  if (now < state.ball.noPickupUntil) return;
  const d = Math.hypot(state.ball.x - p.x, state.ball.y - (p.y - 8));
  if (!state.ball.owner && d < cfg.playerRadius + cfg.ballRadius + 14) {
    state.ball.owner = p.team;
    p.hasBall = true;
  }
}

function syncBallOwnership() {
  const owner = state.ball.owner;
  state.players[0].hasBall = owner === "A";
  state.players[1].hasBall = owner === "B";
}

function trySteal(p, now) {
  const enemy = state.players.find((x) => x.team !== p.team);
  if (!enemy || !enemy.hasBall) return false;
  if (now - p.lastActionAt < 320) return false;
  const distance = Math.hypot(enemy.x - p.x, enemy.y - p.y);
  if (distance > 54) return false;
  p.lastActionAt = now;
  const success = Math.random() < 1;
  if (!success) return false;
  state.ball.owner = p.team;
  syncBallOwnership();
  state.ball.x = p.x + (p.team === "A" ? 12 : -12);
  state.ball.y = p.y - 26;
  return true;
}

function jumpIfNeeded(p, idx) {
  const jumpPressed = keyboard.has(p.controls.jump) || actionState[idx].jump;
  if (jumpPressed && Math.abs(p.y - cfg.floorY) < 0.2) {
    p.vy = -cfg.jumpPower;
  }
  actionState[idx].jump = false;
}

function shootIfNeeded(p, idx, now, force = false) {
  const pressed =
    force ||
    keyboard.has(p.controls.shoot1) ||
    keyboard.has(p.controls.shoot2) ||
    keyboard.has(p.controls.shoot3) ||
    actionState[idx].shoot ||
    actionState[idx].shootQueued;
  if (!pressed) return;
  if (!p.hasBall && state.ball.owner === null) {
    const distanceToLooseBall = Math.hypot(state.ball.x - p.x, state.ball.y - (p.y - 10));
    if (distanceToLooseBall < 32) {
      state.ball.owner = p.team;
      syncBallOwnership();
    }
  }
  if (!p.hasBall || state.ball.owner !== p.team) {
    trySteal(p, now);
    actionState[idx].shootQueued = false;
    return;
  }
  if (now - p.lastActionAt < 220) return;
  p.lastActionAt = now;
  p.hasBall = false;
  state.ball.owner = null;
  state.ball.noPickupUntil = now + 220;
  state.ball.lastReleasedBy = p.team;
  const rimX = p.team === "A" ? ui.canvas.width - 124 : 124;
  const dx = rimX - p.x;
  const randomSide = (Math.random() - 0.5) * 0.6;
  const randomUp = Math.random() * 1.1;
  if (Math.abs(p.y - cfg.floorY) < 1) p.vy = -7.5;
  state.ball.vx = dx / 14 + randomSide + p.vx * 0.08;
  state.ball.vy = -(13.2 + randomUp) + p.vy * 0.02;
  state.ball.spin = Math.sign(dx || 1) * (0.14 + Math.random() * 0.06);
  actionState[idx].shoot = false;
  actionState[idx].shootQueued = false;
}

function triggerShootAction(idx) {
  if (!state.running || state.paused || state.yandexPaused) return;
  const player = state.players[idx];
  if (!player) return;
  shootIfNeeded(player, idx, performance.now(), true);
}

function updatePlayer(p, idx, dt, now) {
  let axisX = 0;
  if (!(state.mode === "solo" && idx === 1)) {
    if (keyboard.has(p.controls.left)) axisX -= 1;
    if (keyboard.has(p.controls.right)) axisX += 1;
  }
  if (mobileState[idx].active) axisX = mobileState[idx].dx;
  p.vx = axisX * cfg.playerSpeed;

  jumpIfNeeded(p, idx);
  shootIfNeeded(p, idx, now);

  p.vy += cfg.gravity * dt * 0.06;
  p.x = clamp(p.x + p.vx * dt * 0.06, 22, ui.canvas.width - 22);
  p.y += p.vy * dt * 0.06;
  if (p.y > cfg.floorY) {
    p.y = cfg.floorY;
    p.vy = 0;
  }

  if (!p.hasBall) maybeAttachBall(p, now);
}

function resolvePlayerCollision() {
  const a = state.players[0];
  const b = state.players[1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = cfg.playerRadius * 2.05;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist >= minDist) return;
  const push = (minDist - dist) / 2;
  const nx = dx / dist;
  const ny = dy / dist;
  a.x = clamp(a.x - nx * push, 22, ui.canvas.width - 22);
  a.y = clamp(a.y - ny * push, 120, cfg.floorY);
  b.x = clamp(b.x + nx * push, 22, ui.canvas.width - 22);
  b.y = clamp(b.y + ny * push, 120, cfg.floorY);
}

function updateBot(dt, now) {
  if (state.mode !== "solo") return;
  const p = state.players[1];
  const preset = BOT_PRESETS[state.difficulty];
  if (now % preset.reactionMs > 16) return;

  const targetX = p.hasBall ? 710 : state.ball.x;
  mobileState[1] = { active: true, dx: Math.sign(targetX - p.x) * (1 - preset.shotError) };

  if (Math.random() < preset.jumpChance * 0.015) actionState[1].jump = true;
  if (p.hasBall && Math.abs(p.x - 710) < 110) actionState[1].shoot = true;
}

function updateBall(dt) {
  state.ball.lastY = state.ball.y;
  if (state.ball.owner) {
    const p = state.players[state.ball.owner === "A" ? 0 : 1];
    state.ball.x = p.x + (p.team === "A" ? 12 : -12);
    state.ball.y = p.y - 26;
    state.ball.vx = p.vx;
    state.ball.vy = p.vy;
    state.ball.spin = 0;
    return;
  }

  state.ball.vy += cfg.gravity * dt * 0.06;
  state.ball.x += state.ball.vx * dt * 0.06;
  state.ball.y += state.ball.vy * dt * 0.06;
  state.ball.vx *= 0.995;
  state.ball.angle += state.ball.spin * dt * 0.06;
  state.ball.spin *= 0.992;

  const leftBoard = { x: 138, y: 180, w: 8, h: 78 };
  const rightBoard = { x: ui.canvas.width - 146, y: 180, w: 8, h: 78 };
  [leftBoard, rightBoard].forEach((board) => {
    const inY = state.ball.y > board.y && state.ball.y < board.y + board.h;
    const inX = state.ball.x + cfg.ballRadius > board.x && state.ball.x - cfg.ballRadius < board.x + board.w;
    if (inX && inY) {
      state.ball.vx *= -0.78;
      state.ball.spin *= -0.7;
      if (state.ball.x < ui.canvas.width / 2) state.ball.x = board.x - cfg.ballRadius;
      else state.ball.x = board.x + board.w + cfg.ballRadius;
    }
  });

  if (state.ball.x < cfg.ballRadius || state.ball.x > ui.canvas.width - cfg.ballRadius) {
    state.ball.vx *= -0.76;
    state.ball.spin *= -0.75;
    state.ball.x = clamp(state.ball.x, cfg.ballRadius, ui.canvas.width - cfg.ballRadius);
  }
  if (state.ball.y > cfg.floorY - 2) {
    state.ball.y = cfg.floorY - 2;
    state.ball.vy *= -0.78;
    if (Math.abs(state.ball.vy) < 1.1) state.ball.vy = 0;
    state.ball.vx *= 0.94;
    if (Math.abs(state.ball.vx) < 0.12) state.ball.vx = 0;
    state.ball.spin *= 0.86;
  }

  const rimY = 214;
  const rimLeftCenterX = 124;
  const rimRightCenterX = ui.canvas.width - 124;
  [
    { x: rimLeftCenterX, y: rimY, r: 14 },
    { x: rimRightCenterX, y: rimY, r: 14 },
  ].forEach((rim) => {
    const dx = state.ball.x - rim.x;
    const dy = state.ball.y - rim.y;
    const dist = Math.hypot(dx, dy);
    const minDist = cfg.ballRadius + rim.r;
    if (dist > 0 && dist < minDist && state.ball.y < rimY + 22) {
      const nx = dx / dist;
      const ny = dy / dist;
      const dot = state.ball.vx * nx + state.ball.vy * ny;
      state.ball.vx -= 2 * dot * nx;
      state.ball.vy -= 2 * dot * ny;
      state.ball.vx *= 0.78;
      state.ball.vy *= 0.78;
      state.ball.x = rim.x + nx * minDist;
      state.ball.y = rim.y + ny * minDist;
    }
  });
}

function checkScore() {
  const leftZone = { x1: 70, x2: 182, y1: 200, y2: 252 };
  const rightZone = { x1: ui.canvas.width - 182, x2: ui.canvas.width - 70, y1: 200, y2: 252 };
  const inLeft =
    state.ball.x >= leftZone.x1 && state.ball.x <= leftZone.x2 && state.ball.y >= leftZone.y1 && state.ball.y <= leftZone.y2;
  if (inLeft && state.ball.vy > 0) {
    state.scoreB += 2;
    state.swishTimerL = 280;
    state.scorePopTimer = 520;
    resetAfterScore("B");
  }

  const inRight =
    state.ball.x >= rightZone.x1 && state.ball.x <= rightZone.x2 && state.ball.y >= rightZone.y1 && state.ball.y <= rightZone.y2;
  if (inRight && state.ball.vy > 0) {
    state.scoreA += 2;
    state.swishTimerR = 280;
    state.scorePopTimer = 520;
    resetAfterScore("A");
  }
}

function resetAfterScore(lastScorer) {
  resetEntities();
  if (lastScorer === "A") {
    state.players[0].hasBall = false;
    state.players[1].hasBall = true;
    state.ball.owner = "B";
    state.ball.x = state.players[1].x - 10;
    state.ball.y = state.players[1].y - 26;
    state.ball.noPickupUntil = 0;
    state.ball.lastReleasedBy = null;
  } else {
    state.players[0].hasBall = true;
    state.players[1].hasBall = false;
    state.ball.owner = "A";
    state.ball.x = state.players[0].x + 10;
    state.ball.y = state.players[0].y - 26;
    state.ball.noPickupUntil = 0;
    state.ball.lastReleasedBy = null;
  }
  state.ball.spin = 0;
  state.ball.angle = 0;
  syncBallOwnership();
}

function finishMatch() {
  state.running = false;
  stopGameplay();
  showScreen("results");
  const result = state.scoreA === state.scoreB ? "Ничья" : state.scoreA > state.scoreB ? "Победа игрока 1" : "Победа игрока 2";
  ui.resultsText.textContent = `${result}. Финальный счёт: ${state.scoreA} : ${state.scoreB}.`;
}

function drawCourt() {
  drawBackdrop();
  ctx.fillStyle = "#1a212d";
  ctx.fillRect(0, 220, ui.canvas.width, 320);

  ctx.fillStyle = "#2f4032";
  for (let i = 0; i < ui.canvas.width; i += 24) {
    ctx.fillRect(i, 205 + (i % 48 === 0 ? 0 : 5), 24, 15);
  }

  ctx.fillStyle = "#6b4b37";
  for (let i = 0; i < ui.canvas.width; i += 20) {
    ctx.fillRect(i, 150, 14, 60);
  }

  ctx.fillStyle = "#2a323d";
  ctx.fillRect(60, 260, ui.canvas.width - 120, 250);

  ctx.strokeStyle = "#505a69";
  ctx.lineWidth = 4;
  ctx.strokeRect(78, 278, ui.canvas.width - 156, 215);

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ui.canvas.width / 2, 278);
  ctx.lineTo(ui.canvas.width / 2, 493);
  ctx.stroke();

  drawHoop(82, 190, "left");
  drawHoop(ui.canvas.width - 82, 190, "right");
}

function drawBackdrop() {
  ctx.fillStyle = "#171d4a";
  ctx.fillRect(0, 0, ui.canvas.width, 220);
  ctx.fillStyle = "#2a3063";
  for (let i = 0; i < ui.canvas.width; i += 64) {
    const h = 30 + ((i / 64) % 3) * 12;
    ctx.fillRect(i, 70 - h / 2, 64, h);
  }
  ctx.fillStyle = "#ffffff18";
  for (let i = 24; i < ui.canvas.width; i += 88) {
    ctx.fillRect(i, 20 + ((i / 88) % 2) * 8, 4, 4);
  }
}

function drawHoop(x, y, side) {
  const swishTimer = side === "left" ? state.swishTimerL : state.swishTimerR;
  const sway = swishTimer > 0 ? Math.sin(performance.now() * 0.08) * 2.6 : 0;
  ctx.fillStyle = "#82899c";
  ctx.fillRect(side === "left" ? x - 10 : x - 8, y - 16, 14, 96);

  ctx.fillStyle = "#d5def1";
  ctx.fillRect(side === "left" ? x : x - 56, y - 10, 56, 16);

  ctx.fillStyle = "#d75a24";
  ctx.fillRect(side === "left" ? x + 44 : x - 44, y + 22, 36, 8);

  ctx.strokeStyle = "#b9c1d6";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    const netX = side === "left" ? x + 45 + i * 6 : x - 9 - i * 6;
    ctx.beginPath();
    ctx.moveTo(netX, y + 30);
    ctx.lineTo(netX + (side === "left" ? -2 : 2) + sway, y + 58);
    ctx.stroke();
  }
}

function drawAimGuide() {
  if (!state.running || state.paused || state.yandexPaused) return;
  const owner = state.players.find((p) => p.hasBall);
  if (!owner) return;
  const rimX = owner.team === "A" ? ui.canvas.width - 124 : 124;
  const dx = rimX - owner.x;
  const vx = dx / 20;
  let vy = -10.4;
  let x = owner.x;
  let y = owner.y - 22;

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 10; i += 1) {
    vy += cfg.gravity * 1.9;
    x += vx * 0.92;
    y += vy * 0.92;
    ctx.fillRect(x - 2, y - 2, 3, 3);
  }
}

function drawPlayers() {
  state.players.forEach((p, idx) => {
    const hasBall = p.hasBall;
    const runCycle = Math.sin(performance.now() * 0.015 + idx);
    const legSwing = runCycle * 3;

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 42, 24, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#0f1117";
    ctx.lineWidth = 2;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 36, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1a24";
    ctx.fillRect(p.x - 12, p.y - 44, 24, 7);
    ctx.fillStyle = "#f0d2bc";
    ctx.fillRect(p.x - 4, p.y - 38, 2, 2);
    ctx.fillRect(p.x + 2, p.y - 38, 2, 2);

    ctx.fillStyle = p.accent;
    ctx.fillRect(p.x - 18, p.y - 13, 36, 48);
    ctx.strokeRect(p.x - 18, p.y - 13, 36, 48);
    ctx.fillStyle = "#ffffff55";
    ctx.fillRect(p.x - 18, p.y - 13, 36, 7);
    ctx.fillStyle = "#f3d4bf";
    ctx.fillRect(p.x - 4, p.y - 18, 8, 6);
    ctx.fillRect(p.x - 20, p.y - 2, 6, 23);
    ctx.fillRect(p.x + 14, p.y - 2, 6, 23);
    ctx.strokeRect(p.x - 20, p.y - 2, 6, 23);
    ctx.strokeRect(p.x + 14, p.y - 2, 6, 23);

    ctx.fillStyle = "#12141d";
    ctx.fillRect(p.x - 14, p.y + 32, 9, 14 + legSwing);
    ctx.fillRect(p.x + 5, p.y + 32, 9, 14 - legSwing);
    ctx.strokeRect(p.x - 14, p.y + 32, 9, 14 + legSwing);
    ctx.strokeRect(p.x + 5, p.y + 32, 9, 14 - legSwing);

    if (hasBall) {
      ctx.fillStyle = "#ffb13c";
      ctx.beginPath();
      ctx.arc(p.x + (p.team === "A" ? 27 : -27), p.y - 10, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7c4200";
      ctx.beginPath();
      ctx.arc(p.x + (p.team === "A" ? 27 : -27), p.y - 10, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function drawBall() {
  ctx.fillStyle = "#ff9f1c";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, cfg.ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffc46b";
  ctx.beginPath();
  ctx.arc(state.ball.x - 4, state.ball.y - 5, cfg.ballRadius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#7c4200";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, cfg.ballRadius - 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.translate(state.ball.x, state.ball.y);
  ctx.rotate(state.ball.angle);
  ctx.beginPath();
  ctx.moveTo(-cfg.ballRadius * 0.8, 0);
  ctx.lineTo(cfg.ballRadius * 0.8, 0);
  ctx.moveTo(0, -cfg.ballRadius * 0.8);
  ctx.lineTo(0, cfg.ballRadius * 0.8);
  ctx.stroke();
  ctx.restore();
}

function drawHud() {
  const ownerText = state.ball.owner === "A" ? "мяч: P1" : state.ball.owner === "B" ? "мяч: P2" : "мяч: свободный";
  ui.hudTop.textContent = `Счёт ${state.scoreA}:${state.scoreB} · Время ${Math.max(0, Math.ceil(state.timeLeft))}с · ${
    state.mode === "solo" ? `Соло (${state.difficulty})` : "2 игрока"
  } · ${ownerText}`;
  if (state.scorePopTimer > 0) {
    ui.hudTop.textContent += " · ГОООЛ!";
  }
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
      updatePlayer(state.players[0], 0, dt, ts);
      updatePlayer(state.players[1], 1, dt, ts);
      resolvePlayerCollision();
      syncBallOwnership();
      updateBall(dt);
      if (state.swishTimerL > 0) state.swishTimerL -= dt;
      if (state.swishTimerR > 0) state.swishTimerR -= dt;
      if (state.scorePopTimer > 0) state.scorePopTimer -= dt;
      checkScore();
      drawCourt();
      drawAimGuide();
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

function unlockAudio() {
  if (state.audioUnlocked) return;
  state.audioUnlocked = true;
  updateMusicState();
}

function beep(freq = 220, len = 0.12, gainValue = 0.02) {
  if (!state.audioUnlocked || !ui.musicToggle.checked) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!state.audioCtx) state.audioCtx = new AudioCtx();
  const osc = state.audioCtx.createOscillator();
  const gain = state.audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(state.audioCtx.destination);
  osc.start();
  osc.stop(state.audioCtx.currentTime + len);
}

function updateMusicState() {
  if (state.musicInterval) {
    clearInterval(state.musicInterval);
    state.musicInterval = null;
  }
  if (!state.audioUnlocked || !ui.musicToggle.checked) return;
  const notes = [220, 294, 247, 330];
  let step = 0;
  state.musicInterval = setInterval(() => {
    if (state.paused || state.yandexPaused || !state.running) return;
    beep(notes[step % notes.length], 0.1, 0.03);
    step += 1;
  }, 360);
}

function initMobileControls() {
  initJoystick(document.getElementById("joyA"), 0);
  initJoystick(document.getElementById("joyB"), 1);
  holdButton("jumpA", () => (actionState[0].jump = true));
  holdButton("jumpB", () => (actionState[1].jump = true));
  holdButton("shootA", () => triggerShootAction(0), () => {});
  holdButton("shootB", () => triggerShootAction(1), () => {});
  ui.canvas.addEventListener("pointerdown", () => {
    triggerShootAction(0);
  });
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
    node.style.opacity = useStick ? "1" : "0.75";
    node.style.transform = useStick ? "scale(1)" : "scale(0.92)";
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
ui.buildInfo.textContent = `Версия: ${BUILD_VERSION}`;
window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });
ui.musicToggle.addEventListener("change", updateMusicState);
ui.mobileScheme.addEventListener("change", applyMobileScheme);
applyMobileScheme();
applyModeUi();
showScreen("main");
initYandexSdk();
requestAnimationFrame(loop);
