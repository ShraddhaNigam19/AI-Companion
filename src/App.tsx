import React, {

  useEffect,

  useRef,

  useState

} from "react";

type PetState =

  | "idle"

  | "walking"

  | "thinking"

  | "working"

  | "talking"

  | "sleeping";

type CompanionAction =

  | "talk"

  | "give-task"

  | "current-task"

  | "settings";

type TaskStatus =

  | "none"

  | "thinking"

  | "working"

  | "completed";

type Source = {

  title: string;

  url: string;

};

export type ConversationMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "luna" | "assistant";
  text: string;
  sources?: Source[];
  timestamp?: number;
};

export type ConversationRecord = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
};

type ResultData = {
  task: string;
  result: string;
  conversationId?: string;
  sources?: Source[];
};

type ChatMessage = {
  role: "user" | "luna";
  text: string;
  sources?: Source[];
};

declare global {
  interface Window {
    companion: {
      onPetState: (callback: (data: { state: PetState }) => void) => () => void;
      onCompanionAction: (callback: (data: { action: CompanionAction }) => void) => () => void;
      onResultData: (callback: (data: ResultData) => void) => () => void;
      onResultStream: (
        callback: (data: {
          type: "start" | "chunk" | "end" | "error";
          requestId?: string;
          conversationId?: string;
          task?: string;
          text?: string;
          error?: string;
          sources?: Source[];
        }) => void
      ) => () => void;
      onPlacementChanged?: (callback: (placement: string) => void) => () => void;
      submitTaskFromCompanion?: (taskText: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
      getPendingTask?: () => Promise<{ taskId: string; text: string; timestamp?: number } | null>;
      clearPendingTask?: (taskId?: string) => void;
      onTaskDispatched?: (callback: (data: { taskId: string; text: string }) => void) => () => void;
      getResultData: () => Promise<ResultData | null>;
      setPlacement?: (placement: string) => void;
      getPlacement?: () => Promise<string>;
      requestRoam: () => void;
      setState: (state: PetState) => void;
      toggleSleep: () => void;
      talk: () => void;
      giveTask: () => void;
      openSettings: () => void;
      quit: () => void;
      openContextMenu: () => void;
      dragWindow: (screenX: number, screenY: number) => void;
      dragStarted: (screenX: number, screenY: number, offsetX: number, offsetY: number) => void;
      dragEnded: () => void;
      openResultWindow: (task: string, result: string, sources?: Source[], conversationId?: string) => void;
      closeResultWindow: () => void;
      newTaskFromResult: () => void;
      isResultWindow: () => boolean;
      openExternal: (url: string) => void;
      runGemmaTask: (
        task: string,
        options?: {
          requestId?: string;
          conversationId?: string;
          openResult?: boolean;
          context?: string | ChatMessage[];
          history?: ChatMessage[];
        }
      ) => Promise<{
        success: boolean;
        result?: string;
        error?: string;
        sources?: Source[];
      }>;
      getChatHistory: () => Promise<ChatMessage[]>;
      saveChatHistory: (messages: ChatMessage[]) => Promise<boolean>;
      clearChatHistory: () => Promise<boolean>;
      listConversations: () => Promise<ConversationMeta[]>;
      getConversation: (conversationId: string) => Promise<ConversationRecord | null>;
      createConversation: (initialTask?: string, customId?: string) => Promise<ConversationRecord>;
      saveConversation: (conversation: ConversationRecord) => Promise<boolean>;
      deleteConversation: (conversationId: string) => Promise<boolean>;
      clearAllConversations: () => Promise<boolean>;
      getActiveConversationId: () => Promise<string | null>;
      setActiveConversationId: (conversationId: string | null) => Promise<boolean>;
      captureScreen: () => Promise<{ success: boolean; imageJpegBase64?: string; width?: number; height?: number; error?: string }>;
      analyzeScreen: (options?: { prompt?: string; customImageBase64?: string }) => Promise<{ success: boolean; analysis?: string; error?: string }>;
      selectProjectFolder: () => Promise<{ canceled?: boolean; projectPath?: string | null; error?: string }>;
      getProjectPath: () => Promise<string | null>;
      listProjectFiles: (relDir?: string) => Promise<{ files?: string[]; error?: string }>;
      readProjectFile: (relFilePath: string, maxBytes?: number) => Promise<{ path?: string; content?: string; lineCount?: number; truncated?: boolean; error?: string }>;
      searchProjectCode: (query: string, maxMatches?: number) => Promise<{ query?: string; matches?: Array<{ file: string; line: number; text: string }>; error?: string }>;
      diagnoseProject: (options: { symptom?: string; visibleError?: string; files?: string[]; screenBase64?: string }) => Promise<{ success: boolean; text?: string; error?: string }>;
      startMonitoring: (options: { target: string; intervalMs?: number; description?: string }) => Promise<{ success: boolean; task?: any; error?: string }>;
      stopMonitoring: (taskId: string) => Promise<{ success: boolean }>;
      getMonitoringStatus: (taskId: string) => Promise<any>;
      onMonitoringAlert: (callback: (alert: { taskId: string; target: string; changeType: string; snippet?: string; timestamp: number }) => void) => () => void;
    };
  }
}

const petMessages: Record<

  PetState,

  string

> = {

  idle:

    "I'm exploring your desktop.",

  walking:

    "Let's see what's around...",

  thinking:

    "Hmm... let me think.",

  working:

    "I'm working on it!",

  talking:

    "Hey! What are we working on?",

  sleeping:

    "Zzz... I'm taking a little rest 💤"

};


function openExternalLink(url: string) {
  if (!url || url.startsWith("data:")) return;
  try {
    if (window.companion?.openExternal) {
      window.companion.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  } catch (err) {
    console.error("Failed to open external link:", err);
    window.open(url, "_blank");
  }
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const formatLanguage = (lang?: string) => {
    if (!lang) return "Code";
    const clean = lang.replace(/^```/, "").trim().toLowerCase();
    const map: Record<string, string> = {
      js: "JavaScript",
      javascript: "JavaScript",
      ts: "TypeScript",
      typescript: "TypeScript",
      py: "Python",
      python: "Python",
      html: "HTML",
      css: "CSS",
      sh: "Bash",
      bash: "Bash",
      shell: "Bash",
      json: "JSON",
      sql: "SQL",
      cpp: "C++",
      c: "C",
      csharp: "C#",
      cs: "C#",
      rust: "Rust",
      rs: "Rust",
      go: "Go",
      java: "Java",
      md: "Markdown",
      markdown: "Markdown",
      yaml: "YAML",
      yml: "YAML"
    };
    return map[clean] || (clean.charAt(0).toUpperCase() + clean.slice(1)) || "Code";
  };

  const displayLang = formatLanguage(language);

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang-tag">{displayLang}</span>
        <button
          className="code-copy-btn"
          onClick={handleCopy}
          title="Copy code to clipboard"
        >
          {copied ? "✓ Copied!" : "📋 Copy"}
        </button>
      </div>
      <pre className="result-code-block">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderMarkdown(text?: string) {
  if (typeof text !== "string" || !text) {
    return [];
  }
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let listItems: string[] = [];
  let numberedItems: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";
  let tableRows: string[][] = [];

  const flushLists = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="result-list">
          {listItems.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
    if (numberedItems.length > 0) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="result-list">
          {numberedItems.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      numberedItems = [];
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      const headerRow = tableRows[0];
      const dataRows = tableRows.slice(1).filter(row => !row.every(cell => /^:?-+:?$/.test(cell.trim())));

      elements.push(
        <div key={`table-wrapper-${elements.length}`} className="result-table-wrapper">
          <table className="result-table">
            <thead>
              <tr>
                {headerRow.map((cell, idx) => (
                  <th key={idx}>{renderInlineMarkdown(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{renderInlineMarkdown(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
  };

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    // Check for fenced code block toggle ```
    if (trimmed.startsWith("```")) {
      flushLists();
      flushTable();
      if (inCodeBlock) {
        elements.push(
          <CodeBlock
            key={`code-${elements.length}`}
            code={codeBlockLines.join("\n")}
            language={codeBlockLang}
          />
        );
        codeBlockLines = [];
        codeBlockLang = "";
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLines = [];
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Check for table row
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushLists();
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map(c => c.trim());
      tableRows.push(cells);
      continue;
    }

    // If blank line, only flush table if the NEXT non-empty line is NOT a table row
    if (!trimmed) {
      flushLists();
      if (tableRows.length > 0) {
        let nextIsTableRow = false;
        for (let p = index + 1; p < lines.length; p++) {
          const nextTrim = lines[p].trim();
          if (!nextTrim) continue;
          if (nextTrim.startsWith("|") && nextTrim.endsWith("|")) {
            nextIsTableRow = true;
          }
          break;
        }
        if (!nextIsTableRow) {
          flushTable();
        }
      }
      continue;
    }

    // Non-table line encountered
    flushTable();

    // Headings: # through ######
    const headingMatch = trimmed.match(/^(#{1,6})\s*(.*)$/);
    if (headingMatch) {
      flushLists();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      const Tag = (`h${Math.min(level, 6)}`) as keyof JSX.IntrinsicElements;
      elements.push(
        <Tag key={`h-${index}`} className={`result-h${level}`}>
          {renderInlineMarkdown(headingText)}
        </Tag>
      );
      continue;
    }

    // Unordered lists
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      numberedItems = [];
      listItems.push(trimmed.substring(2));
      continue;
    }

    // Numbered lists
    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      listItems = [];
      numberedItems.push(numbered[1]);
      continue;
    }

    // Divider
    if (trimmed === "---" || trimmed === "***") {
      flushLists();
      elements.push(<hr key={`hr-${index}`} className="result-divider" />);
      continue;
    }

    flushLists();
    elements.push(
      <p key={`p-${index}`} className="result-paragraph">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  flushLists();
  flushTable();
  if (inCodeBlock) {
    elements.push(
      <CodeBlock
        key={`code-${elements.length}`}
        code={codeBlockLines.join("\n")}
        language={codeBlockLang}
      />
    );
  }

  return elements;
}

function renderInlineMarkdown(text?: string): React.ReactNode[] {
  if (typeof text !== "string" || !text) {
    return [];
  }
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const imageRegex = /!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^\s)]+)\)/;
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
  const urlRegex = /(https?:\/\/[^\s]+)/;

  while (remaining.length > 0) {
    const imgMatch = remaining.match(imageRegex);
    const linkMatch = remaining.match(linkRegex);
    const urlMatch = remaining.match(urlRegex);

    let earliestMatch: RegExpMatchArray | null = null;
    let matchType: "image" | "link" | "url" = "link";

    if (imgMatch) {
      earliestMatch = imgMatch;
      matchType = "image";
    }

    if (linkMatch && (!earliestMatch || (linkMatch.index ?? Infinity) < (earliestMatch.index ?? Infinity))) {
      earliestMatch = linkMatch;
      matchType = "link";
    }

    if (urlMatch && (!earliestMatch || (urlMatch.index ?? Infinity) < (earliestMatch.index ?? Infinity))) {
      earliestMatch = urlMatch;
      matchType = "url";
    }

    if (!earliestMatch) {
      parts.push(...renderFormattedText(remaining, `txt-${key++}`));
      break;
    }

    if ((earliestMatch.index ?? 0) > 0) {
      parts.push(...renderFormattedText(remaining.substring(0, earliestMatch.index), `pre-${key++}`));
    }

    if (matchType === "image") {
      const altText = earliestMatch[1];
      const imgUrl = earliestMatch[2];
      parts.push(
        <img
          key={`img-${key++}`}
          src={imgUrl}
          alt={altText || "Image"}
          className="result-image"
          loading="lazy"
          onClick={(e) => {
            e.stopPropagation();
            openExternalLink(imgUrl);
          }}
          title="Click to view full image in browser"
        />
      );
      remaining = remaining.substring((earliestMatch.index ?? 0) + earliestMatch[0].length);
    } else if (matchType === "link") {
      const linkText = earliestMatch[1];
      const linkUrl = earliestMatch[2];
      parts.push(
        <a
          key={`link-${key++}`}
          href={linkUrl}
          target="_blank"
          rel="noreferrer"
          className="result-link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternalLink(linkUrl);
          }}
        >
          {linkText}
        </a>
      );
      remaining = remaining.substring((earliestMatch.index ?? 0) + earliestMatch[0].length);
    } else {
      const cleanUrl = earliestMatch[1].replace(/[.,!?;:]$/, "");
      parts.push(
        <a
          key={`url-${key++}`}
          href={cleanUrl}
          target="_blank"
          rel="noreferrer"
          className="result-link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternalLink(cleanUrl);
          }}
        >
          {cleanUrl}
        </a>
      );
      remaining = remaining.substring((earliestMatch.index ?? 0) + earliestMatch[0].length);
    }
  }

  return parts;
}

