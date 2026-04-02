const CHARACTER_POOL = [
  { id: "scout", name: "Разведчик", speed: 2.7, hp: 90, color: "#7de0ff" },
  { id: "assault", name: "Штурмовик", speed: 2.2, hp: 120, color: "#6aa9ff" },
  { id: "tank", name: "Танк", speed: 1.8, hp: 160, color: "#4f7dff" },
  { id: "spec", name: "Спец", speed: 2.4, hp: 100, color: "#98a4ff" },
];

const WEAPONS = {
  pistol: { name: "Пистолет", cooldown: 270, damage: 18, speed: 7, spread: 0.03 },
  rifle: { name: "Автомат", cooldown: 120, damage: 10, speed: 9, spread: 0.08 },
};

const MAP_POOL = [
  {
    id: "warehouse",
    name: "Склад",
    bg: "#141a24",
    grid: "#1c2638",
    coverColor: "#334768",
    covers: [
      { x: 180, y: 110, w: 150, h: 42 },
      { x: 630, y: 110, w: 150, h: 42 },
      { x: 425, y: 210, w: 110, h: 120 },
      { x: 170, y: 360, w: 170, h: 45 },
      { x: 620, y: 360, w: 170, h: 45 },
    ],
  },
  {
    id: "crossfire",
    name: "Перекрёсток",
    bg: "#151825",
    grid: "#22293d",
    coverColor: "#46506a",
    covers: [
      { x: 265, y: 80, w: 55, h: 160 },
      { x: 640, y: 300, w: 55, h: 160 },
      { x: 430, y: 170, w: 95, h: 55 },
      { x: 430, y: 315, w: 95, h: 55 },
      { x: 90, y: 240, w: 130, h: 45 },
      { x: 740, y: 240, w: 130, h: 45 },
    ],
  },
  {
    id: "ruins",
    name: "Руины",
    bg: "#1a1720",
    grid: "#2a2432",
    coverColor: "#55455e",
    covers: [
      { x: 130, y: 130, w: 120, h: 45 },
      { x: 720, y: 130, w: 120, h: 45 },
      { x: 130, y: 340, w: 120, h: 45 },
      { x: 720, y: 340, w: 120, h: 45 },
      { x: 360, y: 95, w: 240, h: 34 },
      { x: 360, y: 410, w: 240, h: 34 },
      { x: 450, y: 220, w: 60, h: 100 },
    ],
  },
];

const MAX_ROUNDS = 6;
const ROUND_TIME_MS = 45_000;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreboard = document.getElementById("scoreboard");
const roundInfo = document.getElementById("roundInfo");
const matchSummary = document.getElementById("matchSummary");
const teamASelect = document.getElementById("teamASelect");
const teamBSelect = document.getElementById("teamBSelect");
const lobby = document.getElementById("lobby");
const arena = document.getElementById("arena");
const startBtn = document.getElementById("startBtn");

let scoreA = 0;
let scoreB = 0;
let draws = 0;
let roundsPlayed = 0;

let bullets = [];
let grenades = [];
let players = [];
let roundTimeLeft = ROUND_TIME_MS;
let roundOverAt = 0;
let roundMessage = "";
let lastTs = performance.now();

let currentMap = MAP_POOL[0];
let previousMapId = null;
let inMatch = false;

const keyboard = new Set();
window.addEventListener("keydown", (e) => keyboard.add(e.code));
window.addEventListener("keyup", (e) => keyboard.delete(e.code));

function makeTeamUI(container, teamName, defaultId) {
  container.innerHTML = `<h3>${teamName}</h3><div class="option-list"></div>`;
  const list = container.querySelector(".option-list");
  CHARACTER_POOL.forEach((ch) => {
    const el = document.createElement("label");
    el.innerHTML = `<input type="radio" name="${teamName}" value="${ch.id}" ${ch.id === defaultId ? "checked" : ""}> ${ch.name} (HP ${ch.hp}, SPD ${ch.speed})`;
    list.append(el);
  });
}

makeTeamUI(teamASelect, "Синие", "assault");
makeTeamUI(teamBSelect, "Красные", "scout");

function readPick(teamName) {
  const value = document.querySelector(`input[name="${teamName}"]:checked`)?.value;
  return CHARACTER_POOL.find((x) => x.id === value) ?? CHARACTER_POOL[0];
}

