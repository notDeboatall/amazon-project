// Homebase Web UI Application Logic (Vanilla JS)

let currentState = null;
let chatHistory = [];
let isAssistantThinking = false;
let isSpeakingEnabled = true;
let speechRecognizer = null;

// Member color mappings
const memberColors = {
  arjun: "#146EB4",
  meera: "#FF9900",
  riya: "#067D62",
  kabir: "#9C27B0",
};

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  loadState();
  setupEventsSSE();
  setupChatHandlers();
  setupVoiceRecognition();
  setupQuickActions();
}

// ----------------------------------------------------------------------------
// State Fetching & Rendering
// ----------------------------------------------------------------------------

async function loadState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentState = await res.json();
    renderDashboard(currentState);
  } catch (err) {
    console.error("Failed to load state:", err);
  }
}

function renderDashboard(state) {
  if (!state) return;

  renderGreeting(state);
  renderChores(state.chores || []);
  renderGroceries(state.groceries || []);
  renderEvents(state.events || []);
  renderReminders(state.reminders || []);
  renderActivity(state.activity || []);
}

function renderGreeting(state) {
  const greetingEl = document.getElementById("greetingText");
  if (!greetingEl) return;

  const openChores = (state.chores || []).filter((c) => c.status !== "done").length;
  const neededGroceries = (state.groceries || []).filter((g) => g.status === "needed").length;
  const count = openChores + neededGroceries;

  greetingEl.textContent = `Good day, Sharma-Rao family. ${count} item${count === 1 ? "" : "s"} need attention this week.`;
}

function renderChores(chores) {
  const container = document.getElementById("choresList");
  const countBadge = document.getElementById("choresCount");
  if (!container) return;

  const openChores = chores.filter((c) => c.status !== "done");
  if (countBadge) countBadge.textContent = openChores.length;

  if (openChores.length === 0) {
    container.innerHTML = `<li class="empty-state">No chores yet. Say "add a chore" or use Add chore.</li>`;
    return;
  }

  container.innerHTML = openChores
    .map((c) => {
      const assigneeName = c.assignee || "Unassigned";
      const color = memberColors[assigneeName.toLowerCase()] || "#888888";
      return `
        <li class="item-row" data-id="${c.id}">
          <div class="item-left">
            <span class="item-title">${escapeHtml(c.title)}</span>
            <div class="item-meta">
              <span class="effort-badge">Effort: ${c.effort}</span>
              <span class="member-chip">
                <span class="member-dot" style="background-color: ${color};"></span>
                ${escapeHtml(assigneeName)}
              </span>
            </div>
          </div>
          <button class="btn-done" onclick="completeChore(${c.id})" aria-label="Mark ${escapeHtml(c.title)} done">
            ✓ Done
          </button>
        </li>
      `;
    })
    .join("");
}

function renderGroceries(groceries) {
  const container = document.getElementById("groceriesList");
  const countBadge = document.getElementById("groceriesCount");
  if (!container) return;

  const needed = groceries.filter((g) => g.status === "needed");
  if (countBadge) countBadge.textContent = needed.length;

  if (needed.length === 0) {
    container.innerHTML = `<li class="empty-state">Your list is empty. Say what you need and Homebase adds it.</li>`;
    return;
  }

  // Group by category
  const groups = {};
  for (const item of needed) {
    const cat = item.category || "other";
    (groups[cat] = groups[cat] || []).push(item);
  }

  let html = "";
  for (const [category, items] of Object.entries(groups)) {
    html += `<div class="grocery-group-header">${escapeHtml(category)}</div>`;
    for (const item of items) {
      html += `
        <li class="item-row">
          <div class="item-left">
            <span class="item-title">${escapeHtml(item.name)}</span>
            ${item.quantity ? `<div class="item-meta"><span class="grocery-quantity">${escapeHtml(item.quantity)}</span></div>` : ""}
          </div>
        </li>
      `;
    }
  }

  container.innerHTML = html;
}

