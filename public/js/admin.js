let names = [];
const socket = io();
let lastReportData = [];

/* =====================
   ELEMENT REFS
===================== */
const createRoomBtn = document.getElementById("createRoomBtn");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const startQuizBtn = document.getElementById("startQuizBtn");
const endQuizBtn = document.getElementById("endQuizBtn");
const quizInputsContainer = document.getElementById("quizInputs");
const addQuestionBtn = document.getElementById("addQuestionBtn");
const shareBox = document.getElementById("shareBox");
const shareUrlEl = document.getElementById("shareUrl");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const downloadReportBtn = document.getElementById("downloadReportBtn");
const downloadTypeSelect = document.getElementById("downloadTypeSelect");

let currentRoom = null;
window.lastQuizData = null;

/* =====================
   THEME
   theme.js is loaded before this script and has already called
   applyStored() from the inline <body> script.
   All we need here is to wire up the toggle button.
===================== */
ThemeManager.bindToggle("themeToggle");

/* =====================
   JOIN TOAST
===================== */
let toastTimeout = null;

function showJoinToast(name) {
  let toast = document.getElementById("joinToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "joinToast";
    document.body.appendChild(toast);
  }
  toast.textContent = `✅ ${name} has joined!`;
  toast.classList.add("visible");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3000);
}

const toastStyles = document.createElement("style");
toastStyles.textContent = `
  #joinToast {
    position:fixed;top:70px;right:45%;
    background:#4ade80;color:#0f172a;
    padding:12px 20px;border-radius:10px;
    font-weight:600;font-size:15px;
    box-shadow:0 4px 20px rgba(0,0,0,.2);
    opacity:0;transform:translateY(-10px);
    transition:opacity .3s ease,transform .3s ease;
    pointer-events:none;z-index:9999;
  }
  #joinToast.visible{opacity:1;transform:translateY(0);}
`;
document.head.appendChild(toastStyles);

/* =====================
   SHARE LINK
===================== */
function showShareLink(roomCode) {
  shareUrlEl.value = `${window.location.origin}/join/${roomCode}`;
  shareBox.classList.add("visible");
}

copyLinkBtn.addEventListener("click", () => {
  if (!shareUrlEl.value) return;
  navigator.clipboard
    .writeText(shareUrlEl.value)
    .then(() => {
      copyLinkBtn.textContent = "Copied!";
      copyLinkBtn.classList.add("copied");
      setTimeout(() => {
        copyLinkBtn.textContent = "Copy";
        copyLinkBtn.classList.remove("copied");
      }, 2000);
    })
    .catch(() => {
      shareUrlEl.select();
      document.execCommand("copy");
      copyLinkBtn.textContent = "Copied!";
      setTimeout(() => (copyLinkBtn.textContent = "Copy"), 2000);
    });
});

/* =====================
   SETTINGS
   Reuses the shared "quizSettings" localStorage key so
   the admin, join, and helper pages stay in sync.
===================== */
const SETTINGS_KEY = "quizSettings";
const DEFAULT_SETTINGS = {
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
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY)),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function resolveTheme(theme) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function applySettings(settings) {
  const resolved = resolveTheme(settings.theme);
  document.body.classList.remove("light", "dark");
  document.body.classList.add(resolved);
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
  document.documentElement.style.setProperty("--accent", settings.accent);
  document.documentElement.style.setProperty(
    "--quiz-font-size",
    `${settings.fontSize}px`,
  );
}

function syncSettingsUI(settings) {
  document
    .querySelectorAll(".sd-pill")
    .forEach((pill) =>
      pill.classList.toggle("active", pill.dataset.theme === settings.theme),
    );
}

const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const settingsDrawer = document.getElementById("settingsDrawer");
const settingsOverlay = document.getElementById("settingsOverlay");

function openSettings() {
  settingsDrawer.classList.add("open");
  settingsOverlay.classList.add("open");
  syncSettingsUI(loadSettings());
}

