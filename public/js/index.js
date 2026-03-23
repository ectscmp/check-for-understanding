const socket = io();
let room_joined = false;
const joinBtn = document.getElementById("join_btn");
const adminbtn = document.getElementById("admin_btn");
const roomInput = document.getElementById("room_code_input");
const gameArea = document.getElementById("game");
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const statusEl = document.getElementById("status");

let currentRoom = null;
let hasAnswered = false;
let playerReportData = null;

// Detect /join/ROOMCODE in URL
const urlParts = window.location.pathname.split("/");
const URL_ROOM_CODE =
  urlParts[1] === "join" && urlParts[2]
    ? urlParts[2].trim().toUpperCase()
    : null;

if (URL_ROOM_CODE) {
  roomInput.value = URL_ROOM_CODE;
  roomInput.classList.add("hidden");
  document.getElementById("username").placeholder =
    `Enter your name to join ${URL_ROOM_CODE}`;
}

/* ═══════════════════════════════════════
   SETTINGS
═══════════════════════════════════════ */

const DEFAULTS = {
  username: "",
  theme: "light",
  accent: "#6366f1",
  fontSize: 16,
  confirm: false,
  sounds: true,
  keyboard: true,
  progress: true,
};

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("quizSettings")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  localStorage.setItem("quizSettings", JSON.stringify(s));
}

function applySettings(s) {
  // Theme
  const resolved =
    s.theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : s.theme;
  document.body.classList.remove("light", "dark");
  document.body.classList.add(resolved);
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) themeBtn.textContent = resolved === "light" ? "🌙" : "☀️";

  // Accent colour
  document.documentElement.style.setProperty("--accent", s.accent);

  // Font size
  document.documentElement.style.setProperty(
    "--quiz-font-size",
    s.fontSize + "px",
  );

  // Pre-fill username field (only if currently empty)
  const usernameEl = document.getElementById("username");
  if (usernameEl && s.username && !usernameEl.value)
    usernameEl.value = s.username;

  // Progress visibility
  const progressEl = document.getElementById("progress");
  if (progressEl) progressEl.style.display = s.progress ? "" : "none";
}

function syncSettingsUI(s) {
  document.getElementById("setting-username").value = s.username;
  document.getElementById("setting-confirm").checked = s.confirm;
  document.getElementById("setting-sounds").checked = s.sounds;
  document.getElementById("setting-keyboard").checked = s.keyboard;
  document.getElementById("setting-progress").checked = s.progress;

  document.getElementById("fontSizeRange").value = s.fontSize;
  document.getElementById("fontSizeValue").textContent = s.fontSize + "px";

  document
    .querySelectorAll(".sd-pill")
    .forEach((p) => p.classList.toggle("active", p.dataset.theme === s.theme));
  document
    .querySelectorAll(".sd-swatch")
    .forEach((sw) =>
      sw.classList.toggle("active", sw.dataset.color === s.accent),
    );
  document.getElementById("customAccentPicker").value = s.accent;
}

// Apply immediately on load
applySettings(loadSettings());

// Keep system theme in sync if OS preference changes
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const s = loadSettings();
    if (s.theme === "system") applySettings(s);
  });

window.addEventListener("storage", (event) => {
  if (event.key !== "quizSettings") return;
  const s = loadSettings();
  applySettings(s);
  syncSettingsUI(s);
});

/* ── Drawer open / close ── */
const drawer = document.getElementById("settingsDrawer");
const overlay = document.getElementById("settingsOverlay");

function openSettings() {
  drawer.classList.add("open");
  overlay.classList.add("open");
  syncSettingsUI(loadSettings());
}
function closeSettings() {
  drawer.classList.remove("open");
  overlay.classList.remove("open");
}

document.getElementById("settingsBtn").addEventListener("click", openSettings);
document
  .getElementById("closeSettingsBtn")
  .addEventListener("click", closeSettings);
overlay.addEventListener("click", closeSettings);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drawer.classList.contains("open")) closeSettings();
});

/* ── Username ── */
document.getElementById("saveUsernameBtn").addEventListener("click", () => {
  const s = loadSettings();
  s.username = document.getElementById("setting-username").value.trim();
  saveSettings(s);
  applySettings(s);

  const btn = document.getElementById("saveUsernameBtn");
  btn.textContent = "✓ Saved";
  btn.classList.add("sd-saved");
  setTimeout(() => {
    btn.textContent = "Save";
    btn.classList.remove("sd-saved");
  }, 1400);
});

/* ── Theme pills ── */
document.querySelectorAll(".sd-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    const s = loadSettings();
    s.theme = pill.dataset.theme;
    saveSettings(s);
    applySettings(s);
    document
      .querySelectorAll(".sd-pill")
      .forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
  });
});