function renderEvents(events) {
  const container = document.getElementById("eventsList");
  const countBadge = document.getElementById("eventsCount");
  if (!container) return;

  if (countBadge) countBadge.textContent = events.length;

  if (events.length === 0) {
    container.innerHTML = `<li class="empty-state">Nothing scheduled this week.</li>`;
    return;
  }

  // Detect conflicts (overlapping events)
  const conflicts = findOverlaps(events);

  container.innerHTML = events
    .map((e) => {
      const d = new Date(e.start_at);
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const hasConflict = conflicts.has(e.id);

      return `
        <li class="event-row">
          <div class="event-date-box">
            <div class="event-day">${dayName}</div>
            <div class="event-time">${timeStr}</div>
          </div>
          <div class="event-details">
            <div class="event-title">${escapeHtml(e.title)}</div>
            <div class="event-location">${escapeHtml(e.location || "Home")} • ${escapeHtml(e.members || "")}</div>
            ${hasConflict ? `<div class="conflict-pill">⚠ Conflict with another event</div>` : ""}
          </div>
        </li>
      `;
    })
    .join("");
}

function findOverlaps(events) {
  const set = new Set();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      const startA = new Date(a.start_at).getTime();
      const endA = new Date(a.end_at).getTime();
      const startB = new Date(b.start_at).getTime();
      const endB = new Date(b.end_at).getTime();

      // Check time overlap
      if (startA < endB && startB < endA) {
        set.add(a.id);
        set.add(b.id);
      }
    }
  }
  return set;
}

function renderReminders(reminders) {
  const container = document.getElementById("remindersList");
  if (!container) return;

  const pending = reminders.filter((r) => r.status === "pending");
  if (pending.length === 0) {
    container.innerHTML = `<li class="empty-state">No pending reminders.</li>`;
    return;
  }

  container.innerHTML = pending
    .map((r) => {
      const d = new Date(r.remind_at);
      const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      return `
        <li class="item-row">
          <div class="item-left">
            <span class="item-title">${escapeHtml(r.message)}</span>
            <span class="item-meta">At ${timeStr}</span>
          </div>
        </li>
      `;
    })
    .join("");
}

function renderActivity(activities) {
  const container = document.getElementById("activityList");
  if (!container) return;

  if (activities.length === 0) {
    container.innerHTML = `<div class="empty-state">Tool calls will appear here as Homebase works.</div>`;
    return;
  }

  container.innerHTML = activities
    .slice(0, 10)
    .map((a) => {
      const time = a.created_at ? a.created_at.slice(11, 19) : "Just now";
      return `
        <div class="activity-item" id="activity-${a.id}">
          <span class="activity-tool-name">${escapeHtml(a.tool)}</span>
          <span class="activity-status-ok">200 OK</span>
          <span class="activity-time">${time}</span>
        </div>
      `;
    })
    .join("");
}

// ----------------------------------------------------------------------------
// Live SSE Stream for Live Activity (Phase 3 requirement)
// ----------------------------------------------------------------------------

function setupEventsSSE() {
  const eventSource = new EventSource("/api/events");

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "tool_call" || payload.type === "tool_result") {
        addLiveActivityItem(payload.data?.tool || "tool", payload.type === "tool_result");
        // Refresh dashboard data
        loadState();
      }
    } catch (err) {
      console.warn("SSE parse error:", err);
    }
  };

  eventSource.onerror = () => {
    // Reconnects automatically by browser
  };
}

function addLiveActivityItem(toolName, isResult) {
  const container = document.getElementById("activityList");
  if (!container) return;

  // Clear empty state if present
  if (container.querySelector(".empty-state")) {
    container.innerHTML = "";
  }

  const nowTime = new Date().toTimeString().slice(0, 8);
  const row = document.createElement("div");
  row.className = "activity-item highlight-new";
  row.innerHTML = `
    <span class="activity-tool-name">${escapeHtml(toolName)}</span>
    <span class="activity-status-ok">200 OK</span>
    <span class="activity-time">${nowTime}</span>
  `;

  container.prepend(row);

  // Settle fade after 1.5s per DESIGN.md section 5
  setTimeout(() => {
    row.classList.remove("highlight-new");
  }, 1500);
}

// ----------------------------------------------------------------------------
// Chat & Assistant Interaction
// ----------------------------------------------------------------------------

function setupChatHandlers() {
  const form = document.getElementById("assistantForm");
  const input = document.getElementById("assistantInput");
  const chips = document.querySelectorAll(".chip-btn");
  const speakToggle = document.getElementById("speakToggle");

  if (speakToggle) {
    isSpeakingEnabled = speakToggle.checked;
    speakToggle.addEventListener("change", (e) => {
      isSpeakingEnabled = e.target.checked;
    });
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || isAssistantThinking) return;
      input.value = "";
      sendUserMessage(text);
    });
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const text = chip.getAttribute("data-prompt") || chip.textContent.trim();
      if (!isAssistantThinking) {
        sendUserMessage(text);
      }
    });
  });
}

