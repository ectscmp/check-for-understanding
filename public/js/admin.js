let names = [];
const socket = io();
let lastReportData = [];

/* =====================
   ROOM CREATION
===================== */
const createRoomBtn = document.getElementById("createRoomBtn");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const startQuizBtn = document.getElementById("startQuizBtn");
const endQuizBtn = document.getElementById("endQuizBtn");
const quizInputsContainer = document.getElementById("quizInputs");
const addQuestionBtn = document.getElementById("addQuestionBtn");

// ── Share link elements ──
const shareBox = document.getElementById("shareBox");
const shareUrlEl = document.getElementById("shareUrl");
const copyLinkBtn = document.getElementById("copyLinkBtn");

function showShareLink(roomCode) {
  const url = `${window.location.origin}/join/${roomCode}`;
  shareUrlEl.value = url;
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
      // Fallback for older browsers
      shareUrlEl.select();
      document.execCommand("copy");
      copyLinkBtn.textContent = "Copied!";
      setTimeout(() => {
        copyLinkBtn.textContent = "Copy";
      }, 2000);
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
    <button class="removeQuestionBtn">🗑 Remove Question</button>
    <hr />
  `;

  div.querySelector(".addWrongBtn").addEventListener("click", () => {
    const wrongContainer = div.querySelector(".wrong-answers");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "Wrong";
    input.placeholder = "Wrong Answer";
    wrongContainer.appendChild(input);
  });

  div.querySelector(".removeQuestionBtn").addEventListener("click", () => {
    div.remove();
  });

  return div;
}

function addQuestion() {
  const count = document.querySelectorAll(".question-block").length + 1;
  quizInputsContainer.appendChild(createQuestionBlock(count));
}

addQuestion(); // start with one question
addQuestionBtn?.addEventListener("click", addQuestion);

let currentRoom = null;
window.lastQuizData = null;

function update_namelist() {
  document.getElementById("namelist").innerText = names.join("\n");
}

/* =====================
   CREATE ROOM
===================== */
createRoomBtn.addEventListener("click", () => {
  const roomNameInput = document.getElementById("roomName");
  const isPublic = document.getElementById("publicRadio").checked;
  const roomInput = document.getElementById("roomInput");

  let customCode = roomInput.value.trim() || "CMP";

  socket.emit("create_room", customCode, (response) => {
    if (response.error) {
      alert(response.error);
      return;
    }

    document.getElementById("json").classList.remove("hidden");
    document.getElementById("create").classList.remove("hidden");

    currentRoom = response.roomCode;
    roomCodeDisplay.textContent = `Room Code: ${response.roomCode}`;

    // ── Show shareable link ──
    showShareLink(response.roomCode);

    socket.emit("update_room_settings", {
      roomCode: currentRoom,
      isPublic,
      roomName: roomNameInput.value.trim() || "Unnamed Room",
    });

    socket.emit("get_players", currentRoom);
  });
});

/* =====================
   CREATE QUIZ FROM INPUTS
===================== */
const createQuizBtn = document.getElementById("createQuizBtn");

createQuizBtn.addEventListener("click", () => {
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
    wrongs.forEach((wrong, idx) => {
      wrongsObj[`wrong${idx + 1}`] = wrong;
    });

    quizData.push({
      question,
      choices: { correct, ...wrongsObj },
    });
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
const fileInput = document.getElementById("fileInput");

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (!currentRoom) {
        alert("Create a room first!");
        return;
      }

      const quizData = JSON.parse(reader.result);
      const quizArray = quizData.quiz || quizData;

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
    } catch (err) {
      document.getElementById("output").textContent = "Invalid JSON file";
    }
  };
  reader.readAsText(file);
});

/* =====================
   START / END QUIZ
===================== */
startQuizBtn.addEventListener("click", () => {
  if (!currentRoom) {
    alert("Create a room first!");
    return;
  }
  if (!window.lastQuizData) {
    alert("Create or upload quiz before starting!");
    return;
  }

  socket.emit("quizDataUploaded", {
    roomCode: currentRoom,
    quizData: window.lastQuizData,
  });
  socket.emit("start_quiz", currentRoom);
});

endQuizBtn.addEventListener("click", () => {
  try {
    socket.emit("endquiz", currentRoom);
    roomCodeDisplay.textContent = "Ending Quiz…";
    setTimeout(() => {
      roomCodeDisplay.textContent = "";
    }, 1000);
  } catch {
    alert("Not in a room");
  }
});

/* =====================
   THEME TOGGLE
===================== */
function setCookie(name, value, days = 365) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
}

function getCookie(name) {
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    const [key, value] = cookie.split("=");
    if (key === name) return value;
  }
  return null;
}

function applyTheme(theme) {
  document.body.classList.remove("light", "dark");
  document.body.classList.add(theme);
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) themeBtn.textContent = theme === "light" ? "🌙" : "☀️";
}

const savedTheme = getCookie("theme") || "light";
applyTheme(savedTheme);

document.getElementById("themeToggle").onclick = () => {
  const newTheme = document.body.classList.contains("light") ? "dark" : "light";
  applyTheme(newTheme);
  setCookie("theme", newTheme);
};

/* =====================
   NUKE ANIMATION
===================== */
function playNukeAnimation() {
  const overlay = document.createElement("div");
  overlay.id = "nukeOverlay";
  overlay.innerHTML = `
    <div class="nuke-flash"></div>
    <div class="nuke-shockwave"></div>
    <div class="nuke-shockwave" style="animation-delay:0.2s"></div>
    <div class="nuke-shockwave" style="animation-delay:0.4s"></div>
    <div class="nuke-text">💥 NUKE INCOMING! 💥</div>
  `;
  document.body.appendChild(overlay);
  document.body.style.animation = "shake 0.5s infinite";

  setTimeout(() => {
    overlay.remove();
    document.body.style.animation = "";
    const video = document.createElement("video");
    video.src = "./nuke.mp4";
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
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
    if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
    video.play();
    video.onended = () => video.remove();
  }, 5000);
}

const nukeStyles = document.createElement("style");
nukeStyles.textContent = `
  #nukeOverlay { position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;pointer-events:none;overflow:hidden; }
  .nuke-flash { position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,1) 0%,rgba(255,200,0,.8) 20%,rgba(255,100,0,.4) 50%,transparent 70%);animation:flash 1s ease-out; }
  .nuke-shockwave { position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100px;height:100px;border:5px solid rgba(255,100,0,.8);border-radius:50%;animation:shockwave 2s ease-out; }
  .nuke-text { position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:4rem;font-weight:bold;color:#f00;text-shadow:0 0 20px #f00,0 0 40px #f60,0 0 60px #fa0;animation:pulse .5s infinite,textShake .1s infinite;z-index:10; }
  @keyframes flash{0%{opacity:0}10%{opacity:1}100%{opacity:0}}
  @keyframes shockwave{0%{width:100px;height:100px;opacity:1}100%{width:200vmax;height:200vmax;opacity:0}}
  @keyframes pulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.1)}}
  @keyframes shake{0%,100%{transform:none}10%{transform:translateX(-5px) translateY(-5px) rotate(-1deg)}20%{transform:translateX(5px) translateY(5px) rotate(1deg)}30%{transform:translateX(-5px) translateY(5px) rotate(-1deg)}40%{transform:translateX(5px) translateY(-5px) rotate(1deg)}}
  @keyframes textShake{0%,100%{transform:translate(-50%,-50%)}25%{transform:translate(-52%,-50%)}50%{transform:translate(-50%,-52%)}75%{transform:translate(-48%,-50%)}}