function buildPlayer(team, char, x, y, controls) {
  return {
    team,
    char,
    x,
    y,
    radius: 13,
    hp: char.hp,
    speed: char.speed,
    angle: team === "A" ? 0 : Math.PI,
    weapon: "pistol",
    lastShot: 0,
    nadeCd: 0,
    controls,
    alive: true,
  };
}

function pickMap() {
  const candidates = MAP_POOL.filter((m) => m.id !== previousMapId);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? MAP_POOL[0];
  previousMapId = chosen.id;
  return chosen;
}

function startMatch() {
  inMatch = true;
  scoreA = 0;
  scoreB = 0;
  draws = 0;
  roundsPlayed = 0;
  scoreboard.textContent = `Счёт — Синие: ${scoreA} | Красные: ${scoreB}`;
  matchSummary.classList.add("hidden");
  matchSummary.textContent = "";
  lobby.classList.add("hidden");
  arena.classList.remove("hidden");
  resetRound();
}

function finishMatch() {
  inMatch = false;
  arena.classList.add("hidden");
  lobby.classList.remove("hidden");

  let resultText = "Итог: Ничья.";
  if (scoreA > scoreB) resultText = "Итог: Победа Синих!";
  if (scoreB > scoreA) resultText = "Итог: Победа Красных!";

  matchSummary.textContent = `${resultText} Раунды: ${roundsPlayed}/${MAX_ROUNDS}. Победы — Синие: ${scoreA}, Красные: ${scoreB}, Ничьи: ${draws}. Выберите классы и начните новый матч.`;
  matchSummary.classList.remove("hidden");
  roundInfo.textContent = `Раунд 0 / ${MAX_ROUNDS} • Карта: —`;
}

function resetRound() {
  bullets = [];
  grenades = [];
  roundOverAt = 0;
  roundMessage = "";
  roundTimeLeft = ROUND_TIME_MS;
  currentMap = pickMap();

  const a = readPick("Синие");
  const b = readPick("Красные");
  players = [
    buildPlayer("A", a, 90, canvas.height / 2, {
      up: "KeyW",
      down: "KeyS",
      left: "KeyA",
      right: "KeyD",
      shoot: "KeyF",
      nade: "KeyG",
      swap: "KeyQ",
    }),
    buildPlayer("B", b, canvas.width - 90, canvas.height / 2, {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      shoot: "KeyK",
      nade: "KeyL",
      swap: "KeyP",
    }),
  ];

  roundInfo.textContent = `Раунд ${roundsPlayed + 1} / ${MAX_ROUNDS} • Карта: ${currentMap.name}`;
}

startBtn.addEventListener("click", startMatch);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function collidesWithCover(x, y, radius) {
  for (const c of currentMap.covers) {
    const nearestX = clamp(x, c.x, c.x + c.w);
    const nearestY = clamp(y, c.y, c.y + c.h);
    const dx = x - nearestX;
    const dy = y - nearestY;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

function movePlayer(p, moveX, moveY, dt) {
  if (!p.alive) return;
  const len = Math.hypot(moveX, moveY) || 1;
  const vx = (moveX / len) * p.speed * dt * 0.08;
  const vy = (moveY / len) * p.speed * dt * 0.08;

  const nx = clamp(p.x + vx, p.radius, canvas.width - p.radius);
  const ny = clamp(p.y + vy, p.radius, canvas.height - p.radius);

  if (!collidesWithCover(nx, ny, p.radius)) {
    p.x = nx;
    p.y = ny;
  }

  if (moveX !== 0 || moveY !== 0) {
    p.angle = Math.atan2(moveY, moveX);
  }
}

function shoot(p, now) {
  const w = WEAPONS[p.weapon];
  if (now - p.lastShot < w.cooldown || !p.alive || roundOverAt !== 0) return;
  p.lastShot = now;
  const dir = p.angle + (Math.random() - 0.5) * w.spread;
  bullets.push({
    x: p.x + Math.cos(dir) * (p.radius + 5),
    y: p.y + Math.sin(dir) * (p.radius + 5),
    vx: Math.cos(dir) * w.speed,
    vy: Math.sin(dir) * w.speed,
    damage: w.damage,
    team: p.team,
  });
}

function throwGrenade(p, now) {
  if (now < p.nadeCd || !p.alive || roundOverAt !== 0) return;
  p.nadeCd = now + 2200;
  grenades.push({
    x: p.x,
    y: p.y,
    vx: Math.cos(p.angle) * 4.2,
    vy: Math.sin(p.angle) * 4.2,
    fuse: 1300,
    bounces: 2,
    team: p.team,
  });
}

function applyControls(dt, now) {
  players.forEach((p, idx) => {
    let mx = 0;
    let my = 0;

    if (keyboard.has(p.controls.left)) mx -= 1;
    if (keyboard.has(p.controls.right)) mx += 1;
    if (keyboard.has(p.controls.up)) my -= 1;
    if (keyboard.has(p.controls.down)) my += 1;

    const joy = mobileState[idx];
    if (joy.active) {
      mx = joy.dx;
      my = joy.dy;
    }

    movePlayer(p, mx, my, dt);

    if (keyboard.has(p.controls.shoot) || actionState[idx].shoot) shoot(p, now);
    if (keyboard.has(p.controls.nade) || actionState[idx].nade) {
      throwGrenade(p, now);
      actionState[idx].nade = false;
    }

    if ((keyboard.has(p.controls.swap) || actionState[idx].swap) && !actionState[idx].swapLock) {
      p.weapon = p.weapon === "pistol" ? "rifle" : "pistol";
      actionState[idx].swapLock = true;
    }

    if (!keyboard.has(p.controls.swap) && !actionState[idx].swap) {
      actionState[idx].swapLock = false;
    }

    actionState[idx].swap = false;
  });
}

function hitsCover(x, y) {
  return currentMap.covers.some((c) => x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h);
}

function updateBullets() {
  bullets = bullets.filter((b) => {
    b.x += b.vx;
    b.y += b.vy;

    if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) return false;
    if (hitsCover(b.x, b.y)) return false;

    for (const p of players) {
      if (!p.alive || p.team === b.team) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) < p.radius) {
        p.hp -= b.damage;
        if (p.hp <= 0) p.alive = false;
        return false;
      }
    }

    return true;
  });
}

