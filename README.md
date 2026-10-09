🐾 AI Companions --- Meet Luna

> An AI companion that lives on your desktop. Talk to Luna, give her
> tasks, and keep your AI conversations close while you work.
AI Companions is an experimental Windows desktop application that brings
an AI companion out of the browser and onto your desktop. Luna appears
as a small floating character and connects to a dedicated chat workspace
powered by Gemma 4.
The project explores a different way to work with AI: instead of opening
a separate chatbot every time you need help, your companion is already
nearby when you need her.
> **Project status:** Hackathon Submission Ready. The implementation
> includes the desktop companion, Gemma 4 multimodal reasoning (`gemma-4-26b-a4b-it`),
> occlusion-free Screen Vision with guaranteed window restoration, Developer Code Debugger
> with scoped project security, Grounded Live Web Research (synthesized answers with
> clickable source citations directly inside chat with no browser popups), lightweight file monitoring,
> conversation isolation, persistence, and rich Markdown/code rendering.
✨ Why AI Companions?
Most AI assistants live inside a browser tab or a separate application.
AI Companions explores a more present, approachable experience: an AI
character that lives on the desktop and opens a dedicated workspace when
you need help.
The idea: make AI feel present, approachable, and useful during
everyday work.
🐱 Meet Luna
Luna is the first desktop companion in the project.
Desktop presence: a floating character window that can be moved
around the desktop.
Quick interaction: interact with Luna through the companion UI
and context menu.
Task workspace: open a dedicated chat/result window for tasks
and conversations.
Gemma 4-powered answers: use Google's multimodal `gemma-4-26b-a4b-it`
model via `@google/genai` for vision, reasoning, and synthesis.
Streaming responses: see generated text progressively.
Conversation history: keep chats separate and reopen previous
conversations.
Developer-friendly output: render Markdown and code blocks with
language labels and copy controls.
🚀 Current Features
Desktop companion
Transparent, frameless floating companion window.
Always-on-top desktop presence.
Dragging and placement controls.
Roaming and sleep/wake interactions.
Native context-menu actions for common interactions.
Global summon shortcut (Alt+Space or Ctrl+Shift+L).
AI chat & Gemma 4
Gemma 4 integration through the official `@google/genai` SDK.
Intent-based workflow routing (chat, screen inspection, developer diagnosis, web research).
Streaming responses in the chat workspace.
Concise answers by default, with structured depth for complex requests.
Markdown rendering for headings, lists, links, inline code, and syntax-highlighted blocks with copy controls.
Screen Doctor & Vision
Zero-occlusion screen capture: Luna's pet window and chat window are temporarily hidden before taking the screenshot and guaranteed to be restored in a `finally` block even on capture errors.
Real multimodal visual understanding using Gemma 4 Vision.
Developer Debugging Mode
Explicit folder picker to connect the active project root.
Strict directory traversal protection preventing escape outside authorized workspace.
Automatic exclusion of sensitive files (`.env`, keys, credentials) and heavy directories (`node_modules`, build output).
Evidence-based code diagnostics linking visible errors and stack traces to actual source files.
Grounded Live Web Research
Google Search grounding built into the Gemma 4 pipeline.
Current queries ("What's trending in AI today?", "Latest React updates") synthesize live search findings into chat.
Clickable source badges with domain names and URLs directly inside Luna's result window—never forces unwanted browser windows open.
Lightweight Monitoring
File/log modification monitor to watch build logs or output files and alert the user when changes occur.
Conversation management
Start a new, separate conversation with a single click.
Reopen saved conversations from the history drawer.
Store conversation history locally in the application's user-data directory.
Unique conversation IDs ensure strict context isolation; old history never leaks into new chats.
Delete individual conversations or clear history.
Preserve conversation titles based on the first user request.
Quality checks
Automated 14-point regression suite covering conversation isolation, persistence, message ordering, streaming behavior, Markdown rendering, and multi-turn chat.
Full production Vite build verified.
🧱 Tech Stack
Desktop runtime: Electron
UI: React, TypeScript, Vite
AI: Gemma 4 through the Google GenAI SDK
Desktop communication: Electron IPC with a preload bridge
Local history: application-local conversation storage
Styling: CSS
Exact dependency versions are defined in `package.json` and the
lockfile.
🏗️ Architecture Overview
``` text
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
The renderer handles the user interface. The Electron main process owns
privileged desktop operations and local persistence. A preload bridge
exposes only the IPC methods the renderer needs. AI requests are sent
through the backend module rather than exposing Node.js or unrestricted
filesystem access to the UI.
🛠️ Getting Started
Prerequisites
Windows 10 or later.
Node.js compatible with the project's dependencies.
npm.
A Google GenAI API key with access to the configured model.
Check your versions:
``` cmd
node --version
npm --version
```
1. Clone the repository
``` cmd
git clone <YOUR_REPOSITORY_URL>
cd ai-companions-mvp
```
Replace `<YOUR_REPOSITORY_URL>` with your repository URL.
2. Install dependencies
``` cmd
npm install
```
If Electron installation fails, resolve the installation issue before
continuing. Do not commit `node_modules`, downloaded binaries, or local
caches.
3. Configure the API key
Create a `.env` file in the project root:
``` env
GEMINI_API_KEY=your_google_genai_api_key
```
Use the variable name expected by the current code. Keep the actual key
private.
Never commit `.env` or paste API keys into source files, issues,
screenshots, or demo recordings. If a key has already been exposed,
revoke it and create a replacement.
The configured model name is maintained in `electron/gemma.cjs`. Model
availability depends on provider and account access.
4. Start the development app
``` cmd
npm.cmd run dev
```
5. Build the frontend
``` cmd
npm.cmd run build
```
This runs the production build script defined by the project. It builds
the Vite frontend; it does not necessarily create a distributable
Windows installer unless a packaging script is configured.
🧪 Tests
Run the regression suite:
``` cmd
node test-regression-suite.cjs
```
The reported suite covers: - Creating a fresh conversation. - Adding
user and assistant messages. - Contextual follow-ups. - Preventing
previous-chat context from leaking into new chats. - Switching between
saved conversations. - Restoring conversation history. - Deleting and
clearing history. - Preventing old streams from modifying the active
conversation. - Avoiding duplicate stream/final messages. - Stable
conversation titles. - Markdown and streaming rendering. - Multi-turn
conversation behavior.
Automated tests do not replace manual testing of Electron windows, API
connectivity, screen capture, or the packaged app. Verify those
separately before release.
🔐 Privacy & Safety
AI Companions is designed to keep conversation history in local
application storage. AI requests still require sending the relevant
prompt and context to the configured AI provider.
Keep API credentials in environment variables.
Do not commit `.env`, private keys, tokens, or user data.
Limit file access to user-selected project folders.
Exclude secrets and unrelated files from model requests.
Ask permission before screen capture or project inspection.
Require approval before editing files or running risky commands.
Be transparent about whether a task uses live web data or only model
knowledge.
Screen vision, web research, and background monitoring should only be
enabled once their integrations and privacy behavior are implemented and
tested.
📁 Project Structure
``` text
ai-companions-mvp/
├── electron/
│   ├── main.cjs                 # Electron main process and desktop windows
│   ├── preload.cjs              # Restricted renderer-to-main IPC bridge
│   ├── gemma.cjs                # Gemma / Google GenAI integration
│   └── conversationStore.cjs    # Local conversation persistence
├── src/
│   ├── App.tsx                  # React UI and companion/chat experience
│   └── styles.css               # Application styling
├── test-regression-suite.cjs    # Conversation and UI logic regression tests
├── package.json
├── package-lock.json
└── .env.example                 # Safe environment-variable template, if present
```
Some filenames or scripts may differ as the project evolves. Check the
current repository before relying on this tree.
🏆 Hackathon Demo
Suggested short demo flow:
Show Luna floating on the Windows desktop.
Move Luna and open the chat workspace.
Ask a question and show the streamed answer.
Ask a follow-up to demonstrate conversational context.
Start a new chat and show that the previous conversation does not
leak into it.
Open History and restore the earlier chat.
Show a code response and copy its code block.
Only demonstrate screen analysis or live research if those features work
in the submitted build.
🤝 Contributing
Contributions and ideas are welcome.
Potential areas to improve: - Cross-platform desktop support. - More
robust conversation tests. - Reliable vision and screen-capture
workflows. - Real web search with grounded citations. - Opt-in
monitoring and notifications. - Better accessibility and keyboard
navigation. - A documented extension/tool interface for new companion
capabilities.
Keep contributions focused, avoid committing secrets, and include tests
for changes that affect conversations or IPC.
📜 License
Add a `LICENSE` file before publishing the repository publicly. Choose a
license that matches how you want others to use, modify, and
redistribute the project. Do not claim a specific open-source license
until that file is present.
💡 The Vision
AI should not only be somewhere you go to ask questions. It can be a
companion that lives alongside your work, understands what you choose to
show it, and helps you move from a question to a useful next step.
AI Companions is an experiment in making that experience feel
natural.
---
Built as a hackathon prototype with Electron, React, and Gemma 4.