function closeSettings() {
  settingsDrawer.classList.remove("open");
  settingsOverlay.classList.remove("open");
}

applySettings(loadSettings());

themeMediaQuery.addEventListener("change", () => {
  const settings = loadSettings();
  if (settings.theme === "system") applySettings(settings);
});

window.addEventListener("storage", (event) => {
  if (event.key !== SETTINGS_KEY) return;
  const settings = loadSettings();
  applySettings(settings);
  syncSettingsUI(settings);
});

document.getElementById("settingsBtn").addEventListener("click", openSettings);
document
  .getElementById("closeSettingsBtn")
  .addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", closeSettings);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settingsDrawer.classList.contains("open")) {
    closeSettings();
  }
});

document.querySelectorAll(".sd-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    const settings = loadSettings();
    settings.theme = pill.dataset.theme;
    saveSettings(settings);
    applySettings(settings);
    syncSettingsUI(settings);
  });
});

/* =====================
   QUESTION BUILDER
===================== */
function createQuestionBlock(index) {
  const div = document.createElement("div");
  div.className = "question-block";
  div.innerHTML = `
    <input type="text" class="question" placeholder="Question ${index}" />
    <input type="text" class="Right" placeholder="Correct Answer" />
    <div class="wrong-answers">
      <input type="text" class="Wrong" placeholder="Wrong Answer" />
    </div>
    <button class="addWrongBtn">+ Add Wrong Answer</button>
    <button class="removeQuestionBtn">Remove Question</button>
    <hr />
  `;
  div.querySelector(".addWrongBtn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "Wrong";
    input.placeholder = "Wrong Answer";
    div.querySelector(".wrong-answers").appendChild(input);
  });
  div
    .querySelector(".removeQuestionBtn")
    .addEventListener("click", () => div.remove());
  return div;
}

function addQuestion() {
  quizInputsContainer.appendChild(
    createQuestionBlock(
      document.querySelectorAll(".question-block").length + 1,
    ),
  );
}

addQuestion();
addQuestionBtn?.addEventListener("click", addQuestion);

/* =====================
   UPDATE NAME LIST
===================== */
function update_namelist() {
  const el = document.getElementById("namelist");
  if (!el) return;
  el.innerHTML = names.length
    ? names.map((n) => `👤 ${n}`).join("<br>")
    : "<span style='color:#94a3b8'>No players yet...</span>";
}

/* =====================
   QUIZ-RUNNING VISUAL STATE
===================== */
function enterQuizRunningMode() {
  document.getElementById("quizRunningBanner")?.classList.remove("hidden");
  document.getElementById("create")?.classList.add("hidden");
  const btn = document.getElementById("restoreBuilderBtn");
  if (btn) {
    btn.classList.remove("hidden");
    btn.textContent = "Show Quiz Builder";
  }
}

function exitQuizRunningMode() {
  document.getElementById("quizRunningBanner")?.classList.add("hidden");
  document.getElementById("create")?.classList.remove("hidden");
  document.getElementById("restoreBuilderBtn")?.classList.add("hidden");
}

const quizRunningStyles = document.createElement("style");
quizRunningStyles.textContent = `
  #quizRunningBanner:not(.hidden){
    display:flex;align-items:center;gap:12px;
    background:linear-gradient(135deg,#22c55e,#16a34a);
    color:white;padding:14px 20px;border-radius:12px;
    font-weight:700;font-size:1rem;margin-bottom:16px;
    animation:bannerPulse 2s ease-in-out infinite;
    box-shadow:0 4px 20px rgba(34,197,94,.35);
  }
  #quizRunningBanner .banner-dot{width:10px;height:10px;background:white;border-radius:50%;animation:dot-blink 1s ease-in-out infinite;flex-shrink:0;}
  #quizRunningBanner .banner-question-counter{margin-left:auto;font-size:.85rem;opacity:.9;font-weight:600;}
  @keyframes bannerPulse{0%,100%{box-shadow:0 4px 20px rgba(34,197,94,.35);}50%{box-shadow:0 4px 28px rgba(34,197,94,.6);}}
  @keyframes dot-blink{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.8);}}
  #restoreBuilderBtn{background:transparent;border:1.5px dashed currentColor;opacity:.7;font-size:.85rem;padding:8px 14px;margin-bottom:12px;cursor:pointer;border-radius:8px;transition:opacity .2s;}
  #restoreBuilderBtn:hover{opacity:1;}
`;
document.head.appendChild(quizRunningStyles);