function explode(g) {
  const radius = 75;
  for (const p of players) {
    if (!p.alive || p.team === g.team) continue;
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    if (d < radius) {
      p.hp -= Math.round(58 * (1 - d / radius));
      if (p.hp <= 0) p.alive = false;
    }
  }
}

function updateGrenades(dt) {
  grenades = grenades.filter((g) => {
    g.fuse -= dt;
    g.vy += 0.05 * dt * 0.06;
    g.x += g.vx;
    g.y += g.vy;

    if ((g.x < 5 || g.x > canvas.width - 5) && g.bounces > 0) {
      g.vx *= -0.7;
      g.bounces -= 1;
    }
    if ((g.y < 5 || g.y > canvas.height - 5) && g.bounces > 0) {
      g.vy *= -0.7;
      g.bounces -= 1;
    }
    if (hitsCover(g.x, g.y) && g.bounces > 0) {
      g.vx *= -0.5;
      g.vy *= -0.5;
      g.bounces -= 1;
    }

    if (g.fuse <= 0) {
      explode(g);
      return false;
    }
    return true;
  });
}

function closeRound(result, now) {
  if (roundOverAt !== 0) return;

  roundsPlayed += 1;
  if (result === "A") {
    scoreA += 1;
    roundMessage = "Раунд за Синими";
  } else if (result === "B") {
    scoreB += 1;
    roundMessage = "Раунд за Красными";
  } else {
    draws += 1;
    roundMessage = "Ничья";
  }

  scoreboard.textContent = `Счёт — Синие: ${scoreA} | Красные: ${scoreB}`;
  roundOverAt = now + 1700;
}

function checkRound(now, dt) {
  roundTimeLeft = Math.max(0, roundTimeLeft - dt);

  const aliveA = players.some((p) => p.team === "A" && p.alive);
  const aliveB = players.some((p) => p.team === "B" && p.alive);

  if (!aliveA && !aliveB) closeRound("draw", now);
  else if (aliveA && !aliveB) closeRound("A", now);
  else if (!aliveA && aliveB) closeRound("B", now);
  else if (roundTimeLeft <= 0) closeRound("draw", now);

  if (roundOverAt !== 0 && now > roundOverAt) {
    if (roundsPlayed >= MAX_ROUNDS) {
      finishMatch();
    } else {
      resetRound();
    }
  }
}