/* ── Top-bar theme toggle button ── */
document.getElementById("themeToggle")?.addEventListener("click", () => {
  const s = loadSettings();
  const cur =
    s.theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : s.theme;
  s.theme = cur === "light" ? "dark" : "light";
  saveSettings(s);
  applySettings(s);
  // Keep pills in sync if drawer happens to be open
  document
    .querySelectorAll(".sd-pill")
    .forEach((p) => p.classList.toggle("active", p.dataset.theme === s.theme));
});

/* ── Accent swatches ── */
document.querySelectorAll(".sd-swatch").forEach((sw) => {
  sw.addEventListener("click", () => {
    const s = loadSettings();
    s.accent = sw.dataset.color;
    saveSettings(s);
    applySettings(s);
    document
      .querySelectorAll(".sd-swatch")
      .forEach((el) => el.classList.remove("active"));
    sw.classList.add("active");
    document.getElementById("customAccentPicker").value = s.accent;
  });
});

document.getElementById("customAccentPicker").addEventListener("input", (e) => {
  const s = loadSettings();
  s.accent = e.target.value;
  saveSettings(s);
  applySettings(s);
  document
    .querySelectorAll(".sd-swatch")
    .forEach((el) => el.classList.remove("active"));
});

/* ── Font size ── */
document.getElementById("fontSizeRange").addEventListener("input", (e) => {
  const s = loadSettings();
  s.fontSize = parseInt(e.target.value);
  saveSettings(s);
  applySettings(s);
  document.getElementById("fontSizeValue").textContent = s.fontSize + "px";
});

/* ── Toggles ── */
["confirm", "sounds", "keyboard", "progress"].forEach((key) => {
  document.getElementById(`setting-${key}`).addEventListener("change", (e) => {
    const s = loadSettings();
    s[key] = e.target.checked;
    saveSettings(s);
    applySettings(s);
  });
});

/* ── Reset ── */
document.getElementById("resetSettingsBtn").addEventListener("click", () => {
  if (!confirm("Reset all settings to defaults?")) return;
  saveSettings({ ...DEFAULTS });
  applySettings(DEFAULTS);
  syncSettingsUI(DEFAULTS);
});

/* ═══════════════════════════════════════
   SOUND EFFECTS  (Web Audio API)
═══════════════════════════════════════ */
function playSound(type) {
  if (!loadSettings().sounds) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "correct") {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
    }
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
  } catch (_) {
    /* AudioContext unavailable — skip silently */
  }
}

/* ═══════════════════════════════════════
   KEYBOARD SHORTCUTS  (1–4)
═══════════════════════════════════════ */
document.addEventListener("keydown", (e) => {
  if (!loadSettings().keyboard) return;
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  const n = parseInt(e.key);
  if (n >= 1 && n <= 4) {
    const btns = document.querySelectorAll(".answer-btn");
    if (btns[n - 1] && !btns[n - 1].disabled) btns[n - 1].click();
  }
});

/* ═══════════════════════════════════════
   NUKE ANIMATION
═══════════════════════════════════════ */
function playNukeAnimation() {
  if (!document.getElementById("nukeStyles")) {
    const st = document.createElement("style");
    st.id = "nukeStyles";
    st.textContent = `
      .nuke-flash{position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,1) 0%,rgba(255,200,0,.8) 20%,rgba(255,100,0,.4) 50%,transparent 70%);animation:nkFlash 1s ease-out forwards;}
      .nuke-shockwave{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100px;height:100px;border:5px solid rgba(255,100,0,.8);border-radius:50%;animation:nkWave 2s ease-out forwards;}
      .nuke-text{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:3.5rem;font-weight:900;color:#f00;text-shadow:0 0 20px #f00,0 0 40px #f60,0 0 60px #fa0;animation:nkPulse .5s infinite;z-index:10;white-space:nowrap;}
      @keyframes nkFlash{0%{opacity:0}10%{opacity:1}100%{opacity:0}}
      @keyframes nkWave{0%{width:100px;height:100px;opacity:1}100%{width:200vmax;height:200vmax;opacity:0}}
      @keyframes nkPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.08)}}
      @keyframes nkShake{0%,100%{transform:none}20%{transform:translateX(-6px) rotate(-.8deg)}40%{transform:translateX(6px) rotate(.8deg)}60%{transform:translateX(-4px) rotate(-.4deg)}80%{transform:translateX(4px) rotate(.4deg)}}
    `;
    document.head.appendChild(st);
  }

  const nukeOverlay = document.createElement("div");
  nukeOverlay.id = "nukeOverlay";
  nukeOverlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;pointer-events:none;overflow:hidden;";
  nukeOverlay.innerHTML = `
    <div class="nuke-flash"></div>
    <div class="nuke-shockwave"></div>
    <div class="nuke-shockwave" style="animation-delay:.2s"></div>
    <div class="nuke-shockwave" style="animation-delay:.4s"></div>
    <div class="nuke-text">💥 NUKE INCOMING! 💥</div>
  `;
  document.body.appendChild(nukeOverlay);
  document.body.style.animation = "nkShake 0.4s infinite";

  setTimeout(() => {
    nukeOverlay.remove();
    document.body.style.animation = "";
    const video = document.createElement("video");
    video.src = "./nuke.mp4";
    video.autoplay = video.muted = video.playsInline = true;
    video.controls = false;
    Object.assign(video.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      objectFit: "cover",
      zIndex: "9999",
      background: "black",
    });
    document.body.appendChild(video);
    video.requestFullscreen?.().catch(() => {});
    video.play();
    video.onended = () => video.remove();
  }, 5000);
}

