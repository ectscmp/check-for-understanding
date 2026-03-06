# Quiz App — Setup & Usage Guide

## Setup

1. Clone the repository and navigate into the project folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   node server.js
   ```
4. The app will be running at `http://localhost:3000`.

---

## Pages

| URL               | Description                          |
| ----------------- | ------------------------------------ |
| `/` or `/join`    | Student join page                    |
| `/admin`          | Admin dashboard                      |
| `/join/:roomcode` | Direct join link for a specific room |
| `/create`         | Auto-create a room via URL params    |

---

## Creating a Quiz Room (Admin Dashboard)

1. Go to `/admin`.
2. Enter a **Room Name** and optionally a **Room Code** (defaults to `CMP` if left blank).
3. Choose **Private** or **Public** visibility.
   - Public rooms appear in the room list on the join page.
4. Click **Create Room**.
5. A shareable link will appear — send this to your students so they can join directly.
6. Upload a quiz using one of the methods below, then click **Start Quiz**.

---

## Quiz JSON Format

Quizzes are defined in JSON. Each question has one correct answer and up to three wrong answers.

```json
{
  "quiz": [
    {
      "id": 1,
      "question": "What is the capital of France?",
      "choices": {
        "correct": "Paris",
        "wrong1": "London",
        "wrong2": "Berlin",
        "wrong3": "Madrid"
      }
    },
    {
      "id": 2,
      "question": "What is 2 + 2?",
      "choices": {
        "correct": "4",
        "wrong1": "3",
        "wrong2": "5",
        "wrong3": "22"
      }
    }
  ]
}
```

**Notes:**

- The `id` field is optional but recommended.
- You can include 1–3 wrong answers (`wrong1`, `wrong2`, `wrong3`). All provided choices will be shuffled before being shown to students.
- Save the file with a `.json` extension (e.g., `my-quiz.json`).

### Uploading a Quiz

There are three ways to load a quiz after creating a room:

**Option 1 — Upload a JSON file:** In the _Upload Quiz JSON_ section, click the file input and select your `.json` file.

**Option 2 — Paste JSON directly:** Paste your JSON into the text area in the _Or Paste JSON Directly_ section and click **Load Quiz from Pasted JSON**.

**Option 3 — Use the form:** Use the _Create A Quiz_ form to build questions one by one in the browser, then click **Upload Quiz Data**.

---

## Auto-Create a Room via URL

You can create a room and pre-load a quiz in one step using URL parameters. This is useful for sharing a setup link or scripting room creation.

```
/create?code=ABC&name=My+Quiz&quiz=<URL-encoded JSON>
```

### Parameters

| Parameter | Required | Description                                                 |
| --------- | -------- | ----------------------------------------------------------- |
| `code`    | No       | Custom room code (e.g. `MATH1`). Auto-generated if omitted. |
| `name`    | No       | Display name for the room (e.g. `Chapter 5 Review`).        |
| `quiz`    | No       | URL-encoded quiz JSON string.                               |

### Example

Given this quiz JSON:

```json
{
  "quiz": [
    {
      "id": 1,
      "question": "What is 1+1?",
      "choices": { "correct": "2", "wrong1": "1", "wrong2": "3" }
    }
  ]
}
```

URL-encode it and append it to the `/create` route:

```
http://localhost:3000/create?code=MATH1&name=Math+Quiz&quiz=%7B%22quiz%22%3A%5B%7B%22id%22%3A1%2C%22question%22%3A%22What+is+1%2B1%3F%22%2C%22choices%22%3A%7B%22correct%22%3A%222%22%2C%22wrong1%22%3A%221%22%2C%22wrong2%22%3A%223%22%7D%7D%5D%7D
```

You can URL-encode JSON using any online tool or with JavaScript:

```javascript
const encoded = encodeURIComponent(JSON.stringify(quizData));
const url = `http://localhost:3000/create?code=MATH1&name=My+Quiz&quiz=${encoded}`;
```

When you open that URL in the admin browser, the room is created and the quiz is loaded automatically — just click **Start Quiz**.

---

## Student Flow

1. Students go to `/join` or use the shareable link (e.g. `/join/MATH1`).
2. They enter their name and click **Join Room**.
3. Once the admin starts the quiz, questions appear automatically.
4. After answering, students see their score and a full results breakdown.

---

## Downloading Reports

- **Admin report:** Click **Download Report** on the admin page after the quiz ends. This downloads a JSON file with every player's answers and scores.
- **Student report:** Each student receives their own results automatically at quiz end and can download their personal report from their screen.

Done:

- Json Upload
- dark and light mode selects(saves via a cookie)
- store accuracy locally then only send which questions were right and wrong then user and accuracy to a room code not a room system
- create a room system with one admin and inf users
- display multiple chose answers from json file
- room names
- user is shown 1 question at a time and cant move on until answered
- do not check accuracy till end
- room codes (if none provided defualt to CMP)
- Force instructions upon first launch (save launch data as cookie that expiries every 48hrs)
- Ability to paste in json text
- Hide Join section after joining.
- fix constant sending of player list to end on start of quiz
  Player reports update after each question
- share urls
- admin kick
- create rooms with url
- pass in json with url
  TO-DO

  persistent rooms
  quiz that starts at different points and allows users to join while its running
