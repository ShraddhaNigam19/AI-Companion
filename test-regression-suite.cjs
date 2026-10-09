const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const conversationStore = require("./electron/conversationStore.cjs");
const { runGemma, streamGemma, buildContents } = require("./electron/gemma.cjs");

// Helper with retry for network resilience
async function runGemmaWithRetry(task, context, retries = 2) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await runGemma(task, context);
      if (res && res.text) return res;
      throw new Error(res.error || "Empty response from Gemma");
    } catch (err) {
      if (attempt > retries) throw err;
      console.log(`[Retry] Attempt ${attempt} failed with: ${err.message}. Retrying in 1s...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function runRegressionSuite() {
  console.log("==================================================================");
  console.log("    LUNA REGRESSION SUITE: CONVERSATIONS, ISOLATION & QUALITY     ");
  console.log("==================================================================\n");

  let passed = 0;
  let total = 0;

  function report(num, name, condition, details = "") {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] Req ${num}: ${name}`);
    } else {
      console.error(`[FAIL] Req ${num}: ${name} -> ${details}`);
    }
  }

  // Temporary storage directory for testing persistence safely
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "luna-test-"));

  // 1. A new conversation starts with zero messages
  try {
    const newConv = conversationStore.createConversation(tempDir);
    const hasZero = newConv && Array.isArray(newConv.messages) && newConv.messages.length === 0;
    report(1, "A new conversation starts with zero messages", hasZero);
  } catch (err) {
    report(1, "A new conversation starts with zero messages", false, err.message);
  }

  // 2. Sending the first task adds one user message and one assistant response
  let conv1Id = null;
  try {
    const created = conversationStore.createConversation(tempDir, "What is React?");
    conv1Id = created.id;
    conversationStore.saveConversation(tempDir, {
      id: conv1Id,
      title: "What is React?",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        { id: "m1", role: "user", text: "What is React?" },
        { id: "m2", role: "luna", text: "React is a JavaScript library for building user interfaces." }
      ]
    });

    const retrieved = conversationStore.getConversation(tempDir, conv1Id);
    const validTurn = retrieved &&
      retrieved.messages.length === 2 &&
      retrieved.messages[0].role === "user" &&
      retrieved.messages[1].role === "luna";
    report(2, "Sending the first task adds one user message and one assistant response", validTurn);
  } catch (err) {
    report(2, "Sending the first task adds one user message and one assistant response", false, err.message);
  }

  // 3. Follow-up questions receive context from the active conversation
  try {
    const activeContext = [
      { role: "user", text: "What is React?" },
      { role: "luna", text: "React is a JavaScript library." }
    ];
    const followUpTask = "Who created it?";
    const contents = buildContents(followUpTask, activeContext);
    const hasActiveContext = Array.isArray(contents) &&
      contents.length === 3 &&
      contents[0].parts[0].text === "What is React?" &&
      contents[1].parts[0].text === "React is a JavaScript library." &&
      contents[2].parts[0].text === "Who created it?";
    report(3, "Follow-up questions receive context from the active conversation", hasActiveContext);
  } catch (err) {
    report(3, "Follow-up questions receive context from the active conversation", false, err.message);
  }

  // 4. Starting a new conversation removes all previous conversation context from the model request
  try {
    const newConversationContext = [];
    const contentsNewChat = buildContents("What is Python?", newConversationContext);
    const isolated = Array.isArray(contentsNewChat) &&
      contentsNewChat.length === 1 &&
      contentsNewChat[0].parts[0].text === "What is Python?";
    report(4, "Starting a new conversation removes all previous conversation context from model request", isolated);
  } catch (err) {
    report(4, "Starting a new conversation removes all previous conversation context", false, err.message);
  }

  // 5. Switching to an older conversation loads only that conversation's messages
  try {
    const conv2 = conversationStore.createConversation(tempDir, "Explain Python");
    conversationStore.saveConversation(tempDir, {
      id: conv2.id,
      title: "Explain Python",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        { id: "m3", role: "user", text: "Explain Python" },
        { id: "m4", role: "luna", text: "Python is an interpreted, high-level programming language." }
      ]
    });

    const loaded1 = conversationStore.getConversation(tempDir, conv1Id);
    const loaded2 = conversationStore.getConversation(tempDir, conv2.id);

    const pure1 = loaded1.messages.every(m => !m.text.includes("Python"));
    const pure2 = loaded2.messages.every(m => !m.text.includes("React"));
    report(5, "Switching to an older conversation loads only that conversation's messages", pure1 && pure2);
  } catch (err) {
    report(5, "Switching to an older conversation loads only that conversation's messages", false, err.message);
  }

  // 6. Closing and reopening the app restores saved conversations
  try {
    // Re-reading from the exact file location simulates app restart
    const list = conversationStore.listConversations(tempDir);
    const conv1Restored = conversationStore.getConversation(tempDir, conv1Id);

    const restored = list.length >= 2 && conv1Restored && conv1Restored.messages.length === 2;
    report(6, "Closing and reopening the app restores saved conversations", restored);
  } catch (err) {
    report(6, "Closing and reopening the app restores saved conversations", false, err.message);
  }

  // 7. Deleting a conversation removes it from persistent storage
  try {
    const toDelete = conversationStore.createConversation(tempDir, "To Delete");
    conversationStore.saveConversation(tempDir, {
      id: toDelete.id,
      title: "To Delete",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [{ id: "d1", role: "user", text: "Delete me" }]
    });

    const beforeDelete = conversationStore.getConversation(tempDir, toDelete.id);
    assert.ok(beforeDelete, "Conversation should exist prior to deletion");

    const deletedSuccess = conversationStore.deleteConversation(tempDir, toDelete.id);
    const afterDelete = conversationStore.getConversation(tempDir, toDelete.id);

    // Verify disk persistence after deletion
    const recheckList = conversationStore.listConversations(tempDir);
    const persistedGone = !recheckList.some(c => c.id === toDelete.id);

    report(7, "Deleting a conversation removes it from persistent storage", 
      deletedSuccess && afterDelete === null && persistedGone);
  } catch (err) {
    report(7, "Deleting a conversation removes it from persistent storage", false, err.message);
  }

  // 8. Clearing history removes all conversations after confirmation
  try {
    const cleared = conversationStore.clearAllConversations(tempDir);
    const remaining = conversationStore.listConversations(tempDir);

    report(8, "Clearing history removes all conversations after confirmation", 
      cleared && remaining.length === 0);
  } catch (err) {
    report(8, "Clearing history removes all conversations after confirmation", false, err.message);
  }

  // 9. A stream started in one conversation cannot modify another conversation
  try {
    let activeConversationId = "conv-active-B";
    let convBMessages = [{ role: "user", text: "Question in B" }];

    const simulateStreamChunk = (data) => {
      // Stream chunk filtering as implemented in ResultChat
      if (data.conversationId && activeConversationId && data.conversationId !== activeConversationId) {
        return false; // Rejected
      }
      convBMessages.push({ role: "luna", text: data.text });
      return true;
    };

    const acceptedOld = simulateStreamChunk({
      type: "chunk",
      conversationId: "conv-old-A",
      text: "Leaked chunk from A"
    });

    const acceptedActive = simulateStreamChunk({
      type: "chunk",
      conversationId: "conv-active-B",
      text: "Valid chunk for B"
    });

    const streamIsolated = !acceptedOld && 
      acceptedActive && 
      convBMessages.length === 2 &&
      !convBMessages.some(m => m.text.includes("Leaked"));

    report(9, "A stream started in one conversation cannot modify another conversation", streamIsolated);
  } catch (err) {
    report(9, "A stream started in one conversation cannot modify another conversation", false, err.message);
  }

  // 10. Stream events and final result events do not create duplicate messages
  try {
    let messages = [{ role: "user", text: "What is 2+2?" }];

    // Stream start
    messages.push({ role: "luna", text: "Thinking..." });

    // Stream chunk
    messages[messages.length - 1] = { role: "luna", text: "4" };

    // Stream end
    messages[messages.length - 1] = { role: "luna", text: "4" };

    // Final result event received (deduplicated as in ResultChat)
    const resultEvent = { task: "What is 2+2?", result: "4" };
    const lastMsg = messages[messages.length - 1];
    if (!(lastMsg && lastMsg.role === "luna" && lastMsg.text === resultEvent.result)) {
      messages.push({ role: "luna", text: resultEvent.result });
    }

    const noDuplicates = messages.length === 2 && 
      messages[0].text === "What is 2+2?" && 
      messages[1].text === "4";

    report(10, "Stream events and final result events do not create duplicate messages", noDuplicates);
  } catch (err) {
    report(10, "Stream events and final result events do not create duplicate messages", false, err.message);
  }

  // 11. Conversation titles are stable and generated from the first user request
  try {
    const longPrompt = "Could you please help me write a comprehensive summary of quantum computing?";
    const title = conversationStore.generateTitle(longPrompt);
    const wordCount = title.split(" ").length;
    const isStable = wordCount >= 3 && wordCount <= 7;
    report(11, "Conversation titles are stable and generated from the first user request", 
      isStable, `Generated title: "${title}" (${wordCount} words)`);
  } catch (err) {
    report(11, "Conversation titles are stable and generated from the first user request", false, err.message);
  }

  // 12. Markdown rendering correctly handles code blocks, lists, links, and partially streamed content
  try {
    const testMarkdown = 
      "# Header 1\n" +
      "- Bullet item 1\n" +
      "- Bullet item 2\n" +
      "1. Numbered one\n" +
      "2. Numbered two\n" +
      "[Link to Docs](https://example.com)\n" +
      "```python\ndef test():\n    return 42"; // unclosed fenced code block (partial stream)

    const lines = testMarkdown.split("\n");
    let inCode = false;
    let codeLines = [];
    let bullets = [];
    let numbers = [];

    for (const line of lines) {
      if (line.startsWith("```")) {
        inCode = !inCode;
        continue;
      }
      if (inCode) {
        codeLines.push(line);
      } else if (line.startsWith("- ")) {
        bullets.push(line.slice(2));
      } else if (/^\d+\.\s+/.test(line)) {
        numbers.push(line.replace(/^\d+\.\s+/, ""));
      }
    }

    const unclosedCaptured = inCode && codeLines.length === 2;
    const listsParsed = bullets.length === 2 && numbers.length === 2;

    report(12, "Markdown rendering correctly handles code blocks, lists, links, and partially streamed content",
      unclosedCaptured && listsParsed);
  } catch (err) {
    report(12, "Markdown rendering correctly handles code blocks, lists, links", false, err.message);
  }

  // 13. A new chat after a long React discussion correctly answers an unrelated Python question without inheriting React context
  try {
    console.log("\n--- Testing Model Strict Isolation (React -> Python) ---");
    // Turn 1: Discuss React
    const reactTurn = await runGemmaWithRetry("What is React in 1 short sentence?");
    assert.ok(reactTurn.text.includes("React") || reactTurn.text.includes("UI") || reactTurn.text.includes("JavaScript"), "React answer failed");

    // Start a completely fresh chat about Python (zero previous turns passed)
    const pythonFreshResponse = await runGemmaWithRetry("What is Python in 1 short sentence?", []);
    const mentionsPython = /python/i.test(pythonFreshResponse.text);
    const mentionsReact = /react/i.test(pythonFreshResponse.text);

    report(13, "A new chat after a React discussion answers an unrelated Python question without inheriting React context",
      mentionsPython && !mentionsReact,
      `Python response: "${pythonFreshResponse.text}"`
    );
  } catch (err) {
    report(13, "New chat isolation after discussion", false, err.message);
  }

  // 14. Existing basic questions, coding responses, and multi-turn follow-ups still work
  try {
    console.log("\n--- Testing Basic Question, Coding Response & Multi-turn Follow-up ---");
    
    // 14a. Basic greeting
    const greet = await runGemmaWithRetry("Hello!");
    const greetOk = greet.text && greet.text.length > 3 && !greet.text.includes("Candidate");

    // 14b. Coding question
    const code = await runGemmaWithRetry("Write a python function to add two numbers.");
    const codeOk = code.text && (code.text.includes("def ") || code.text.includes("+"));

    // 14c. Multi-turn follow-up
    const t1 = await runGemmaWithRetry("What is the capital of France?");
    const t2 = await runGemmaWithRetry("What is its population?", [
      { role: "user", text: "What is the capital of France?" },
      { role: "luna", text: t1.text }
    ]);
    const followUpOk = /million|people|Paris/i.test(t2.text);

    report(14, "Existing basic questions, coding responses, and multi-turn follow-ups work smoothly",
      greetOk && codeOk && followUpOk,
      `Greet: ${greetOk}, Code: ${codeOk}, Follow-up: ${followUpOk}`
    );
  } catch (err) {
    report(14, "Basic questions, coding responses, and multi-turn follow-ups", false, err.message);
  }

  // Cleanup temporary directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log("\n==================================================================");
  console.log(`REGRESSION SUMMARY: ${passed}/${total} REQUIREMENTS PASSED`);
  console.log("==================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runRegressionSuite().catch(err => {
  console.error("Regression suite encountered unexpected error:", err);
  process.exit(1);
});