/* ═══════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════ */
adminbtn.addEventListener("click", () => {
  window.location.href = "/admin";
});

/* ═══════════════════════════════════════
   JOIN ROOM
═══════════════════════════════════════ */
function joinRoom(roomCode, username) {
  if (!roomCode) {
    alert("Enter a room code");
    return;
  }
  if (!username) {
    alert("Name required");
    return;
  }
  socket.emit("join_room", { roomCode, username });
  room_joined = true;
}

joinBtn.addEventListener("click", () => {
  const roomCode = URL_ROOM_CODE || roomInput.value.trim().toUpperCase();
  const username = document.getElementById("username").value.trim();
  joinRoom(roomCode, username);
});

/* ═══════════════════════════════════════
   PUBLIC ROOMS
═══════════════════════════════════════ */
function fetchPublicRooms() {
  if (room_joined) return;
  socket.emit("get_public_rooms", (rooms) => displayPublicRooms(rooms));
}

function displayPublicRooms(rooms) {
  const container = document.getElementById("publicRoomsList");
  if (!container) return;
  if (!rooms || rooms.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:20px">No public rooms available right now</p>`;
    return;
  }
  container.innerHTML = rooms
    .map(
      (room) => `
    <div class="room-item">
      <div class="room-info">
        <strong style="font-size:16px">${room.roomName}</strong>
        <div style="font-size:13px;color:#94a3b8;margin-top:4px">
          Code: ${room.roomCode} &bull; ${room.playerCount} player(s)
          ${room.hasQuiz ? "✓ Quiz Ready" : "⏳ No quiz yet"}
        </div>
      </div>
      <div class="room-actions">
        <button onclick="quickJoinRoom('${room.roomCode}')" style="width:auto;padding:8px 16px;margin:0">Join</button>
      </div>
    </div>
  `,
    )
    .join("");
}

window.quickJoinRoom = function (roomCode) {
  const username = document.getElementById("username").value.trim();
  if (!username) {
    alert("Please enter your name first!");
    document.getElementById("username").focus();
    return;
  }
  joinRoom(roomCode, username);
};

document
  .getElementById("refreshRoomsBtn")
  ?.addEventListener("click", fetchPublicRooms);
socket.on("public_rooms_updated", fetchPublicRooms);

/* ═══════════════════════════════════════
   SOCKET EVENTS
═══════════════════════════════════════ */
socket.on("connect", () => {
  console.log("🔌 Connected:", socket.id);
  fetchPublicRooms();
});

socket.on("triggerNuke", playNukeAnimation);

socket.on("room_joined", (roomCode) => {
  currentRoom = roomCode;
  statusEl.textContent = `Joined room ${roomCode}. Waiting for quiz to start...`;
  document
    .querySelectorAll(".hide_on_join")
    .forEach((el) => el.classList.add("hidden"));
});

socket.on("roomClosed", ({ message }) => {
  alert(message);
  window.location.href = "/";
});

/* ── Quiz ── */
socket.on("quizStarted", ({ totalQuestions }) => {
  statusEl.textContent = `Quiz started! (${totalQuestions} questions)`;
  gameArea.style.display = "block";
});