function drawMap() {
  ctx.fillStyle = currentMap.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = currentMap.grid;
  for (let x = 0; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = currentMap.coverColor;
  currentMap.covers.forEach((c) => {
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = "#a9b7d333";
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  });
}

function drawPlayers() {
  players.forEach((p) => {
    ctx.globalAlpha = p.alive ? 1 : 0.35;
    ctx.fillStyle = p.team === "A" ? p.char.color : "#ff8a8a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * (p.radius + 10), p.y + Math.sin(p.angle) * (p.radius + 10));
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(p.x - 20, p.y - 22, 40, 5);
    ctx.fillStyle = p.team === "A" ? "#5db1ff" : "#ff6868";
    ctx.fillRect(p.x - 20, p.y - 22, (40 * Math.max(0, p.hp)) / p.char.hp, 5);

    ctx.fillStyle = "#d7ddf4";
    ctx.font = "11px sans-serif";
    ctx.fillText(WEAPONS[p.weapon].name, p.x - 20, p.y + 28);
  });
}

function drawProjectiles() {
  ctx.fillStyle = "#fefefe";
  bullets.forEach((b) => ctx.fillRect(b.x - 2, b.y - 2, 4, 4));

  grenades.forEach((g) => {
    ctx.fillStyle = "#8cff8c";
    ctx.beginPath();
    ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHUD() {
  if (!players.length) return;
  const pA = players[0];
  const pB = players[1];

  ctx.fillStyle = "#d7ddf4";
  ctx.font = "13px sans-serif";
  ctx.fillText(`A: ${pA.char.name} | ${WEAPONS[pA.weapon].name} | HP ${Math.max(0, Math.round(pA.hp))}`, 10, 18);
  ctx.fillText(`B: ${pB.char.name} | ${WEAPONS[pB.weapon].name} | HP ${Math.max(0, Math.round(pB.hp))}`, 10, 38);

  const t = Math.ceil(roundTimeLeft / 1000);
  ctx.fillStyle = t <= 10 ? "#ff9d9d" : "#cfe1ff";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(`Таймер: ${t}s`, canvas.width - 120, 24);

  if (roundOverAt !== 0) {
    ctx.font = "bold 28px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(roundMessage, canvas.width / 2 - 100, canvas.height / 2);
  }
}

function loop(ts) {
  const dt = ts - lastTs;
  lastTs = ts;

  if (inMatch) {
    applyControls(dt, ts);
    updateBullets();
    updateGrenades(dt);
    checkRound(ts, dt);

    drawMap();
    drawProjectiles();
    drawPlayers();
    drawHUD();
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

const mobileState = [
  { active: false, dx: 0, dy: 0 },
  { active: false, dx: 0, dy: 0 },
];

const actionState = [
  { shoot: false, nade: false, swap: false, swapLock: false },
  { shoot: false, nade: false, swap: false, swapLock: false },
];

function initJoystick(root, idx) {
  const stick = root.querySelector(".stick");
  let rect = null;
  let pid = null;

  const reset = () => {
    mobileState[idx] = { active: false, dx: 0, dy: 0 };
    stick.style.left = "35px";
    stick.style.top = "35px";
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
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const mag = Math.min(1, Math.hypot(dx, dy) / 42);
    const angle = Math.atan2(dy, dx);
    const vx = Math.cos(angle) * mag;
    const vy = Math.sin(angle) * mag;

    mobileState[idx] = { active: true, dx: vx, dy: vy };
    stick.style.left = `${35 + vx * 28}px`;
    stick.style.top = `${35 + vy * 28}px`;
  };

  root.addEventListener("pointermove", handleMove);
  root.addEventListener("pointerup", reset);
  root.addEventListener("pointercancel", reset);
}

function holdButton(id, cbDown, cbUp) {
  const b = document.getElementById(id);
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    cbDown();
  });
  const end = () => cbUp();
  b.addEventListener("pointerup", end);
  b.addEventListener("pointercancel", end);
  b.addEventListener("pointerleave", end);
}

initJoystick(document.getElementById("joyA"), 0);
initJoystick(document.getElementById("joyB"), 1);

holdButton("shootA", () => (actionState[0].shoot = true), () => (actionState[0].shoot = false));
holdButton("shootB", () => (actionState[1].shoot = true), () => (actionState[1].shoot = false));
holdButton("nadeA", () => (actionState[0].nade = true), () => {});
holdButton("nadeB", () => (actionState[1].nade = true), () => {});
holdButton("swapA", () => (actionState[0].swap = true), () => {});
holdButton("swapB", () => (actionState[1].swap = true), () => {});