function renderFormattedText(text?: string, keyPrefix: string = "fmt"): React.ReactNode[] {
  if (typeof text !== "string" || !text) {
    return [];
  }
  const codePieces = text.split(/(`[^`]+`)/g);

  return codePieces.map((piece, cIdx) => {
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length >= 2) {
      return (
        <code key={`${keyPrefix}-code-${cIdx}`} className="result-inline-code">
          {piece.slice(1, -1)}
        </code>
      );
    }

    const boldItalicPieces = piece.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return (
      <React.Fragment key={`${keyPrefix}-frag-${cIdx}`}>
        {boldItalicPieces.map((subPiece, sIdx) => {
          if (subPiece.startsWith("**") && subPiece.endsWith("**")) {
            return (
              <strong key={`${keyPrefix}-b-${sIdx}`}>
                {subPiece.slice(2, -2)}
              </strong>
            );
          }
          if (subPiece.startsWith("*") && subPiece.endsWith("*")) {
            return (
              <em key={`${keyPrefix}-i-${sIdx}`}>
                {subPiece.slice(1, -1)}
              </em>
            );
          }
          return subPiece;
        })}
      </React.Fragment>
    );
  });
}


function formatTimestamp(ts?: number): string {
  if (!ts) return "";
  try {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function ResultChat() {
  const [result, setResult] = useState<ResultData | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationList, setConversationList] = useState<ConversationMeta[]>([]);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [monitoringActive, setMonitoringActive] = useState<boolean>(false);

  const conversationIdRef = useRef<string | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const handledTaskIdsRef = useRef<Set<string>>(new Set());
  const handleTaskSubmitRef = useRef<(text: string) => Promise<void>>(() => Promise.resolve());

  const refreshConversations = async () => {
    if (window.companion?.listConversations) {
      try {
        const list = await window.companion.listConversations();
        setConversationList(list || []);
      } catch (err) {
        console.error("Failed to list conversations:", err);
      }
    }
  };

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-save completed conversation turns to store
  useEffect(() => {
    if (!sending && messages.length > 0 && conversationIdRef.current) {
      const persistable = messages.filter((m) => {
        if (!m.text || m.text === "Thinking...") return false;
        if (
          m.role === "luna" &&
          (m.text.startsWith("Luna couldn't complete") ||
            m.text.startsWith("Google API Error") ||
            m.text.startsWith("Something went wrong") ||
            m.text.startsWith("Sorry, Luna couldn't") ||
            m.text.startsWith("Luna encountered an error"))
        ) {
          return false;
        }
        return true;
      });

      if (persistable.length > 0) {
        const convId = conversationIdRef.current;
        const firstUser = persistable.find((m) => m.role === "user");
        const rawTitle = firstUser?.text || "New Conversation";
        const title = rawTitle.length > 45 ? rawTitle.slice(0, 45) + "..." : rawTitle;

        if (window.companion?.saveConversation) {
          window.companion
            .saveConversation({
              id: convId,
              title,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messages: persistable.map((m, idx) => ({
                id: "msg-" + idx,
                role: m.role,
                text: m.text,
                sources: m.sources,
                timestamp: Date.now()
              }))
            })
            .then(() => refreshConversations())
            .catch(console.error);
        }

        if (window.companion?.saveChatHistory) {
          window.companion.saveChatHistory(persistable);
        }
      }
    }
  }, [messages, sending]);

  useEffect(() => {
    let mounted = true;

    const initData = async () => {
      try {
        // 1. Check if window was opened with result data
        const data = window.companion?.getResultData
          ? await window.companion.getResultData()
          : null;
        if (!mounted) return;

        if (data && data.conversationId) {
          conversationIdRef.current = data.conversationId;
          setConversationId(data.conversationId);
          if (data.task && data.result) {
            setResult(data);
            setMessages([
              { role: "user", text: data.task },
              { role: "luna", text: data.result, sources: data.sources }
            ]);
          }
          await refreshConversations();
          return;
        }

        // 2. Check active conversation ID from backend
        const activeId = window.companion?.getActiveConversationId
          ? await window.companion.getActiveConversationId()
          : null;

        if (mounted && activeId && window.companion?.getConversation) {
          const conv = await window.companion.getConversation(activeId);
          if (mounted && conv && conv.messages && conv.messages.length > 0) {
            conversationIdRef.current = conv.id;
            setConversationId(conv.id);
            const msgs: ChatMessage[] = conv.messages.map((m) => ({
              role: (m.role === "assistant" ? "luna" : m.role) as "user" | "luna",
              text: m.text,
              sources: m.sources
            }));
            setMessages(msgs);
            const lastLuna = msgs.slice().reverse().find((m) => m.role === "luna");
            const lastUser = msgs.slice().reverse().find((m) => m.role === "user");
            if (lastLuna && lastUser) {
              setResult({
                task: lastUser.text,
                result: lastLuna.text,
                sources: lastLuna.sources,
                conversationId: conv.id
              });
            }
            await refreshConversations();
            return;
          }
        }

        // 3. Fallback to listConversations if any exist
        if (window.companion?.listConversations) {
          const list = await window.companion.listConversations();
          if (mounted && list && list.length > 0 && window.companion?.getConversation) {
            const latest = list[0];
            const conv = await window.companion.getConversation(latest.id);
            if (mounted && conv) {
              conversationIdRef.current = conv.id;
              setConversationId(conv.id);
              const msgs: ChatMessage[] = conv.messages.map((m) => ({
                role: (m.role === "assistant" ? "luna" : m.role) as "user" | "luna",
                text: m.text,
                sources: m.sources
              }));
              setMessages(msgs);
              await refreshConversations();
              return;
            }
          }
        }

        // 4. Default fresh conversation
        const freshId = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
        conversationIdRef.current = freshId;
        setConversationId(freshId);
        if (window.companion?.setActiveConversationId) {
          await window.companion.setActiveConversationId(freshId);
        }
      } catch (error) {
        console.error("Failed to initialize ResultChat data:", error);
      }
    };

    const processIncomingTask = (incoming: { taskId: string; text: string }) => {
      if (!incoming || !incoming.text || !incoming.taskId) return;
      if (handledTaskIdsRef.current.has(incoming.taskId)) return;
      handledTaskIdsRef.current.add(incoming.taskId);

      if (window.companion?.clearPendingTask) {
        window.companion.clearPendingTask(incoming.taskId);
      }

      handleTaskSubmitRef.current(incoming.text);
    };

    initData().then(() => {
      if (!mounted) return;
      if (window.companion?.getPendingTask) {
        window.companion.getPendingTask().then((pending) => {
          if (mounted && pending) {
            processIncomingTask(pending);
          }
        });
      }
    });

    refreshConversations();

    const unsubTask = window.companion?.onTaskDispatched?.((incoming) => {
      if (!mounted || !incoming) return;
      processIncomingTask(incoming);
    });

    const unsubData = window.companion?.onResultData?.((data) => {
      if (!mounted) return;
      if (data.conversationId) {
        conversationIdRef.current = data.conversationId;
        setConversationId(data.conversationId);
      }
      setResult(data);
      if (!data.task) return;

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "luna" && lastMsg.text === data.result) {
          return prev;
        }
        return [
          ...prev,
          { role: "user", text: data.task },
          { role: "luna", text: data.result, sources: data.sources }
        ];
      });
      refreshConversations();
    });

    const unsubStream = window.companion?.onResultStream?.((data) => {
      if (!mounted) return;

      // CRITICAL: Reject stream chunks from other conversations!
      if (
        data.conversationId &&
        conversationIdRef.current &&
        data.conversationId !== conversationIdRef.current
      ) {
        return;
      }

      if (data.conversationId && !conversationIdRef.current) {
        conversationIdRef.current = data.conversationId;
        setConversationId(data.conversationId);
      }

      if (data.type === "start") {
        currentRequestIdRef.current = data.requestId || null;
        setSending(true);

        setMessages((previous) => {
          const updated = [...previous];
          const last = updated.length - 1;
          if (last >= 0 && updated[last].role === "luna" && updated[last].text === "Thinking...") {
            return updated;
          }
          return [
            ...updated,
            { role: "user", text: data.task || "" },
            { role: "luna", text: "Thinking..." }
          ];
        });
        return;
      }

      if (data.type === "chunk" || data.type === "end") {
        setResult((previous) =>
          previous
            ? { ...previous, result: data.text || "", sources: data.sources || previous.sources }
            : { task: data.task || "", result: data.text || "", sources: data.sources }
        );

        setMessages((previous) => {
          const updated = [...previous];
          const last = updated.length - 1;
          if (last >= 0 && updated[last].role === "luna") {
            updated[last] = {
              ...updated[last],
              text: data.text || "",
              sources: data.sources || updated[last].sources
            };
          }
          return updated;
        });

        if (data.type === "end") {
          setSending(false);
          currentRequestIdRef.current = null;
          refreshConversations();
        }
        return;
      }

      if (data.type === "error") {
        setMessages((previous) => {
          const updated = [...previous];
          const last = updated.length - 1;
          if (last >= 0 && updated[last].role === "luna") {
            updated[last] = {
              ...updated[last],
              text: data.error || "Something went wrong."
            };
          }
          return updated;
        });
        setSending(false);
        currentRequestIdRef.current = null;
      }
    });

    return () => {
      mounted = false;
      if (typeof unsubData === "function") unsubData();
      if (typeof unsubStream === "function") unsubStream();
      if (typeof unsubTask === "function") unsubTask();
    };
  }, []);

  const handleSelectConversation = async (convId: string) => {
    if (convId === conversationIdRef.current) {
      setHistoryOpen(false);
      return;
    }
    try {
      const conv = await window.companion.getConversation(convId);
      if (conv) {
        conversationIdRef.current = conv.id;
        setConversationId(conv.id);
        const msgs: ChatMessage[] = conv.messages.map((m) => ({
          role: (m.role === "assistant" ? "luna" : m.role) as "user" | "luna",
          text: m.text,
          sources: m.sources
        }));
        setMessages(msgs);
        const lastLuna = msgs.slice().reverse().find((m) => m.role === "luna");
        const lastUser = msgs.slice().reverse().find((m) => m.role === "user");
        setResult(
          lastLuna && lastUser
            ? { task: lastUser.text, result: lastLuna.text, sources: lastLuna.sources, conversationId: conv.id }
            : null
        );
        if (window.companion?.setActiveConversationId) {
          await window.companion.setActiveConversationId(conv.id);
        }
      }
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
    setHistoryOpen(false);
  };

  const handleNewChat = async () => {
    const freshId = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    conversationIdRef.current = freshId;
    setConversationId(freshId);
    setMessages([]);
    setResult(null);
    setInput("");
    setSending(false);
    if (window.companion?.setActiveConversationId) {
      await window.companion.setActiveConversationId(freshId);
    }
    setHistoryOpen(false);
    await refreshConversations();
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    const confirmed = window.confirm("Are you sure you want to delete this conversation?");
    if (!confirmed) return;
    try {
      await window.companion.deleteConversation(convId);
      await refreshConversations();
      if (conversationIdRef.current === convId) {
        await handleNewChat();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all saved conversations? This cannot be undone."
    );
    if (!confirmed) return;
    try {
      await window.companion.clearAllConversations();
      await refreshConversations();
      await handleNewChat();
    } catch (err) {
      console.error("Failed to clear conversations:", err);
    }
  };

  const handleInspectScreen = async () => {
    if (sending) return;
    const confirmed = window.confirm(
      "Permission Request: Luna will temporarily hide her windows, take a clean screenshot of your active screen, and analyze it with Gemma 4 Vision. Proceed?"
    );
    if (!confirmed) return;

    let activeId = conversationIdRef.current;
    if (!activeId) {
      activeId = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      conversationIdRef.current = activeId;
      setConversationId(activeId);
      if (window.companion?.setActiveConversationId) {
        await window.companion.setActiveConversationId(activeId);
      }
    }

    const reqId = "req-" + Date.now();
    currentRequestIdRef.current = reqId;
    setSending(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", text: "Luna, please inspect my screen and tell me what you see." },
      { role: "luna", text: "📸 Capturing screen safely (temporarily hiding windows)..." }
    ]);

    try {
      if (window.companion?.analyzeScreen) {
        const res = await window.companion.analyzeScreen({
          prompt: "Analyze the user's screen carefully. Identify visible applications, code editors, terminals, active error messages, stack traces, and layout elements. Provide an evidence-based diagnosis."
        });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated.length - 1;
          if (last >= 0 && updated[last].role === "luna") {
            updated[last] = {
              role: "luna",
              text: res.success ? (res.analysis || "Screen analyzed successfully.") : `Screen inspection error: ${res.error}`
            };
          }
          return updated;
        });
      }
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated.length - 1;
        if (last >= 0 && updated[last].role === "luna") {
          updated[last] = { role: "luna", text: `Screen inspection failed: ${err?.message || "Unknown error"}` };
        }
        return updated;
      });
    } finally {
      setSending(false);
      refreshConversations();
    }
  };

  const handleSelectProjectFolder = async () => {
    if (!window.companion?.selectProjectFolder) return;
    try {
      const res = await window.companion.selectProjectFolder();
      if (res && res.projectPath) {
        setProjectPath(res.projectPath);
        const folderName = (res.projectPath || "").split(/[\\/]/).pop() || res.projectPath || "Project";
        setMessages((prev) => [
          ...prev,
          {
            role: "luna",
            text: `📁 **Project folder connected:** \`${res.projectPath}\`\nLuna is now ready to safely inspect and diagnose files in **${folderName}**.`
          }
        ]);
      }
    } catch (err: any) {
      console.error("Failed to select project folder:", err);
    }
  };

  const handleTaskSubmit = async (taskText: string) => {
    const cleaned = taskText.trim();
    if (!cleaned || sending) {
      return;
    }

    let activeId = conversationIdRef.current;
    if (!activeId) {
      activeId = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      conversationIdRef.current = activeId;
      setConversationId(activeId);
      if (window.companion?.setActiveConversationId) {
        await window.companion.setActiveConversationId(activeId);
      }
    }

    const reqId = "req-" + Date.now();
    currentRequestIdRef.current = reqId;

    // Isolate context strictly to the active conversation's messages
    const conversationContext = messages
      .filter((m) => {
        if (!m.text || m.text === "Thinking...") return false;
        if (
          m.role === "luna" &&
          (m.text.startsWith("Luna couldn't complete") ||
            m.text.startsWith("Google API Error") ||
            m.text.startsWith("Something went wrong") ||
            m.text.startsWith("Sorry, Luna couldn't") ||
            m.text.startsWith("Luna encountered an error"))
        ) {
          return false;
        }
        return true;
      })
      .map((m) => ({
        role: m.role,
        text: m.text
      }));

    setSending(true);

    setMessages((previous) => [
      ...previous,
      {
        role: "user",
        text: cleaned
      },
      {
        role: "luna",
        text: "Thinking..."
      }
    ]);

    try {
      const response = await window.companion.runGemmaTask(cleaned, {
        requestId: reqId,
        conversationId: activeId,
        openResult: false,
        context: conversationContext
      });

      if (!response.success && response.error) {
        setMessages((previous) => {
          const updated = [...previous];
          const last = updated.length - 1;
          if (last >= 0 && updated[last].role === "luna") {
            updated[last] = {
              role: "luna",
              text: response.error || "Something went wrong."
            };
          }
          return updated;
        });
      }
    } catch (error: any) {
      console.error("Task submission error:", error);
      setMessages((previous) => {
        const updated = [...previous];
        const last = updated.length - 1;
        if (last >= 0 && updated[last].role === "luna") {
          updated[last] = {
            role: "luna",
            text: error?.message || "Luna encountered an error responding to this task."
          };
        }
        return updated;
      });
    } finally {
      setSending(false);
      refreshConversations();
    }
  };

  handleTaskSubmitRef.current = handleTaskSubmit;

  const sendFollowUp = () => {
    const cleaned = input.trim();
    if (!cleaned || sending) {
      return;
    }
    setInput("");
    return handleTaskSubmit(cleaned);
  };

  return (
    <div className="chat-app">
      <header className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="chat-avatar">🐱</div>
          <div>
            <div className="chat-name">Luna</div>
            <div className="chat-status">AI Companion</div>
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            style={{
              background: "rgba(168, 85, 247, 0.15)",
              border: "1px solid rgba(168, 85, 247, 0.35)",
              color: "#e9d5ff",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: sending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
            onClick={handleInspectScreen}
            disabled={sending}
            title="Temporarily hide Luna and inspect screen with vision model"
          >
            📸 Screen
          </button>

          <button
            style={{
              background: projectPath ? "rgba(34, 197, 94, 0.15)" : "rgba(255, 255, 255, 0.08)",
              border: projectPath ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid rgba(255, 255, 255, 0.16)",
              color: projectPath ? "#86efac" : "#f3e8ff",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
            onClick={handleSelectProjectFolder}
            title={projectPath ? `Connected: ${projectPath}` : "Select project root folder for code debugging"}
          >
            📁 {projectPath ? "Project ✓" : "Project"}
          </button>

          <button
            style={{
              background: historyOpen ? "rgba(168, 85, 247, 0.28)" : "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              color: "#f3e8ff",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
            onClick={() => {
              setHistoryOpen(!historyOpen);
              refreshConversations();
            }}
            title="Toggle conversation history"
          >
            📜 History
          </button>

          <button
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              color: "#f3e8ff",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer"
            }}
            onClick={handleNewChat}
            title="Start a new chat"
          >
            ➕ New Chat
          </button>

          <button
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              color: "#f3e8ff",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer"
            }}
            onClick={() => window.companion.newTaskFromResult()}
            title="Close chat and assign a new task to Luna"
          >
            ➕ New Task
          </button>

          <button
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.6)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 16,
              cursor: "pointer"
            }}
            onClick={() => window.companion.closeResultWindow()}
            title="Close chat window"
          >
            ✕
          </button>
        </div>
      </header>

      {historyOpen && (
        <>
          <div className="history-backdrop" onClick={() => setHistoryOpen(false)} />
          <div className="history-drawer open">
            <div className="history-header">
              <div className="history-header-title">
                <span>📜</span>
                <span>Chat History</span>
              </div>
              <button
                className="history-close-btn"
                onClick={() => setHistoryOpen(false)}
                title="Close history"
              >
                ✕
              </button>
            </div>

            <div className="history-actions-bar">
              <button className="history-new-chat-btn" onClick={handleNewChat}>
                <span>➕</span> New Conversation
              </button>
            </div>

            <div className="history-list">
              {conversationList.length === 0 ? (
                <div className="history-empty-msg">No saved conversations yet.</div>
              ) : (
                conversationList.map((conv) => (
                  <div
                    key={conv.id}
                    className={`history-item ${conv.id === conversationId ? "active" : ""}`}
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <div className="history-item-content">
                      <div className="history-item-title" title={conv.title}>
                        {conv.title || "Untitled Conversation"}
                      </div>
                      <div className="history-item-meta">
                        <span>{formatTimestamp(conv.updatedAt)}</span>
                        {conv.messageCount ? <span>• {conv.messageCount} msgs</span> : null}
                        {conv.id === conversationId ? (
                          <span style={{ color: "#c084fc", fontWeight: 600 }}>• Active</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      className="history-item-delete"
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      title="Delete conversation"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>

            {conversationList.length > 0 && (
              <div className="history-footer">
                <button className="history-clear-btn" onClick={handleClearAll}>
                  🗑️ Clear All History
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <main className="chat-messages">
        {messages.length === 0 && (
          <div
            className="chat-empty-state"
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "rgba(255, 255, 255, 0.45)"
            }}
          >
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🐱</div>
            <p
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.85)"
              }}
            >
              How can I help you today?
            </p>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
              Ask a question, request code, or explore ideas with Luna.
            </p>
          </div>
        )}

        {!result && messages.length > 0 && sending && (
          <div className="chat-loading">Luna is preparing your result...</div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`chat-row ${message.role}`}>
            {message.role === "luna" && <div className="chat-small-avatar">🐱</div>}

            <div className={`chat-bubble ${message.role}`}>
              {message.role === "luna" ? (
                renderMarkdown(message.text || "")
              ) : (
                <p className="result-paragraph">{message.text || ""}</p>
              )}

              {message.role === "luna" && message.sources && message.sources.length > 0 && (
                <div className="sources-section">
                  <div className="sources-title">🔗 Sources</div>
                  <div className="sources-list">
                    {message.sources.map((source, sourceIndex) => (
                      <a
                        key={sourceIndex}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="source-card"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openExternalLink(source.url);
                        }}
                      >
                        <span className="source-icon">🌐</span>
                        <span className="source-content">
                          <strong>{source.title}</strong>
                          <small>{new URL(source.url).hostname}</small>
                        </span>
                        <span className="source-arrow">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="chat-input-area">
        <input
          value={input}
          disabled={sending}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              sendFollowUp();
            }
          }}
          placeholder={sending ? "Luna is thinking..." : "Ask Luna a follow-up..."}
        />
        <button onClick={sendFollowUp} disabled={sending} aria-label="Send">
          {sending ? "..." : "➤"}
        </button>
      </footer>
    </div>
  );
}


class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallbackTitle?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallbackTitle?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary caught]:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            color: "#f87171",
            background: "#120019",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Inter, sans-serif",
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: "#e9d5ff", marginBottom: 8, fontSize: 18 }}>
            {this.props.fallbackTitle || "Something went wrong"}
          </h2>
          <p style={{ maxWidth: 420, fontSize: 12, color: "#d8b4fe", marginBottom: 16 }}>
            {this.state.error?.message || "An unexpected rendering error occurred in the workspace."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              background: "#a855f7",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13
            }}
          >
            🔄 Reload Interface
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [resultMode, setResultMode] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        window.location.hash === "#result" ||
        Boolean(window.companion?.isResultWindow?.())
      );
    }
    return false;
  });

  useEffect(() => {
    const handleHash = () => {
      const isResult =
        window.location.hash === "#result" ||
        Boolean(window.companion?.isResultWindow?.());
      setResultMode(isResult);
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  if (resultMode) {
    return (
      <ErrorBoundary fallbackTitle="Chat Workspace Error">
        <ResultChat />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="Companion Error">
      <Companion />
    </ErrorBoundary>
  );
}


function Companion() {

  const [

    state,

    setState

  ] = useState <PetState>(

    "idle"

  );

  const [

    open,

    setOpen

  ] = useState(false);

  const [

    taskInputOpen,

    setTaskInputOpen

  ] = useState(false);

  const [

    settingsOpen,

    setSettingsOpen

  ] = useState(false);

  const [

    currentTask,

    setCurrentTask

  ] = useState("");

  const [

    taskStatus,

    setTaskStatus

  ] = useState <TaskStatus>(

    "none"

  );

  const taskRunRef =

    useRef(0);

  const [

    dragging,

    setDragging

  ] = useState(false);

  const dragMoved =

    useRef(false);

  const lastAssignedConversationIdRef =
    useRef<string | null>(null);

  const [currentPlacement, setCurrentPlacement] = useState<string>("bottom");

  useEffect(() => {
    window.companion?.getPlacement?.().then((p) => {
      if (p) setCurrentPlacement(p);
    });
    const unsubs = window.companion?.onPlacementChanged?.((p) => {
      if (p) setCurrentPlacement(p);
    });
    return () => {
      unsubs?.();
    };
  }, []);

  const handlePlacementSelect = (place: string) => {
    setCurrentPlacement(place);
    window.companion?.setPlacement?.(place);
  };

  useEffect(() => {

    window.companion.onPetState(

      ({ state }) => {

        setState(

          state

        );

      }

    );

    window.companion.onCompanionAction(

      ({ action }) => {

        setOpen(

          true

        );

        switch (

          action

        ) {

          case "talk":

            setTaskInputOpen(

              false

            );

            setSettingsOpen(

              false

            );

            break;

          case "give-task":
          case "new-task":
            setCurrentTask("");
            setTaskStatus("none");
            setTaskInputOpen(true);
            setSettingsOpen(false);
            break;

          case "clear-task":
            setCurrentTask("");
            setTaskStatus("none");
            setTaskInputOpen(false);
            setSettingsOpen(false);
            break;

          case "current-task":

            setTaskInputOpen(

              false

            );

            setSettingsOpen(

              false

            );

            break;

          case "settings":

            setTaskInputOpen(

              false

            );

            setSettingsOpen(

              true

            );

            break;

        }

      }

    );

  }, []);


  const handlePointerDown = (

    event: React.PointerEvent

  ) => {

    if (

      event.button !== 0

    ) {

      return;

    }

    dragMoved.current =

      false;

    setDragging(

      true

    );

    window.companion.dragStarted(

      event.screenX,

      event.screenY,

      event.clientX,

      event.clientY

    );

    try {

      event.currentTarget.setPointerCapture(

        event.pointerId

      );

    } catch {}

    const handleMove = (

      moveEvent: PointerEvent

    ) => {

      dragMoved.current =

        true;

      window.companion.dragWindow(

        moveEvent.screenX,

        moveEvent.screenY

      );

    };

    const handleUp = () => {

      setDragging(

        false

      );

      window.companion.dragEnded();

      window.removeEventListener(

        "pointermove",

        handleMove

      );

      window.removeEventListener(

        "pointerup",

        handleUp

      );

    };

     window.addEventListener(

      "pointermove",

      handleMove

    );

     window.addEventListener(

      "pointerup",

      handleUp

    );

  };


  const handlePetClick =

    () => {

      if (

        dragMoved.current

      ) {

        return;

      }

      if (

        state ===

        "sleeping"

      ) {

        window.companion.requestRoam();

        setOpen(

          true

        );

        return;

      }

      window.companion.talk();

      setOpen(

        true

      );

    };


  const handleContextMenu = (

    event: React.MouseEvent

  ) => {

    event.preventDefault();

    setOpen(

      false

    );

    setTaskInputOpen(

      false

    );

    setSettingsOpen(

      false

    );

    window.companion.openContextMenu();

  };


  const [taskInputValue, setTaskInputValue] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const submitCompanionTask = async (taskText: string) => {
    const cleaned = taskText.trim();
    if (!cleaned || taskSubmitting) {
      return;
    }

    setTaskSubmitting(true);
    setTaskError(null);

    try {
      if (!window.companion?.submitTaskFromCompanion) {
        throw new Error("Task handoff service unavailable");
      }

      const res = await window.companion.submitTaskFromCompanion(cleaned);
      if (res && res.success) {
        setTaskInputValue("");
        setTaskInputOpen(false);
        setCurrentTask(cleaned);
        setTaskStatus("working");
        setState("working");
        window.companion.setState("working");
      } else {
        setTaskError(res?.error || "Failed to deliver task to chat workspace.");
      }
    } catch (err: any) {
      console.error("Task handoff error:", err);
      setTaskError(err?.message || "Failed to communicate with chat window.");
    } finally {
      setTaskSubmitting(false);
    }
  };

  const closeBubble = () => {
    setOpen(false);
    setTaskInputOpen(false);
    setSettingsOpen(false);
    setTaskError(null);
  };

  return (

     <main

      className="pet-stage"

      onContextMenu={

        handleContextMenu

      }

    >

       <button

        className={`pet ${

          state

        } ${

          dragging

            ? "dragging"

            : ""

        }`}

        onPointerDown={

          handlePointerDown

        }

        onClick={

          handlePetClick

        }

        aria-label="Nudge Luna"

        title="Nudge Luna"

      >

         <div className="ear left" />

         <div className="ear right" />

         <div className="head">

           <div className="eye left-eye" />

           <div className="eye right-eye" />

           <div className="nose" />

           <div className="mouth" />

           <div className="whisker w1" />

           <div className="whisker w2" />

           <div className="whisker w3" />

           <div className="whisker w4" />

         </div>

         <div className="body">

           <div className="paw left-paw" />

           <div className="paw right-paw" />

         </div>

         <div className="tail" />

         <div className="shadow" />

       </button>

       <div

        className={`bubble ${

          open

            ? "show"

            : ""

        }`}

      >

         <strong>

          Luna 🐱

         </strong>

        {taskInputOpen ? (
          <>
            <span>What should I do for you?</span>
            <div className="task-input-container">
              <input
                className="task-input"
                placeholder="e.g. Research the best phone in 2026..."
                value={taskInputValue}
                onChange={(e) => {
                  setTaskInputValue(e.target.value);
                  if (taskError) setTaskError(null);
                }}
                disabled={taskSubmitting}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitCompanionTask(taskInputValue);
                  }
                  if (event.key === "Escape") {
                    closeBubble();
                  }
                }}
              />
              <button
                className="task-send-btn"
                type="button"
                disabled={taskSubmitting || !taskInputValue.trim()}
                onClick={() => submitCompanionTask(taskInputValue)}
                aria-label="Send task"
                title="Send task to Luna"
              >
                {taskSubmitting ? "..." : "➤"}
              </button>
            </div>
            {taskError && <span className="task-error">⚠️ {taskError}</span>}
            <small className="task-hint">
              Press Enter or click ➤ to assign • Esc to cancel
            </small>
          </>

        ) : settingsOpen ? (
          <div className="settings-bubble-content">
            <span className="settings-title">⚙️ Luna Placement</span>
            <div className="placement-btn-grid">
              {[
                { id: "bottom", label: "Bottom" },
                { id: "top", label: "Top" },
                { id: "left", label: "Left" },
                { id: "right", label: "Right" },
                { id: "center", label: "Center" },
                { id: "free", label: "Roam" }
              ].map((p) => (
                <button
                  key={p.id}
                  className={`placement-choice-btn ${currentPlacement === p.id ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlacementSelect(p.id);
                  }}
                  type="button"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

        ) : currentTask ? (

          <>

             <span>

              {taskStatus ===

                "thinking"

                ? "🧠 Understanding your request..."

                : taskStatus ===

                    "working"

                  ? "⚙️ Working on it..."

                  : taskStatus ===

                      "completed"

                    ? "✨ Done! Your result is ready."

                    : petMessages[

                        state

                      ]}

             </span>

             <span className="current-task">

              📋{" "}

              {currentTask}

             </span>

            {taskStatus ===

              "thinking" && (

               <span className="task-progress">

                🧠 Understanding

                the request...

               </span>

            )}

            {taskStatus ===

              "working" && (

               <span className="task-progress">

                🌐 Researching /

                working...

               </span>

            )}

            {taskStatus ===

              "completed" && (

               <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="task-complete">
                 ✨ Result ready
                </span>
                <button
                  className="task"
                  style={{ marginTop: 2 }}
                  onClick={() => {
                    window.companion.openResultWindow(
                      currentTask,
                      "",
                      [],
                      lastAssignedConversationIdRef.current || undefined
                    );
                  }}
                >
                  💬 Open Chat / Result →
                </button>
                <button
                  className="task"
                  style={{
                    marginTop: 2,
                    background: "rgba(255, 255, 255, 0.14)",
                    color: "#fff",
                    border: "1px solid rgba(255, 255, 255, 0.2)"
                  }}
                  onClick={() => {
                    setCurrentTask("");
                    setTaskStatus("none");
                    setTaskInputOpen(true);
                    lastAssignedConversationIdRef.current = null;
                  }}
                >
                  ➕ Enter New Task →
                </button>
               </div>

            )}

           </>

        ) : (

          <>

             <span>

              {

                petMessages[

                  state

                ]

              }

             </span>

            {state ===

              "talking" && (

               <button

                className="task"

                onClick={() =>

                  setTaskInputOpen(

                    true

                  )

                }

              >

                🎯 Give Luna a

                task →

               </button>

            )}

           </>

        )}

         <button

          className="close"

          onClick={

            closeBubble

          }

        >

          ×

         </button>

       </div>

     </main>

  );

}