`;
document.head.appendChild(nukeStyles);

/* =====================
   SOCKET EVENTS
===================== */
socket.on("connect", () => console.log("Connected:", socket.id));
socket.on("disconnect", () => console.log("Disconnected"));
socket.on("error", (err) => console.error("Socket error:", err));

socket.on("triggerNuke", () => {
  console.log("💥 NUKE TRIGGERED!");
  playNukeAnimation();
});

socket.on("quizStarted", (data) =>
  console.log("✅ Admin received quizStarted:", data),
);
socket.on("question", (data) =>
  console.log("✅ Admin received question:", data),
);

socket.on("room_joined", (roomCode) => {
  console.log("✅ Admin joined room:", roomCode);
});

socket.on("answer_progress", ({ answered, total }) => {
  const progressEl = document.getElementById("answerProgress");
  if (progressEl) progressEl.textContent = `${answered} / ${total} answered`;
});

socket.on("quizAccuracy", (accuracyData) => {
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

function update_report(reports) {
  console.log("📊 Admin Report Update:", reports);
  lastReportData = reports;

  let reportHTML = "<h2>Quiz Results Report</h2>";
  reports.forEach((report) => {
    reportHTML += `
      <div style="border:1px solid #ccc;padding:10px;margin:10px 0;">
        <h3>${report.username} — Score: ${report.score}/${report.totalQuestions}</h3>
        ${report.questions
          .map(
            (q) => `
          <p>
            <strong>Q${q.questionNumber}:</strong> ${q.question}<br>
            <span style="color:${q.isCorrect ? "green" : "red"}">
              ${q.isCorrect ? "✓" : "✗"} Answer: ${q.playerAnswer}
            </span>
            ${!q.isCorrect ? `<br><small>Correct: ${q.correctAnswer}</small>` : ""}
          </p>
        `,
          )
          .join("")}
      </div>
    `;
  });

  document.getElementById("adminReportContainer").innerHTML = reportHTML;
}

socket.on("adminReport", (reports) => update_report(reports));

/* =====================
   HIDE / SHOW FORM
===================== */
const hide_btn = document.getElementById("Hide");
const unhide_btn = document.getElementById("unhide");

hide_btn.addEventListener("click", () => {
  document.getElementById("create").classList.add("hidden");
  unhide_btn.classList.remove("hidden");
});
unhide_btn.addEventListener("click", () => {
  document.getElementById("create").classList.remove("hidden");
  unhide_btn.classList.add("hidden");
});

/* =====================
   INFO MODAL
===================== */
const infoBtn = document.getElementById("Information");
const infoModal = document.getElementById("infoModal");
const closeInfoModal = document.getElementById("closeInfoModal");

infoBtn.addEventListener("click", () => infoModal.classList.remove("hidden"));

closeInfoModal.addEventListener("click", () => {
  infoModal.classList.add("hidden");
  setCookie("info-seen", "true");
});

infoModal.addEventListener("click", (e) => {
  if (e.target === infoModal) {
    infoModal.classList.add("hidden");
    setCookie("info-seen", "true");
  }
});

/* =====================
   DOWNLOAD REPORT
===================== */
document.getElementById("downloadReportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(lastReportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quiz-report.json";
  a.click();
  URL.revokeObjectURL(url);
});

/* =====================
   PLAYER LIST
===================== */
socket.on("player_list", ({ players }) => {
  names = players.map((p) => p.name);
  update_namelist();
});

socket.on("player_joined", ({ players }) => {
  names = players.map((p) => p.name);
  update_namelist();
});

/* =====================
   INFO COOKIE
===================== */
function hasValidInfoCookie() {
  return getCookie("info-seen") === "true";
}

document.addEventListener("DOMContentLoaded", () => {
  if (!hasValidInfoCookie()) infoModal.classList.remove("hidden");
});

/* =====================
   PASTE JSON
===================== */
const jsonTextarea = document.getElementById("jsonTextarea");
const loadJsonBtn = document.getElementById("loadJsonBtn");
const pasteOutput = document.getElementById("pasteOutput");

loadJsonBtn.addEventListener("click", () => {
  const jsonText = jsonTextarea.value.trim();
  if (!jsonText) {
    alert("Please paste some JSON first!");
    return;
  }
  if (!currentRoom) {
    alert("Create a room first!");
    return;
  }

  try {
    const quizData = JSON.parse(jsonText);
    const quizArray = quizData.quiz || quizData;

    socket.emit("quizDataUploaded", {
      roomCode: currentRoom,
      quizData: quizArray,
    });
    window.lastQuizData = quizArray;

    pasteOutput.textContent = "✅ Quiz loaded successfully!";
    pasteOutput.style.color = "green";
    document.getElementById("output").textContent = JSON.stringify(
      quizArray,
      null,
      2,
    );
  } catch (err) {
    pasteOutput.textContent = "❌ Invalid JSON format: " + err.message;
    pasteOutput.style.color = "red";
  }
});
