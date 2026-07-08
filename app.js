import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from "./config.js";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = id => document.getElementById(id);

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

let calendarDate = new Date();
calendarDate.setDate(1);

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

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;

  $("themeToggle").textContent =
    theme === "light" ? "☾" : "☼";

  localStorage.setItem("minddrop-theme", theme);
}

$("themeToggle").onclick = () => {
  const currentTheme =
    document.documentElement.dataset.theme;

  applyTheme(
    currentTheme === "light" ? "dark" : "light"
  );
};

applyTheme(
  localStorage.getItem("minddrop-theme") || "light"
);

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  profile = data;
}

async function loadData() {
  const [routineResult, taskResult] =
    await Promise.all([
      supabase
        .from("routines")
        .select("*")
        .order("time_of_day"),

      supabase
        .from("tasks")
        .select("*")
        .order("created_at", {
          ascending: false
        })
    ]);

  if (routineResult.error) {
    throw routineResult.error;
  }

  if (taskResult.error) {
    throw taskResult.error;
  }

  routines = routineResult.data || [];
  tasks = taskResult.data || [];

  renderRoutines();
renderTasks();
renderCalendar();
}

function realtimeStart() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel(`minddrop-${session.user.id}`)

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tasks",
        filter: `user_id=eq.${session.user.id}`
      },
      loadData
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "routines",
        filter: `user_id=eq.${session.user.id}`
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

