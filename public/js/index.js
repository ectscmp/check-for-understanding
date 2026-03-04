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

  // Update theme button emoji
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) {
    themeBtn.textContent = theme === "light" ? "🌙" : "☀️";
  }
}

// Load saved theme
const savedTheme = getCookie("theme") || "light";
applyTheme(savedTheme);

// Theme toggle button handler
const themeToggleBtn = document.getElementById("themeToggle");
if (themeToggleBtn) {
  themeToggleBtn.onclick = () => {
    const newTheme = document.body.classList.contains("light")
      ? "dark"
      : "light";
    applyTheme(newTheme);
    setCookie("theme", newTheme);
  };
}

function playNukeAnimation() {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "nukeOverlay";
  overlay.innerHTML = `
    <div class="nuke-flash"></div>
    <div class="nuke-shockwave"></div>
    <div class="nuke-shockwave" style="animation-delay: 0.2s;"></div>
    <div class="nuke-shockwave" style="animation-delay: 0.4s;"></div>
    <div class="nuke-text">💥 NUKE INCOMING! 💥</div>
  `;
  document.body.appendChild(overlay);

  // Add shake effect
  document.body.style.animation = "shake 0.5s infinite";

  // Remove overlay, then play video
  setTimeout(() => {
    overlay.remove();
    document.body.style.animation = "";

    // Create video
    const video = document.createElement("video");
    video.src = "./nuke.mp4";
    video.autoplay = true;
    video.muted = true; // required for autoplay
    video.playsInline = true;
    video.controls = false;

    // Fullscreen styling
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

    // Request fullscreen
    if (video.requestFullscreen) {
      video.requestFullscreen().catch(() => {});
    }

    video.play();

    // Optional: remove video when finished
    video.onended = () => {
      video.remove();
    };
  }, 5000);
}

// Add styles dynamically
const nukeStyles = document.createElement("style");
nukeStyles.textContent = `
  #nukeOverlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 999999;
    pointer-events: none;
    overflow: hidden;
  }

  .nuke-flash {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, 
      rgba(255, 255, 255, 1) 0%, 
      rgba(255, 200, 0, 0.8) 20%, 
      rgba(255, 100, 0, 0.4) 50%,
      transparent 70%
    );
    animation: flash 1s ease-out;
  }

  .nuke-shockwave {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100px;
    height: 100px;
    border: 5px solid rgba(255, 100, 0, 0.8);
    border-radius: 50%;
    animation: shockwave 2s ease-out;
  }

  .nuke-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 4rem;
    font-weight: bold;
    color: #ff0000;
    text-shadow: 0 0 20px #ff0000, 0 0 40px #ff6600, 0 0 60px #ffaa00;
    animation: pulse 0.5s infinite, textShake 0.1s infinite;
    z-index: 10;
  }

  @keyframes flash {
    0% {
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes shockwave {
    0% {
      width: 100px;
      height: 100px;
      opacity: 1;
    }
    100% {
      width: 200vmax;
      height: 200vmax;
      opacity: 0;
    }
  }

  @keyframes pulse {
    0%, 100% {
      transform: translate(-50%, -50%) scale(1);
    }
    50% {
      transform: translate(-50%, -50%) scale(1.1);
    }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0) translateY(0) rotate(0deg); }
    10% { transform: translateX(-5px) translateY(-5px) rotate(-1deg); }
    20% { transform: translateX(5px) translateY(5px) rotate(1deg); }
    30% { transform: translateX(-5px) translateY(5px) rotate(-1deg); }
    40% { transform: translateX(5px) translateY(-5px) rotate(1deg); }
    50% { transform: translateX(-5px) translateY(-5px) rotate(-1deg); }
    60% { transform: translateX(5px) translateY(5px) rotate(1deg); }
    70% { transform: translateX(-5px) translateY(5px) rotate(-1deg); }
    80% { transform: translateX(5px) translateY(-5px) rotate(1deg); }
    90% { transform: translateX(-5px) translateY(-5px) rotate(-1deg); }
  }

  @keyframes textShake {
    0%, 100% { transform: translate(-50%, -50%); }
    25% { transform: translate(-52%, -50%); }
    50% { transform: translate(-50%, -52%); }
    75% { transform: translate(-48%, -50%); }
  }
`;
document.head.appendChild(nukeStyles);

