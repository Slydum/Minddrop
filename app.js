import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const configured =
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_PUBLISHABLE");

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const LOCAL_KEY = "minddrop-local-tasks-v1";
const THEME_KEY = "minddrop-theme-v1";
let session = null;
let tasks = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");

const input = document.querySelector("#brainDump");
const authDialog = document.querySelector("#authDialog");
const authMessage = document.querySelector("#authMessage");

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  })[char]);
}

function classify(text) {
  const t = text.toLowerCase();
  if (["tomorrow","today","monday","tuesday","wednesday","thursday","friday",
       "saturday","sunday"," am"," pm","meeting","appointment","next week"]
      .some((word) => t.includes(word))) return "schedule";
  if (["call ","email ","reply","message ","ask ","send ","follow up"]
      .some((word) => t.includes(word))) return "followup";
  if (["buy ","later","maybe","research","someday"]
      .some((word) => t.includes(word))) return "later";
  return "today";
}

function parseDue(text) {
  const t = text.toLowerCase();
  const days = {sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
  let date = null;

  if (t.includes("tomorrow")) {
    date = new Date();
    date.setDate(date.getDate() + 1);
  } else if (/\btoday\b/.test(t)) {
    date = new Date();
  } else {
    const dayMatch = t.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (dayMatch) {
      date = new Date();
      let difference = (days[dayMatch[1]] - date.getDay() + 7) % 7;
      if (difference === 0) difference = 7;
      date.setDate(date.getDate() + difference);
    }
  }

  const timeMatch = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    if (!date) date = new Date();
    let hour = Number(timeMatch[1]);
    if (timeMatch[3] === "pm" && hour < 12) hour += 12;
    if (timeMatch[3] === "am" && hour === 12) hour = 0;
    date.setHours(hour, Number(timeMatch[2] || 0), 0, 0);
  } else if (date) {
    date.setHours(9, 0, 0, 0);
  }

  return date?.toISOString() || null;
}

async function loadTasks() {
  if (!supabase || !session) {
    tasks = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    render();
    return;
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message);
    return;
  }

  tasks = data;
  render();
}

async function addTask(text) {
  const task = {
    id: id(),
    title: text,
    category: classify(text),
    due_at: parseDue(text),
    completed: false,
    created_at: new Date().toISOString()
  };

  if (!supabase || !session) {
    tasks.unshift(task);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(tasks));
    render();
    return;
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: task.title,
      category: task.category,
      due_at: task.due_at,
      completed: false,
      user_id: session.user.id
    })
    .select()
    .single();

  if (error) throw error;
  tasks.unshift(data);
  render();
}

async function saveCapture() {
  const lines = input.value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return;

  try {
    for (const line of lines) await addTask(line);
    input.value = "";
    document.querySelector("#smartPreview").textContent = "";
    showToast(`${lines.length} saved`);
  } catch (error) {
    showToast(error.message);
  }
}

async function toggleTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  const next = !task.completed;

  if (supabase && session) {
    const { error } = await supabase
      .from("tasks")
      .update({ completed: next, completed_at: next ? new Date().toISOString() : null })
      .eq("id", taskId);
    if (error) return showToast(error.message);
  }

  task.completed = next;
  if (!supabase || !session) localStorage.setItem(LOCAL_KEY, JSON.stringify(tasks));
  render();
}

async function deleteTask(taskId) {
  if (supabase && session) {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) return showToast(error.message);
  }

  tasks = tasks.filter((item) => item.id !== taskId);
  if (!supabase || !session) localStorage.setItem(LOCAL_KEY, JSON.stringify(tasks));
  render();
}

function taskMarkup(task) {
  const due = task.due_at
    ? new Date(task.due_at).toLocaleString([], {
        month:"short", day:"numeric", hour:"numeric", minute:"2-digit"
      })
    : "";

  return `<div class="task">
    <button class="check ${task.completed ? "done" : ""}" data-action="toggle" data-id="${task.id}" aria-label="Complete task"></button>
    <div>
      <div class="task-title" style="${task.completed ? "text-decoration:line-through;opacity:.55" : ""}">${escapeHtml(task.title)}</div>
      ${due ? `<div class="task-meta">${escapeHtml(due)}</div>` : ""}
    </div>
    <button class="delete" data-action="delete" data-id="${task.id}" aria-label="Delete task">×</button>
  </div>`;
}

function render() {
  for (const category of ["today","followup","schedule","later"]) {
    const items = tasks.filter((task) => task.category === category && !task.completed);
    document.querySelector(`#count-${category}`).textContent = items.length;
    document.querySelector(`#list-${category}`).innerHTML =
      items.length ? items.map(taskMarkup).join("") : '<div class="empty">empty</div>';
  }
}

function updateAuthUi() {
  const button = document.querySelector("#authButton");
  const sync = document.querySelector("#syncState");

  if (!configured) {
    sync.textContent = "add Supabase config";
    button.textContent = "setup needed";
    return;
  }

  if (session) {
    sync.textContent = "synced";
    button.textContent = "sign out";
  } else {
    sync.textContent = "local mode";
    button.textContent = "sign in";
  }
}

async function initializeAuth() {
  if (!supabase) {
    updateAuthUi();
    render();
    return;
  }

  const { data } = await supabase.auth.getSession();
  session = data.session;
  updateAuthUi();
  await loadTasks();

  supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    updateAuthUi();
    await loadTasks();
  });
}

async function signIn() {
  authMessage.textContent = "";
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  authMessage.textContent = error ? error.message : "Signed in.";
  if (!error) authDialog.close();
}

async function signUp() {
  authMessage.textContent = "";
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  const { error } = await supabase.auth.signUp({ email, password });
  authMessage.textContent = error
    ? error.message
    : "Account created. Check your email if confirmation is enabled.";
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

document.querySelector("#authButton").addEventListener("click", async () => {
  if (!configured) {
    showToast("Add your Supabase URL and publishable key in config.js");
  } else if (session) {
    await supabase.auth.signOut();
  } else {
    authDialog.showModal();
  }
});

document.querySelector("#signInButton").addEventListener("click", signIn);
document.querySelector("#signUpButton").addEventListener("click", signUp);

document.querySelector(".board").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "toggle") toggleTask(button.dataset.id);
  if (button.dataset.action === "delete") deleteTask(button.dataset.id);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveCapture();
  }
});

input.addEventListener("input", () => {
  const value = input.value.trim();
  document.querySelector("#smartPreview").textContent =
    value ? `→ ${classify(value)}` : "";
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector("#themeToggle").textContent = theme === "dark" ? "☼" : "☾";
  localStorage.setItem(THEME_KEY, theme);
}

document.querySelector("#themeToggle").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

applyTheme(localStorage.getItem(THEME_KEY) || "dark");
initializeAuth();
