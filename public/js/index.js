const socket = io();

const joinBtn = document.getElementById("join_btn");
const adminbtn = document.getElementById("admin_btn");
const roomInput = document.getElementById("room_code_input");
const gameArea = document.getElementById("game");
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const statusEl = document.getElementById("status");

let currentRoom = null;
let hasAnswered = false;

adminbtn.addEventListener("click", () => {
  window.location.href = "admin.html";
});

/* =====================
   JOIN ROOM
===================== */

joinBtn.addEventListener("click", () => {
  const roomCode = roomInput.value.trim();
  if (!roomCode) {
    alert("Enter a room code");
    return;
  }

  const username = document.getElementById("username").value.trim();
  if (!username) {
    alert("Name required");
    return;
  }

  socket.emit("join_room", { roomCode, username });
});

socket.on("room_joined", (roomCode) => {
  currentRoom = roomCode;
  statusEl.textContent = `Joined room ${roomCode}. Waiting for quiz to start...`;
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
    progressEl.textContent = "0 / 0 answered";
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

socket.on("error", (err) => {
  alert(err.message || "An error occurred");
});