/* =====================
   CORE CREATE ROOM
===================== */
function createRoom(customCode, roomName, isPublic, quizData) {
  const code = (customCode || "CMP").trim().toUpperCase();
  socket.emit("create_room", code, (response) => {
    if (response.error) {
      alert("Room error: " + response.error);
      return;
    }

    currentRoom = response.roomCode;
    roomCodeDisplay.textContent = `Room Code: ${response.roomCode}`;

    [
      "json",
      "create",
      "downloadControls",
      "nameListContainer",
      "namelist",
      "startHeader",
    ].forEach((id) => document.getElementById(id)?.classList.remove("hidden"));
    startQuizBtn?.classList.remove("hidden");
    endQuizBtn?.classList.remove("hidden");
    document
      .querySelectorAll(".hideoncreate")
      .forEach((el) => el.classList.add("hidden"));

    showShareLink(response.roomCode);
    socket.emit("update_room_settings", {
      roomCode: currentRoom,
      isPublic: isPublic ?? false,
      roomName: roomName || "Unnamed Room",
    });
    socket.emit("get_players", currentRoom);

    if (quizData) {
      socket.emit("quizDataUploaded", { roomCode: currentRoom, quizData });
      window.lastQuizData = quizData;
      document.getElementById("output").textContent = JSON.stringify(
        quizData,
        null,
        2,
      );
      roomCodeDisplay.textContent += " — Quiz loaded";
    }
  });
}

/* =====================
   MANUAL CREATE BUTTON
===================== */
createRoomBtn.addEventListener("click", () => {
  createRoom(
    document.getElementById("roomInput").value.trim(),
    document.getElementById("roomName").value.trim(),
    document.getElementById("publicRadio").checked,
    null,
  );
});

/* =====================
   CREATE QUIZ FROM FORM
===================== */
document.getElementById("createQuizBtn").addEventListener("click", () => {
  if (!currentRoom) {
    alert("Create a room first!");
    return;
  }
  const quizData = [];
  document.querySelectorAll(".question-block").forEach((block) => {
    const question = block.querySelector(".question")?.value.trim();
    const correct = block.querySelector(".Right")?.value.trim();
    const wrongs = [...block.querySelectorAll(".Wrong")]
      .map((w) => w.value.trim())
      .filter(Boolean);
    if (!question || !correct) return;
    const wrongsObj = {};
    wrongs.forEach((w, i) => (wrongsObj[`wrong${i + 1}`] = w));
    quizData.push({ question, choices: { correct, ...wrongsObj } });
  });
  if (!quizData.length) {
    alert("Add at least one valid question.");
    return;
  }
  socket.emit("quizDataUploaded", { roomCode: currentRoom, quizData });
  window.lastQuizData = quizData;
  document.getElementById("written").textContent = JSON.stringify(
    quizData,
    null,
    2,
  );
  alert("Quiz uploaded successfully!");
});

/* =====================
   UPLOAD JSON FILE
===================== */
document.getElementById("fileInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (!currentRoom) {
        alert("Create a room first!");
        return;
      }
      const raw = JSON.parse(reader.result);
      const quizArray = raw.quiz || raw;
      socket.emit("quizDataUploaded", {
        roomCode: currentRoom,
        quizData: quizArray,
      });
      window.lastQuizData = quizArray;
      document.getElementById("output").textContent = JSON.stringify(
        quizArray,
        null,
        2,
      );
      alert("Quiz uploaded successfully!");
    } catch {
      document.getElementById("output").textContent = "Invalid JSON file";
    }
  };
  reader.readAsText(file);
});

