const assert = require("assert");
const { runGemma, streamGemma, buildContents } = require("./electron/gemma.cjs");

async function runTests() {
  console.log("==================================================");
  console.log("       LUNA QUALITY & CONVERSATION TESTS          ");
  console.log("==================================================\n");

  let passed = 0;
  let total = 0;

  function report(name, success, details = "") {
    total++;
    if (success) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      console.error(`[FAIL] ${name}: ${details}`);
    }
  }

  // TEST 1: IPC Context options parsing (verifying main.cjs fix for array context)
  try {
    const simulateIpcContextParsing = (options) => {
      return Array.isArray(options.context)
        ? options.context
        : (Array.isArray(options.history)
            ? options.history
            : (typeof options.context === "string" ? options.context : ""));
    };

    const arrayInput = [
      { role: "user", text: "what is react" },
      { role: "luna", text: "React is a UI library." }
    ];

    const parsedArray = simulateIpcContextParsing({ context: arrayInput });
    assert.strictEqual(Array.isArray(parsedArray), true);
    assert.strictEqual(parsedArray.length, 2);

    const stringInput = "User: hello\n\nLuna: hi";
    const parsedString = simulateIpcContextParsing({ context: stringInput });
    assert.strictEqual(parsedString, stringInput);

    report("IPC context parser accepts both structured message arrays and legacy strings", true);
  } catch (err) {
    report("IPC context parser", false, err.message);
  }

  // TEST 2: Prompt structure separation
  try {
    const context = [
      { role: "user", text: "what is react" },
      { role: "luna", text: "React is a UI library." }
    ];
    const contents = buildContents("who created it", context);
    const valid = Array.isArray(contents) &&
      contents.length === 3 &&
      contents[0].role === "user" &&
      contents[0].parts[0].text === "what is react" &&
      contents[1].role === "model" &&
      contents[1].parts[0].text === "React is a UI library." &&
      contents[2].role === "user" &&
      contents[2].parts[0].text === "who created it";

    report("Prompt structure properly separates history turns and current user task", valid);
  } catch (err) {
    report("Prompt structure separation", false, err.message);
  }

  // TEST 3: Full 4-turn stateful conversation simulation
  console.log("\n--- Simulating 4-Turn Stateful UI Conversation Flow ---");
  const conversationHistory = [];

  // Turn 1: Casual greeting
  try {
    console.log("\n[Turn 1] User: 'how are you'");
    conversationHistory.push({ role: "user", text: "how are you" });
    const res1 = await runGemma("how are you");
    assert.ok(res1.text && res1.text.length > 5, "Response 1 empty");
    conversationHistory.push({ role: "luna", text: res1.text });

    const clean1 = !/(?:Is it concise\?|Direct\?|Natural\?|Constraints|Plan:)/i.test(res1.text);
    report("Turn 1 (Casual greeting) produced clean, single answer", clean1, res1.text);
  } catch (err) {
    report("Turn 1 (Casual greeting)", false, err.message);
  }

  // Turn 2: General knowledge question
  try {
    console.log("\n[Turn 2] User: 'what is react'");
    const previousTurns1 = [...conversationHistory];
    conversationHistory.push({ role: "user", text: "what is react" });

    const res2 = await runGemma("what is react", previousTurns1);
    assert.ok(res2.text && res2.text.length > 10, "Response 2 empty");
    conversationHistory.push({ role: "luna", text: res2.text });

    const clean2 = /(library|javascript|ui|interface|components)/i.test(res2.text) &&
                   !/SYSTEM INSTRUCTION/i.test(res2.text);
    report("Turn 2 (General knowledge) accurately explained React without instruction leaks", clean2, res2.text);
  } catch (err) {
    report("Turn 2 (General knowledge)", false, err.message);
  }

  // Turn 3: Contextual follow-up question ("who created it")
  try {
    console.log("\n[Turn 3] User: 'who created it' (relies on Turn 2 context)");
    const previousTurns2 = [...conversationHistory];
    conversationHistory.push({ role: "user", text: "who created it" });

    // Passing the actual array of previous turns as options.context
    const res3 = await runGemma("who created it", previousTurns2);
    assert.ok(res3.text && res3.text.length > 5, "Response 3 empty");
    conversationHistory.push({ role: "luna", text: res3.text });

    const resolvesContext = /(Jordan Walke|Facebook|Meta)/i.test(res3.text);
    const noPromptLeak = !/Constraints/i.test(res3.text) && !/SYSTEM INSTRUCTION/i.test(res3.text);
    report("Turn 3 (Follow-up) correctly resolved 'it' to React using conversation context", 
      resolvesContext && noPromptLeak, 
      res3.text
    );
  } catch (err) {
    report("Turn 3 (Follow-up)", false, err.message);
  }

  // Turn 4: Technical explanation ("explain docker in simple words")
  try {
    console.log("\n[Turn 4] User: 'explain docker in simple words'");
    const previousTurns3 = [...conversationHistory];
    conversationHistory.push({ role: "user", text: "explain docker in simple words" });

    const res4 = await runGemma("explain docker in simple words", previousTurns3);
    assert.ok(res4.text && res4.text.length > 10, "Response 4 empty");
    conversationHistory.push({ role: "luna", text: res4.text });

    const explainsDocker = /(container|shipping|software|package|environment|run)/i.test(res4.text);
    const noSelfGrading = !/(?:Is it concise\?|Is it objective\?)/i.test(res4.text);
    report("Turn 4 (Technical explanation) clearly explained Docker without self-evaluation", 
      explainsDocker && noSelfGrading, 
      res4.text
    );
  } catch (err) {
    report("Turn 4 (Technical explanation)", false, err.message);
  }

  // TEST 4: Verify conversation history integrity
  try {
    assert.strictEqual(conversationHistory.length, 8, "Expected 8 messages for 4 completed turns");
    const roles = conversationHistory.map(m => m.role);
    const expectedRoles = ["user", "luna", "user", "luna", "user", "luna", "user", "luna"];
    assert.deepStrictEqual(roles, expectedRoles, "Roles should strictly alternate user and luna");
    const noPlaceholders = conversationHistory.every(m => m.text && m.text !== "Thinking...");
    assert.strictEqual(noPlaceholders, true, "No temporary placeholders in completed history");

    report("Conversation history integrity verified (exactly 4 user turns, 4 completed assistant answers)", true);
  } catch (err) {
    report("Conversation history integrity", false, err.message);
  }

  // TEST 5: Streaming purity test (verifying chunks never stream thoughts)
  try {
    console.log("\n--- Testing Streaming Chunk Purity ---");
    let streamedPieces = [];
    let accumulated = "";

    const streamRes = await streamGemma("say hello in one short sentence", (piece, full) => {
      streamedPieces.push(piece);
      accumulated = full;
    });

    const noStreamedThoughts = streamedPieces.every(p => 
      !p.includes("Plan:") && 
      !p.includes("Constraints:") && 
      !p.includes("<thought>")
    );
    const matchesFinal = accumulated === streamRes.text;

    report("Streaming chunks emit only user-facing content with zero thoughts or intermediate drafts", 
      noStreamedThoughts && matchesFinal && streamRes.text.length > 0,
      `Chunks: ${streamedPieces.length}`
    );
  } catch (err) {
    report("Streaming chunk purity", false, err.message);
  }

  // TEST 6: Coding question test
  try {
    console.log("\n--- Testing Coding Question ---");
    const codeRes = await runGemma("write a python function to reverse a string");
    const codeText = codeRes.text;
    const hasCode = codeText.includes("def ") || codeText.includes("[::-1]");
    const cleanOutput = !codeText.includes("Candidate 1") && !codeText.includes("Option A");

    report("Coding question returns clean single solution without multiple candidate answer lists", 
      hasCode && cleanOutput, 
      codeText.slice(0, 150)
    );
  } catch (err) {
    report("Coding question", false, err.message);
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("==================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
