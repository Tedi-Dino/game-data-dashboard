// Admin UIDs that have write access
export const ADMIN_UIDS = ['ZPyHfPGUI4elNvRN2Q30ZqfzT6X2'];

// Firebase plan feature switches — see docs/free-tier-plan.md.
// Spark (free) has no Cloud Functions and no Cloud Scheduler, so the browser
// must never depend on a callable. Flip these back after upgrading to Blaze:
//   Blaze: {STEAM_SYNC: true, SCHEDULED_SYNC: true, AI_LOCAL_ONLY: false}
//   Spark: {STEAM_SYNC: false, SCHEDULED_SYNC: false, AI_LOCAL_ONLY: true}
export const FEATURES = {
    // Manual Steam sync via the `syncSteamData` Cloud Function.
    STEAM_SYNC: false,
    // Daily 04:00 `scheduledSteamSync` run by Cloud Scheduler.
    // Requires STEAM_SYNC: without Cloud Functions there is nothing to schedule.
    SCHEDULED_SYNC: false,
    // AI recommendations skip the Cloud Function and call DeepSeek directly
    // from the browser with the user's own API key.
    AI_LOCAL_ONLY: true,
};

// Guard against a half-flipped config (e.g. enabling the schedule while the
// callable stays off), which would silently skip every sync.
if (FEATURES.SCHEDULED_SYNC && !FEATURES.STEAM_SYNC) {
    throw new Error('FEATURES.SCHEDULED_SYNC requires FEATURES.STEAM_SYNC');
}

// Unified platform metadata table — single source of truth for all platform
// mappings below. Adding a new platform only requires one entry here.
// Fields:
//   type:       item.type value
//   label:      display label (TYPE_MAP value)
//   costLabel:  label for cost charts
//   costTypes:  item.type(s) included in this cost group
//   timeLabel:  label for time charts (null = exclude from time chart)
//   timeTypes:  item.type(s) included in this time group
//   colorKey:   key into PLATFORM_COLORS
//   isHardware: true if hardware category
// NOTE: previously some labels here were written as \uXXXX escapes on the very
// same lines that used literal UTF-8 — a tool artifact that made the "single
// source of truth" the least readable file in the repo. All literals now.
export const PLATFORM_META = [
    { type: 'hardware', label: '硬件', costLabel: '硬件设备', costTypes: ['hardware'], timeLabel: null, timeTypes: [], trendKey: 'hardware', trendLabel: '硬件', colorKey: 'hardware', isHardware: true },
    { type: 'physical', label: 'Switch 实体', costLabel: 'Switch 实体', costTypes: ['physical'], timeLabel: 'Switch', timeTypes: ['physical', 'digital'], trendKey: 'switch_physical', trendLabel: 'Switch 实体', colorKey: 'switch_physical' },
    { type: 'digital', label: 'Switch 数字', costLabel: 'Switch 数字', costTypes: ['digital'], timeLabel: 'Switch', timeTypes: ['physical', 'digital'], trendKey: 'switch_digital', trendLabel: 'Switch 数字', colorKey: 'switch_digital' },
    { type: 'steam', label: 'Steam', costLabel: 'Steam 游戏', costTypes: ['steam'], timeLabel: 'Steam', timeTypes: ['steam'], trendKey: 'steam', trendLabel: 'Steam', colorKey: 'steam' },
    { type: 'epic', label: 'Epic', costLabel: 'Epic 游戏', costTypes: ['epic'], timeLabel: 'Epic', timeTypes: ['epic'], trendKey: 'epic', trendLabel: 'Epic', colorKey: 'epic' },
    { type: 'ubi', label: 'Uplay', costLabel: 'Uplay 游戏', costTypes: ['ubi'], timeLabel: 'Uplay', timeTypes: ['ubi'], trendKey: 'ubi', trendLabel: 'Uplay', colorKey: 'ubi' },
    { type: 'gog', label: 'GOG', costLabel: 'GOG 游戏', costTypes: ['gog'], timeLabel: 'GOG', timeTypes: ['gog'], trendKey: 'gog', trendLabel: 'GOG', colorKey: 'gog' },
    { type: 'ps', label: 'PlayStation', costLabel: 'PlayStation 游戏', costTypes: ['ps'], timeLabel: 'PlayStation', timeTypes: ['ps'], trendKey: 'ps', trendLabel: 'PlayStation', colorKey: 'ps' },
    { type: 'xbox', label: 'Xbox/MS Store', costLabel: 'Xbox/MS 游戏', costTypes: ['xbox', 'ms'], timeLabel: 'Xbox/MS', timeTypes: ['xbox', 'ms'], trendKey: 'xbox', trendLabel: 'Xbox/MS', colorKey: 'xbox' },
    { type: 'ms', label: 'Xbox/MS Store', costLabel: 'Xbox/MS 游戏', costTypes: ['xbox', 'ms'], timeLabel: 'Xbox/MS', timeTypes: ['xbox', 'ms'], trendKey: 'xbox', trendLabel: 'Xbox/MS', colorKey: 'ms' },
    { type: 'appstore', label: 'App Store', costLabel: 'App Store 游戏', costTypes: ['appstore'], timeLabel: 'App Store', timeTypes: ['appstore'], trendKey: 'appstore', trendLabel: 'App Store', colorKey: 'appstore' },
    { type: 'googleplay', label: 'Google Play', costLabel: 'Google Play 游戏', costTypes: ['googleplay'], timeLabel: 'Google Play', timeTypes: ['googleplay'], trendKey: 'googleplay', trendLabel: 'Google Play', colorKey: 'googleplay' },
    { type: 'emulator', label: '模拟器', costLabel: '模拟器游戏', costTypes: ['emulator'], timeLabel: '模拟器', timeTypes: ['emulator'], trendKey: 'emulator', trendLabel: '模拟器', colorKey: 'emulator' },
    { type: 'other', label: 'Other', costLabel: 'Other 游戏', costTypes: ['other'], timeLabel: 'Other', timeTypes: ['other'], trendKey: 'other', trendLabel: 'Other', colorKey: 'other' },
    { type: 'drama', label: '剧', costLabel: '剧', costTypes: ['drama'], timeLabel: '剧', timeTypes: ['drama'], trendKey: 'drama', trendLabel: '剧', colorKey: 'drama' },
];