async function sendUserMessage(text) {
  if (isAssistantThinking) return;
  isAssistantThinking = true;

  // Append user bubble
  appendChatBubble("user", text);
  chatHistory.push({ role: "user", content: text });

  // Show typing indicator
  showTypingIndicator();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        history: chatHistory.slice(-10),
      }),
    });

    const data = await res.json();
    removeTypingIndicator();

    if (!res.ok) {
      const errMsg = data.error || "Can't reach the assistant right now. Check your API keys in .env and try again.";
      appendChatBubble("assistant", errMsg);
      speakReply(errMsg);
    } else {
      const reply = data.reply || "Done.";
      appendChatBubble("assistant", reply, data.toolCalls);
      chatHistory.push({ role: "assistant", content: reply });
      speakReply(reply);
      // Reload state after assistant actions
      loadState();
    }
  } catch (err) {
    removeTypingIndicator();
    const fallbackErr = "Can't reach the assistant right now. Check your API keys in .env and try again.";
    appendChatBubble("assistant", fallbackErr);
    speakReply(fallbackErr);
  } finally {
    isAssistantThinking = false;
  }
}

function appendChatBubble(role, text, toolCalls) {
  const thread = document.getElementById("chatThread");
  if (!thread) return;

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;

  let toolSummaryHtml = "";
  if (toolCalls && toolCalls.length > 0) {
    const names = toolCalls.map((t) => t.name).join(", ");
    toolSummaryHtml = `<span class="tool-summary-tag">⚙ Called: ${escapeHtml(names)}</span>`;
  }

  bubble.innerHTML = `${toolSummaryHtml}<div>${escapeHtml(text)}</div>`;
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
}

function showTypingIndicator() {
  const thread = document.getElementById("chatThread");
  if (!thread) return;

  const indicator = document.createElement("div");
  indicator.id = "typingIndicator";
  indicator.className = "chat-bubble assistant typing-dots";
  indicator.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;
  thread.appendChild(indicator);
  thread.scrollTop = thread.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typingIndicator");
  if (indicator) indicator.remove();
}

// ----------------------------------------------------------------------------
// Voice Input (Web Speech API) & Speech Synthesis
// ----------------------------------------------------------------------------

function setupVoiceRecognition() {
  const micBtn = document.getElementById("micBtn");
  if (!micBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micBtn.addEventListener("click", () => {
      showVoiceToast("Voice input isn't supported in this browser. Use Chrome or type your request.");
    });
    return;
  }

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = false;
  speechRecognizer.interimResults = false;
  speechRecognizer.lang = "en-US";

  let isListening = false;

  micBtn.addEventListener("click", () => {
    if (isListening) {
      speechRecognizer.stop();
      return;
    }

    try {
      speechRecognizer.start();
      isListening = true;
      micBtn.classList.add("listening");
      micBtn.setAttribute("aria-label", "Listening...");
    } catch (err) {
      console.warn("Speech error:", err);
    }
  });

  speechRecognizer.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript) {
      const input = document.getElementById("assistantInput");
      if (input) input.value = transcript;
      sendUserMessage(transcript);
    }
  };

  speechRecognizer.onerror = (event) => {
    console.warn("Speech recognition error:", event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      showVoiceToast("Microphone access is off. Allow it in your browser settings, or type instead.");
    }
  };

  speechRecognizer.onend = () => {
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.setAttribute("aria-label", "Start voice input");
  };
}

function speakReply(text) {
  if (!isSpeakingEnabled || !window.speechSynthesis) return;

  try {
    window.speechSynthesis.cancel();
    // Keep spoken reply concise (under 25 words per CONTENT.md)
    const shortText = text.split(".").slice(0, 2).join(".").trim();
    const utterance = new SpeechSynthesisUtterance(shortText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
  }
}

function showVoiceToast(message) {
  const toast = document.getElementById("voiceErrorToast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 5000);
}

// ----------------------------------------------------------------------------
// Action Buttons & Shortcuts
// ----------------------------------------------------------------------------

function setupQuickActions() {
  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/reset", { method: "POST" });
        await loadState();
        appendChatBubble("assistant", "Demo household has been reset to starting state.");
      } catch (err) {
        console.error("Reset error:", err);
      }
    });
  }
}

// Complete chore via assistant
window.completeChore = function (choreId) {
  sendUserMessage(`Complete chore #${choreId}`);
};

// Escape HTML utility
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
