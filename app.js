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

const motivations = [
  "You only need to do the next small thing.",
  "Done imperfectly is still done.",
  "Your brain does not have to hold everything.",
  "Pause, breathe, choose one thing."
];

let session = null;
let profile = null;
let routines = [];
let tasks = [];
let activeRoutineFrequency = "daily";
let realtimeChannel = null;
let showCompleted = false;

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

function routineOccursOnDate(
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

function frequencyLabel(routine) {
  if (routine.frequency === "daily") {
    return "every day";
  }

  if (routine.frequency === "weekly") {
    const weekdays = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday"
    ];

    return (
      weekdays[routine.weekday] ||
      "weekly"
    );
  }

  if (routine.frequency === "monthly") {
    return (
      `day ${routine.monthday} of each month`
    );
  }

  return routine.frequency;
}

async function loadProfile() {
  const {
    data,
    error
  } = await supabase
    .from("profiles")
    .select("*")
    .eq(
      "id",
      session.user.id
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  profile = data;
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

  renderRoutines();
  renderTasks();
  renderUpcoming();
}

function realtimeStart() {
  if (realtimeChannel) {
    supabase.removeChannel(
      realtimeChannel
    );
  }

  realtimeChannel = supabase
    .channel(
      `minddrop-dashboard-${session.user.id}`
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

function renderRoutines() {
  const today =
    localDateKey(new Date());

  const filtered =
    routines.filter(
      routine =>
        routine.frequency ===
        activeRoutineFrequency
    );

  $("routineHeading").textContent =
    `${activeRoutineFrequency} routine`;

  if (!filtered.length) {
    $("routineList").innerHTML = `
      <div class="empty">
        No ${activeRoutineFrequency}
        routines yet.
      </div>
    `;

    return;
  }

  $("routineList").innerHTML =
    filtered.map(routine => {
      const done =
        routine.completion_date ===
        today;

      return `
        <div class="routine-item">
          <div class="time">
            ${formatTime(
              routine.time_of_day
            )}
          </div>

          <div>
            <div
              class="task-title"
              style="${
                done
                  ? "text-decoration:line-through;opacity:.55"
                  : ""
              }"
            >
              ${escapeHtml(
                routine.title
              )}
            </div>

            <div class="routine-frequency">
              ${escapeHtml(
                frequencyLabel(routine)
              )}
            </div>
          </div>

          <button
            class="check ${
              done ? "done" : ""
            }"
            data-routine="${routine.id}"
            data-done="${done}"
            aria-label="Complete routine"
          ></button>
        </div>
      `;
    }).join("");

  document
    .querySelectorAll(
      "[data-routine]"
    )
    .forEach(button => {
      button.onclick = () => {
        toggleRoutine(
          button.dataset.routine,
          button.dataset.done === "true"
        );
      };
    });
}

function taskRowHtml(task) {
  const done = !!task.completed;

  const metaParts = [
    task.due_date
      ? `scheduled ${escapeHtml(task.due_date)}`
      : "captured task"
  ];

  if (task.category && task.category !== "today") {
    metaParts.push(escapeHtml(task.category));
  }

  return `
    <div class="task-item">
      <button
        class="check ${done ? "done" : ""}"
        data-task="${task.id}"
        data-done="${done}"
        aria-label="${done ? "Mark task incomplete" : "Complete task"}"
      ></button>

      <div>
        <div class="task-title-row">
          ${task.priority === "must" ? '<span class="priority-dot" title="must-do"></span>' : ""}
          <div
            class="task-title"
            style="${done ? "text-decoration:line-through;opacity:.55" : ""}"
          >
            ${escapeHtml(task.title)}
          </div>
        </div>

        <div class="task-meta">
          ${metaParts.join(" · ")}
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
  `;
}

function renderTasks() {
  const activeTasks =
    tasks.filter(task => !task.completed);

  const completedTasks =
    tasks.filter(task => task.completed);

  $("toggleCompletedButton").textContent =
    showCompleted
      ? "hide completed"
      : `show completed${completedTasks.length ? ` (${completedTasks.length})` : ""}`;

  const rows = [
    ...activeTasks,
    ...(showCompleted ? completedTasks : [])
  ];

  if (!rows.length) {
    $("taskList").innerHTML = `
      <div class="empty">
        Nothing captured yet.
      </div>
    `;

    return;
  }

  $("taskList").innerHTML =
    rows.map(taskRowHtml).join("");

  document
    .querySelectorAll(
      "[data-task]"
    )
    .forEach(button => {
      button.onclick = () => {
        toggleTask(
          button.dataset.task,
          button.dataset.done === "true"
        );
      };
    });

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

$("toggleCompletedButton").onclick = () => {
  showCompleted = !showCompleted;
  renderTasks();
};

function renderUpcoming() {
  const upcoming = [];

  for (
    let offset = 0;
    offset < 7;
    offset++
  ) {
    const date = new Date();

    date.setHours(
      0,
      0,
      0,
      0
    );

    date.setDate(
      date.getDate() + offset
    );

    const dateKey =
      localDateKey(date);

    routines
      .filter(routine =>
        routineOccursOnDate(
          routine,
          date
        )
      )
      .forEach(routine => {
        upcoming.push({
          date,
          title: routine.title,
          detail:
            `routine · ${formatTime(
              routine.time_of_day
            )}`
        });
      });

    tasks
      .filter(task =>
        !task.completed &&
        task.due_date === dateKey
      )
      .forEach(task => {
        upcoming.push({
          date,
          title: task.title,
          detail: "scheduled task"
        });
      });
  }

  upcoming.sort(
    (first, second) =>
      first.date - second.date
  );

  const visible =
    upcoming.slice(0, 5);

  if (!visible.length) {
    $("upcomingList").innerHTML = `
      <div class="empty">
        Nothing scheduled for
        the next seven days.
      </div>
    `;

    return;
  }

  $("upcomingList").innerHTML =
    visible.map(item => `
      <div class="upcoming-item">
        <div class="time">
          ${item.date.toLocaleDateString(
            [],
            {
              weekday: "short",
              month: "short",
              day: "numeric"
            }
          )}
        </div>

        <div>
          <div class="task-title">
            ${escapeHtml(item.title)}
          </div>

          <div class="task-meta">
            ${escapeHtml(item.detail)}
          </div>
        </div>
      </div>
    `).join("");
}

async function toggleRoutine(
  id,
  done
) {
  const routine =
    routines.find(
      item => item.id === id
    );

  if (!routine) {
    return;
  }

  const previousDate =
    routine.completion_date;

  const nextDate =
    done
      ? null
      : localDateKey(
          new Date()
        );

  routine.completion_date =
    nextDate;

  renderRoutines();

  const {
    error
  } = await supabase
    .from("routines")
    .update({
      completion_date: nextDate
    })
    .eq("id", id);

  if (error) {
    routine.completion_date =
      previousDate;

    renderRoutines();

    alert(error.message);
  }
}

async function toggleTask(
  id,
  done
) {
  const task =
    tasks.find(
      item => item.id === id
    );

  if (!task) {
    return;
  }

  const previous =
    task.completed;

  task.completed =
    !done;

  renderTasks();
  renderUpcoming();

  const {
    error
  } = await supabase
    .from("tasks")
    .update({
      completed: !done
    })
    .eq("id", id);

  if (error) {
    task.completed =
      previous;

    renderTasks();
    renderUpcoming();

    alert(error.message);
  }
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

  const previousTasks =
    [...tasks];

  tasks =
    tasks.filter(
      item => item.id !== id
    );

  renderTasks();
  renderUpcoming();

  const {
    error
  } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id);

  if (error) {
    tasks =
      previousTasks;

    renderTasks();
    renderUpcoming();

    alert(error.message);
  }
}

$("taskInput").onkeydown =
  async event => {
    if (event.key !== "Enter") {
      return;
    }

    const title =
      $("taskInput")
        .value
        .trim();

    if (!title) {
      return;
    }

    const {
      error
    } = await supabase
      .from("tasks")
      .insert({
        user_id:
          session.user.id,
        title,
        priority:
          $("taskPriorityInput").value,
        category:
          $("taskCategoryInput").value
      });

    if (error) {
      alert(error.message);
      return;
    }

    $("taskInput").value = "";
  };

document
  .querySelectorAll(
    ".routine-tab"
  )
  .forEach(button => {
    button.onclick = () => {
      activeRoutineFrequency =
        button.dataset.frequency;

      document
        .querySelectorAll(
          ".routine-tab"
        )
        .forEach(tab => {
          tab.classList.toggle(
            "active",
            tab === button
          );
        });

      renderRoutines();
    };
  });

function updateRoutineFields() {
  const frequency =
    $("routineFrequencyInput")
      .value;

  $("weekdayField")
    .classList
    .toggle(
      "hidden",
      frequency !== "weekly"
    );

  $("monthdayField")
    .classList
    .toggle(
      "hidden",
      frequency !== "monthly"
    );
}

$("routineFrequencyInput")
  .onchange =
  updateRoutineFields;

$("addRoutineButton").onclick =
  () => {
    $("routineForm").reset();

    $("routineTimeInput").value =
      "09:00";

    $("routineFrequencyInput").value =
      activeRoutineFrequency;

    updateRoutineFields();

    $("routineDialogError")
      .textContent = "";

    $("routineDialog")
      .showModal();

    setTimeout(
      () =>
        $("routineTitleInput")
          .focus(),
      200
    );
  };

$("cancelRoutineButton").onclick =
  () => {
    $("routineDialog").close();
  };

$("routineForm").onsubmit =
  async event => {
    event.preventDefault();

    const title =
      $("routineTitleInput")
        .value
        .trim();

    const frequency =
      $("routineFrequencyInput")
        .value;

    const weekday =
      frequency === "weekly"
        ? Number(
            $("routineWeekdayInput")
              .value
          )
        : null;

    const monthday =
      frequency === "monthly"
        ? Number(
            $("routineMonthdayInput")
              .value
          )
        : null;

    if (!title) {
      $("routineDialogError")
        .textContent =
        "Enter a routine name.";

      return;
    }

    const {
      error
    } = await supabase
      .from("routines")
      .insert({
        user_id:
          session.user.id,

        title,

        time_of_day:
          $("routineTimeInput")
            .value,

        frequency,
        weekday,
        monthday,

        sort_order:
          routines.length
      });

    if (error) {
      $("routineDialogError")
        .textContent =
        error.message;

      return;
    }

    activeRoutineFrequency =
      frequency;

    document
      .querySelectorAll(
        ".routine-tab"
      )
      .forEach(tab => {
        tab.classList.toggle(
          "active",
          tab.dataset.frequency ===
            frequency
        );
      });

    $("routineDialog").close();
  };

$("lockButton").onclick = () => {
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
  await loadProfile();

  $("dashboardGreeting")
    .textContent =
    `hey, ${profile.name}`;

  $("dashboardMotivation")
    .textContent =
    motivations[
      Math.floor(
        Math.random() *
        motivations.length
      )
    ];

  await loadData();
  realtimeStart();
}