// Thin helper: get all unique entries for a given field (for derived maps)
const uniqueBy = (arr, key) => {
    const seen = new Set();
    return arr.filter(item => {
        const val = item[key];
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
    });
};

// TYPE_MAP — display label per item.type (unchanged)
export const TYPE_MAP = Object.fromEntries(PLATFORM_META.map(p => [p.type, p.label]));

// COST_TYPE_MAP — cost chart grouping label -> types
export const COST_TYPE_MAP = Object.fromEntries(
    uniqueBy(PLATFORM_META.filter(p => p.costLabel), 'costLabel')
        .map(p => [p.costLabel, p.costTypes])
);

// COST_COLOR_MAP — cost chart label -> color key
export const COST_COLOR_MAP = Object.fromEntries(
    uniqueBy(PLATFORM_META.filter(p => p.costLabel), 'costLabel')
        .map(p => [p.costLabel, p.colorKey])
);

// TIME_TYPE_MAP — time chart grouping label -> types
export const TIME_TYPE_MAP = Object.fromEntries(
    uniqueBy(PLATFORM_META.filter(p => p.timeLabel), 'timeLabel')
        .map(p => [p.timeLabel, p.timeTypes])
);

// TIME_COLOR_MAP — time chart label -> color key
export const TIME_COLOR_MAP = Object.fromEntries(
    uniqueBy(PLATFORM_META.filter(p => p.timeLabel), 'timeLabel')
        .map(p => [p.timeLabel, p.colorKey])
);


// FROM_MAP (values unchanged — previously written as \uXXXX escapes)
export const FROM_MAP = {
    purchase: '购买', free: '免费', friend: '赠送', subscription: '订阅'
};

// STATUS_MAP (values unchanged — previously written as \uXXXX escapes)
export const STATUS_MAP = {
    playing: '进行中', backlog: '待玩', passed: '已完成',
    abandoned: '已放弃', empty: '空'
};

// PLATFORM_COLORS (unchanged)
export const PLATFORM_COLORS = {
    hardware: '#b0a498',
    switch_physical: '#d89888',
    switch_digital: '#e8c8b0',
    steam: '#8abcd8',
    epic: '#d8ccc0',
    ubi: '#bcb4d4',
    gog: '#d0a8c0',
    ps: '#8ca8c8',
    xbox: '#8cbc98',
    ms: '#8cbc98',
    appstore: '#a0a8b4',
    googleplay: '#90c0a8',
    emulator: '#d8c898',
    other: '#c0b8b0',
    drama: '#d8a8b8'
};

// --- Per-type lookups -------------------------------------------------------
// These replace the label maps that used to be duplicated inside each chart
// module (COST_LABELS / TIME_LABELS / PLATFORM_MAP / typeToKey). Charts import
// them, so adding a platform now only requires editing PLATFORM_META above.
// Declared after PLATFORM_COLORS because TREND_PLATFORM_KEYS dereferences it.
export const COST_LABEL_BY_TYPE = Object.fromEntries(
    PLATFORM_META.filter(p => p.costLabel).map(p => [p.type, p.costLabel])
);

export const TIME_LABEL_BY_TYPE = Object.fromEntries(
    PLATFORM_META.filter(p => p.timeLabel).map(p => [p.type, p.timeLabel])
);

// Monthly trend buckets are finer-grained than the cost/time charts (Switch
// physical and digital are separate series), hence their own key per type.
export const TREND_KEY_BY_TYPE = Object.fromEntries(
    PLATFORM_META.filter(p => p.trendKey).map(p => [p.type, p.trendKey])
);

// [{ label, key, color }] for the stacked platform bars, derived once.
export const TREND_PLATFORM_KEYS = uniqueBy(PLATFORM_META.filter(p => p.trendKey), 'trendKey')
    .map(p => ({ label: p.trendLabel, key: p.trendKey, color: PLATFORM_COLORS[p.colorKey] }));

// Zero-filled template for one month of trend data (plus the playtime series).
export const DEFAULT_TREND = Object.fromEntries(
    TREND_PLATFORM_KEYS.map(({ key }) => [key, 0]).concat([['playtime', 0], ['dramaPlaytime', 0]])
);
