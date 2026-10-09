const fs = require("fs");
const path = require("path");

const STORE_VERSION = 1;

function getStoreFilePath(userDataDir) {
  return path.join(userDataDir, "luna-conversations.json");
}

function generateTitle(text) {
  if (!text || typeof text !== "string") {
    return "New Conversation";
  }

  // Strip code blocks, markdown symbols, and extra whitespace
  const clean = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/[#*_\->~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return "New Conversation";
  }

  // Extract first 3 to 7 words
  const words = clean.split(" ").filter(Boolean);
  if (words.length <= 6) {
    const raw = words.join(" ");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  const titleWords = words.slice(0, 6);
  const truncated = titleWords.join(" ");
  return (truncated.charAt(0).toUpperCase() + truncated.slice(1)).slice(0, 45);
}

function readStore(userDataDir) {
  const filePath = getStoreFilePath(userDataDir);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.conversations)) {
          const normalized = parsed.conversations.map((conv) => {
            if (Array.isArray(conv.messages)) {
              conv.messages = conv.messages.map((m, idx) => {
                const textVal = m.text || m.content || "";
                return {
                  ...m,
                  id: m.id || m.messageId || `msg-${idx}`,
                  messageId: m.messageId || m.id || `msg-${idx}`,
                  text: textVal,
                  content: textVal
                };
              });
            }
            return conv;
          });
          return {
            version: parsed.version || STORE_VERSION,
            activeConversationId: parsed.activeConversationId || null,
            conversations: normalized
          };
        }
      }
    }
  } catch (err) {
    console.error("[ConversationStore] Error reading store, initializing fresh store:", err.message);
    try {
      const backupPath = path.join(userDataDir, `luna-conversations-corrupted-${Date.now()}.json`);
      if (fs.existsSync(filePath)) {
        fs.renameSync(filePath, backupPath);
      }
    } catch {}
  }

  return {
    version: STORE_VERSION,
    activeConversationId: null,
    conversations: []
  };
}

function writeStore(userDataDir, store) {
  const filePath = getStoreFilePath(userDataDir);
  const tmpPath = path.join(userDataDir, "luna-conversations.tmp");

  const data = JSON.stringify(
    {
      version: store.version || STORE_VERSION,
      activeConversationId: store.activeConversationId || null,
      conversations: store.conversations || []
    },
    null,
    2
  );

  try {
    fs.writeFileSync(tmpPath, data, "utf8");
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    try {
      fs.writeFileSync(filePath, data, "utf8");
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
      return true;
    } catch (writeErr) {
      console.error("[ConversationStore] Failed to write conversation store:", writeErr.message);
      return false;
    }
  }
}

function listConversations(userDataDir) {
  const store = readStore(userDataDir);
  return store.conversations.map((c) => {
    const convId = c.conversationId || c.id;
    return {
      id: convId,
      conversationId: convId,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: Array.isArray(c.messages) ? c.messages.length : 0
    };
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function getConversation(userDataDir, conversationId) {
  if (!conversationId) return null;
  const store = readStore(userDataDir);
  const found = store.conversations.find((c) => (c.conversationId === conversationId || c.id === conversationId));
  if (!found) return null;
  const convId = found.conversationId || found.id;
  return {
    ...found,
    id: convId,
    conversationId: convId
  };
}

function createConversation(userDataDir, initialTask = "", customId = null) {
  const store = readStore(userDataDir);
  const now = new Date().toISOString();
  const conversationId = customId || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = generateTitle(initialTask);

  const newConv = {
    id: conversationId,
    conversationId,
    title,
    createdAt: now,
    updatedAt: now,
    messages: []
  };

  store.conversations.unshift(newConv);
  store.activeConversationId = conversationId;
  writeStore(userDataDir, store);

  return newConv;
}

function saveConversation(userDataDir, conversation) {
  const convId = conversation?.conversationId || conversation?.id;
  if (!convId) return false;
  const store = readStore(userDataDir);

  const index = store.conversations.findIndex((c) => (c.conversationId === convId || c.id === convId));
  const now = new Date().toISOString();

  // If title is missing or default, generate one if messages exist
  let title = conversation.title;
  if ((!title || title === "New Conversation") && conversation.messages && conversation.messages.length > 0) {
    const firstUserMsg = conversation.messages.find((m) => m.role === "user");
    if (firstUserMsg && (firstUserMsg.content || firstUserMsg.text)) {
      title = generateTitle(firstUserMsg.content || firstUserMsg.text);
    }
  }

  const normalizedMessages = Array.isArray(conversation.messages)
    ? conversation.messages.map((m, idx) => {
        const textVal = m.text || m.content || "";
        return {
          ...m,
          id: m.id || m.messageId || `msg-${idx}`,
          messageId: m.messageId || m.id || `msg-${idx}`,
          text: textVal,
          content: textVal
        };
      })
    : [];

  const updatedRecord = {
    ...conversation,
    id: convId,
    conversationId: convId,
    title: title || "New Conversation",
    messages: normalizedMessages,
    updatedAt: now
  };

  if (index >= 0) {
    store.conversations[index] = updatedRecord;
  } else {
    store.conversations.unshift(updatedRecord);
  }

  store.activeConversationId = convId;
  return writeStore(userDataDir, store);
}

function deleteConversation(userDataDir, conversationId) {
  if (!conversationId) return false;
  const store = readStore(userDataDir);
  const prevCount = store.conversations.length;
  store.conversations = store.conversations.filter((c) => (c.conversationId !== conversationId && c.id !== conversationId));

  if (store.activeConversationId === conversationId) {
    store.activeConversationId = store.conversations.length > 0 ? (store.conversations[0].conversationId || store.conversations[0].id) : null;
  }

  writeStore(userDataDir, store);
  return store.conversations.length < prevCount;
}

function clearAllConversations(userDataDir) {
  const store = {
    version: STORE_VERSION,
    activeConversationId: null,
    conversations: []
  };
  return writeStore(userDataDir, store);
}

function getActiveConversationId(userDataDir) {
  const store = readStore(userDataDir);
  return store.activeConversationId;
}

function setActiveConversationId(userDataDir, conversationId) {
  const store = readStore(userDataDir);
  store.activeConversationId = conversationId;
  return writeStore(userDataDir, store);
}

module.exports = {
  generateTitle,
  listConversations,
  getConversation,
  createConversation,
  saveConversation,
  deleteConversation,
  clearAllConversations,
  getActiveConversationId,
  setActiveConversationId,
  readStore,
  writeStore
};
