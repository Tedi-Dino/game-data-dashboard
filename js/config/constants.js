// Admin UIDs that have write access
export const ADMIN_UIDS = ['ZPyHfPGUI4elNvRN2Q30ZqfzT6X2'];


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
export const PLATFORM_META = [
    { type: 'hardware', label: '硬件', costLabel: '\u786c\u4ef6\u8bbe\u5907', costTypes: ['hardware'], timeLabel: null, timeTypes: [], colorKey: 'hardware', isHardware: true },
    { type: 'physical', label: 'Switch\u5b9e\u4f53', costLabel: 'Switch \u5b9e\u4f53', costTypes: ['physical'], timeLabel: 'Switch', timeTypes: ['physical', 'digital'], colorKey: 'switch_physical' },
    { type: 'digital', label: 'Switch\u6570\u5b57', costLabel: 'Switch \u6570\u5b57', costTypes: ['digital'], timeLabel: 'Switch', timeTypes: ['physical', 'digital'], colorKey: 'switch_digital' },
    { type: 'steam', label: 'Steam', costLabel: 'Steam \u6e38\u620f', costTypes: ['steam'], timeLabel: 'Steam', timeTypes: ['steam'], colorKey: 'steam' },
    { type: 'epic', label: 'Epic', costLabel: 'Epic \u6e38\u620f', costTypes: ['epic'], timeLabel: 'Epic', timeTypes: ['epic'], colorKey: 'epic' },
    { type: 'ubi', label: 'Uplay', costLabel: 'Uplay \u6e38\u620f', costTypes: ['ubi'], timeLabel: 'Uplay', timeTypes: ['ubi'], colorKey: 'ubi' },
    { type: 'gog', label: 'GOG', costLabel: 'GOG \u6e38\u620f', costTypes: ['gog'], timeLabel: 'GOG', timeTypes: ['gog'], colorKey: 'gog' },
    { type: 'ps', label: 'PlayStation', costLabel: 'PlayStation \u6e38\u620f', costTypes: ['ps'], timeLabel: 'PlayStation', timeTypes: ['ps'], colorKey: 'ps' },
    { type: 'xbox', label: 'Xbox/MS Store', costLabel: 'Xbox/MS \u6e38\u620f', costTypes: ['xbox', 'ms'], timeLabel: 'Xbox/MS', timeTypes: ['xbox', 'ms'], colorKey: 'xbox' },
    { type: 'ms', label: 'Xbox/MS Store', costLabel: 'Xbox/MS \u6e38\u620f', costTypes: ['xbox', 'ms'], timeLabel: 'Xbox/MS', timeTypes: ['xbox', 'ms'], colorKey: 'ms' },
    { type: 'appstore', label: 'App Store', costLabel: 'App Store \u6e38\u620f', costTypes: ['appstore'], timeLabel: 'App Store', timeTypes: ['appstore'], colorKey: 'appstore' },
    { type: 'googleplay', label: 'Google Play', costLabel: 'Google Play \u6e38\u620f', costTypes: ['googleplay'], timeLabel: 'Google Play', timeTypes: ['googleplay'], colorKey: 'googleplay' },
    { type: 'emulator', label: '\u6a21\u62df\u5668', costLabel: '\u6a21\u62df\u5668\u6e38\u620f', costTypes: ['emulator'], timeLabel: '\u6a21\u62df\u5668', timeTypes: ['emulator'], colorKey: 'emulator' },
    { type: 'other', label: 'Other', costLabel: 'Other \u6e38\u620f', costTypes: ['other'], timeLabel: 'Other', timeTypes: ['other'], colorKey: 'other' },
    { type: 'drama', label: '\u5267', costLabel: '\u5267', costTypes: ['drama'], timeLabel: '\u5267', timeTypes: ['drama'], colorKey: 'drama' },
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

// FROM_MAP (unchanged)
export const FROM_MAP = {
    purchase: '\u8d2d\u4e70', free: '\u514d\u8d39', friend: '\u8d60\u9001', subscription: '\u8ba2\u9605'
};

// STATUS_MAP (unchanged)
export const STATUS_MAP = {
    playing: '\u8fdb\u884c\u4e2d', backlog: '\u5f85\u73a9', passed: '\u5df2\u5b8c\u6210',
    abandoned: '\u5df2\u653e\u5f03', empty: '\u7a7a'
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