/* =====================
   PASTE JSON
===================== */
document.getElementById("loadJsonBtn").addEventListener("click", () => {
  const jsonText = document.getElementById("jsonTextarea").value.trim();
  const pasteOut = document.getElementById("pasteOutput");
  if (!jsonText) {
    alert("Please paste some JSON first!");
    return;
  }
  if (!currentRoom) {
    alert("Create a room first!");
    return;
  }
  try {
    const raw = JSON.parse(jsonText);
    const quizArray = raw.quiz || raw;
    socket.emit("quizDataUploaded", {
      roomCode: currentRoom,
      quizData: quizArray,
    });
    window.lastQuizData = quizArray;
    pasteOut.textContent = "Quiz loaded successfully!";
    pasteOut.style.color = "green";
    document.getElementById("output").textContent = JSON.stringify(
      quizArray,
      null,
      2,
    );
  } catch (err) {
    pasteOut.textContent = "Invalid JSON format: " + err.message;
    pasteOut.style.color = "red";
  }
});

/* =====================
   START QUIZ
===================== */
startQuizBtn.addEventListener("click", () => {
  if (!currentRoom) {
    alert("Create a room first!");
    return;
  }
  if (!window.lastQuizData) {
    alert("Upload a quiz before starting!");
    return;
  }
  socket.emit("quizDataUploaded", {
    roomCode: currentRoom,
    quizData: window.lastQuizData,
  });
  socket.emit("start_quiz", currentRoom);
  document
    .querySelectorAll(".hideonstart")
    .forEach((el) => el.classList.add("hidden"));
  enterQuizRunningMode();
});

/* =====================
   END QUIZ
===================== */
let endQuizPhase = 0;

endQuizBtn.addEventListener("click", () => {
  if (!currentRoom) {
    alert("Not in a room");
    return;
  }

  if (endQuizPhase === 0) {
    socket.emit("endquiz", currentRoom);
    endQuizBtn.textContent = "Close Room";
    endQuizBtn.style.background = "#dc2626";
    endQuizPhase = 1;
    exitQuizRunningMode();
    document
      .querySelectorAll(".hideonstart")
      .forEach((el) => el.classList.remove("hidden"));
  } else {
    socket.emit("close_room", currentRoom);
    currentRoom = null;
    window.lastQuizData = null;
    names = [];
    endQuizPhase = 0;
    endQuizBtn.textContent = "End Quiz";
    endQuizBtn.style.background = "";
    roomCodeDisplay.textContent = "";
    [
      "json",
      "create",
      "downloadControls",
      "nameListContainer",
      "namelist",
      "startHeader",
      "adminReportContainer",
    ].forEach((id) => document.getElementById(id)?.classList.add("hidden"));
    startQuizBtn?.classList.add("hidden");
    endQuizBtn?.classList.add("hidden");
    document.getElementById("unhide")?.classList.add("hidden");
    document.getElementById("chart")?.classList.add("hidden");
    shareBox.classList.remove("visible");
    shareUrlEl.value = "";
    update_namelist();
    const rc = document.getElementById("adminReportContainer");
    if (rc) rc.innerHTML = "";
    document
      .querySelectorAll(".hideoncreate")
      .forEach((el) => el.classList.remove("hidden"));
    document.getElementById("roomInput").value = "";
    document.getElementById("roomName").value = "";
  }
});

/* =====================
   HIDE / SHOW FORM
===================== */
document.getElementById("Hide").addEventListener("click", () => {
  document.getElementById("create").classList.add("hidden");
  document.getElementById("unhide").classList.remove("hidden");
});
document.getElementById("unhide").addEventListener("click", () => {
  document.getElementById("create").classList.remove("hidden");
  document.getElementById("unhide").classList.add("hidden");
});

