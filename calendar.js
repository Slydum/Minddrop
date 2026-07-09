import {
  createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from "./config.js";

import { ICON_MOON, ICON_SUN } from "./icons.js";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = id =>
  document.getElementById(id);

let session = null;
let routines = [];
let tasks = [];
let calendarDate = new Date();
let realtimeChannel = null;
let dayDialogDateKey = null;

calendarDate.setDate(1);
renderCalendar();

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );
}

function localDateKey(date) {
  const year =
    date.getFullYear();

  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(date.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme =
    theme;

  $("themeToggle").innerHTML =
    theme === "light"
      ? ICON_MOON
      : ICON_SUN;

  localStorage.setItem(
    "minddrop-theme",
    theme
  );
}

$("themeToggle").onclick = () => {
  const currentTheme =
    document.documentElement.dataset.theme;

  applyTheme(
    currentTheme === "light"
      ? "dark"
      : "light"
  );
};

applyTheme(
  localStorage.getItem("minddrop-theme") ||
  "light"
);

function formatTime(value) {
  if (!value) {
    return "";
  }

  const [hour, minute] =
    value
      .slice(0, 5)
      .split(":")
      .map(Number);

  const date = new Date();

  date.setHours(
    hour,
    minute
  );

  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit"
    }
  );
}

function routineMatchesDate(
  routine,
  date
) {
  if (routine.frequency === "daily") {
    return true;
  }

  if (routine.frequency === "weekly") {
    return (
      Number(routine.weekday) ===
      date.getDay()
    );
  }

  if (routine.frequency === "monthly") {
    return (
      Number(routine.monthday) ===
      date.getDate()
    );
  }

  return false;
}

function eventsForDate(date) {
  const dateKey = localDateKey(date);

  const routineEvents =
    routines
      .filter(routine =>
        routineMatchesDate(
          routine,
          date
        )
      )
      .map(routine => ({
        type: "routine",
        title: routine.title,
        time: formatTime(
          routine.time_of_day
        )
      }));

  const taskEvents =
    tasks
      .filter(task =>
        !task.completed &&
        task.due_date === dateKey
      )
      .map(task => ({
        type: "task",
        title: task.title,
        time: ""
      }));

  return [...routineEvents, ...taskEvents];
}

async function loadData() {
  const [
    routineResult,
    taskResult
  ] = await Promise.all([
    supabase
      .from("routines")
      .select("*")
      .order("time_of_day"),

    supabase
      .from("tasks")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
  ]);

  if (routineResult.error) {
    throw routineResult.error;
  }

  if (taskResult.error) {
    throw taskResult.error;
  }

  routines =
    routineResult.data || [];

  tasks =
    taskResult.data || [];

  renderCalendar();
  renderUnscheduledTasks();

  if (dayDialogDateKey) {
    renderDayDialogEvents(dayDialogDateKey);
  }
}

function realtimeStart() {
  if (realtimeChannel) {
    supabase.removeChannel(
      realtimeChannel
    );
  }

  realtimeChannel = supabase
    .channel(
      `minddrop-calendar-${session.user.id}`
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tasks",
        filter:
          `user_id=eq.${session.user.id}`
      },
      loadData
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "routines",
        filter:
          `user_id=eq.${session.user.id}`
      },
      loadData
    )

    .subscribe(status => {
      $("syncState").textContent =
        status === "SUBSCRIBED"
          ? "live sync"
          : "connecting…";
    });
}

function renderCalendar() {
  const year =
    calendarDate.getFullYear();

  const month =
    calendarDate.getMonth();

  $("calendarMonthTitle")
    .textContent =
    calendarDate.toLocaleDateString(
      [],
      {
        month: "long",
        year: "numeric"
      }
    );

  const firstDay =
    new Date(
      year,
      month,
      1
    );

  const firstVisible =
    new Date(
      year,
      month,
      1 - firstDay.getDay()
    );

  const todayKey =
    localDateKey(new Date());

  let html = "";

  for (
    let index = 0;
    index < 42;
    index++
  ) {
    const currentDate =
      new Date(firstVisible);

    currentDate.setDate(
      firstVisible.getDate() +
      index
    );

    const dateKey =
      localDateKey(currentDate);

    const outside =
      currentDate.getMonth() !==
      month;

    const today =
      dateKey === todayKey;

    const events =
      eventsForDate(currentDate);

    const visible =
      events.slice(0, 3);

    const remaining =
      events.length -
      visible.length;

    const eventHtml =
      visible.map(event => `
        <div
          class="calendar-event ${event.type}"
          title="${escapeHtml(
            event.title
          )}"
        >
          ${
            event.time
              ? `
                <span class="calendar-event-time">
                  ${escapeHtml(
                    event.time
                  )}
                </span>
              `
              : ""
          }

          <span class="calendar-event-title">
            ${escapeHtml(
              event.title
            )}
          </span>
        </div>
      `).join("");

    html += `
      <div
        class="
          calendar-day
          ${outside ? "outside-month" : ""}
          ${today ? "today" : ""}
        "
        data-date="${dateKey}"
      >
        <div class="calendar-day-number">
          ${currentDate.getDate()}
        </div>

        <div class="calendar-day-events">
          ${eventHtml}

          ${
            remaining > 0
              ? `
                <div class="calendar-more">
                  +${remaining} more
                </div>
              `
              : ""
          }
        </div>
      </div>
    `;
  }

  $("calendarGrid").innerHTML =
    html;
}