socket.on(
  "question",
  ({ question, options, questionNumber, totalQuestions }) => {
    hasAnswered = false;
    gameArea.style.display = "block";
    answersEl.innerHTML = "";

    const progressEl = document.getElementById("progress");
    if (progressEl) progressEl.textContent = "";

    questionEl.textContent = `Q${questionNumber}${totalQuestions ? `/${totalQuestions}` : ""}: ${question}`;

    options.forEach((option, i) => {
      const btn = document.createElement("button");
      btn.className = "answer-btn";
      btn.textContent = option;
      const s = loadSettings();
      if (s.keyboard && i < 4) btn.title = `Press ${i + 1}`;

      btn.onclick = () => {
        if (hasAnswered) return;
        const cur = loadSettings();
        if (cur.confirm && !confirm(`Submit "${option}" as your answer?`))
          return;

        hasAnswered = true;
        document
          .querySelectorAll(".answer-btn")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        disableButtons();
        socket.emit("submit_answer", { roomCode: currentRoom, answer: option });
        statusEl.textContent =
          "Answer submitted — waiting for next question...";
      };

      answersEl.appendChild(btn);
    });
  },
);

function disableButtons() {
  document.querySelectorAll(".answer-btn").forEach((b) => (b.disabled = true));
}

socket.on("answer_progress", ({ answered, total }) => {
  const progressEl = document.getElementById("progress");
  if (progressEl) progressEl.textContent = `${answered} / ${total} answered`;
});

socket.on("question_results", ({ correctAnswer, isCorrect, score }) => {
  playSound(isCorrect ? "correct" : "wrong");
  statusEl.textContent = isCorrect
    ? `✅ Correct! Score: ${score}`
    : `❌ Wrong — correct answer: ${correctAnswer}. Score: ${score}`;
});

socket.on("quiz_complete_waiting", () => {
  gameArea.style.display = "none";
  statusEl.innerHTML = `
    <div style="text-align:center;padding:24px">
      <div style="font-size:3rem;margin-bottom:12px">🎉</div>
      <h2 style="margin:0 0 8px">You're done!</h2>
      <p style="opacity:.6">Waiting for the admin to end the quiz...</p>
    </div>
  `;
});

socket.on("quizResults", ({ results, winner }) => {
  gameArea.style.display = "none";
  const medals = ["🥇", "🥈", "🥉"];
  statusEl.innerHTML = `
    <h2 style="margin-bottom:12px">🏆 Quiz Finished!</h2>
    ${winner ? `<p style="margin-bottom:14px;font-weight:700">Winner: ${winner.name}</p>` : ""}
    ${results
      .map(
        (p, i) =>
          `<p style="font-size:1.1rem;margin:6px 0">${medals[i] || i + 1 + "."} ${p.name}: <strong>${p.score}</strong></p>`,
      )
      .join("")}
  `;
});

socket.on("playerReport", (report) => {
  playerReportData = report;
  let container = document.getElementById("playerReportContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "playerReportContainer";
    document.body.appendChild(container);
  }
  container.classList.remove("hidden");
  container.innerHTML = `
    <h2>Your Results</h2>
    <h3>Score: ${report.score} / ${report.totalQuestions}</h3>
    ${report.questions
      .map(
        (q) => `
      <div class="report-question">
        <p><strong>Q${q.questionNumber}:</strong> ${q.question}</p>
        <p class="${q.isCorrect ? "report-correct" : "report-incorrect"}">${q.isCorrect ? "✓ Correct" : "✗ Incorrect"}</p>
        <p class="report-your-answer">Your answer: <strong>${q.playerAnswer}</strong></p>
        ${!q.isCorrect ? `<p class="report-correct-answer">Correct: <strong>${q.correctAnswer}</strong></p>` : ""}
      </div>
    `,
      )
      .join("")}
    <button id="downloadPlayerReportBtn" style="margin-top:12px">⬇ Download Report</button>
  `;
  document.getElementById("downloadPlayerReportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(playerReportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `quiz-report-${report.username}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };
});

/* ── Errors & kick ── */
socket.on("error", (err) => alert(err.message || "An error occurred"));
socket.on("kicked", () => {
  alert("You were kicked from the room.");
  window.location.href = "/";
});

/* ═══════════════════════════════════════
   AUTO-JOIN FROM /join/ROOMCODE
═══════════════════════════════════════ */
if (urlParts[1] === "join" && urlParts[2]) {
  const code = urlParts[2].trim().toUpperCase();
  roomInput.value = code;
  roomInput.classList.add("hidden");
  document.getElementById("username").placeholder =
    `Enter your name to join ${code}`;

  const newBtn = joinBtn.cloneNode(true);
  joinBtn.replaceWith(newBtn);
  newBtn.addEventListener("click", () => {
    const username = document.getElementById("username").value.trim();
    if (!username) {
      alert("Please enter your name");
      return;
    }
    joinRoom(code, username);
  });
}