/* =====================
   INFO MODAL
===================== */
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("infoModal");
  document
    .getElementById("Information")
    .addEventListener("click", () => modal.classList.remove("hidden"));
  document
    .getElementById("closeInfoModal")
    .addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  const restoreBtn = document.getElementById("restoreBuilderBtn");
  if (restoreBtn) {
    restoreBtn.addEventListener("click", () => {
      const builder = document.getElementById("create");
      const wasHidden = builder.classList.contains("hidden");
      builder.classList.toggle("hidden");
      restoreBtn.textContent = wasHidden
        ? "Hide Quiz Builder"
        : "Show Quiz Builder";
    });
  }
});

/* =====================
   DOWNLOAD REPORT
===================== */
function triggerDownload(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: fileName,
  });
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

function buildReportCsv(reports) {
  const maxQuestions = reports.reduce(
    (max, report) => Math.max(max, report.questions?.length || 0),
    0,
  );
  const headers = [
    "Name",
    ...Array.from({ length: maxQuestions }, (_, i) => `Q${i + 1}`),
    "Total Correct",
    "Total Possible",
  ];

  const rows = reports.map((report) => {
    const qResults = Array.from({ length: maxQuestions }, (_, index) => {
      const q = report.questions?.[index];
      if (!q) return "";
      return q.isCorrect ? "Right" : "Wrong";
    });
    return [
      report.username || "",
      ...qResults,
      report.score ?? 0,
      report.totalQuestions ?? maxQuestions,
    ];
  });

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

downloadReportBtn?.addEventListener("click", () => {
  const selectedType = downloadTypeSelect?.value || "report-json";

  if (selectedType === "report-json") {
    if (!lastReportData.length) {
      alert("No report data available yet. End the quiz first.");
      return;
    }
    triggerDownload(
      "quiz-report.json",
      JSON.stringify(lastReportData, null, 2),
      "application/json",
    );
    return;
  }

  if (selectedType === "report-csv") {
    if (!lastReportData.length) {
      alert("No report data available yet. End the quiz first.");
      return;
    }
    const csv = buildReportCsv(lastReportData);
    triggerDownload("quiz-report.csv", csv, "text/csv;charset=utf-8");
    return;
  }

  alert("Please choose a valid report format.");
});

/* =====================
   NUKE ANIMATION
===================== */
function playNukeAnimation() {
  const overlay = document.createElement("div");
  overlay.id = "nukeOverlay";
  overlay.innerHTML = `
    <div class="nuke-flash"></div>
    <div class="nuke-shockwave"></div>
    <div class="nuke-shockwave" style="animation-delay:.2s"></div>
    <div class="nuke-shockwave" style="animation-delay:.4s"></div>
    <div class="nuke-text">NUKE INCOMING!</div>`;
  document.body.appendChild(overlay);
  document.body.style.animation = "shake .5s infinite";
  setTimeout(() => {
    overlay.remove();
    document.body.style.animation = "";
    const video = document.createElement("video");
    video.src = "./nuke.mp4";
    video.autoplay = video.muted = video.playsInline = true;
    video.controls = false;
    Object.assign(video.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      objectFit: "cover",
      zIndex: 9999,
      background: "black",
    });
    document.body.appendChild(video);
    video.requestFullscreen?.().catch(() => {});
    video.play();
    video.onended = () => video.remove();
  }, 5000);
}

document.head.appendChild(
  Object.assign(document.createElement("style"), {
    textContent: `
  #nukeOverlay{position:fixed;inset:0;z-index:999999;pointer-events:none;overflow:hidden;}
  .nuke-flash{position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,1) 0%,rgba(255,200,0,.8) 20%,rgba(255,100,0,.4) 50%,transparent 70%);animation:flash 1s ease-out;}
  .nuke-shockwave{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100px;height:100px;border:5px solid rgba(255,100,0,.8);border-radius:50%;animation:shockwave 2s ease-out;}
  .nuke-text{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:4rem;font-weight:bold;color:#f00;text-shadow:0 0 20px #f00,0 0 40px #f60,0 0 60px #fa0;animation:pulse .5s infinite;z-index:10;}
  @keyframes flash{0%{opacity:0}10%{opacity:1}100%{opacity:0}}
  @keyframes shockwave{0%{width:100px;height:100px;opacity:1}100%{width:200vmax;height:200vmax;opacity:0}}
  @keyframes pulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.1)}}
  @keyframes shake{0%,100%{transform:none}10%{transform:translateX(-5px) translateY(-5px) rotate(-1deg)}20%{transform:translateX(5px) translateY(5px) rotate(1deg)}30%{transform:translateX(-5px) translateY(5px) rotate(-1deg)}40%{transform:translateX(5px) translateY(-5px) rotate(1deg)}}
`,
  }),
);