/* =====================
   NAVIGATION
===================== */
adminbtn.addEventListener("click", () => {
  window.location.href = "/admin";
});

/* =====================
   JOIN ROOM
===================== */

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
  const roomCode = URL_ROOM_CODE || roomInput.value.trim();
  const username = document.getElementById("username").value.trim();
  joinRoom(roomCode, username);
});

/* =====================
   PUBLIC ROOMS LIST
===================== */

function fetchPublicRooms() {
  // Don't fetch if already joined a room
  if (room_joined) {
    console.log("⏸️ Skipping fetch - already in a room");
    return;
  }

  console.log("🔍 Fetching public rooms...");
  socket.emit("get_public_rooms", (rooms) => {
    console.log("✅ Received public rooms:", rooms);
    displayPublicRooms(rooms);
  });
}

function displayPublicRooms(rooms) {
  const container = document.getElementById("publicRoomsList");

  if (!container) return; // Exit if container doesn't exist

  if (!rooms || rooms.length === 0) {
    container.innerHTML = `
      <p style="text-align: center; color: #94a3b8; padding: 20px;">
        No public rooms available right now
      </p>
    `;
    return;
  }

  let roomsHTML = '<div class="room-list">';

  rooms.forEach((room) => {
    roomsHTML += `
      <div class="room-item">
        <div class="room-info">
          <strong style="font-size: 16px;">${room.roomName}</strong>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">
            Code: ${room.roomCode} • ${room.playerCount} player(s)
            ${room.hasQuiz ? "✓ Quiz Ready" : "⏳ No quiz yet"}
          </div>
        </div>
        <div class="room-actions">
          <button 
            onclick="quickJoinRoom('${room.roomCode}')" 
            style="width: auto; padding: 8px 16px; margin: 0;"
          >
            Join
          </button>
        </div>
      </div>
    `;
  });

  roomsHTML += "</div>";
  container.innerHTML = roomsHTML;
}

// Quick join function for public rooms
window.quickJoinRoom = function (roomCode) {
  const username = document.getElementById("username").value.trim();

  if (!username) {
    alert("Please enter your name first!");
    document.getElementById("username").focus();
    return;
  }

  joinRoom(roomCode, username);
};

// Refresh button
const refreshRoomsBtn = document.getElementById("refreshRoomsBtn");
if (refreshRoomsBtn) {
  refreshRoomsBtn.addEventListener("click", fetchPublicRooms);
}

// Listen for real-time updates
socket.on("public_rooms_updated", () => {
  console.log("📢 Public rooms updated");
  fetchPublicRooms();
});

// Initial fetch when socket connects
socket.on("connect", () => {
  console.log("🔌 Connected to server");
  fetchPublicRooms(); // Fetch rooms on connection
});

// ── Listen for nuke trigger ──
socket.on("triggerNuke", () => {
  console.log("💥 NUKE TRIGGERED!");
  playNukeAnimation();
});

socket.on("room_joined", (roomCode) => {
  currentRoom = roomCode;
  statusEl.textContent = `Joined room ${roomCode}. Waiting for quiz to start...`;
  document.querySelectorAll(".hide_on_join").forEach((element) => {
    element.classList.add("hidden");
  });
});

/* =====================
   QUIZ FLOW
===================== */

socket.on("quizStarted", ({ totalQuestions }) => {
  statusEl.textContent = `Quiz started! (${totalQuestions} questions)`;
});

