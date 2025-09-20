const {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} = React;
const BRUSHSTROKE_CROSS = typeof window !== "undefined" && window.BRUSHSTROKE_CROSS ? window.BRUSHSTROKE_CROSS : "";
const todayISO = () => new Date().toISOString().slice(0, 10);
const ymd = d => d.toISOString().slice(0, 10);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const STORE_KEY = "zc_tracker_v1";
const SECURE_STORE_KEY = "zc_tracker_secure_v1";
const PIN_KEY = "zc_pin_v1";
const THEME_KEY = "zc_theme";
const PREFS_KEY = "zc_preferences_v1";
const REMINDER_STATE_KEY = "zc_reminder_state_v1";
const DEVICE_CREDENTIAL_ID = "mindful-prayer-pin";
const BASELINE_ITERATIONS = 120000;
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
function fromBase64(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
const randomId = () => Math.random().toString(36).slice(2, 10);
async function storeDeviceCredential(pin) {
  try {
    if (!navigator.credentials || typeof window.PasswordCredential === "undefined") return false;
    const credential = new window.PasswordCredential({
      id: DEVICE_CREDENTIAL_ID,
      name: "Mindfulness & Prayer Tracker",
      password: pin
    });
    await navigator.credentials.store(credential);
    return true;
  } catch (e) {
    console.warn("Unable to store credential", e);
    return false;
  }
}
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
  },
  mood: "",
  contextTags: [],
  customMetrics: {}
});
async function deriveKeyMaterial(pin, saltBuffer, iterations = BASELINE_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey("raw", textEncoder.encode(pin), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  const params = {
    name: "PBKDF2",
    salt: saltBuffer,
    iterations,
    hash: "SHA-256"
  };
  const key = await crypto.subtle.deriveKey(params, baseKey, {
    name: "AES-GCM",
    length: 256
  }, false, ["encrypt", "decrypt"]);
  const bits = await crypto.subtle.deriveBits(params, baseKey, 256);
  return {
    key,
    bits
  };
}
async function encryptJSON(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = textEncoder.encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv
  }, key, payload);
  return {
    iv: toBase64(iv.buffer),
    data: toBase64(ciphertext)
  };
}
async function decryptJSON(key, payload) {
  if (!payload) return {};
  const obj = typeof payload === "string" ? JSON.parse(payload) : payload;
  const iv = fromBase64(obj.iv);
  const ciphertext = fromBase64(obj.data);
  const decrypted = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: new Uint8Array(iv)
  }, key, ciphertext);
  const text = textDecoder.decode(decrypted);
  return JSON.parse(text);
}
const WEEKLY_ANCHOR_KEYS = ["mass", "confession", "fasting", "accountability"];
const MOOD_OPTIONS = [{
  value: "joyful",
  label: "Joyful",
  emoji: "😊"
}, {
  value: "grateful",
  label: "Grateful",
  emoji: "🙏"
}, {
  value: "peaceful",
  label: "Peaceful",
  emoji: "🕊️"
}, {
  value: "tender",
  label: "Tender",
  emoji: "💗"
}, {
  value: "wrestling",
  label: "Wrestling",
  emoji: "😔"
}, {
  value: "weary",
  label: "Weary",
  emoji: "😴"
}, {
  value: "hopeful",
  label: "Hopeful",
  emoji: "🌅"
}];
const getMoodMeta = value => MOOD_OPTIONS.find(option => option.value === value) || null;
const TAG_SUGGESTIONS = ["gratitude", "lament", "discernment", "family", "stillness", "healing", "mercy", "service", "intercession", "rest"];
const DEFAULT_REMINDERS = {
  morning: {
    enabled: false,
    time: "07:00",
    label: "Morning consecration"
  },
  midday: {
    enabled: false,
    time: "12:30",
    label: "Midday stillness"
  },
  evening: {
    enabled: false,
    time: "21:30",
    label: "Evening examen"
  }
};
const DEFAULT_PREFERENCES = {
  onboardingComplete: false,
  showGuidedPrompts: true,
  customMetrics: [],
  reminders: DEFAULT_REMINDERS,
  allowNotifications: false,
  spotlightIndex: 0,
  tomorrowPlan: ""
};
const LECTIO_PROMPTS = ["Read slowly and notice a word or phrase that shimmers.", "Listen for Christ speaking the passage directly to you.", "How does this scripture invite you to act in love today?", "Rest in silence after reading—receive the gift rather than striving."];
const JOURNAL_PROMPTS = ["Where did you sense consolation or desolation today?", "Name a person you want to hold in prayer right now.", "What invitation from God feels most alive this evening?", "What resistance or distraction surfaced, and how might grace meet it?", "Celebrate one small victory of faithfulness from today."];
const EXAMEN_PROMPTS = ["Review the day with gratitude and note any gentle surprises.", "Ask the Spirit to show a moment you wish had gone differently.", "Is there someone to forgive—or to ask forgiveness from?", "Offer tomorrow to God, trusting grace for what you cannot control."];
const PRACTICE_SPOTLIGHTS = [{
  title: "Breath Prayer Reset",
  body: "Pause for four slow breaths. On the inhale pray ‘Jesus, Son of God’; on the exhale ‘have mercy on me.’"
}, {
  title: "Lectio Anchor",
  body: "Try reading the day’s scripture aloud three times, listening for a word that stays with you through the day."
}, {
  title: "Embodied Blessing",
  body: "Place a hand over your heart and bless your body for carrying you. Offer kindness to any tense place."
}, {
  title: "Nightly Surrender",
  body: "Before sleep, picture placing the day into God’s hands. Notice what feels hard to release and breathe out gently."
}, {
  title: "Community Check-In",
  body: "Send a short note to a spiritual friend sharing one gratitude and one need for prayer."
}];
const ONBOARDING_STEPS = [{
  title: "Welcome to your prayer companion",
  body: "Track morning, midday, and evening practices—all stored privately on this device unless you export a backup."
}, {
  title: "Log what matters most",
  body: "Add custom metrics, note your mood, and tag themes so you can notice grace-filled patterns over time."
}, {
  title: "Stay gently on rhythm",
  body: "Enable reminders for the rhythms you choose and revisit the rotating practice spotlight when you want fresh inspiration."
}];
const SUM_AGGREGATE = {
  init: () => 0,
  accumulate: (acc, value) => acc + value,
  finalize: acc => acc
};
const BASE_METRIC_OPTIONS = [{
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
function buildCustomMetricOptions(customMetrics = []) {
  return customMetrics.filter(metric => metric && metric.id && metric.name).map(metric => ({
    value: `custom:${metric.id}`,
    label: metric.name,
    accessor: day => {
      const raw = day.customMetrics?.[metric.id];
      const numeric = typeof raw === "number" ? raw : Number(raw || 0);
      return Number.isFinite(numeric) ? numeric : 0;
    },
    unit: metric.unit || "",
    aggregate: SUM_AGGREGATE,
    definition: metric
  }));
}
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
  },
  mood: input.mood ?? "",
  contextTags: Array.isArray(input.contextTags) ? input.contextTags : [],
  customMetrics: input.customMetrics ?? {}
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
function loadPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {
      ...DEFAULT_PREFERENCES
    };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {
      ...DEFAULT_PREFERENCES
    };
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      reminders: {
        ...DEFAULT_PREFERENCES.reminders,
        ...(parsed.reminders || {})
      },
      customMetrics: Array.isArray(parsed.customMetrics) ? parsed.customMetrics : [],
      tomorrowPlan: typeof parsed.tomorrowPlan === "string" ? parsed.tomorrowPlan : ""
    };
  } catch (e) {
    console.warn("Failed to load preferences", e);
    return {
      ...DEFAULT_PREFERENCES
    };
  }
}
function usePreferences() {
  const [preferences, setPreferences] = useState(() => loadPreferences());
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    } catch (e) {
      console.warn("Unable to persist preferences", e);
    }
  }, [preferences]);
  const updatePreferences = useCallback(updater => {
    setPreferences(prev => {
      const patch = typeof updater === "function" ? updater(prev) : updater;
      const next = {
        ...prev,
        ...patch,
        reminders: {
          ...prev.reminders,
          ...(patch?.reminders || {})
        }
      };
      if (patch?.customMetrics) {
        next.customMetrics = patch.customMetrics;
      }
      return next;
    });
  }, []);
  return {
    preferences,
    updatePreferences,
    setPreferences
  };
}
function loadReminderState() {
  try {
    const raw = localStorage.getItem(REMINDER_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveReminderState(state) {
  try {
    localStorage.setItem(REMINDER_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Unable to persist reminder state", e);
  }
}
function parseReminderTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const parts = timeStr.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}
function useReminders(reminders, allowNotifications) {
  const [activeReminder, setActiveReminder] = useState(null);
  useEffect(() => {
    if (!reminders) return undefined;
    let mounted = true;
    const checkReminders = async () => {
      const now = new Date();
      const state = loadReminderState();
      const entries = Object.entries(reminders);
      for (const [id, reminder] of entries) {
        if (!reminder?.enabled) continue;
        const scheduled = parseReminderTime(reminder.time);
        if (!scheduled) continue;
        if (now.getTime() < scheduled.getTime()) continue;
        const diff = now.getTime() - scheduled.getTime();
        if (diff > 45 * 60 * 1000) continue;
        const dayKey = todayISO();
        const record = state[id] || {};
        if (record.done === dayKey) continue;
        if (record.snoozedUntil && now.getTime() < record.snoozedUntil) continue;
        if (allowNotifications && typeof Notification !== "undefined") {
          if (Notification.permission === "granted") {
            new Notification(reminder.label, {
              body: "Gentle nudge: it's time for your planned prayer rhythm."
            });
          }
        }
        if (mounted) {
          setActiveReminder({
            id,
            ...reminder,
            scheduled
          });
        }
        break;
      }
    };
    checkReminders();
    const interval = window.setInterval(checkReminders, 60 * 1000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [reminders, allowNotifications]);
  const markReminderDone = useCallback(id => {
    const state = loadReminderState();
    state[id] = {
      ...(state[id] || {}),
      done: todayISO(),
      snoozedUntil: null
    };
    saveReminderState(state);
    setActiveReminder(prev => prev?.id === id ? null : prev);
  }, []);
  const snoozeReminder = useCallback((id, minutes = 10) => {
    const state = loadReminderState();
    const until = Date.now() + minutes * 60 * 1000;
    state[id] = {
      ...(state[id] || {}),
      snoozedUntil: until
    };
    saveReminderState(state);
    setActiveReminder(prev => prev?.id === id ? null : prev);
  }, []);
  const requestNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }, []);
  return {
    activeReminder,
    markReminderDone,
    snoozeReminder,
    requestNotifications
  };
}
function useData({
  hasPIN,
  unlocked,
  encryptionKey,
  unlockGeneration
}) {
  const [data, setDataState] = useState({});
  const [ready, setReady] = useState(false);
  const loadData = useCallback(async () => {
    if (hasPIN && !unlocked) {
      setReady(false);
      setDataState({});
      return;
    }
    try {
      if (hasPIN) {
        const secureRaw = localStorage.getItem(SECURE_STORE_KEY);
        if (secureRaw && encryptionKey) {
          const decrypted = await decryptJSON(encryptionKey, JSON.parse(secureRaw));
          setDataState(decrypted && typeof decrypted === "object" ? decrypted : {});
        } else {
          const plain = localStorage.getItem(STORE_KEY);
          setDataState(plain ? JSON.parse(plain) : {});
        }
      } else {
        const raw = localStorage.getItem(STORE_KEY);
        setDataState(raw ? JSON.parse(raw) : {});
      }
    } catch (e) {
      console.error("Failed to load tracker data", e);
      setDataState({});
    } finally {
      setReady(true);
    }
  }, [hasPIN, unlocked, encryptionKey]);
  useEffect(() => {
    loadData();
  }, [loadData, unlockGeneration, hasPIN, unlocked]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        if (hasPIN) {
          if (!encryptionKey) return;
          const payload = await encryptJSON(encryptionKey, data);
          if (!cancelled) {
            localStorage.setItem(SECURE_STORE_KEY, JSON.stringify(payload));
            localStorage.removeItem(STORE_KEY);
          }
        } else {
          localStorage.setItem(STORE_KEY, JSON.stringify(data));
          localStorage.removeItem(SECURE_STORE_KEY);
        }
      } catch (e) {
        console.error("Failed to persist tracker data", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, ready, hasPIN, encryptionKey]);
  const setData = useCallback(value => {
    setDataState(typeof value === "function" ? value : {
      ...value
    });
  }, []);
  const setDay = useCallback((date, updater) => {
    setDataState(prev => {
      const curRaw = prev[date] ?? blankDay(date);
      const cur = normalizeDay(curRaw);
      return {
        ...prev,
        [date]: updater({
          ...cur
        })
      };
    });
  }, []);
  return {
    data,
    setData,
    setDay,
    ready
  };
}
function loadPINInfo() {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.salt || !parsed?.verifier) return null;
    return {
      salt: parsed.salt,
      verifier: parsed.verifier,
      iterations: parsed.iterations || BASELINE_ITERATIONS
    };
  } catch (e) {
    console.warn("Failed to parse stored PIN", e);
    return null;
  }
}
function usePIN() {
  const initialPinInfoRef = useRef(loadPINInfo());
  const [pinInfo, setPinInfo] = useState(() => initialPinInfoRef.current);
  const [unlocked, setUnlocked] = useState(() => !initialPinInfoRef.current);
  const [encryptionKey, setEncryptionKey] = useState(null);
  const [unlockGeneration, setUnlockGeneration] = useState(0);
  const hasPIN = Boolean(pinInfo);
  const tryUnlock = useCallback(async attempt => {
    if (!hasPIN) {
      setUnlocked(true);
      return true;
    }
    if (!attempt) {
      alert("Enter your 4-digit PIN");
      return false;
    }
    try {
      const saltBuffer = fromBase64(pinInfo.salt);
      const {
        key,
        bits
      } = await deriveKeyMaterial(attempt, saltBuffer, pinInfo.iterations || BASELINE_ITERATIONS);
      const verifier = toBase64(bits);
      if (verifier === pinInfo.verifier) {
        setEncryptionKey(key);
        setUnlocked(true);
        setUnlockGeneration(g => g + 1);
        return true;
      }
    } catch (e) {
      console.warn("PIN unlock failed", e);
    }
    alert("Incorrect PIN");
    return false;
  }, [hasPIN, pinInfo]);
  const updatePIN = useCallback(async pin => {
    if (!pin) {
      localStorage.removeItem(PIN_KEY);
      setPinInfo(null);
      setEncryptionKey(null);
      setUnlocked(true);
      setUnlockGeneration(g => g + 1);
      return true;
    }
    if (pin.length !== 4) {
      alert("PIN must be exactly 4 digits");
      return false;
    }
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const {
        key,
        bits
      } = await deriveKeyMaterial(pin, salt.buffer, BASELINE_ITERATIONS);
      const info = {
        salt: toBase64(salt.buffer),
        verifier: toBase64(bits),
        iterations: BASELINE_ITERATIONS
      };
      localStorage.setItem(PIN_KEY, JSON.stringify(info));
      setPinInfo(info);
      setEncryptionKey(key);
      setUnlocked(true);
      setUnlockGeneration(g => g + 1);
      storeDeviceCredential(pin);
      return true;
    } catch (e) {
      console.error("Failed to set PIN", e);
      alert("Could not secure PIN. Please try again.");
      return false;
    }
  }, []);
  return {
    hasPIN,
    pinInfo,
    unlocked,
    tryUnlock,
    updatePIN,
    encryptionKey,
    unlockGeneration
  };
}
function App() {
  const {
    theme,
    setTheme
  } = useTheme();
  const {
    preferences,
    updatePreferences
  } = usePreferences();
  const {
    hasPIN,
    unlocked,
    tryUnlock,
    updatePIN,
    encryptionKey,
    unlockGeneration
  } = usePIN();
  const {
    data,
    setData,
    setDay,
    ready
  } = useData({
    hasPIN,
    unlocked,
    encryptionKey,
    unlockGeneration
  });
  const [date, setDate] = useState(todayISO());
  const metricOptions = useMemo(() => {
    const combined = [...BASE_METRIC_OPTIONS, ...buildCustomMetricOptions(preferences.customMetrics)];
    return combined.length ? combined : [...BASE_METRIC_OPTIONS];
  }, [preferences.customMetrics]);
  const [selectedMetric, setSelectedMetric] = useState(() => metricOptions[0]?.value || BASE_METRIC_OPTIONS[0].value);
  const [metricView, setMetricView] = useState("daily");
  useEffect(() => {
    if (!metricOptions.some(option => option.value === selectedMetric)) {
      setSelectedMetric(metricOptions[0]?.value || BASE_METRIC_OPTIONS[0].value);
    }
  }, [metricOptions, selectedMetric]);
  const d = useMemo(() => normalizeDay(data[date] ?? blankDay(date)), [data, date]);
  const streak = useMemo(() => calcStreak(data), [data]);
  const longestStreak = useMemo(() => calcLongestStreak(data), [data]);
  const totals = useMemo(() => calcTotals(data), [data]);
  const weekSummary = useMemo(() => calcWeekSummary(data, date), [data, date]);
  const metricConfig = useMemo(() => metricOptions.find(opt => opt.value === selectedMetric) ?? metricOptions[0], [metricOptions, selectedMetric]);
  const metricSeries = useMemo(() => buildMetricSeries(data, selectedMetric, metricOptions), [data, selectedMetric, metricOptions]);
  const displayedMetricSeries = metricView === "weekly" ? metricSeries.weekly : metricSeries.daily;
  const metricSummary = useMemo(() => computeMetricSummary(metricSeries, metricView), [metricSeries, metricView]);
  const metricHighlights = useMemo(() => computeMetricHighlights(metricSeries, metricConfig, metricView), [metricSeries, metricConfig, metricView]);
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
  const customTotals = useMemo(() => calcCustomTotals(data, preferences.customMetrics), [data, preferences.customMetrics]);
  const tagSummary = useMemo(() => summarizeTags(data), [data]);
  const moodSummary = useMemo(() => summarizeMood(data), [data]);
  const latestMoodMeta = useMemo(() => getMoodMeta(moodSummary.latest?.mood), [moodSummary]);
  const {
    activeReminder,
    markReminderDone,
    snoozeReminder,
    requestNotifications
  } = useReminders(preferences.reminders, preferences.allowNotifications);
  const spotlight = useMemo(() => PRACTICE_SPOTLIGHTS[preferences.spotlightIndex % PRACTICE_SPOTLIGHTS.length], [preferences.spotlightIndex]);
  const cycleSpotlight = useCallback(() => {
    updatePreferences(prev => ({
      spotlightIndex: (prev.spotlightIndex + 1) % PRACTICE_SPOTLIGHTS.length
    }));
  }, [updatePreferences]);
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
    className: "app-shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative z-10 flex min-h-screen flex-col"
  }, !preferences.onboardingComplete && /*#__PURE__*/React.createElement(OnboardingDialog, {
    onComplete: () => updatePreferences({
      onboardingComplete: true
    })
  }), /*#__PURE__*/React.createElement("header", {
    className: "sticky top-0 z-30 pt-4 pb-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mx-auto max-w-5xl px-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4 rounded-3xl border border-white/60 bg-white/75 px-5 py-4 shadow-lg shadow-emerald-500/20 backdrop-blur-xl dark:border-white/10 dark:bg-white/10"
  }, /*#__PURE__*/React.createElement("img", {
    src: BRUSHSTROKE_CROSS,
    alt: "Mindfulness and Prayer Tracker logo",
    className: "h-12 w-12 shrink-0 rounded-2xl border border-white/50 bg-white/70 p-2 shadow-md shadow-emerald-500/10 dark:border-white/10 dark:bg-white/10",
    width: "48",
    height: "48",
    loading: "lazy"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-100"
  }, "Mindfulness and Prayer Tracker"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-emerald-600/80 sm:text-sm dark:text-emerald-300/80"
  }, "Gentle rhythms for prayer, stillness, and compassion.")), /*#__PURE__*/React.createElement("div", {
    className: "ml-auto flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setTheme(theme === "dark" ? "light" : "dark"),
    title: "Toggle theme"
  }, theme === "dark" ? "☀️ Light" : "🌙 Dark"), /*#__PURE__*/React.createElement(PinMenu, {
    hasPIN: hasPIN,
    updatePIN: updatePIN
  }))))), /*#__PURE__*/React.createElement("main", {
    className: "relative z-10 mx-auto grid max-w-5xl gap-8 px-4 pb-12 pt-8"
  }, /*#__PURE__*/React.createElement(ReminderBanner, {
    reminder: activeReminder,
    onComplete: markReminderDone,
    onSnooze: id => snoozeReminder(id, 10)
  }), /*#__PURE__*/React.createElement(PracticeSpotlight, {
    spotlight: spotlight,
    onNext: cycleSpotlight
  }), /*#__PURE__*/React.createElement("div", {
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
  }), /*#__PURE__*/React.createElement(CustomMetricInputs, {
    date: date,
    day: d,
    setDay: setDay,
    customMetrics: preferences.customMetrics
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
  }), preferences.showGuidedPrompts && /*#__PURE__*/React.createElement(GuidedPrompt, {
    title: "Gentle examen",
    prompts: EXAMEN_PROMPTS
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
  }), preferences.showGuidedPrompts && /*#__PURE__*/React.createElement(GuidedPrompt, {
    title: "Lectio divina prompt",
    prompts: LECTIO_PROMPTS
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Weekly Anchors (auto-applies to week)"
  }, /*#__PURE__*/React.createElement(WeeklyAnchors, {
    date: date,
    setData: setData,
    data: data
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Journal"
  }, preferences.showGuidedPrompts && /*#__PURE__*/React.createElement(GuidedPrompt, {
    title: "Journal spark",
    prompts: JOURNAL_PROMPTS
  }), /*#__PURE__*/React.createElement(MoodSelector, {
    value: d.mood,
    onChange: mood => setDay(date, x => ({
      ...x,
      mood
    }))
  }), /*#__PURE__*/React.createElement(TagSelector, {
    tags: d.contextTags,
    onChange: tags => setDay(date, x => ({
      ...x,
      contextTags: tags
    }))
  }), /*#__PURE__*/React.createElement("textarea", {
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
    metricConfig: metricConfig,
    metricOptions: metricOptions,
    highlights: metricHighlights
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
  }, totals.lapses))), customTotals.length ? /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-medium uppercase tracking-wide text-zinc-500"
  }, "Custom totals to date"), customTotals.map(entry => /*#__PURE__*/React.createElement("div", {
    key: entry.id,
    className: "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", null, entry.name), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums font-semibold"
  }, formatMetricValue(entry.total), " ", entry.unit)))) : null, /*#__PURE__*/React.createElement("div", {
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
  }, totals.weeklyAccountability)))), moodSummary.counts.length ? /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-medium uppercase tracking-wide text-zinc-500"
  }, "Mood patterns"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2 text-xs"
  }, moodSummary.counts.map(([mood, count]) => {
    const meta = getMoodMeta(mood);
    return /*#__PURE__*/React.createElement("span", {
      key: mood,
      className: "chip"
    }, meta?.emoji, " ", meta?.label || mood, " \xB7 ", count);
  })), latestMoodMeta ? /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-zinc-500"
  }, "Last logged mood: ", latestMoodMeta.emoji, " ", latestMoodMeta.label) : null) : null, tagSummary.length ? /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-medium uppercase tracking-wide text-zinc-500"
  }, "Frequent tags"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-300"
  }, tagSummary.slice(0, 10).map(([tag, count]) => /*#__PURE__*/React.createElement("span", {
    key: tag,
    className: "chip"
  }, "#", tag, " \xB7 ", count)))) : null)), /*#__PURE__*/React.createElement(Card, {
    title: "Backup / Restore"
  }, /*#__PURE__*/React.createElement(BackupControls, {
    data: data,
    setData: setData,
    preferences: preferences,
    updatePreferences: updatePreferences
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Settings & Safety"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2 text-sm"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "Show guided prompts"), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: preferences.showGuidedPrompts,
    onChange: e => updatePreferences({
      showGuidedPrompts: e.target.checked
    })
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30",
    onClick: resetApp
  }, "Reset App (export \u2192 clear \u2192 reload)"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "This will optionally back up your data as JSON, then clear local storage and unregister the service worker before reloading.")))), /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-2 gap-6"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Custom Metrics"
  }, /*#__PURE__*/React.createElement(CustomMetricManager, {
    customMetrics: preferences.customMetrics,
    updatePreferences: updatePreferences
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Reminders & Planning"
  }, /*#__PURE__*/React.createElement(ReminderPlanner, {
    reminders: preferences.reminders,
    updatePreferences: updatePreferences,
    allowNotifications: preferences.allowNotifications,
    requestNotifications: requestNotifications
  }), /*#__PURE__*/React.createElement(PlanTomorrow, {
    plan: preferences.tomorrowPlan,
    onChange: value => updatePreferences({
      tomorrowPlan: value
    })
  }))), /*#__PURE__*/React.createElement(TopNav, {
    date: date,
    setDate: setDate,
    data: data
  }), /*#__PURE__*/React.createElement("footer", {
    className: "pt-2 pb-8 text-center text-xs text-zinc-500 dark:text-zinc-400"
  }, "Built for Mark \u2014 \u201Csee clearly, return gently, offer everything to Christ.\u201D"))));
}
function MetricTrendsCard({
  selectedMetric,
  setSelectedMetric,
  metricView,
  setMetricView,
  series,
  summary,
  metricConfig,
  metricOptions,
  highlights
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
  }, metricOptions.map(option => /*#__PURE__*/React.createElement("option", {
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
  }, averageDisplay, summary.averageValue != null && unit ? " " + unit : "")), highlights ? /*#__PURE__*/React.createElement("div", {
    className: "grid gap-1 text-[11px] text-zinc-500 dark:text-zinc-400"
  }, /*#__PURE__*/React.createElement("div", null, "Total recorded: ", /*#__PURE__*/React.createElement("b", {
    className: "text-zinc-700 dark:text-zinc-200"
  }, formatMetricValue(highlights.total)), highlights.unit ? " " + highlights.unit : ""), /*#__PURE__*/React.createElement("div", null, "Record high: ", /*#__PURE__*/React.createElement("b", {
    className: "text-zinc-700 dark:text-zinc-200"
  }, formatMetricValue(highlights.maxValue)), highlights.maxDate ? ` on ${formatSeriesLabel({
    date: highlights.maxDate,
    end: highlights.maxEnd
  }, metricView, "end")}` : ""), /*#__PURE__*/React.createElement("div", null, "Current streak: ", /*#__PURE__*/React.createElement("b", {
    className: "text-zinc-700 dark:text-zinc-200"
  }, highlights.currentStreak), " day(s) \xB7 Longest streak:", /*#__PURE__*/React.createElement("b", {
    className: "text-zinc-700 dark:text-zinc-200"
  }, " ", highlights.longestStreak))) : null), /*#__PURE__*/React.createElement(MetricSparkline, {
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
    className: "glass-card"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "card-title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "grid gap-3 text-sm text-zinc-600 dark:text-zinc-300"
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
function CustomMetricInputs({
  date,
  day,
  setDay,
  customMetrics
}) {
  if (!customMetrics?.length) return null;
  const current = day.customMetrics || {};
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-sm font-medium"
  }, "Custom practice log"), customMetrics.map(metric => /*#__PURE__*/React.createElement(CustomMetricField, {
    key: metric.id,
    metric: metric,
    value: current[metric.id] ?? 0,
    onChange: value => setDay(date, existing => ({
      ...existing,
      customMetrics: {
        ...(existing.customMetrics || {}),
        [metric.id]: value
      }
    }))
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "Track anything else meaningful to your rhythm\u2014minutes of silence, chapters read, or visits with a friend."));
}
function CustomMetricField({
  metric,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: "flex items-center justify-between gap-3 pr-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "flex-1"
  }, metric.name, metric.unit ? /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-zinc-500"
  }, " (", metric.unit, ")") : null), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    onChange: e => {
      const next = Number(e.target.value);
      onChange(Number.isFinite(next) ? next : 0);
    },
    className: "w-24 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/60 px-2 py-1 text-right tabular-nums"
  }));
}
function MoodSelector({
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm font-medium"
  }, "How are you arriving today?"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, MOOD_OPTIONS.map(option => {
    const active = option.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: option.value,
      type: "button",
      onClick: () => onChange(active ? "" : option.value),
      className: "rounded-full px-3 py-1 text-sm transition border " + (active ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300")
    }, /*#__PURE__*/React.createElement("span", {
      className: "mr-1"
    }, option.emoji), option.label);
  })));
}
function TagSelector({
  tags,
  onChange
}) {
  const [input, setInput] = useState("");
  const addTag = tag => {
    const normalized = String(tag || "").trim();
    if (!normalized) return;
    if (tags.includes(normalized)) return;
    onChange([...tags, normalized]);
    setInput("");
  };
  const removeTag = tag => {
    onChange(tags.filter(t => t !== tag));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm font-medium"
  }, "Tag the day"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, tags.map(tag => /*#__PURE__*/React.createElement("span", {
    key: tag,
    className: "chip"
  }, "#", tag, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => removeTag(tag),
    className: "chip-remove"
  }, "\xD7")))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    value: input,
    onChange: e => setInput(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag(input);
      }
    },
    placeholder: "Add tag",
    className: "flex-1 min-w-[8rem] rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-sm text-zinc-700 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    type: "button",
    onClick: () => addTag(input)
  }, "Add")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2 text-xs"
  }, TAG_SUGGESTIONS.map(suggestion => /*#__PURE__*/React.createElement("button", {
    key: suggestion,
    type: "button",
    onClick: () => addTag(suggestion),
    className: "chip hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-200"
  }, "#", suggestion))));
}
function GuidedPrompt({
  title,
  prompts
}) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * prompts.length) || 0);
  useEffect(() => {
    setIndex(0);
  }, [prompts]);
  const cycle = () => {
    setIndex(prev => (prev + 1) % prompts.length);
  };
  const prompt = prompts[index] || "";
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 p-3 text-xs text-zinc-600 dark:text-zinc-300"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-semibold text-zinc-700 dark:text-zinc-100"
  }, title), /*#__PURE__*/React.createElement("button", {
    className: "ml-auto text-[11px] text-emerald-600 hover:underline",
    type: "button",
    onClick: cycle
  }, "New prompt \u21BA")), /*#__PURE__*/React.createElement("p", {
    className: "mt-1 leading-relaxed"
  }, prompt));
}
function ReminderPlanner({
  reminders,
  updatePreferences,
  allowNotifications,
  requestNotifications
}) {
  const toggleReminder = (id, patch) => {
    updatePreferences(prev => ({
      reminders: {
        ...prev.reminders,
        [id]: {
          ...prev.reminders[id],
          ...patch
        }
      }
    }));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-3 text-sm"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "text-sm font-medium"
  }, "Daily reminder times"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "Set gentle alerts (while the app is open) for key rhythms. Enable browser notifications for extra nudges.")), Object.entries(reminders).map(([id, reminder]) => /*#__PURE__*/React.createElement("div", {
    key: id,
    className: "flex flex-wrap items-center gap-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: reminder.enabled,
    onChange: e => toggleReminder(id, {
      enabled: e.target.checked
    })
  }), /*#__PURE__*/React.createElement("span", {
    className: "capitalize"
  }, reminder.label || id)), /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: reminder.time,
    onChange: e => toggleReminder(id, {
      time: e.target.value
    }),
    className: "rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2 text-xs text-zinc-500"
  }, /*#__PURE__*/React.createElement("span", null, "Browser notifications:"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    type: "button",
    onClick: async () => {
      const granted = await requestNotifications();
      if (granted) updatePreferences({
        allowNotifications: true
      });
    }
  }, allowNotifications ? "Enabled" : "Enable"), allowNotifications ? /*#__PURE__*/React.createElement("span", {
    className: "text-emerald-600"
  }, "Granted") : null));
}
function ReminderBanner({
  reminder,
  onComplete,
  onSnooze
}) {
  if (!reminder) return null;
  const timeLabel = reminder.time || reminder.scheduled?.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "sticky top-32 z-30 mx-auto max-w-4xl px-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-card reminder-card mt-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-3 text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold"
  }, "Reminder: ", reminder.label), /*#__PURE__*/React.createElement("span", {
    className: "text-xs opacity-80"
  }, "Scheduled for ", timeLabel), /*#__PURE__*/React.createElement("div", {
    className: "ml-auto flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => onComplete(reminder.id)
  }, "Logged"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => onSnooze(reminder.id)
  }, "Snooze 10m")))));
}
function PracticeSpotlight({
  spotlight,
  onNext
}) {
  if (!spotlight) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "glass-card spotlight-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-start gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-semibold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-200/80"
  }, "Practice spotlight"), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-base font-semibold text-emerald-900 dark:text-emerald-100"
  }, spotlight.title), /*#__PURE__*/React.createElement("p", {
    className: "mt-2 text-sm leading-relaxed text-emerald-800/90 dark:text-emerald-100/80"
  }, spotlight.body)), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: onNext
  }, "Another")));
}
function OnboardingDialog({
  onComplete
}) {
  const [step, setStep] = useState(0);
  const totalSteps = ONBOARDING_STEPS.length;
  const current = ONBOARDING_STEPS[step];
  if (!current) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-40 grid place-items-center bg-black/40 backdrop-blur-sm px-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-full max-w-lg rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs uppercase tracking-wide text-emerald-600"
  }, "Step ", step + 1, " of ", totalSteps), /*#__PURE__*/React.createElement("h2", {
    className: "mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100"
  }, current.title), /*#__PURE__*/React.createElement("p", {
    className: "mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
  }, current.body), /*#__PURE__*/React.createElement("div", {
    className: "mt-6 flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("button", {
    className: "text-xs text-zinc-500 hover:text-zinc-700",
    onClick: () => onComplete()
  }, "Skip tour"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => {
      if (step + 1 >= totalSteps) onComplete();else setStep(s => s + 1);
    }
  }, step + 1 >= totalSteps ? "Let’s begin" : "Next")))));
}
function PlanTomorrow({
  plan,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2 text-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-medium"
  }, "Plan tomorrow\u2019s focus"), /*#__PURE__*/React.createElement("textarea", {
    value: plan,
    onChange: e => onChange(e.target.value),
    placeholder: "Jot a short intention for tomorrow\u2019s prayer rhythm\u2026",
    className: "min-h-[4.5rem] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 p-3 outline-none focus:ring-2 focus:ring-emerald-500"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "Tomorrow\u2019s intention appears here for quick review when you begin the day."));
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
    className: "glass-card grid gap-4"
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
    className: "rounded-xl border border-white/60 bg-white/80 px-3 py-1 text-sm text-zinc-700 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setDate(todayISO())
  }, "Today"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setDate(prevDay(date, 1))
  }, "Next \u2192"), /*#__PURE__*/React.createElement("span", {
    className: "ml-auto text-xs text-zinc-500 dark:text-zinc-400"
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
      className: "aspect-square rounded-lg text-[11px] tabular-nums flex items-center justify-center border transition-colors backdrop-blur " + (isCurrent ? "border-emerald-500 bg-emerald-500/30 text-emerald-900 shadow-sm dark:text-emerald-100" : "border-white/50 bg-white/70 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300") + (filled ? " ring-1 ring-emerald-500/40" : ""),
      "aria-pressed": isCurrent
    }, Number(strDate.slice(-2)));
  })), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-[10px] text-zinc-500"
  }, "Filled = any practice done that day"));
}
function BackupControls({
  data,
  setData,
  preferences,
  updatePreferences
}) {
  const exportJSON = () => {
    const payload = {
      data,
      preferences
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
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
    const rows = toCSV(data, preferences.customMetrics);
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
        if (obj.data && typeof obj.data === "object") setData(obj.data);else setData(obj);
        if (obj.preferences && typeof obj.preferences === "object") {
          updatePreferences(prev => ({
            ...prev,
            ...obj.preferences
          }));
        }
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
function CustomMetricManager({
  customMetrics,
  updatePreferences
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const maxMetrics = 6;
  const remaining = maxMetrics - customMetrics.length;
  const addMetric = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 12)}-${randomId()}`;
    updatePreferences(prev => ({
      customMetrics: [...prev.customMetrics, {
        id,
        name: trimmed,
        unit: unit.trim()
      }]
    }));
    setName("");
    setUnit("");
  };
  const updateMetric = (id, patch) => {
    updatePreferences(prev => ({
      customMetrics: prev.customMetrics.map(metric => metric.id === id ? {
        ...metric,
        ...patch
      } : metric)
    }));
  };
  const removeMetric = id => {
    updatePreferences(prev => ({
      customMetrics: prev.customMetrics.filter(metric => metric.id !== id)
    }));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "grid gap-3 text-sm"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "text-sm font-medium mb-1"
  }, "Custom metrics"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "Create extra counters or minute trackers for practices unique to you. They\u2019ll appear in today\u2019s log and analytics.")), customMetrics.length ? /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2"
  }, customMetrics.map(metric => /*#__PURE__*/React.createElement("div", {
    key: metric.id,
    className: "rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 flex flex-wrap items-center gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    value: metric.name,
    onChange: e => updateMetric(metric.id, {
      name: e.target.value
    }),
    className: "flex-1 min-w-[8rem] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1"
  }), /*#__PURE__*/React.createElement("input", {
    value: metric.unit || "",
    onChange: e => updateMetric(metric.id, {
      unit: e.target.value
    }),
    placeholder: "Unit",
    className: "w-24 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => removeMetric(metric.id)
  }, "Remove")))) : /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-500"
  }, "No custom metrics yet."), remaining > 0 ? /*#__PURE__*/React.createElement("div", {
    className: "grid gap-2 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-medium text-sm"
  }, "Add a metric"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    value: name,
    onChange: e => setName(e.target.value),
    placeholder: "e.g., Lectio minutes",
    className: "flex-1 min-w-[8rem] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1"
  }), /*#__PURE__*/React.createElement("input", {
    value: unit,
    onChange: e => setUnit(e.target.value),
    placeholder: "Unit (optional)",
    className: "w-28 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: addMetric,
    disabled: !name.trim()
  }, "Add")), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-zinc-500"
  }, "You can add ", remaining, " more.")) : null);
}
function PinMenu({
  hasPIN,
  updatePIN
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [working, setWorking] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    onClick: () => setOpen(o => !o)
  }, hasPIN ? "🔒 PIN" : "🔓 Set PIN"), open && /*#__PURE__*/React.createElement("div", {
    className: "absolute right-0 z-40 mt-3 w-72 rounded-2xl border border-white/60 bg-white/80 p-4 text-left shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-white/10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-3 text-sm text-zinc-600 dark:text-zinc-300"
  }, "Optional 4-digit app lock. When enabled, your journal + scripture entries are stored encrypted on this device. If supported, we\u2019ll also save the PIN to your browser\u2019s credential manager for biometric unlocks."), /*#__PURE__*/React.createElement("input", {
    value: val,
    onChange: e => setVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)),
    placeholder: "1234",
    className: "mb-3 w-full rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-center text-lg tracking-[0.35em] text-zinc-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn",
    disabled: working,
    onClick: async () => {
      if (val.length !== 4) {
        alert("Enter 4 digits");
        return;
      }
      setWorking(true);
      const success = await updatePIN(val);
      setWorking(false);
      if (success) {
        setOpen(false);
        setVal("");
      }
    }
  }, hasPIN ? "Update" : "Set"), /*#__PURE__*/React.createElement("button", {
    className: "btn",
    disabled: working || !hasPIN,
    onClick: async () => {
      setWorking(true);
      await updatePIN(null);
      setWorking(false);
      setVal("");
      setOpen(false);
    }
  }, "Remove"))));
}
function LockScreen({
  tryUnlock
}) {
  const [val, setVal] = useState("");
  const [working, setWorking] = useState(false);
  const submit = async (pinValue = val) => {
    if (working) return;
    setWorking(true);
    const ok = await tryUnlock(pinValue);
    setWorking(false);
    if (!ok) setVal("");
  };
  const useDeviceCredential = async () => {
    try {
      if (!navigator.credentials) {
        alert("Device credential unlock not supported in this browser.");
        return;
      }
      const credential = await navigator.credentials.get({
        password: true,
        mediation: "optional"
      });
      if (!credential || credential.id !== DEVICE_CREDENTIAL_ID || !credential.password) {
        alert("No saved device credential was found. Set a PIN first to store one.");
        return;
      }
      submit(credential.password);
    } catch (e) {
      alert("Could not use saved credential: " + e.message);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "app-shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative z-10 grid min-h-screen place-items-center px-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-card w-full max-w-sm text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
  }, "\uD83D\uDD12"), /*#__PURE__*/React.createElement("h2", {
    className: "mb-2 text-lg font-semibold"
  }, "Enter PIN"), /*#__PURE__*/React.createElement("p", {
    className: "mb-4 text-xs text-zinc-500 dark:text-zinc-400"
  }, "Your journal is encrypted when a PIN is set. Unlock to continue."), /*#__PURE__*/React.createElement("input", {
    value: val,
    onChange: e => setVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)),
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    },
    className: "w-full rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-center text-2xl tracking-[0.5em] text-zinc-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mt-4 grid gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn w-full justify-center",
    onClick: submit,
    disabled: working
  }, working ? "Checking…" : "Unlock"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn w-full justify-center",
    onClick: useDeviceCredential,
    disabled: working
  }, "Use saved device credential")), /*#__PURE__*/React.createElement("p", {
    className: "mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400"
  }, "Tip: You can remove the PIN later from the header menu. Device credentials rely on your browser\u2019s password manager and may prompt for biometric confirmation."))));
}
function buildMetricSeries(data, metricKey, metricOptions = BASE_METRIC_OPTIONS) {
  const metric = metricOptions.find(option => option.value === metricKey);
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
function computeMetricStreak(points) {
  let current = 0;
  let longest = 0;
  let prevDate = null;
  for (const point of points) {
    const hasPractice = point.value > 0;
    if (!hasPractice) {
      current = 0;
      prevDate = null;
      continue;
    }
    const currentDate = new Date(point.date);
    if (prevDate) {
      const diff = Math.round((currentDate - prevDate) / (1000 * 60 * 60 * 24));
      current = diff === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    prevDate = currentDate;
    longest = Math.max(longest, current);
  }
  return {
    current,
    longest
  };
}
function computeMetricHighlights(series, metricConfig, view) {
  const points = view === "weekly" ? series.weekly : series.daily;
  if (!points.length) {
    return {
      total: 0,
      maxValue: 0,
      maxDate: null,
      currentStreak: 0,
      longestStreak: 0
    };
  }
  const total = points.reduce((acc, point) => acc + point.value, 0);
  let maxPoint = points[0];
  for (const point of points) {
    if (point.value > maxPoint.value) maxPoint = point;
  }
  const streakStats = computeMetricStreak(series.daily);
  return {
    total,
    maxValue: maxPoint.value,
    maxDate: maxPoint.date,
    maxEnd: maxPoint.end,
    currentStreak: streakStats.current,
    longestStreak: streakStats.longest,
    unit: metricConfig.unit
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
function calcCustomTotals(data, customMetrics = []) {
  if (!customMetrics.length) return [];
  const summary = customMetrics.map(metric => ({
    id: metric.id,
    name: metric.name,
    unit: metric.unit || "",
    total: 0
  }));
  const index = new Map(summary.map(entry => [entry.id, entry]));
  Object.values(data).forEach(day => {
    const entries = day.customMetrics || {};
    for (const metric of customMetrics) {
      const raw = entries?.[metric.id];
      const value = typeof raw === "number" ? raw : Number(raw || 0);
      if (Number.isFinite(value)) {
        const target = index.get(metric.id);
        if (target) target.total += value;
      }
    }
  });
  return summary;
}
function summarizeTags(data) {
  const counts = new Map();
  Object.values(data).forEach(day => {
    (day.contextTags || []).forEach(tag => {
      const normalized = String(tag || "").trim();
      if (!normalized) return;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}
function summarizeMood(data) {
  const counts = new Map();
  let latest = null;
  Object.values(data).forEach(day => {
    if (!day.mood) return;
    counts.set(day.mood, (counts.get(day.mood) || 0) + 1);
    if (!latest || day.date && day.date > latest.date) {
      latest = {
        date: day.date,
        mood: day.mood
      };
    }
  });
  return {
    counts: Array.from(counts.entries()),
    latest
  };
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
function toCSV(data, customMetrics = []) {
  const header = ["Date", "Scripture", "Notes", "Consecration", "BreathMinutes", "JesusPrayerCount", "Stillness", "BodyBlessing", "Examen", "RosaryDecades", "NightSilence", "UrgesNoted", "Victories", "Lapses", "Mass", "Confession", "Fasting", "Accountability", "Mood", "Tags"];
  customMetrics.forEach(metric => header.push(metric.name || metric.id));
  const rows = [header.join(",")];
  const keys = Object.keys(data).sort();
  for (const k of keys) {
    const day = data[k];
    const tags = Array.isArray(day.contextTags) ? day.contextTags.join(" ") : "";
    const mood = day.mood || "";
    rows.push([day.date, csvQuote(day.scripture), csvQuote(day.notes), day.morning.consecration ? 1 : 0, day.morning.breathMinutes, day.morning.jesusPrayerCount, day.midday.stillness ? 1 : 0, day.midday.bodyBlessing ? 1 : 0, day.evening.examen ? 1 : 0, day.evening.rosaryDecades, day.evening.nightSilence ? 1 : 0, day.temptations.urgesNoted, day.temptations.victories, day.temptations.lapses, day.weekly.mass ? 1 : 0, day.weekly.confession ? 1 : 0, day.weekly.fasting ? 1 : 0, day.weekly.accountability ? 1 : 0, mood, csvQuote(tags), ...customMetrics.map(metric => {
      const raw = day.customMetrics?.[metric.id];
      return Number(raw ?? 0);
    })].join(","));
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