/* =====================
   SOCKET EVENTS
===================== */
socket.on("connect", () => console.log("Connected:", socket.id));
socket.on("disconnect", () => console.log("Disconnected"));
socket.on("error", (err) => console.error("Socket error:", err));
socket.on("triggerNuke", playNukeAnimation);

socket.on("answer_progress", ({ answered, total }) => {
  const el = document.getElementById("answerProgress");
  if (el) el.textContent = `${answered} / ${total} answered`;
  const counter = document.getElementById("bannerQuestionText");
  if (counter && window.lastQuizData)
    counter.textContent = `${answered} / ${total} answered`;
});

socket.on("quizAccuracy", (accuracyData) => {
  document.getElementById("chart")?.classList.remove("hidden");
  const ctx = document.getElementById("accuracyChart");
  if (!ctx) return;
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: accuracyData.map((q) => `Q${q.questionNumber}`),
      datasets: [
        {
          label: "Accuracy (%)",
          data: accuracyData.map((q) => q.accuracyPercent),
        },
      ],
    },
    options: { scales: { y: { min: 0, max: 100 } } },
  });
});

socket.on("adminReport", (reports) => {
  lastReportData = reports;
  let html = "<h2>Quiz Results Report</h2>";
  reports.forEach((r) => {
    html += `<div style="border:1px solid #ccc;padding:10px;margin:10px 0;">
      <h3>${r.username} — Score: ${r.score}/${r.totalQuestions}</h3>
      ${r.questions
        .map(
          (q) => `
        <p><strong>Q${q.questionNumber}:</strong> ${q.question}<br>
        <span style="color:${q.isCorrect ? "green" : "red"}">${q.isCorrect ? "✓" : "✗"} ${q.playerAnswer}</span>
        ${!q.isCorrect ? `<br><small>Correct: ${q.correctAnswer}</small>` : ""}</p>
      `,
        )
        .join("")}
    </div>`;
  });
  document.getElementById("adminReportContainer").innerHTML = html;
});

socket.on("player_list", ({ players }) => {
  names = players.map((p) => p.name);
  update_namelist();
});
socket.on("player_joined", ({ players }) => {
  const newest = players[players.length - 1];
  names = players.map((p) => p.name);
  update_namelist();
  if (newest) showJoinToast(newest.name);
});

/* =====================
   AUTO-CREATE FROM URL
===================== */
(function autoCreateFromURL() {
  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get("code")?.trim().toUpperCase();
  const urlName = params.get("name")?.trim();
  const urlQuiz = params.get("quiz");
  if (!urlCode && !urlName && !urlQuiz) return;
  if (urlCode) document.getElementById("roomInput").value = urlCode;
  if (urlName) document.getElementById("roomName").value = urlName;
  let parsedQuiz = null;
  if (urlQuiz) {
    try {
      let raw;
      try {
        raw = JSON.parse(urlQuiz);
      } catch {
        raw = JSON.parse(decodeURIComponent(urlQuiz));
      }
      parsedQuiz = raw.quiz || raw;
    } catch (e) {
      alert("Invalid quiz JSON in URL: " + e.message);
      return;
    }
  }
  const doCreate = () => createRoom(urlCode, urlName, false, parsedQuiz);
  socket.connected ? doCreate() : socket.once("connect", doCreate);
})();