socket.on("question", ({ question, options, questionNumber }) => {
  console.log("✅ question received:", { question, options, questionNumber });
  hasAnswered = false;
  gameArea.style.display = "block";
  answersEl.innerHTML = "";

  // ── Reset progress display for new question ──
  const progressEl = document.getElementById("progress");
  if (progressEl) {
    progressEl.textContent = "0  answered";
  }

  questionEl.textContent = `Q${questionNumber}: ${question}`;

  options.forEach((option) => {
    const btn = document.createElement("button");
    btn.textContent = option;
    btn.className = "answer-btn";

    btn.onclick = () => {
      if (hasAnswered) return;
      hasAnswered = true;

      socket.emit("submit_answer", {
        roomCode: currentRoom,
        answer: option,
      });

      statusEl.textContent = "Answer submitted. Waiting for others...";
      disableButtons();
    };

    answersEl.appendChild(btn);
  });
});

function disableButtons() {
  document.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.disabled = true;
  });
}

/* =====================
   ANSWER PROGRESS
===================== */

socket.on("answer_progress", ({ answered, total }) => {
  const progressEl = document.getElementById("progress");
  if (progressEl) {
    progressEl.textContent = `${answered} / ${total} answered`;
  }
});

/* =====================
   PLAYER REPORT
===================== */

function displayPlayerReport(report) {
  console.log("📊 Player Report:", report);
  playerReportData = report;

  // Create or update report container
  let reportContainer = document.getElementById("playerReportContainer");
  if (!reportContainer) {
    reportContainer = document.createElement("div");
    reportContainer.id = "playerReportContainer";
    document.body.appendChild(reportContainer);
  }

  let reportHTML = `
    <h2>Your Results</h2>
    <h3>Score: ${report.score} / ${report.totalQuestions}</h3>
    <div>
  `;

  report.questions.forEach((q) => {
    const statusClass = q.isCorrect ? "report-correct" : "report-incorrect";
    const statusText = q.isCorrect ? "✓ Correct!" : "✗ Incorrect";

    reportHTML += `
      <div class="report-question">
        <p>
          <strong>Q${q.questionNumber}:</strong> ${q.question}
        </p>
        <p class="${statusClass}">
          ${statusText}
        </p>
        <p class="report-your-answer">
          Your answer: <strong>${q.playerAnswer}</strong>
        </p>
        ${
          !q.isCorrect
            ? `<p class="report-correct-answer">Correct answer: <strong>${q.correctAnswer}</strong></p>`
            : ""
        }
      </div>
    `;
  });

  reportContainer.innerHTML = reportHTML;

  // Add download functionality
  document
    .getElementById("downloadPlayerReportBtn")
    .addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(playerReportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-quiz-report-${report.username}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
}

socket.on("playerReport", (report) => {
  displayPlayerReport(report);
});

/* =====================
   RESULTS
===================== */

socket.on("question_results", ({ correctAnswer, scores }) => {
  statusEl.textContent = `Correct answer: ${correctAnswer}`;
});

socket.on("quizResults", ({ finalScores }) => {
  gameArea.style.display = "none";
  statusEl.innerHTML = "<h2>Quiz Finished!</h2>";

  finalScores.forEach((player) => {
    const p = document.createElement("p");
    p.textContent = `${player.name}: ${player.score}`;
    statusEl.appendChild(p);
  });
});

/* =====================
   ERRORS
===================== */
// ── Auto-join from /join/ROOMCODE ──
if (urlParts[1] === "join" && urlParts[2]) {
  const urlRoomCode = urlParts[2].trim().toUpperCase();

  // Hide room code input, pre-fill it
  roomInput.value = urlRoomCode;
  roomInput.classList.add("hidden");
  document.getElementById("username").placeholder =
    `Enter your name to join ${urlRoomCode}`;

  // Remove the existing joinBtn listener by cloning it
  const oldBtn = joinBtn;
  const newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);

  newBtn.addEventListener("click", () => {
    const username = document.getElementById("username").value.trim();
    if (!username) {
      alert("Please enter your name");
      return;
    }
    joinRoom(urlRoomCode, username);
  });
}
socket.on("error", (err) => {
  alert(err.message || "An error occurred");
});

socket.on("kicked", () => {
  console.log("kicked");
  alert("You were kicked from the room.");

  window.location.href = "/";
});