function formatTime(value) {
  const [hour, minute] =
    value.slice(0, 5).split(":").map(Number);

  const date = new Date();

  date.setHours(hour, minute);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function routineOccursToday(routine) {
  const now = new Date();

  if (routine.frequency === "daily") {
    return true;
  }

  if (routine.frequency === "weekly") {
    return routine.weekday === now.getDay();
  }

  if (routine.frequency === "monthly") {
    return routine.monthday === now.getDate();
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

    return weekdays[routine.weekday] || "weekly";
  }

  if (routine.frequency === "monthly") {
    return `day ${routine.monthday} of each month`;
  }

  return routine.frequency;
}

function renderRoutines() {
  const today =
    new Date().toISOString().slice(0, 10);

  const filteredRoutines = routines.filter(
    routine =>
      routine.frequency === activeRoutineFrequency
  );

  $("routineHeading").textContent =
    `${activeRoutineFrequency} routine`;

  if (!filteredRoutines.length) {
    $("routineList").innerHTML = `
      <div class="empty">
        No ${activeRoutineFrequency} routines yet.
        Add one when you’re ready.
      </div>
    `;

    return;
  }

  $("routineList").innerHTML =
    filteredRoutines.map(routine => {
      const done =
        routine.completion_date === today;

      const dueToday =
        routineOccursToday(routine);

      return `
        <div class="routine-item">
          <div class="time">
            ${formatTime(routine.time_of_day)}
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
              ${escapeHtml(routine.title)}
            </div>

            <div class="routine-frequency">
              ${escapeHtml(frequencyLabel(routine))}
              ${dueToday ? " · due today" : ""}
            </div>
          </div>

          <button
            class="check ${done ? "done" : ""}"
            data-routine="${routine.id}"
            data-done="${done}"
            aria-label="Complete routine"
          ></button>
        </div>
      `;
    }).join("");

  document
    .querySelectorAll("[data-routine]")
    .forEach(button => {
      button.onclick = () => {
        toggleRoutine(
          button.dataset.routine,
          button.dataset.done === "true"
        );
      };
    });
}

function renderTasks() {
  const visibleTasks =
    tasks.filter(task => !task.completed);

  if (!visibleTasks.length) {
    $("taskList").innerHTML = `
      <div class="empty">
        Nothing captured yet.
      </div>
    `;

    return;
  }

  $("taskList").innerHTML =
    visibleTasks.map(task => `
      <div class="task-item">
        <button
          class="check"
          data-task="${task.id}"
          aria-label="Complete task"
        ></button>

        <div>
          <div class="task-title">
            ${escapeHtml(task.title)}
          </div>

          <div class="task-meta">
            captured task
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
    .querySelectorAll("[data-task]")
    .forEach(button => {
      button.onclick = () => {
        toggleTask(
          button.dataset.task,
          false
        );
      };
    });

  document
    .querySelectorAll("[data-delete]")
    .forEach(button => {
      button.onclick = () => {
        deleteTask(button.dataset.delete);
      };
    });
}

function localDateKey(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function routineMatchesDate(routine, date) {
  if (routine.frequency === "daily") {
    return true;
  }

  if (routine.frequency === "weekly") {
    return Number(routine.weekday) === date.getDay();
  }

  if (routine.frequency === "monthly") {
    return Number(routine.monthday) === date.getDate();
  }

  return false;
}

function taskDateKey(task) {
  /*
    The calendar first checks for due_date.

    If your table uses scheduled_date instead,
    it will check that too.
  */
  return (
    task.due_date ||
    task.scheduled_date ||
    null
  );
}

function getCalendarItems(date) {
  const dateKey = localDateKey(date);

  const routineItems = routines
    .filter(routine => routineMatchesDate(routine, date))
    .map(routine => ({
      type: "routine",
      title: routine.title,
      time: routine.time_of_day
        ? formatTime(routine.time_of_day)
        : ""
    }));

  const taskItems = tasks
    .filter(task => {
      return (
        !task.completed &&
        taskDateKey(task) === dateKey
      );
    })
    .map(task => ({
      type: "task",
      title: task.title,
      time: ""
    }));

  return [
    ...routineItems,
    ...taskItems
  ];
}

function renderCalendar() {
  const grid = $("calendarGrid");
  const monthTitle = $("calendarMonthTitle");

  if (!grid || !monthTitle) {
    return;
  }

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  monthTitle.textContent =
    calendarDate.toLocaleDateString([], {
      month: "long",
      year: "numeric"
    });

  const firstDayOfMonth =
    new Date(year, month, 1);

  const firstVisibleDate =
    new Date(year, month, 1 - firstDayOfMonth.getDay());

  const todayKey =
    localDateKey(new Date());

  let calendarHtml = "";

  for (let index = 0; index < 42; index++) {
    const currentDate =
      new Date(firstVisibleDate);

    currentDate.setDate(
      firstVisibleDate.getDate() + index
    );

    const currentKey =
      localDateKey(currentDate);

    const isOutsideMonth =
      currentDate.getMonth() !== month;

    const isToday =
      currentKey === todayKey;

    const items =
      getCalendarItems(currentDate);

    const visibleItems =
      items.slice(0, 3);

    const remainingCount =
      items.length - visibleItems.length;

    const eventHtml =
      visibleItems.map(item => `
        <div
          class="calendar-event ${item.type}"
          title="${escapeHtml(item.title)}"
        >
          ${
            item.time
              ? `<span class="calendar-event-time">
                   ${escapeHtml(item.time)}
                 </span>`
              : ""
          }

          <span>
            ${escapeHtml(item.title)}
          </span>
        </div>
      `).join("");

    const moreHtml =
      remainingCount > 0
        ? `
          <div class="calendar-more">
            +${remainingCount} more
          </div>
        `
        : "";

    calendarHtml += `
      <div
        class="
          calendar-day
          ${isOutsideMonth ? "outside-month" : ""}
          ${isToday ? "today" : ""}
        "
        data-date="${currentKey}"
      >
        <div class="calendar-day-number">
          ${currentDate.getDate()}
        </div>

        <div class="calendar-day-events">
          ${eventHtml}
          ${moreHtml}
        </div>
      </div>
    `;
  }

  grid.innerHTML = calendarHtml;

  renderUnscheduledTasks();
}

function renderUnscheduledTasks() {
  const container =
    $("unscheduledTaskList");

  if (!container) {
    return;
  }

  const unscheduledTasks =
    tasks.filter(task => {
      return (
        !task.completed &&
        !taskDateKey(task)
      );
    });

  if (!unscheduledTasks.length) {
    container.innerHTML = `
      <div class="empty">
        No unscheduled tasks.
      </div>
    `;

    return;
  }

  container.innerHTML =
    unscheduledTasks.map(task => `
      <div class="task-item">
        <button
          class="check"
          data-unscheduled-task="${task.id}"
          aria-label="Complete task"
        ></button>

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
          data-unscheduled-delete="${task.id}"
          aria-label="Delete task"
        >
          ×
        </button>
      </div>
    `).join("");

  document
    .querySelectorAll("[data-unscheduled-task]")
    .forEach(button => {
      button.onclick = () => {
        toggleTask(
          button.dataset.unscheduledTask,
          false
        );
      };
    });

  document
    .querySelectorAll("[data-unscheduled-delete]")
    .forEach(button => {
      button.onclick = () => {
        deleteTask(
          button.dataset.unscheduledDelete
        );
      };
    });
}

function moveCalendarMonth(amount) {
  calendarDate.setMonth(
    calendarDate.getMonth() + amount
  );

  renderCalendar();
}

$("calendarPrevious").onclick = () => {
  moveCalendarMonth(-1);
};

$("calendarNext").onclick = () => {
  moveCalendarMonth(1);
};

$("calendarToday").onclick = () => {
  calendarDate = new Date();
  calendarDate.setDate(1);

  renderCalendar();
};

async function toggleRoutine(id, done) {
  const routine = routines.find(
    item => item.id === id
  );

  if (!routine) {
    return;
  }

  const previousDate =
    routine.completion_date;

  const nextDate = done
    ? null
    : new Date().toISOString().slice(0, 10);

  /*
    Update the page immediately.
    The user does not have to wait for Supabase.
  */
  routine.completion_date = nextDate;
  renderRoutines();

  const { error } = await supabase
    .from("routines")
    .update({
      completion_date: nextDate
    })
    .eq("id", id);

  /*
    If syncing fails, return the checkbox
    to its previous state.
  */
  if (error) {
    routine.completion_date = previousDate;
    renderRoutines();
    alert(error.message);
  }
}

async function toggleTask(id, done) {
  const task = tasks.find(
    item => item.id === id
  );

  if (!task) {
    return;
  }

  const previousValue = task.completed;

  /*
    Update the page immediately.
  */
  task.completed = !done;
  renderTasks();

  const { error } = await supabase
    .from("tasks")
    .update({
      completed: !done
    })
    .eq("id", id);

  if (error) {
    task.completed = previousValue;
    renderTasks();
    alert(error.message);
  }
}

async function deleteTask(id) {
  const previousTasks = [...tasks];

  tasks = tasks.filter(
    task => task.id !== id
  );

  renderTasks();

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id);

  if (error) {
    tasks = previousTasks;
    renderTasks();
    alert(error.message);
  }
}

$("taskInput").onkeydown = async event => {
  if (event.key !== "Enter") {
    return;
  }

  const title =
    $("taskInput").value.trim();

  if (!title) {
    return;
  }

  const { error } = await supabase
    .from("tasks")
    .insert({
      user_id: session.user.id,
      title
    });

  if (error) {
    alert(error.message);
    return;
  }

  $("taskInput").value = "";
};

document
  .querySelectorAll(".routine-tab")
  .forEach(button => {
    button.onclick = () => {
      activeRoutineFrequency =
        button.dataset.frequency;

      document
        .querySelectorAll(".routine-tab")
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
    $("routineFrequencyInput").value;

  $("weekdayField").classList.toggle(
    "hidden",
    frequency !== "weekly"
  );

  $("monthdayField").classList.toggle(
    "hidden",
    frequency !== "monthly"
  );
}

$("routineFrequencyInput").onchange =
  updateRoutineFields;

$("addRoutineButton").onclick = () => {
  $("routineForm").reset();

  $("routineTimeInput").value = "09:00";

  $("routineFrequencyInput").value =
    activeRoutineFrequency;

  updateRoutineFields();

  $("routineDialogError").textContent = "";

  $("routineDialog").showModal();

  setTimeout(() => {
    $("routineTitleInput").focus();
  }, 250);
};

$("cancelRoutineButton").onclick = () => {
  $("routineDialog").close();
};

$("routineForm").onsubmit =
  async event => {
    event.preventDefault();

    const title =
      $("routineTitleInput").value.trim();

    const frequency =
      $("routineFrequencyInput").value;

    const weekday =
      frequency === "weekly"
        ? Number(
            $("routineWeekdayInput").value
          )
        : null;

    const monthday =
      frequency === "monthly"
        ? Number(
            $("routineMonthdayInput").value
          )
        : null;

    if (!title) {
      $("routineDialogError").textContent =
        "Enter a routine name.";

      return;
    }

    const { error } = await supabase
      .from("routines")
      .insert({
        user_id: session.user.id,
        title,
        time_of_day:
          $("routineTimeInput").value,
        frequency,
        weekday,
        monthday,
        sort_order: routines.length
      });

    if (error) {
      $("routineDialogError").textContent =
        error.message;

      return;
    }

    activeRoutineFrequency = frequency;

    document
      .querySelectorAll(".routine-tab")
      .forEach(tab => {
        tab.classList.toggle(
          "active",
          tab.dataset.frequency === frequency
        );
      });

    $("routineDialog").close();
  };

$("lockButton").onclick = () => {
  sessionStorage.removeItem(
    "minddrop-unlocked"
  );

  location.href = "./index.html";
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
  location.href = "./index.html";
} else {
  await loadProfile();

  $("dashboardGreeting").textContent =
    `hey, ${profile.name}`;

  $("dashboardMotivation").textContent =
    motivations[
      Math.floor(
        Math.random() * motivations.length
      )
    ];

  await loadData();
  realtimeStart();
}