# 🐾 AI Companions — Meet Luna

> **An AI companion that lives on your desktop.** Talk to Luna, give her tasks, and keep your AI conversations close while you work.

AI Companions is an experimental Windows desktop application that brings an AI companion out of the browser and onto your desktop. Luna appears as a small floating character and connects to a dedicated chat workspace powered by Google Gemma 4.

The project explores a different way to work with AI: instead of opening a separate chatbot every time you need help, your companion is always nearby when you need her.

> **Project status:** Hackathon Submission Ready. The implementation includes the desktop companion, Gemma 4 multimodal reasoning (`gemma-4-26b-a4b-it`), occlusion-free Screen Vision with guaranteed window restoration, Developer Code Debugger with scoped project security, Grounded Live Web Research (synthesized answers with clickable source citations directly inside chat with no browser popups), lightweight file monitoring, conversation isolation, persistence, and rich Markdown/code rendering.

---

## ✨ Why AI Companions?

Most AI assistants live inside a browser tab or a separate application. AI Companions explores a more present, approachable experience: an AI character that lives on the desktop and opens a dedicated workspace when you need help.

The idea: make AI feel present, approachable, and useful during everyday work.

---

## 🐱 Meet Luna

Luna is the first desktop companion in the project:

* **Desktop presence:** A floating character window that can be moved around the desktop.
* **Quick interaction:** Interact with Luna through the companion UI and context menu.
* **Task workspace:** Open a dedicated chat/result window for tasks and conversations.
* **Gemma 4-powered answers:** Uses Google's multimodal `gemma-4-26b-a4b-it` model via `@google/genai` for vision, reasoning, and synthesis.
* **Streaming responses:** See generated text progressively in real time.
* **Conversation history:** Keep chats separate and reopen previous conversations anytime.
* **Developer-friendly output:** Render Markdown and code blocks with language labels and copy controls.

---

## 🚀 Current Features

### Desktop Companion
* Transparent, frameless floating companion window.
* Always-on-top desktop presence.
* Dragging and placement controls.
* Roaming and sleep/wake interactions.
* Native context-menu actions for common interactions.
* Global summon shortcut (`Alt+Space` or `Ctrl+Shift+L`).

### AI Chat & Gemma 4
* Gemma 4 integration through the official `@google/genai` SDK (`gemma-4-26b-a4b-it`).
* Intent-based workflow routing (chat, screen inspection, developer diagnosis, web research).
* Streaming responses in the chat workspace.
* Concise answers by default, with structured depth for complex requests.
* Markdown rendering for headings, lists, links, inline code, and syntax-highlighted blocks with one-click copy buttons.

### Screen Doctor & Vision
* **Zero-occlusion screen capture:** Luna's pet window and chat window are temporarily hidden before capturing the screen and guaranteed to be restored in a `finally` block even on capture errors.
* Real multimodal visual understanding using Gemma 4 Vision.

### Developer Debugging Mode
* Explicit folder picker to connect the active project root.
* Strict directory traversal protection preventing escape outside the authorized workspace.
* Automatic exclusion of sensitive files (`.env`, keys, credentials) and heavy directories (`node_modules`, build output).
* Evidence-based code diagnostics linking visible errors and stack traces to actual source files.

### Grounded Live Web Research
* Google Search grounding built into the Gemma 4 pipeline.
* Queries such as *"What's trending in AI today?"* or *"Latest React updates"* synthesize live search findings into chat.
* Clickable source badges with domain names and URLs directly inside Luna's result window — never forces unwanted browser popups.

### Lightweight Monitoring
* File/log modification monitor to watch build logs or output files and alert the user when changes occur.

### Conversation Management
* Start a new, separate conversation with a single click.
* Reopen saved conversations from the slide-out history drawer.
* Store conversation history locally in the application's user-data directory.
* Unique conversation IDs ensure strict context isolation; old history never leaks into new chats.
* Delete individual conversations or clear entire history.
* Preserve conversation titles automatically generated from the first user request.

### Quality & Testing
* Automated 14-point regression suite covering conversation isolation, persistence, message ordering, streaming behavior, Markdown rendering, and multi-turn chat.
* Full production Vite build verified.

---

## 🧱 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Desktop Runtime** | Electron (v38+) |
| **Frontend Framework** | React 19 + TypeScript |
| **Build Tooling** | Vite 7 |
| **AI Model & SDK** | Google Gemma 4 (`gemma-4-26b-a4b-it`) via `@google/genai` |
| **IPC Bridge** | Electron ContextBridge & Preload API |
| **Storage** | Local JSON file storage in app `userData` |
| **Styling** | Vanilla CSS (Glassmorphism, animations, dark mode) |

---

## 🏗️ Architecture Overview

```text
┌────────────────────────────────────────────┐
│              Windows Desktop               │
│                                            │
│   ┌──────────────┐    ┌─────────────────┐  │
│   │ Luna Pet     │    │ Chat / Results  │  │
│   │ Electron     │    │ React + Vite    │  │
│   └──────┬───────┘    └────────┬────────┘  │
│          └──────────┬──────────┘           │
│                     │ IPC                  │
│              ┌──────▼───────┐              │
│              │ Preload API  │              │
│              └──────┬───────┘              │
│                     │                      │
│          ┌──────────▼──────────┐           │
│          │ Electron Main       │           │
│          │ Windows + IPC       │           │
│          └──────┬────────┬─────┘           │
│                 │        │                 │
│        ┌────────▼───┐ ┌──▼────────────┐    │
│        │ Gemma 4    │ │ Conversation  │    │
│        │ AI service │ │ Store         │    │
│        └────────────┘ └───────────────┘    │
└────────────────────────────────────────────┘
```

