let names = [];
const socket = io();

/* =====================
   ROOM CREATION
===================== */
const createRoomBtn = document.getElementById("createRoomBtn");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const startQuizBtn = document.getElementById("startQuizBtn");
const endQuizBtn = document.getElementById("endQuizBtn");
const quizInputsContainer = document.getElementById("quizInputs");
const addQuestionBtn = document.getElementById("addQuestionBtn");

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

  // add wrong answer dynamically
  div.querySelector(".addWrongBtn").addEventListener("click", () => {
    const wrongContainer = div.querySelector(".wrong-answers");
    // ── REMOVED: the 3-answer limit, now unlimited ──

    const input = document.createElement("input");
    input.type = "text";
    input.className = "Wrong";
    input.placeholder = "Wrong Answer";
    wrongContainer.appendChild(input);
  });

  // remove question
  div.querySelector(".removeQuestionBtn").addEventListener("click", () => {
    div.remove();
  });

  return div;
}

function addQuestion() {
  const count = document.querySelectorAll(".question-block").length + 1;
  quizInputsContainer.appendChild(createQuestionBlock(count));
}

// start with one question
addQuestion();
addQuestionBtn?.addEventListener("click", addQuestion);

let currentRoom = null;
window.lastQuizData = null; // store quiz data locally

function update_namelist() {
  document.getElementById("namelist").innerText = names.join("\n");
}

createRoomBtn.addEventListener("click", () => {
  let customCode = "";
  if (!roomInput.value) {
    customCode = "CMP";
  } else {
    customCode = roomInput.value;
  }

  socket.emit("create_room", customCode, (response) => {
    if (response.error) {
      alert(response.error);
      return;
    }

    currentRoom = response.roomCode;
    roomCodeDisplay.textContent = `Room Code: ${response.roomCode}`;

    // 🔥 ALWAYS request current players
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

    // ── NEW: collect all wrong answers dynamically ──
    const wrongsObj = {};
    wrongs.forEach((wrong, idx) => {
      wrongsObj[`wrong${idx + 1}`] = wrong;
    });

    quizData.push({
      question,
      choices: {
        correct,
        ...wrongsObj, // spread in however many wrong answers exist
      },
    });
  });

  if (!quizData.length) {
    alert("Add at least one valid question.");
    return;
  }

  socket.emit("quizDataUploaded", {
    roomCode: currentRoom,
    quizData,
  });

  window.lastQuizData = quizData;

  document.getElementById("written").textContent = JSON.stringify(
    quizData,
    null,
    2,
  );

  alert("Quiz uploaded successfully!");
});

/* =====================
   UPLOAD JSON
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

      window.lastQuizData = quizArray; // ✅ Store the array, not wrapper
      console.log("Quiz Data Exists");

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
   START QUIZ
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

  // Start the quiz
  socket.emit("start_quiz", currentRoom);
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
}

const savedTheme = getCookie("theme") || "light";
applyTheme(savedTheme);

document.getElementById("themeToggle").onclick = () => {
  const newTheme = document.body.classList.contains("light") ? "dark" : "light";
  applyTheme(newTheme);
  setCookie("theme", newTheme);
};

/* =====================
   SOCKET EVENTS
===================== */
endQuizBtn.addEventListener("click", () => {
  try {
    socket.emit("endquiz", currentRoom);
    roomCodeDisplay.textContent = `Ending Quiz`;
    setTimeout(() => {
      roomCodeDisplay.textContent = "";
    }, 1000);
  } catch {
    alert("Not In A Room");
  }
});

socket.on("connect", () => console.log("Connected:", socket.id));
socket.on("disconnect", () => console.log("Disconnected"));
socket.on("error", (err) => console.error("Socket error:", err));

socket.on("quizStarted", (data) => {
  console.log("✅ Admin received quizStarted:", data);
});

socket.on("question", (data) => {
  console.log("✅ Admin received question:", data);
});

socket.on("room_joined", (roomCode, username) => {
  console.log("✅ Admin joined room:", roomCode);
});

// ── NEW: Listen for answer progress updates ──
socket.on("answer_progress", ({ answered, total }) => {
  const progressEl = document.getElementById("answerProgress");
  if (progressEl) {
    progressEl.textContent = `${answered} / ${total} answered`;
  }
});

function update_report(reports) {
  let lastReportData = [];
  console.log("Admin Report:", reports);

  lastReportData = reports;

  let reportHTML = "<h2>Quiz Results Report</h2>";

  reports.forEach((report) => {
    reportHTML += `
      <div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
        <h3>${report.username} - Score: ${report.score}/${report.totalQuestions}</h3>
        ${report.questions
          .map(
            (q) => `
              <p>
                <strong>Q${q.questionNumber}:</strong> ${q.question}<br>
                <span style="color: ${q.isCorrect ? "green" : "red"}">
                  ${q.isCorrect ? "✓" : "✗"} Answer: ${q.playerAnswer}
                </span>
                ${
                  !q.isCorrect
                    ? `<br><small>Correct: ${q.correctAnswer}</small>`
                    : ""
                }
              </p>
            `,
          )
          .join("")}
      </div>
    `;
  });

  const container = document.getElementById("adminReportContainer");
  container.innerHTML = reportHTML;
}

socket.on("adminReport", (reports) => {
  update_report(reports);
});

hide_btn = document.getElementById("Hide");
unhide_btn = document.getElementById("unhide");

hide_btn.addEventListener("click", () => {
  document.getElementById("create").classList.add("hidden");
  unhide_btn.classList.remove("hidden");
});
unhide_btn.addEventListener("click", () => {
  document.getElementById("create").classList.remove("hidden");
  unhide_btn.classList.add("hidden");
});

const infoBtn = document.getElementById("Information");
const infoModal = document.getElementById("infoModal");
const closeInfoModal = document.getElementById("closeInfoModal");

infoBtn.addEventListener("click", () => {
  infoModal.classList.remove("hidden");
});

closeInfoModal.addEventListener("click", () => {
  infoModal.classList.add("hidden");
});

infoModal.addEventListener("click", (e) => {
  if (e.target === infoModal) {
    infoModal.classList.add("hidden");
  }
});

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

socket.on("player_list", ({ players }) => {
  console.log("ADMIN players:", players);
  names = players.map((p) => p.name);
  update_namelist();
  socket.emit("get_players", currentRoom);
});

socket.on("player_joined", ({ players }) => {
  console.log("🟢 Player joined:", players);
  names = players.map((p) => p.name);
  update_namelist();
});
