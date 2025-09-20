const {
  useEffect,
  useMemo,
  useRef,
  useState
} = React;
const BRUSHSTROKE_CROSS = typeof window !== "undefined" && window.BRUSHSTROKE_CROSS ? window.BRUSHSTROKE_CROSS : "";
const todayISO = () => new Date().toISOString().slice(0, 10);
const ymd = d => d.toISOString().slice(0, 10);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const STORE_KEY = "zc_tracker_v1";
const PIN_KEY = "zc_pin_v1";
const THEME_KEY = "zc_theme";
const blankDay = date => ({
  date,
  scripture: "",
  notes: "",
  morning: {
    consecration: false,
    breathMinutes: 0,
    jesusPrayerCount: 0
  },
  midday: {
    stillness: false,
    bodyBlessing: false
  },
  evening: {
    examen: false,
    rosaryDecades: 0,
    nightSilence: false
  },
  temptations: {
    urgesNoted: 0,
    lapses: 0,
    victories: 0
  },
  weekly: {
    mass: false,
    confession: false,
    fasting: false,
    accountability: false
  }
});
const WEEKLY_ANCHOR_KEYS = ["mass", "confession", "fasting", "accountability"];
const SUM_AGGREGATE = {
  init: () => 0,
  accumulate: (acc, value) => acc + value,
  finalize: acc => acc
};
const METRIC_OPTIONS = [{
  value: "breathMinutes",
  label: "Breath meditation (min)",
  accessor: day => day.morning.breathMinutes || 0,
  unit: "min",
  aggregate: SUM_AGGREGATE
}, {
  value: "jesusPrayerCount",
  label: "Jesus Prayer (count)",
  accessor: day => day.morning.jesusPrayerCount || 0,
  unit: "count",
  aggregate: SUM_AGGREGATE
}, {
  value: "rosaryDecades",
  label: "Rosary decades",
  accessor: day => day.evening.rosaryDecades || 0,
  unit: "decades",
  aggregate: SUM_AGGREGATE
}, {
  value: "urgesNoted",
  label: "Urges noted",
  accessor: day => day.temptations.urgesNoted || 0,
  unit: "count",
  aggregate: SUM_AGGREGATE
}, {
  value: "victories",
  label: "Victories over urges",
  accessor: day => day.temptations.victories || 0,
  unit: "count",
  aggregate: SUM_AGGREGATE
}, {
  value: "lapses",
  label: "Lapses",
  accessor: day => day.temptations.lapses || 0,
  unit: "count",
  aggregate: SUM_AGGREGATE
}, {
  value: "morningConsecration",
  label: "Morning consecration",
  accessor: day => day.morning.consecration ? 1 : 0,
  unit: "",
  weeklyUnit: "days",
  aggregate: SUM_AGGREGATE
}, {
  value: "middayStillness",
  label: "Midday stillness pause",
  accessor: day => day.midday.stillness ? 1 : 0,
  unit: "",
  weeklyUnit: "days",
  aggregate: SUM_AGGREGATE
}, {
  value: "bodyBlessing",
  label: "Body blessing",
  accessor: day => day.midday.bodyBlessing ? 1 : 0,
  unit: "",
  weeklyUnit: "days",
  aggregate: SUM_AGGREGATE
}, {
  value: "eveningExamen",
  label: "Evening examen",
  accessor: day => day.evening.examen ? 1 : 0,
  unit: "",
  weeklyUnit: "days",
  aggregate: SUM_AGGREGATE
}, {
  value: "nightSilence",
  label: "Silence before sleep",
  accessor: day => day.evening.nightSilence ? 1 : 0,
  unit: "",
  weeklyUnit: "days",
  aggregate: SUM_AGGREGATE
}];
const METRIC_VIEW_OPTIONS = [{
  value: "daily",
  label: "Daily"
}, {
  value: "weekly",
  label: "Weekly"
}];
const normalizeDay = (input = {}) => ({
  date: input.date || todayISO(),
  scripture: input.scripture ?? "",
  notes: input.notes ?? "",
  morning: {
    consecration: input.morning?.consecration ?? false,
    breathMinutes: input.morning?.breathMinutes ?? 0,
    jesusPrayerCount: input.morning?.jesusPrayerCount ?? 0
  },
  midday: {
    stillness: input.midday?.stillness ?? false,
    bodyBlessing: input.midday?.bodyBlessing ?? false
  },
  evening: {
    examen: input.evening?.examen ?? false,
    rosaryDecades: input.evening?.rosaryDecades ?? 0,
    nightSilence: input.evening?.nightSilence ?? false
  },
  temptations: {
    urgesNoted: input.temptations?.urgesNoted ?? 0,
    lapses: input.temptations?.lapses ?? 0,
    victories: input.temptations?.victories ?? 0
  },
  weekly: {
    mass: input.weekly?.mass ?? false,
    confession: input.weekly?.confession ?? false,
    fasting: input.weekly?.fasting ?? false,
    accountability: input.weekly?.accountability ?? false
  }
});
function exportDataJSON(data) {
  try {
    const blob = new Blob([JSON.stringify(data || {}, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prayer-tracker-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    alert("Export failed: " + e.message);
    return false;
  }
}
async function resetApp() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const wantsBackup = confirm("Back up your data before reset? Click OK to download a JSON backup, or Cancel to skip.");
    if (wantsBackup) exportDataJSON(data);
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(THEME_KEY);
    alert("App data cleared. Reloading now…");
    location.reload();
  } catch (e) {
    alert("Reset failed: " + e.message);
  }
}
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");else root.classList.remove("dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return {
    theme,
    setTheme
  };
}
function useData() {
  const [data, setData] = useState(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }, [data]);
  const setDay = (date, updater) => {
    setData(prev => {
      const curRaw = prev[date] ?? blankDay(date);
      const cur = normalizeDay(curRaw);
      return {
        ...prev,
        [date]: updater({
          ...cur
        })
      };
    });
  };
  return {
    data,
    setData,
    setDay
  };
}
function usePIN() {
  const [pin, setPin] = useState(() => localStorage.getItem(PIN_KEY));
  const [unlocked, setUnlocked] = useState(() => !pin);
  const tryUnlock = attempt => {
    if (!pin) {
      setUnlocked(true);
      return;
    }
    if (attempt === pin) setUnlocked(true);else alert("Incorrect PIN");
  };
  const updatePIN = p => {
    if (p) {
      localStorage.setItem(PIN_KEY, p);
      setPin(p);
      setUnlocked(false);
    } else {
      localStorage.removeItem(PIN_KEY);
      setPin(null);
      setUnlocked(true);
    }
  };
  return {
    pin,
    unlocked,
    tryUnlock,
    updatePIN
  };
}
function App() {
  const {
    theme,
    setTheme
  } = useTheme();
  const {
    data,
    setData,
    setDay
  } = useData();
  const {
    pin,
    unlocked,
    tryUnlock,
    updatePIN
  } = usePIN();
  const [date, setDate] = useState(todayISO());
  const [selectedMetric, setSelectedMetric] = useState(METRIC_OPTIONS[0].value);
  const [metricView, setMetricView] = useState("daily");
  const d = useMemo(() => normalizeDay(data[date] ?? blankDay(date)), [data, date]);
  const streak = useMemo(() => calcStreak(data), [data]);
  const longestStreak = useMemo(() => calcLongestStreak(data), [data]);
  const totals = useMemo(() => calcTotals(data), [data]);
  const weekSummary = useMemo(() => calcWeekSummary(data, date), [data, date]);
  const metricConfig = useMemo(() => METRIC_OPTIONS.find(opt => opt.value === selectedMetric) ?? METRIC_OPTIONS[0], [selectedMetric]);
  const metricSeries = useMemo(() => buildMetricSeries(data, selectedMetric), [data, selectedMetric]);
  const displayedMetricSeries = metricView === "weekly" ? metricSeries.weekly : metricSeries.daily;
  const metricSummary = useMemo(() => computeMetricSummary(metricSeries, metricView), [metricSeries, metricView]);
  const weekStartLabel = useMemo(() => {
    const startDate = weekSummary?.start ? new Date(weekSummary.start) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) return "--";
    return startDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }, [weekSummary.start]);
  const weekEndLabel = useMemo(() => {
    const endDate = weekSummary?.end ? new Date(weekSummary.end) : null;
    if (!endDate || Number.isNaN(endDate.getTime())) return "--";
    return endDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }, [weekSummary.end]);
  useEffect(() => {
    const onKey = e => {
      if (e.key === "ArrowLeft") setDate(prevDay(date, -1));
      if (e.key === "ArrowRight") setDate(prevDay(date, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [date]);
  if (!unlocked) return /*#__PURE__*/React.createElement(LockScreen, {
    tryUnlock: tryUnlock
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen"
  }, /*#__PURE__*/React.createElement("header", {
    className: "sticky top-0 z-20 backdrop-blur bg-white/70 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mx-auto max-w-5xl px-4 py-3 flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("img", {
    src: BRUSHSTROKE_CROSS,
    alt: "Mindfulness and Prayer Tracker logo",
    className: "h-10 w-10 shrink-0",
    width: "40",
    height: "40",
    loading: "lazy"
  }), /*#__PURE__*/React.createElement("h1", {
    className: "text-xl sm:text-2xl font-semibold tracking-tight"
  }, "Mindfulness and Prayer Tracker"), /*#__PURE__*/React.createElement("span", {
    className: "ml-auto inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400"
  }, /*#__PURE__*/React.createElement("button", {
    className: "px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800",
    onClick: () => setTheme(theme === "dark" ? "light" : "dark"),
    title: "Toggle theme"
  }, theme === "dark" ? "☀️ Light" : "🌙 Dark"), /*#__PURE__*/React.createElement(PinMenu, {
    pin: pin,
    updatePIN: updatePIN
  })))), /*#__PURE__*/React.createElement("main", {
    className: "mx-auto max-w-5xl px-4 py-6 grid gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Morning"
  }, /*#__PURE__*/React.createElement(ToggleRow, {
    label: "Consecration (Offering the day)",
    checked: d.morning.consecration,
    onChange: v => setDay(date, x => ({
      ...x,
      morning: {
        ...x.morning,
        consecration: v
      }
    }))
  }), /*#__PURE__*/React.createElement(TimerRow, {
    label: "Breath Meditation (min)",
    minutes: d.morning.breathMinutes,
    onChange: m => setDay(date, x => ({
      ...x,
      morning: {
        ...x.morning,
        breathMinutes: clamp(m, 0, 600)
      }
    }))
  }), /*#__PURE__*/React.createElement(CounterRow, {
    label: "Jesus Prayer (count)",
    value: d.morning.jesusPrayerCount,
    onChange: n => setDay(date, x => ({
      ...x,
      morning: {
        ...x.morning,
        jesusPrayerCount: clamp(n, 0, 100000)
      }
    }))
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Midday"
  }, /*#__PURE__*/React.createElement(ToggleRow, {
    label: "Stillness Pause",
    checked: d.midday.stillness,
    onChange: v => setDay(date, x => ({
      ...x,
      midday: {
        ...x.midday,
        stillness: v
      }
    }))
  }), /*#__PURE__*/React.createElement(ToggleRow, {
    label: "Body Blessing",
    checked: d.midday.bodyBlessing,
    onChange: v => setDay(date, x => ({
      ...x,
      midday: {
        ...x.midday,
        bodyBlessing: v
      }
    }))
  }), /*#__PURE__*/React.createElement(TemptationBox, {
    date: date,
    d: d,
    setDay: setDay
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Evening"
  }, /*#__PURE__*/React.createElement(ToggleRow, {
    label: "Examen with Compassion",
    checked: d.evening.examen,
    onChange: v => setDay(date, x => ({
      ...x,
      evening: {
        ...x.evening,
        examen: v
      }
    }))
  }), /*#__PURE__*/React.createElement(StepperRow, {
    label: "Rosary (decades)",
    value: d.evening.rosaryDecades,
    min: 0,
    max: 5,
    onChange: n => setDay(date, x => ({
      ...x,
      evening: {
        ...x.evening,
        rosaryDecades: n
      }
    }))
  }), /*#__PURE__*/React.createElement(ToggleRow, {
    label: "Silence Before Sleep",
    checked: d.evening.nightSilence,
    onChange: v => setDay(date, x => ({
      ...x,
      evening: {
        ...x.evening,
        nightSilence: v
      }
    }))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Scripture Seed"
  }, /*#__PURE__*/React.createElement("textarea", {
    value: d.scripture,
    onChange: e => setDay(date, x => ({
      ...x,
      scripture: e.target.value
    })),
    className: "w-full h-28 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-3 outline-none focus:ring-2 focus:ring-emerald-500",
    placeholder: "E.g., \u2018Blessed are the pure in heart\u2026\u2019 (Matt 5:8)"
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Weekly Anchors (auto-applies to week)"
  }, /*#__PURE__*/React.createElement(WeeklyAnchors, {
    date: date,
    setData: setData,
    data: data
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Journal"
  }, /*#__PURE__*/React.createElement("textarea", {
    value: d.notes,
    onChange: e => setDay(date, x => ({
      ...x,
      notes: e.target.value
    })),
    className: "w-full h-28 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-3 outline-none focus:ring-2 focus:ring-emerald-500",
    placeholder: "Graces, struggles, consolations, inspirations\u2026"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Meditation Timer"
  }, /*#__PURE__*/React.createElement(MeditationTimer, {
    onFinish: mins => setDay(date, x => ({
      ...x,
      morning: {
        ...x.morning,
        breathMinutes: x.morning.breathMinutes + mins
      }
    }))
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Weekly Summary"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm grid gap-2"
  }, /*#__PURE__*/React.createElement("div", null, "Week of ", /*#__PURE__*/React.createElement("b", null, weekStartLabel), " \u2013", /*#__PURE__*/React.createElement("b", null, " ", weekEndLabel)), /*#__PURE__*/React.createElement("div", null, "Breath meditation: ", /*#__PURE__*/React.createElement("b", null, weekSummary.totals.breathMinutes), " min"), /*#__PURE__*/React.createElement("div", null, "Jesus Prayer: ", /*#__PURE__*/React.createElement("b", null, weekSummary.totals.jesusPrayerCount)), /*#__PURE__*/React.createElement("div", null, "Rosary decades: ", /*#__PURE__*/React.createElement("b", null, weekSummary.totals.rosaryDecades)), /*#__PURE__*/React.createElement("div", {
    className: "pt-2 border-t border-zinc-200 dark:border-zinc-800"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
  }, /*#__PURE__*/React.createElement("span", null, "Weekly Anchors"), /*#__PURE__*/React.createElement("span", null, weekSummary.completedCount, "/", weekSummary.totalAnchors, " done")), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 grid gap-1"
  }, WEEKLY_ANCHOR_KEYS.map(k => {
    const complete = weekSummary.anchors[k];
    return /*#__PURE__*/React.createElement("div", {
      key: k,
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("span", {
      className: "capitalize"
    }, k), /*#__PURE__*/React.createElement("span", {
      className: "text-xs font-medium " + (complete ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400")
    }, complete ? "Completed" : "Pending"));
  }))))), /*#__PURE__*/React.createElement(MetricTrendsCard, {
    selectedMetric: selectedMetric,
    setSelectedMetric: setSelectedMetric,
    metricView: metricView,
    setMetricView: setMetricView,
    series: displayedMetricSeries,
    summary: metricSummary,
    metricConfig: metricConfig
  }), /*#__PURE__*/React.createElement(Card, {
    title: "Stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm grid gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Current streak"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, streak, " day", streak === 1 ? "" : "s")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Longest streak"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, longestStreak, " day", longestStreak === 1 ? "" : "s")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Breath meditation (min)"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.breathMinutes)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Jesus Prayer (count)"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.jesusPrayerCount)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Rosary decades"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.rosaryDecades)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Urges noted"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.urgesNoted)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Victories over urges"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.victories)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Lapses"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.lapses))), /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-medium uppercase tracking-wide text-zinc-500"
  }, "Daily practices completed"), /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Morning consecration"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.morningConsecration)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Midday stillness pause"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.middayStillness)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Body blessing"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.middayBodyBlessing)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Evening examen"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.eveningExamen)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Silence before sleep"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.eveningNightSilence)))), /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-medium uppercase tracking-wide text-zinc-500"
  }, "Weekly anchors completed"), /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Mass"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.weeklyMass)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Confession"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.weeklyConfession)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Fasting"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.weeklyFasting)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Accountability"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, totals.weeklyAccountability)))))), /*#__PURE__*/React.createElement(Card, {
    title: "Backup / Restore"
  }, /*#__PURE__*/React.createElement(BackupControls, {
    data: data,
    setData: setData
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Settings & Safety"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2 text-sm"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30",
    onClick: resetApp
  }, "Reset App (export \u2192 clear \u2192 reload)"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "This will optionally back up your data as JSON, then clear local storage and unregister the service worker before reloading.")))), /*#__PURE__*/React.createElement(TopNav, {
    date: date,
    setDate: setDate,
    data: data
  }), /*#__PURE__*/React.createElement("footer", {
    className: "pt-2 pb-8 text-center text-xs text-zinc-500 dark:text-zinc-400"
  }, "Built for Mark \u2014 \u201Csee clearly, return gently, offer everything to Christ.\u201D")));
}
function MetricTrendsCard({
  selectedMetric,
  setSelectedMetric,
  metricView,
  setMetricView,
  series,
  summary,
  metricConfig
}) {
  const unit = metricView === "weekly" ? metricConfig.weeklyUnit ?? metricConfig.unit : metricConfig.unit;
  const latestLabel = metricView === "weekly" ? "Latest week" : "Latest day";
  const averageLabel = summary.averageLabel ?? (metricView === "weekly" ? "4-week avg" : "7-day avg");
  const latestDisplay = formatMetricValue(summary.lastValue);
  const averageDisplay = formatMetricValue(summary.averageValue);
  return /*#__PURE__*/React.createElement(Card, {
    title: "Practice Trends"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
  }, "Metric"), /*#__PURE__*/React.createElement("select", {
    value: selectedMetric,
    onChange: e => setSelectedMetric(e.target.value),
    className: "rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-sm",
    "aria-label": "Select metric to visualize"
  }, METRIC_OPTIONS.map(option => /*#__PURE__*/React.createElement("option", {
    key: option.value,
    value: option.value
  }, option.label))), /*#__PURE__*/React.createElement("div", {
    className: "ml-auto inline-flex items-center overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
  }, METRIC_VIEW_OPTIONS.map(option => /*#__PURE__*/React.createElement("button", {
    key: option.value,
    type: "button",
    onClick: () => setMetricView(option.value),
    className: "px-2 py-1 text-xs font-medium uppercase tracking-wide transition " + (metricView === option.value ? "bg-emerald-500 text-white" : "bg-transparent text-zinc-600 dark:text-zinc-300"),
    "aria-pressed": metricView === option.value
  }, option.label)))), /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1 text-xs text-zinc-500 dark:text-zinc-400"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline justify-between text-sm text-zinc-600 dark:text-zinc-200"
  }, /*#__PURE__*/React.createElement("span", null, latestLabel), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold text-zinc-800 dark:text-zinc-100"
  }, latestDisplay, summary.lastValue != null && unit ? " " + unit : "")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline justify-between text-sm text-zinc-600 dark:text-zinc-200"
  }, /*#__PURE__*/React.createElement("span", null, averageLabel), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-medium text-zinc-800 dark:text-zinc-100"
  }, averageDisplay, summary.averageValue != null && unit ? " " + unit : ""))), /*#__PURE__*/React.createElement(MetricSparkline, {
    series: series,
    view: metricView,
    metricLabel: metricConfig.label
  }));
}
function MetricSparkline({
  series,
  view,
  metricLabel
}) {
  if (!series.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "h-40 grid place-items-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 px-4 text-center text-xs text-zinc-500 dark:text-zinc-400"
    }, "Start logging ", metricLabel.toLowerCase(), " to see this trend.");
  }
  if (series.length < 2) {
    return /*#__PURE__*/React.createElement("div", {
      className: "h-40 grid place-items-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 px-4 text-center text-xs text-zinc-500 dark:text-zinc-400"
    }, "Add one more ", view === "weekly" ? "week" : "day", " of data to view the chart.");
  }
  const values = series.map(point => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const points = series.map((point, index) => {
    const x = index / (series.length - 1) * 100;
    const y = 100 - (point.value - minValue) / range * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const areaPoints = ["0,100", ...points, "100,100"].join(" ");
  const firstLabel = formatSeriesLabel(series[0], view, "start");
  const lastLabel = formatSeriesLabel(series[series.length - 1], view, "end");
  const gradientId = `metric-sparkline-${view}`;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    className: "h-40 w-full text-emerald-500 dark:text-emerald-400"
  }, /*#__PURE__*/React.createElement("polygon", {
    points: areaPoints,
    fill: `url(#${gradientId})`,
    opacity: "0.4"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: points.join(" "),
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gradientId,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "currentColor",
    stopOpacity: "0.45"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "currentColor",
    stopOpacity: "0.05"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
  }, /*#__PURE__*/React.createElement("span", null, firstLabel), /*#__PURE__*/React.createElement("span", null, lastLabel)));
}
function formatSeriesLabel(point, view, position) {
  if (!point) return "--";
  if (view === "weekly") {
    const targetISO = position === "end" ? point.end ?? addDaysISO(point.date, 6) : point.date;
    const target = new Date(targetISO);
    if (Number.isNaN(target.getTime())) return "--";
    return target.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }
  const date = new Date(point.date);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}
