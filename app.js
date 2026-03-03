(() => {
  "use strict";

  const STORAGE_KEY = "nocturne-deck-state-v3";
  const MAX_BOOKMARKS = 18;

  const SEARCH_ENGINES = {
    duckduckgo: {
      label: "DuckDuckGo",
      build: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
    },
    google: {
      label: "Google",
      build: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
    },
    bing: {
      label: "Bing",
      build: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`
    },
    brave: {
      label: "Brave",
      build: (query) => `https://search.brave.com/search?q=${encodeURIComponent(query)}`
    },
    kagi: {
      label: "Kagi",
      build: (query) => `https://kagi.com/search?q=${encodeURIComponent(query)}`
    }
  };

  const DEFAULT_BOOKMARKS = [
    { id: "github", title: "GitHub", url: "https://github.com" },
    { id: "gmail", title: "Gmail", url: "https://mail.google.com" },
    { id: "notion", title: "Notion", url: "https://www.notion.so" },
    { id: "figma", title: "Figma", url: "https://www.figma.com" },
    { id: "youtube", title: "YouTube", url: "https://www.youtube.com" },
    { id: "hn", title: "Hacker News", url: "https://news.ycombinator.com" }
  ];

  const Motion = (() => {
    function spring({ from = 0, to = 1, stiffness = 0.14, damping = 0.78, mass = 1, onUpdate, onComplete }) {
      let value = from;
      let velocity = 0;
      let rafId = 0;
      const epsilon = 0.01;

      const tick = () => {
        const force = (to - value) * stiffness;
        const acceleration = force / mass;
        velocity = (velocity + acceleration) * damping;
        value += velocity;

        if (onUpdate) {
          onUpdate(value);
        }

        if (Math.abs(velocity) < epsilon && Math.abs(to - value) < epsilon) {
          if (onUpdate) {
            onUpdate(to);
          }
          if (onComplete) {
            onComplete();
          }
          return;
        }

        rafId = window.requestAnimationFrame(tick);
      };

      rafId = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(rafId);
    }

    function stagger(elements, callback, gap = 85) {
      elements.forEach((element, index) => {
        window.setTimeout(() => callback(element, index), index * gap);
      });
    }

    return { spring, stagger };
  })();

  const refs = {
    cursorBloom: document.getElementById("cursorBloom"),
    clockHours: document.getElementById("clockHours"),
    clockMinutes: document.getElementById("clockMinutes"),
    dayLine: document.getElementById("dayLine"),
    searchForm: document.getElementById("searchForm"),
    searchInput: document.getElementById("searchInput"),
    engineLabel: document.getElementById("engineLabel"),
    bookmarkGrid: document.getElementById("bookmarkGrid"),
    calendarTitle: document.getElementById("calendarTitle"),
    calendarGridWrap: document.getElementById("calendarGridWrap"),
    calendarGrid: document.getElementById("calendarGrid"),
    viewMonth: document.getElementById("viewMonth"),
    todoForm: document.getElementById("todoForm"),
    todoInput: document.getElementById("todoInput"),
    todoList: document.getElementById("todoList"),
    scratchpad: document.getElementById("scratchpad"),
    sparkLayer: document.getElementById("sparkLayer"),
    openSettings: document.getElementById("openSettings"),
    settingsModal: document.getElementById("settingsModal"),
    closeSettings: document.getElementById("closeSettings"),
    engineSelect: document.getElementById("engineSelect"),
    bookmarkForm: document.getElementById("bookmarkForm"),
    bookmarkTitle: document.getElementById("bookmarkTitle"),
    bookmarkUrl: document.getElementById("bookmarkUrl"),
    settingsBookmarkList: document.getElementById("settingsBookmarkList")
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = loadState();
  const magneticBound = new WeakSet();

  let stopCalendarHeightAnimation = null;

  init();

  function init() {
    initWorldMotion();
    initEntrance();
    initClock();
    initSearch();
    initBookmarks();
    initCalendar();
    initTodos();
    initScratchpad();
    initSettings();
    updateSearchEngineUI();
    bindMagnetic(document);
    focusSearchOnLoad();
  }

  function createDefaultState() {
    return {
      searchEngine: "duckduckgo",
      calendarMode: "month",
      bookmarks: DEFAULT_BOOKMARKS.map((bookmark) => ({ ...bookmark })),
      todos: [],
      scratchpad: ""
    };
  }

  function normalizeState(raw) {
    const safe = createDefaultState();

    if (!raw || typeof raw !== "object") {
      return safe;
    }

    if (typeof raw.searchEngine === "string" && SEARCH_ENGINES[raw.searchEngine]) {
      safe.searchEngine = raw.searchEngine;
    }

    safe.calendarMode = "month";

    if (Array.isArray(raw.bookmarks) && raw.bookmarks.length > 0) {
      safe.bookmarks = raw.bookmarks
        .filter((bookmark) => bookmark && typeof bookmark.title === "string" && typeof bookmark.url === "string")
        .map((bookmark) => ({
          id: typeof bookmark.id === "string" ? bookmark.id : generateId(),
          title: bookmark.title.trim().slice(0, 60),
          url: normalizeUrl(bookmark.url) || bookmark.url
        }))
        .filter((bookmark) => bookmark.title.length > 0 && bookmark.url.length > 0)
        .slice(0, MAX_BOOKMARKS);
    }

    if (Array.isArray(raw.todos)) {
      safe.todos = raw.todos
        .filter((todo) => todo && typeof todo.text === "string")
        .map((todo) => ({
          id: typeof todo.id === "string" ? todo.id : generateId(),
          text: todo.text.trim().slice(0, 120),
          done: Boolean(todo.done)
        }))
        .filter((todo) => todo.text.length > 0);
    }

    if (typeof raw.scratchpad === "string") {
      safe.scratchpad = raw.scratchpad.slice(0, 50000);
    }

    return safe;
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return createDefaultState();
      }
      return normalizeState(JSON.parse(raw));
    } catch {
      return createDefaultState();
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore localStorage failures and keep the page usable.
    }
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function initWorldMotion() {
    const layers = Array.from(document.querySelectorAll(".nebula"));
    const floats = Array.from(document.querySelectorAll(".float"));

    if (reducedMotion) {
      return;
    }

    const pointer = {
      tx: window.innerWidth * 0.5,
      ty: window.innerHeight * 0.5,
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5
    };

    window.addEventListener("pointermove", (event) => {
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
    });

    window.addEventListener("pointerleave", () => {
      pointer.tx = window.innerWidth * 0.5;
      pointer.ty = window.innerHeight * 0.5;
    });

    const run = () => {
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;

      const nx = pointer.x / window.innerWidth - 0.5;
      const ny = pointer.y / window.innerHeight - 0.5;

      layers.forEach((layer) => {
        const depth = Number(layer.dataset.depth || 0);
        const shiftX = -nx * depth;
        const shiftY = -ny * depth;
        layer.style.transform = `translate3d(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px, 0)`;
      });

      floats.forEach((node) => {
        const depth = Number(node.dataset.depth || 0);
        const shiftX = -nx * depth;
        const shiftY = -ny * depth;
        node.style.setProperty("--float-x", `${shiftX.toFixed(2)}px`);
        node.style.setProperty("--float-y", `${shiftY.toFixed(2)}px`);
      });

      if (refs.cursorBloom) {
        const offset = window.innerWidth * 0.17;
        refs.cursorBloom.style.transform = `translate3d(${(pointer.x - offset).toFixed(2)}px, ${(pointer.y - offset).toFixed(2)}px, 0)`;
      }

      window.requestAnimationFrame(run);
    };

    run();
  }

  function initEntrance() {
    const entries = Array.from(document.querySelectorAll(".entrance"))
      .sort((a, b) => Number(a.dataset.order || 0) - Number(b.dataset.order || 0));

    if (reducedMotion) {
      entries.forEach((entry) => entry.classList.add("in"));
      return;
    }

    window.setTimeout(() => {
      Motion.stagger(entries, (entry) => entry.classList.add("in"), 90);
    }, 70);
  }

  function initClock() {
    const now = new Date();
    setClockSlot(refs.clockHours, format2(now.getHours()), false);
    setClockSlot(refs.clockMinutes, format2(now.getMinutes()), false);
    updateDayLine(now);

    let token = `${now.getHours()}:${now.getMinutes()}`;

    window.setInterval(() => {
      const current = new Date();
      const nextToken = `${current.getHours()}:${current.getMinutes()}`;

      if (nextToken === token) {
        return;
      }

      setClockSlot(refs.clockHours, format2(current.getHours()), true);
      setClockSlot(refs.clockMinutes, format2(current.getMinutes()), true);
      updateDayLine(current);
      token = nextToken;
    }, 1000);
  }

  function setClockSlot(slot, value, animate) {
    const current = slot.querySelector(".current");
    const next = slot.querySelector(".next");

    if (!animate || reducedMotion || current.textContent === value) {
      current.textContent = value;
      next.textContent = value;
      slot.classList.remove("flip");
      return;
    }

    next.textContent = value;
    slot.classList.add("flip");

    window.setTimeout(() => {
      current.textContent = value;
      next.textContent = value;
      slot.classList.remove("flip");
    }, 560);
  }

  function updateDayLine(date) {
    refs.dayLine.textContent = date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
  }

  function initSearch() {
    refs.searchInput.addEventListener("focus", () => {
      document.body.classList.add("search-focus");
    });

    refs.searchInput.addEventListener("blur", () => {
      document.body.classList.remove("search-focus");
    });

    refs.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const query = refs.searchInput.value.trim();
      if (!query) {
        return;
      }

      const destination = resolveSearchDestination(query);
      window.location.href = destination;
    });
  }

  function resolveSearchDestination(query) {
    if (hasProtocol(query)) {
      return query;
    }

    if (looksLikeDomain(query)) {
      return normalizeUrl(query) || `https://${query}`;
    }

    const engine = SEARCH_ENGINES[state.searchEngine] || SEARCH_ENGINES.duckduckgo;
    return engine.build(query);
  }

  function hasProtocol(value) {
    return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  }

  function looksLikeDomain(value) {
    return value.includes(".") && !value.includes(" ") && !value.startsWith("?") && !value.startsWith("#");
  }

  function updateSearchEngineUI() {
    const engine = SEARCH_ENGINES[state.searchEngine] || SEARCH_ENGINES.duckduckgo;
    refs.engineLabel.textContent = engine.label;
    refs.engineSelect.value = state.searchEngine;
  }

  function initBookmarks() {
    renderBookmarks();
  }

  function renderBookmarks() {
    refs.bookmarkGrid.innerHTML = "";

    if (state.bookmarks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "bookmark-empty";
      empty.textContent = "No pinned tabs yet. Add sites from Control.";
      refs.bookmarkGrid.appendChild(empty);
      return;
    }

    state.bookmarks.forEach((bookmark) => {
      const title = bookmark.title.trim();
      const host = hostFromUrl(bookmark.url);
      const faviconUrl = faviconFromUrl(bookmark.url);

      const card = document.createElement("button");
      card.type = "button";
      card.className = "bookmark-card micro-react";
      card.innerHTML = `
        <span class="bookmark-top">
          <span class="bookmark-visual">
            <img class="bookmark-favicon" src="${escapeHtml(faviconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
            <span class="bookmark-fallback">${escapeHtml(title.charAt(0).toUpperCase())}</span>
          </span>
          <span class="bookmark-arrow" aria-hidden="true">↗</span>
        </span>
        <span class="bookmark-title">${escapeHtml(title)}</span>
        <small class="bookmark-host">${escapeHtml(host)}</small>
      `;

      card.addEventListener("click", () => {
        window.location.href = bookmark.url;
      });

      const favicon = card.querySelector(".bookmark-favicon");
      if (!faviconUrl || !favicon) {
        card.classList.add("no-favicon");
      } else {
        favicon.addEventListener(
          "error",
          () => {
            card.classList.add("no-favicon");
          },
          { once: true }
        );
      }

      refs.bookmarkGrid.appendChild(card);
    });

    bindMagnetic(refs.bookmarkGrid);
  }

  function initCalendar() {
    if (state.calendarMode !== "month") {
      state.calendarMode = "month";
      saveState();
    }

    refs.viewMonth.addEventListener("click", () => {
      renderCalendar(true);
    });

    renderCalendar(false);
  }

  function renderCalendar(animatePanel) {
    const today = new Date();
    const previousHeight = refs.calendarGridWrap.getBoundingClientRect().height;
    const weeks = getMonthWeeks(today);

    refs.calendarGrid.innerHTML = "";

    weeks.forEach((week, weekIndex) => {
      const row = document.createElement("div");
      row.className = "calendar-week";

      if (weekIndex >= 2) {
        row.classList.add("extra");
        const bucket = Math.min(3, weekIndex - 2);
        if (bucket > 0) {
          row.classList.add(`d${bucket}`);
        }
      }

      week.forEach((day) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "day-cell micro-react";

        if (day.getMonth() !== today.getMonth()) {
          cell.classList.add("muted");
        }
        if (isSameDate(day, today)) {
          cell.classList.add("today");
        }

        cell.textContent = String(day.getDate());
        row.appendChild(cell);
      });

      refs.calendarGrid.appendChild(row);
    });

    updateCalendarHeader(today, weeks);
    updateCalendarToggleUI();
    bindMagnetic(refs.calendarGrid);

    if (animatePanel && !reducedMotion) {
      const nextHeight = refs.calendarGrid.getBoundingClientRect().height;
      animateHeight(refs.calendarGridWrap, previousHeight, nextHeight);
    } else {
      refs.calendarGridWrap.style.height = "";
      refs.calendarGridWrap.style.overflow = "";
    }
  }

  function updateCalendarHeader(today, weeks) {
    refs.calendarTitle.textContent = today.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  }

  function updateCalendarToggleUI() {
    refs.viewMonth.classList.add("is-active");
    refs.viewMonth.setAttribute("aria-selected", "true");
  }

  function animateHeight(element, from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return;
    }

    if (stopCalendarHeightAnimation) {
      stopCalendarHeightAnimation();
      stopCalendarHeightAnimation = null;
    }

    if (Math.abs(from - to) < 1) {
      element.style.height = "";
      element.style.overflow = "";
      return;
    }

    element.style.height = `${from}px`;
    element.style.overflow = "hidden";

    stopCalendarHeightAnimation = Motion.spring({
      from,
      to,
      stiffness: 0.125,
      damping: 0.76,
      onUpdate: (value) => {
        element.style.height = `${value.toFixed(2)}px`;
      },
      onComplete: () => {
        element.style.height = "";
        element.style.overflow = "";
        stopCalendarHeightAnimation = null;
      }
    });
  }

  function getMonthWeeks(referenceDate) {
    const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);

    const start = startOfWeek(monthStart);
    const end = endOfWeek(monthEnd);

    const rows = [];
    let cursor = new Date(start);

    while (cursor <= end) {
      const week = [];
      for (let i = 0; i < 7; i += 1) {
        const day = new Date(cursor);
        day.setDate(cursor.getDate() + i);
        week.push(day);
      }
      rows.push(week);
      cursor.setDate(cursor.getDate() + 7);
    }

    return rows;
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  }

  function endOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() + (6 - offset));
    return d;
  }

  function isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function initTodos() {
    refs.todoForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const text = refs.todoInput.value.trim();
      if (!text) {
        return;
      }

      const todo = {
        id: generateId(),
        text: text.slice(0, 120),
        done: false
      };

      state.todos.unshift(todo);
      saveState();
      refs.todoInput.value = "";

      const row = renderTodoRow(todo);
      const empty = refs.todoList.querySelector(".todo-empty");
      if (empty) {
        empty.remove();
      }

      refs.todoList.prepend(row);
      bindMagnetic(row);
      animateTodoIn(row);
    });

    renderTodos();
  }

  function renderTodos() {
    refs.todoList.innerHTML = "";

    if (state.todos.length === 0) {
      const empty = document.createElement("li");
      empty.className = "todo-empty";
      empty.textContent = "No tasks yet. Add one and start moving.";
      refs.todoList.appendChild(empty);
      return;
    }

    state.todos.forEach((todo) => {
      refs.todoList.appendChild(renderTodoRow(todo));
    });

    bindMagnetic(refs.todoList);
  }

  function renderTodoRow(todo) {
    const item = document.createElement("li");
    item.className = "todo-item";
    item.dataset.id = todo.id;

    if (todo.done) {
      item.classList.add("done");
    }

    item.innerHTML = `
      <div class="todo-row micro-react">
        <button class="todo-check" type="button" aria-label="Toggle done"></button>
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        <button class="todo-delete micro-react" type="button">Delete</button>
      </div>
    `;

    const check = item.querySelector(".todo-check");
    const remove = item.querySelector(".todo-delete");

    check.addEventListener("click", () => {
      const target = state.todos.find((entry) => entry.id === todo.id);
      if (!target) {
        return;
      }

      target.done = !target.done;
      item.classList.toggle("done", target.done);
      saveState();
    });

    remove.addEventListener("click", () => {
      deleteTodo(todo.id, item);
    });

    return item;
  }

  function animateTodoIn(item) {
    if (reducedMotion) {
      return;
    }

    item.style.opacity = "0";
    item.style.transform = "translateX(-34px) scale(0.94)";

    Motion.spring({
      from: -34,
      to: 0,
      stiffness: 0.16,
      damping: 0.74,
      onUpdate: (value) => {
        const progress = 1 - Math.min(1, Math.abs(value / 34));
        item.style.transform = `translateX(${value.toFixed(2)}px) scale(${(0.94 + progress * 0.06).toFixed(3)})`;
        item.style.opacity = String(Math.min(1, progress * 1.2));
      },
      onComplete: () => {
        item.style.opacity = "";
        item.style.transform = "";
      }
    });
  }

  function deleteTodo(id, item) {
    item.classList.add("deleting");

    const startHeight = item.getBoundingClientRect().height;
    item.style.height = `${startHeight}px`;
    item.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      item.style.transition = "height 360ms var(--spring), opacity 260ms ease, transform 360ms var(--spring), margin 360ms ease";
      item.style.height = "0px";
      item.style.opacity = "0";
      item.style.transform = "translateX(12px) scale(0.9)";
      item.style.margin = "0";
    });

    window.setTimeout(() => {
      state.todos = state.todos.filter((todo) => todo.id !== id);
      saveState();
      renderTodos();
    }, 380);
  }

  function initScratchpad() {
    refs.scratchpad.value = state.scratchpad;
    autoGrowScratchpad();

    refs.scratchpad.addEventListener("input", (event) => {
      state.scratchpad = refs.scratchpad.value;
      saveState();
      autoGrowScratchpad();

      if (event.inputType && event.inputType.startsWith("insert") && event.data) {
        spawnSpark();
      }
    });
  }

  function autoGrowScratchpad() {
    refs.scratchpad.style.height = "auto";
    const maxHeight = parseFloat(window.getComputedStyle(refs.scratchpad).maxHeight) || 228;
    const nextHeight = Math.min(refs.scratchpad.scrollHeight, maxHeight);
    refs.scratchpad.style.height = `${nextHeight}px`;
    refs.scratchpad.style.overflowY = refs.scratchpad.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function spawnSpark() {
    if (reducedMotion || document.activeElement !== refs.scratchpad) {
      return;
    }

    const caret = getTextareaCaretPosition(refs.scratchpad, refs.scratchpad.selectionStart);
    if (!caret) {
      return;
    }

    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${caret.left + 6}px`;
    spark.style.top = `${caret.top + 8}px`;

    refs.sparkLayer.appendChild(spark);
    window.setTimeout(() => spark.remove(), 700);
  }

  function getTextareaCaretPosition(textarea, position) {
    const mirror = document.createElement("div");
    const marker = document.createElement("span");
    const style = window.getComputedStyle(textarea);

    const properties = [
      "boxSizing",
      "width",
      "height",
      "overflowX",
      "overflowY",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "fontStyle",
      "fontVariant",
      "fontWeight",
      "fontStretch",
      "fontSize",
      "lineHeight",
      "fontFamily",
      "textAlign",
      "textTransform",
      "textIndent",
      "letterSpacing",
      "wordSpacing",
      "tabSize"
    ];

    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";

    properties.forEach((property) => {
      mirror.style[property] = style[property];
    });

    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.textContent = textarea.value.slice(0, position);

    marker.textContent = textarea.value.slice(position) || ".";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();

    const left = markerRect.left - mirrorRect.left - textarea.scrollLeft;
    const top = markerRect.top - mirrorRect.top - textarea.scrollTop;

    document.body.removeChild(mirror);

    return {
      left: Math.max(0, left),
      top: Math.max(0, top)
    };
  }

  function initSettings() {
    refs.openSettings.addEventListener("click", openSettings);
    refs.closeSettings.addEventListener("click", closeSettings);

    refs.settingsModal.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.matches("[data-close-settings]")) {
        closeSettings();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && refs.settingsModal.classList.contains("open")) {
        closeSettings();
      }
    });

    refs.engineSelect.addEventListener("change", () => {
      if (SEARCH_ENGINES[refs.engineSelect.value]) {
        state.searchEngine = refs.engineSelect.value;
        saveState();
        updateSearchEngineUI();
      }
    });

    refs.bookmarkForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const title = refs.bookmarkTitle.value.trim();
      const url = normalizeUrl(refs.bookmarkUrl.value.trim());

      if (!title || !url) {
        return;
      }

      state.bookmarks.unshift({
        id: generateId(),
        title: title.slice(0, 60),
        url
      });

      state.bookmarks = state.bookmarks.slice(0, MAX_BOOKMARKS);
      saveState();

      refs.bookmarkTitle.value = "";
      refs.bookmarkUrl.value = "";

      renderBookmarks();
      renderSettingsBookmarks();
    });

    refs.settingsBookmarkList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest("button[data-remove-bookmark]");
      if (!button) {
        return;
      }

      const id = button.getAttribute("data-remove-bookmark");
      if (!id) {
        return;
      }

      state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.id !== id);
      saveState();
      renderBookmarks();
      renderSettingsBookmarks();
    });
  }

  function openSettings() {
    refs.settingsModal.classList.add("open");
    refs.settingsModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    refs.engineSelect.value = state.searchEngine;
    renderSettingsBookmarks();
    bindMagnetic(refs.settingsModal);

    window.setTimeout(() => {
      refs.engineSelect.focus();
    }, 30);
  }

  function closeSettings() {
    refs.settingsModal.classList.remove("open");
    refs.settingsModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function renderSettingsBookmarks() {
    refs.settingsBookmarkList.innerHTML = "";

    if (state.bookmarks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "settings-empty";
      empty.textContent = "No pinned tabs yet. Add one above.";
      refs.settingsBookmarkList.appendChild(empty);
      return;
    }

    state.bookmarks.forEach((bookmark) => {
      const item = document.createElement("li");
      item.className = "settings-item";
      item.innerHTML = `
        <div class="settings-main">
          <strong>${escapeHtml(bookmark.title)}</strong>
          <small>${escapeHtml(hostFromUrl(bookmark.url))}</small>
        </div>
        <button class="remove-bookmark micro-react" type="button" data-remove-bookmark="${escapeHtml(bookmark.id)}">Remove</button>
      `;
      refs.settingsBookmarkList.appendChild(item);
    });
  }

  function bindMagnetic(root) {
    if (reducedMotion || !root) {
      return;
    }

    const nodes = [];
    if (root instanceof HTMLElement && (root.classList.contains("magnetic") || root.classList.contains("micro-react"))) {
      nodes.push(root);
    }

    if (root.querySelectorAll) {
      nodes.push(...root.querySelectorAll(".magnetic, .micro-react"));
    }

    nodes.forEach((node) => attachMagnetic(node));
  }

  function attachMagnetic(element) {
    if (magneticBound.has(element)) {
      return;
    }

    magneticBound.add(element);

    const isPanel = element.classList.contains("magnetic");
    const maxTilt = isPanel ? 10 : element.matches(".bookmark-card") ? 13 : 8;
    const magnet = isPanel ? 7 : element.matches(".bookmark-card") ? 8 : 5;

    const reset = () => {
      element.classList.remove("is-reacting");
      element.style.setProperty("--rx", "0deg");
      element.style.setProperty("--ry", "0deg");
      element.style.setProperty("--mx", "0px");
      element.style.setProperty("--my", "0px");
      element.style.setProperty("--gx", "50%");
      element.style.setProperty("--gy", "50%");
    };

    element.addEventListener("pointermove", (event) => {
      const rect = element.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;

      element.classList.add("is-reacting");
      element.style.setProperty("--rx", `${(-py * maxTilt).toFixed(2)}deg`);
      element.style.setProperty("--ry", `${(px * maxTilt).toFixed(2)}deg`);
      element.style.setProperty("--mx", `${(px * magnet).toFixed(2)}px`);
      element.style.setProperty("--my", `${(py * magnet).toFixed(2)}px`);
      element.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(2)}%`);
      element.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(2)}%`);
    });

    element.addEventListener("pointerleave", reset);
    element.addEventListener("pointerup", () => {
      window.setTimeout(() => {
        if (!element.matches(":hover")) {
          reset();
        }
      }, 12);
    });
  }

  function normalizeUrl(raw) {
    if (!raw) {
      return "";
    }

    let value = raw.trim();
    if (!hasProtocol(value)) {
      value = `https://${value}`;
    }

    try {
      return new URL(value).href;
    } catch {
      return "";
    }
  }

  function hostFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  function focusSearchOnLoad() {
    window.setTimeout(() => {
      refs.searchInput.focus({ preventScroll: true });
    }, 120);
  }

  function faviconFromUrl(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}/favicon.ico`;
    } catch {
      return "";
    }
  }

  function format2(value) {
    return String(value).padStart(2, "0");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