function renderUnscheduledTasks() {
  const unscheduled =
    tasks.filter(task =>
      !task.completed &&
      !task.due_date
    );

  if (!unscheduled.length) {
    $("unscheduledTaskList")
      .innerHTML = `
        <div class="empty">
          No unscheduled tasks.
        </div>
      `;

    return;
  }

  $("unscheduledTaskList")
    .innerHTML =
    unscheduled.map(task => `
      <div class="unscheduled-item">
        <div>
          <div class="task-title">
            ${escapeHtml(task.title)}
          </div>

          <div class="task-meta">
            no date assigned
          </div>
        </div>

        <button
          class="delete"
          data-delete="${task.id}"
          aria-label="Delete task"
        >
          ×
        </button>
      </div>
    `).join("");

  document
    .querySelectorAll(
      "[data-delete]"
    )
    .forEach(button => {
      button.onclick = () => {
        deleteTask(
          button.dataset.delete
        );
      };
    });
}

async function deleteTask(id) {
  const task =
    tasks.find(item => item.id === id);

  if (!task) {
    return;
  }

  if (!confirm(`Delete "${task.title}"? This can't be undone.`)) {
    return;
  }

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
  }
}

function formatDialogDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);

  return date.toLocaleDateString(
    [],
    {
      weekday: "long",
      month: "long",
      day: "numeric"
    }
  );
}

function renderDayDialogEvents(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const events = eventsForDate(date);

  if (!events.length) {
    $("dayDialogEvents").innerHTML = `
      <div class="day-dialog-event">
        <span class="task-meta">Nothing scheduled for this day.</span>
      </div>
    `;

    return;
  }

  $("dayDialogEvents").innerHTML =
    events.map(event => `
      <div class="day-dialog-event">
        <span>${escapeHtml(event.title)}</span>
        ${
          event.time
            ? `<span class="day-dialog-event-time">${escapeHtml(event.time)}</span>`
            : `<span class="task-meta">${event.type === "routine" ? "routine" : "task"}</span>`
        }
      </div>
    `).join("");
}

function openDayDialog(dateKey) {
  dayDialogDateKey = dateKey;

  $("dayDialogTitle").textContent =
    formatDialogDate(dateKey);

  renderDayDialogEvents(dateKey);

  $("dayTaskInput").value = "";
  $("dayDialogError").textContent = "";

  $("dayDialog").showModal();

  setTimeout(() => $("dayTaskInput").focus(), 150);
}

$("calendarGrid").addEventListener(
  "click",
  event => {
    const dayEl =
      event.target.closest(".calendar-day");

    if (!dayEl) {
      return;
    }

    openDayDialog(dayEl.dataset.date);
  }
);

$("closeDayDialog").onclick = () => {
  $("dayDialog").close();
};

$("dayDialog").addEventListener("close", () => {
  dayDialogDateKey = null;
});

$("dayTaskForm").onsubmit = async event => {
  event.preventDefault();

  const title = $("dayTaskInput").value.trim();

  if (!title) {
    return;
  }

  const { error } = await supabase
    .from("tasks")
    .insert({
      user_id: session.user.id,
      title,
      due_date: dayDialogDateKey
    });

  if (error) {
    $("dayDialogError").textContent = error.message;
    return;
  }

  $("dayTaskInput").value = "";
  $("dayDialogError").textContent = "";
};

$("calendarPrevious").onclick =
  () => {
    calendarDate.setMonth(
      calendarDate.getMonth() - 1
    );

    renderCalendar();
  };

$("calendarNext").onclick =
  () => {
    calendarDate.setMonth(
      calendarDate.getMonth() + 1
    );

    renderCalendar();
  };

$("calendarToday").onclick =
  () => {
    calendarDate =
      new Date();

    calendarDate.setDate(1);

    renderCalendar();
  };

$("lockButton").onclick =
  () => {
    sessionStorage.removeItem(
      "minddrop-unlocked"
    );

    location.href =
      "./index.html";
  };

const {
  data: {
    session: initialSession
  }
} = await supabase.auth.getSession();

session = initialSession;

if (
  !session ||
  sessionStorage.getItem(
    "minddrop-unlocked"
  ) !== "yes"
) {
  location.href =
    "./index.html";
} else {
  await loadData();
  realtimeStart();
}