function formatMetricValue(value) {
  if (value == null || Number.isNaN(value)) return "—";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1
  });
}
function Card({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 shadow-sm p-4"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-semibold tracking-tight mb-3 text-zinc-800 dark:text-zinc-100"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "grid gap-3 text-sm"
  }, children));
}
function ToggleRow({
  label,
  checked,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: "flex items-center justify-between gap-3 pr-2"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    onChange: e => onChange(e.target.checked),
    className: "h-5 w-5 accent-emerald-600"
  }));
}
function CounterRow({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-x-3 gap-y-2 pr-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex-1 min-w-[10rem]"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 md:w-full md:justify-end"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => onChange(Math.max(0, value - 10))
  }, "\u221210"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => onChange(Math.max(0, value - 1))
  }, "\u22121"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums min-w-[3ch] text-center"
  }, value), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => onChange(value + 1)
  }, "+1"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => onChange(value + 10)
  }, "+10")));
}
function StepperRow({
  label,
  value,
  min,
  max,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-3 pr-2"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => onChange(Math.max(min, value - 1))
  }, "\u2212"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums w-10 text-center"
  }, value), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => onChange(Math.min(max, value + 1))
  }, "+")));
}
function TimerRow({
  label,
  minutes,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-2 pr-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-zinc-500"
  }, "Logged: ", /*#__PURE__*/React.createElement("b", {
    className: "tabular-nums"
  }, minutes), " min")), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: minutes,
    onChange: e => onChange(Number(e.target.value)),
    className: "w-24 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/60 px-2 py-1 outline-none"
  })));
}
function MeditationTimer({
  onFinish
}) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef(null);
  useEffect(() => {
    if (running) intervalRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000);else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const reset = () => setSeconds(0);
  const finish = () => {
    setRunning(false);
    if (mins > 0) onFinish(mins);
    setSeconds(0);
    alert(`Logged ${mins} minute(s) of breath meditation.`);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-4xl font-mono tabular-nums"
  }, String(mins).padStart(2, "0"), ":", String(secs).padStart(2, "0")), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setRunning(r => !r)
  }, running ? "Pause" : seconds ? "Resume" : "Start"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: reset,
    disabled: running
  }, "Reset"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: finish,
    disabled: running || seconds === 0
  }, "Finish & Log")), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500 text-center"
  }, "Tip: Use the timer during breath prayer. On finish, minutes are added to today\u2019s total."));
}
function TemptationBox({
  date,
  d,
  setDay
}) {
  const t = d.temptations;
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-sm font-medium"
  }, "Temptation Tracker"), /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2 sm:grid-cols-3"
  }, /*#__PURE__*/React.createElement(SmallCounter, {
    label: "Urges Noted",
    value: t.urgesNoted,
    onChange: n => setDay(date, x => ({
      ...x,
      temptations: {
        ...x.temptations,
        urgesNoted: Math.max(0, n)
      }
    }))
  }), /*#__PURE__*/React.createElement(SmallCounter, {
    label: "Victories",
    value: t.victories,
    onChange: n => setDay(date, x => ({
      ...x,
      temptations: {
        ...x.temptations,
        victories: Math.max(0, n)
      }
    }))
  }), /*#__PURE__*/React.createElement(SmallCounter, {
    label: "Lapses",
    value: t.lapses,
    onChange: n => setDay(date, x => ({
      ...x,
      temptations: {
        ...x.temptations,
        lapses: Math.max(0, n)
      }
    }))
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "Note urges gently; celebrate victories; bring lapses to Confession with hope."));
}
function SmallCounter({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-medium text-zinc-700 dark:text-zinc-200"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn sm:!px-2",
    onClick: () => onChange(Math.max(0, value - 1))
  }, "\u2212"), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums w-8 text-center text-sm"
  }, value), /*#__PURE__*/React.createElement("button", {
    className: "btn sm:!px-2",
    onClick: () => onChange(Math.max(0, value + 1))
  }, "+")));
}
function WeeklyAnchors({
  date,
  setData,
  data
}) {
  const week = useMemo(() => weekRange(new Date(date)), [date]);
  const all = WEEKLY_ANCHOR_KEYS.reduce((acc, k) => {
    acc[k] = week.every(d => (data[ymd(d)] ?? blankDay(ymd(d))).weekly[k]);
    return acc;
  }, {});
  const toggle = (k, v) => {
    const updates = {
      ...data
    };
    week.forEach(d => {
      const key = ymd(d);
      const cur = updates[key] ?? blankDay(key);
      updates[key] = {
        ...cur,
        weekly: {
          ...cur.weekly,
          [k]: v
        }
      };
    });
    setData(updates);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2 text-sm"
  }, WEEKLY_ANCHOR_KEYS.map(k => /*#__PURE__*/React.createElement("label", {
    key: k,
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "capitalize"
  }, k), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: all[k],
    onChange: e => toggle(k, e.target.checked),
    className: "h-5 w-5 accent-emerald-600"
  }))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "Applies to Mon\u2013Sun of the selected week."));
}
function TopNav({
  date,
  setDate,
  data
}) {
  const dots = useMemo(() => monthDots(date, data), [date, data]);
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-4 grid gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setDate(prevDay(date, -1))
  }, "\u2190 Prev"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: date,
    onChange: e => {
      setDate(e.target.value);
    },
    className: "rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setDate(todayISO())
  }, "Today"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setDate(prevDay(date, 1))
  }, "Next \u2192"), /*#__PURE__*/React.createElement("span", {
    className: "ml-auto text-sm text-zinc-500"
  }, "Tip: Use \u2190 \u2192 keys")), /*#__PURE__*/React.createElement(MiniMonth, {
    dots: dots,
    onPick: setDate,
    current: date
  }));
}
function MiniMonth({
  dots,
  onPick,
  current
}) {
  const monthLabel = new Date(current).toLocaleString(undefined, {
    month: "long",
    year: "numeric"
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-2 text-sm font-medium"
  }, monthLabel), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-7 gap-1"
  }, ["M", "T", "W", "T", "F", "S", "S"].map(d => /*#__PURE__*/React.createElement("div", {
    key: d,
    className: "text-center text-[10px] text-zinc-500"
  }, d)), dots.map(({
    date,
    filled
  }) => {
    const strDate = String(date);
    const isRealDate = /^\d{4}-\d{2}-\d{2}$/.test(strDate);
    if (!isRealDate) {
      return /*#__PURE__*/React.createElement("div", {
        key: date,
        className: "aspect-square rounded-md",
        "aria-hidden": "true"
      });
    }
    const isCurrent = date === current;
    return /*#__PURE__*/React.createElement("button", {
      key: date,
      type: "button",
      onClick: () => onPick(date),
      className: "aspect-square rounded-md text-[11px] tabular-nums flex items-center justify-center border transition " + (isCurrent ? "border-emerald-500 " : "border-transparent ") + (filled ? "bg-emerald-500/20 dark:bg-emerald-500/25" : "bg-zinc-200/30 dark:bg-zinc-800/50"),
      "aria-pressed": isCurrent
    }, Number(strDate.slice(-2)));
  })), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-[10px] text-zinc-500"
  }, "Filled = any practice done that day"));
}
function BackupControls({
  data,
  setData
}) {
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zc-tracker-export-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportCSV = () => {
    const rows = toCSV(data);
    const blob = new Blob([rows], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zc-tracker-export-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJSON = file => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || typeof obj !== "object") throw new Error("Invalid file");
        setData(obj);
        alert("Import successful.");
      } catch (e) {
        alert("Import failed: " + e.message);
      }
    };
    reader.readAsText(file);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: exportJSON
  }, "Export JSON"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: exportCSV
  }, "Export CSV"), /*#__PURE__*/React.createElement("label", {
    className: "btn cursor-pointer"
  }, "Import JSON", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "application/json",
    className: "hidden",
    onChange: e => e.target.files && importJSON(e.target.files[0])
  }))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "Back up locally. Files stay on your device."));
}
function PinMenu({
  pin,
  updatePIN
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(pin || "");
  return /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("button", {
    className: "px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800",
    onClick: () => setOpen(o => !o)
  }, pin ? "🔒 PIN" : "🔓 Set PIN"), open && /*#__PURE__*/React.createElement("div", {
    className: "absolute right-0 mt-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-lg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm mb-2"
  }, "Optional 4-digit app lock (device-local)."), /*#__PURE__*/React.createElement("input", {
    value: val,
    onChange: e => setVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)),
    placeholder: "1234",
    className: "w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 mb-2"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => {
      if (val.length === 4) {
        updatePIN(val);
        setOpen(false);
      } else alert("Enter 4 digits");
    }
  }, "Set"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => {
      updatePIN(null);
      setVal("");
      setOpen(false);
    }
  }, "Remove"))));
}
function LockScreen({
  tryUnlock
}) {
  const [val, setVal] = useState("");
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-6 w-full max-w-sm text-center"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-lg font-semibold mb-2"
  }, "Enter PIN"), /*#__PURE__*/React.createElement("input", {
    value: val,
    onChange: e => setVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)),
    className: "w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-center text-2xl tracking-widest"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn w-full mt-3",
    onClick: () => tryUnlock(val)
  }, "Unlock"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500 mt-2"
  }, "Tip: You can remove the PIN later from the header menu.")));
}
function buildMetricSeries(data, metricKey) {
  const metric = METRIC_OPTIONS.find(option => option.value === metricKey);
  if (!metric) return {
    daily: [],
    weekly: []
  };
  const entries = Object.keys(data).sort();
  if (entries.length === 0) {
    return {
      daily: [],
      weekly: []
    };
  }
  const first = new Date(entries[0]);
  const last = new Date(entries[entries.length - 1]);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    return {
      daily: [],
      weekly: []
    };
  }
  const accessor = metric.accessor;
  const daily = [];
  const cursor = new Date(first);
  while (cursor <= last) {
    const key = ymd(cursor);
    const day = data[key] ? normalizeDay(data[key]) : blankDay(key);
    const rawValue = accessor(day);
    const value = typeof rawValue === "number" && !Number.isNaN(rawValue) ? rawValue : 0;
    daily.push({
      date: key,
      value
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  const aggregate = metric.aggregate ?? SUM_AGGREGATE;
  const weeklyMap = new Map();
  for (const point of daily) {
    const weekKey = weekStartISO(point.date);
    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, {
        value: aggregate.init(),
        count: 0
      });
    }
    const group = weeklyMap.get(weekKey);
    group.value = aggregate.accumulate(group.value, point.value);
    group.count += 1;
  }
  const weekly = Array.from(weeklyMap.entries()).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([start, group]) => ({
    date: start,
    end: addDaysISO(start, 6),
    value: aggregate.finalize ? aggregate.finalize(group.value, group.count) : group.value
  }));
  return {
    daily,
    weekly
  };
}
function computeMetricSummary(series, view) {
  const points = view === "weekly" ? series.weekly : series.daily;
  const defaultLabel = view === "weekly" ? "4-week avg" : "7-day avg";
  if (!points.length) {
    return {
      lastValue: null,
      averageValue: null,
      averageLabel: defaultLabel
    };
  }
  const windowSize = view === "weekly" ? 4 : 7;
  const windowPoints = points.slice(-windowSize);
  const averageValue = windowPoints.reduce((acc, point) => acc + point.value, 0) / windowPoints.length;
  const averageLabel = `${windowPoints.length}-${view === "weekly" ? "week" : "day"} avg`;
  return {
    lastValue: points[points.length - 1].value,
    lastDate: points[points.length - 1].date,
    averageValue,
    averageLabel
  };
}
function weekStartISO(dateISO) {
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) return dateISO;
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return ymd(date);
}
function addDaysISO(dateISO, days) {
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) return dateISO;
  date.setDate(date.getDate() + days);
  return ymd(date);
}
function anyPracticeDone(day) {
  if (!day) return false;
  return day.morning.consecration || day.morning.breathMinutes > 0 || day.morning.jesusPrayerCount > 0 || day.midday.stillness || day.midday.bodyBlessing || day.evening.examen || day.evening.rosaryDecades > 0 || day.evening.nightSilence;
}
function calcStreak(data) {
  let d = new Date();
  let count = 0;
  while (true) {
    const key = ymd(d);
    const day = data[key];
    if (day && anyPracticeDone(day)) count++;else break;
    d.setDate(d.getDate() - 1);
  }
  return count;
}
function calcLongestStreak(data) {
  const dates = Object.keys(data).sort();
  let longest = 0;
  let current = 0;
  let prevDateWithPractice = null;
  for (const key of dates) {
    const day = data[key];
    const practiced = anyPracticeDone(day);
    const currentDate = new Date(key);
    if (!practiced) {
      current = 0;
      prevDateWithPractice = null;
      continue;
    }
    if (prevDateWithPractice) {
      const diff = Math.round((currentDate - prevDateWithPractice) / (1000 * 60 * 60 * 24));
      current = diff === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
    prevDateWithPractice = currentDate;
  }
  return longest;
}
function calcTotals(data) {
  return Object.values(data).reduce((acc, d) => {
    const morning = d.morning ?? {};
    const midday = d.midday ?? {};
    const evening = d.evening ?? {};
    const temptations = d.temptations ?? {};
    const weekly = d.weekly ?? {};
    acc.breathMinutes += morning.breathMinutes || 0;
    acc.jesusPrayerCount += morning.jesusPrayerCount || 0;
    acc.rosaryDecades += evening.rosaryDecades || 0;
    acc.victories += temptations.victories || 0;
    acc.lapses += temptations.lapses || 0;
    acc.urgesNoted += temptations.urgesNoted || 0;
    if (morning.consecration) acc.morningConsecration += 1;
    if (midday.stillness) acc.middayStillness += 1;
    if (midday.bodyBlessing) acc.middayBodyBlessing += 1;
    if (evening.examen) acc.eveningExamen += 1;
    if (evening.nightSilence) acc.eveningNightSilence += 1;
    if (weekly.mass) acc.weeklyMass += 1;
    if (weekly.confession) acc.weeklyConfession += 1;
    if (weekly.fasting) acc.weeklyFasting += 1;
    if (weekly.accountability) acc.weeklyAccountability += 1;
    return acc;
  }, {
    breathMinutes: 0,
    jesusPrayerCount: 0,
    rosaryDecades: 0,
    victories: 0,
    lapses: 0,
    urgesNoted: 0,
    morningConsecration: 0,
    middayStillness: 0,
    middayBodyBlessing: 0,
    eveningExamen: 0,
    eveningNightSilence: 0,
    weeklyMass: 0,
    weeklyConfession: 0,
    weeklyFasting: 0,
    weeklyAccountability: 0
  });
}
function calcWeekSummary(data, dateISO) {
  const target = new Date(dateISO);
  if (Number.isNaN(target.getTime())) {
    const anchors = WEEKLY_ANCHOR_KEYS.reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {});
    return {
      start: dateISO,
      end: dateISO,
      totals: {
        breathMinutes: 0,
        jesusPrayerCount: 0,
        rosaryDecades: 0
      },
      anchors,
      completedCount: 0,
      totalAnchors: WEEKLY_ANCHOR_KEYS.length
    };
  }
  const week = weekRange(target);
  const totals = {
    breathMinutes: 0,
    jesusPrayerCount: 0,
    rosaryDecades: 0
  };
  const anchors = WEEKLY_ANCHOR_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
  week.forEach(dt => {
    const key = ymd(dt);
    const day = data[key] ? normalizeDay(data[key]) : blankDay(key);
    totals.breathMinutes += day.morning.breathMinutes || 0;
    totals.jesusPrayerCount += day.morning.jesusPrayerCount || 0;
    totals.rosaryDecades += day.evening.rosaryDecades || 0;
    WEEKLY_ANCHOR_KEYS.forEach(anchor => {
      if (!day.weekly[anchor]) anchors[anchor] = false;
    });
  });
  const completedCount = WEEKLY_ANCHOR_KEYS.reduce((acc, key) => acc + (anchors[key] ? 1 : 0), 0);
  return {
    start: ymd(week[0]),
    end: ymd(week[week.length - 1]),
    totals,
    anchors,
    completedCount,
    totalAnchors: WEEKLY_ANCHOR_KEYS.length
  };
}
function weekRange(d) {
  const day = d.getDay();
  const diffToMon = (day + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diffToMon);
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const t = new Date(start);
    t.setDate(start.getDate() + i);
    arr.push(t);
  }
  return arr;
}
function prevDay(dateISO, delta) {
  const d = new Date(dateISO);
  d.setDate(d.getDate() + delta);
  return ymd(d);
}
function monthDots(dateISO, data) {
  const d = new Date(dateISO);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const arr = [];
  for (let i = 0; i < lead; i++) arr.push({
    date: "lead-" + i,
    filled: false
  });
  for (let i = 1; i <= days; i++) {
    const dt = new Date(d.getFullYear(), d.getMonth(), i);
    const key = ymd(dt);
    arr.push({
      date: key,
      filled: anyPracticeDone(data[key])
    });
  }
  return arr;
}
function toCSV(data) {
  const header = ["Date", "Scripture", "Notes", "Consecration", "BreathMinutes", "JesusPrayerCount", "Stillness", "BodyBlessing", "Examen", "RosaryDecades", "NightSilence", "UrgesNoted", "Victories", "Lapses", "Mass", "Confession", "Fasting", "Accountability"];
  const rows = [header.join(",")];
  const keys = Object.keys(data).sort();
  for (const k of keys) {
    const day = data[k];
    rows.push([day.date, csvQuote(day.scripture), csvQuote(day.notes), day.morning.consecration ? 1 : 0, day.morning.breathMinutes, day.morning.jesusPrayerCount, day.midday.stillness ? 1 : 0, day.midday.bodyBlessing ? 1 : 0, day.evening.examen ? 1 : 0, day.evening.rosaryDecades, day.evening.nightSilence ? 1 : 0, day.temptations.urgesNoted, day.temptations.victories, day.temptations.lapses, day.weekly.mass ? 1 : 0, day.weekly.confession ? 1 : 0, day.weekly.fasting ? 1 : 0, day.weekly.accountability ? 1 : 0].join(","));
  }
  return rows.join("\n");
}
const csvQuote = s => '"' + String(s ?? "").replace(/"/g, '""') + '"';
function AppRoot() {
  return /*#__PURE__*/React.createElement(App, null);
}
const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(/*#__PURE__*/React.createElement(AppRoot, null));
}