The renderer handles the user interface. The Electron main process owns privileged desktop operations and local persistence. A secure preload bridge exposes only safe IPC methods to the renderer. AI requests are handled through the backend service rather than exposing Node.js or unrestricted filesystem access to the UI.

---

## 🛠️ Getting Started

### Prerequisites

* **Operating System:** Windows 10 or later
* **Runtime:** Node.js 20+ and npm
* **API Key:** A Google GenAI API key with access to Gemma 4

Check your environment:
```bash
node --version
npm --version
```

### 1. Clone the Repository

```bash
git clone https://github.com/ShraddhaNigam19/AI-Companion.git
cd AI-Companion
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure the API Key

Create a `.env` file in the project root:
```env
GEMINI_API_KEY=your_google_genai_api_key
```

> [!IMPORTANT]
> Never commit your `.env` file or paste API keys into source files, issues, or pull requests. The repository's `.gitignore` automatically excludes `.env`.

### 4. Start the Application

```bash
npm run dev
```

This starts the Vite development server and launches the Electron desktop companion window.

### 5. Build for Production

```bash
npm run build
```

This compiles TypeScript and bundles the client frontend via Vite into the `dist/` folder.

---

## 🧪 Tests & Quality Assurance

Run the automated regression test suite:

```bash
node test-regression-suite.cjs
```

The 14-point regression suite verifies:
1. Fresh conversations start with zero messages.
2. Adding user tasks and assistant responses.
3. Follow-up questions receive context from the active conversation.
4. Starting a new conversation removes all previous context from model requests.
5. Switching to an older conversation loads only that conversation's messages.
6. Closing and reopening the app restores saved conversations.
7. Deleting a conversation removes it from persistent storage.
8. Clearing history removes all conversations after confirmation.
9. Stream events started in one conversation cannot modify another conversation.
10. Stream events and final result events do not duplicate messages.
11. Conversation titles are stable and derived from the first user request.
12. Markdown rendering handles code blocks, lists, links, and streaming tokens.
13. Unrelated prompts in a new chat never inherit previous chat context.
14. Basic questions, coding responses, and multi-turn follow-ups work smoothly.

---

## 🔐 Privacy & Safety

* **Local Storage:** Conversation history is stored locally on your device in the Electron `userData` directory.
* **Credentials:** All API credentials are read exclusively from environment variables.
* **Scoped Inspection:** File inspection is strictly confined to user-selected project folders with directory traversal protection.
* **Secret Protection:** Sensitive files (`.env`, private keys, certificates) and heavy directories are automatically excluded from model context.
* **Explicit Permissions:** Luna requests confirmation before capturing your screen or inspecting workspace directories.

---

## 📁 Project Structure

```text
ai-companions-mvp/
├── electron/
│   ├── main.cjs                 # Electron main process and window manager
│   ├── preload.cjs              # Secure renderer-to-main IPC bridge
│   ├── gemma.cjs                # Gemma 4 & Google GenAI API integration
│   ├── conversationStore.cjs    # Persistent local conversation storage
│   ├── screenCapture.cjs        # Safe zero-occlusion screen capture
│   ├── projectInspector.cjs     # Scoped code debugging & inspection
│   ├── monitoringService.cjs    # File & build log change monitor
│   └── tools/
│       └── windowsTools.cjs     # Native system tools (time, volume, apps)
├── src/
│   ├── App.tsx                  # React UI: Floating companion & chat workspace
│   ├── main.tsx                 # React entry point
│   └── styles.css               # Modern glassmorphism dark theme styling
├── test-regression-suite.cjs    # 14-point automated test suite
├── test-conversation-memory.cjs # Multi-turn conversational memory test
├── package.json                 # Project scripts and dependencies
├── tsconfig.json                # TypeScript configuration
├── vite.config.js               # Vite build configuration
├── LICENSE                      # MIT License
└── .env.example                 # Environment variable template
```

---

## 🏆 Hackathon Demo Flow

1. **Summon Luna:** Show Luna floating on the desktop and demonstrate dragging/placement.
2. **Assign a Task:** Enter a task via Luna's pet widget or summon the chat workspace.
3. **Inspect the Answer:** Observe clean streaming Markdown output and syntax-highlighted code blocks with one-click copy.
4. **Follow-Up:** Ask a contextual follow-up question in the same chat.
5. **New Chat Isolation:** Start a new chat and show that previous context is cleanly reset.
6. **Chat History:** Open the history drawer, restore earlier chats, or delete conversations.
7. **Screen Vision:** Click **📸 Screen** to let Luna hide herself, capture the display, and provide visual diagnosis.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

## 💡 The Vision

AI should not only be a destination you visit in a browser tab. It can be a companion that lives alongside your daily workflow, understands what you choose to show it, and helps you move smoothly from an idea to execution.

AI Companions is an exploration in making that interaction feel natural, responsive, and delightful.

---

*Built for the Google AI Hackathon with Electron, React, and Gemma 4.*