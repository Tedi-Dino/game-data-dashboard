// Admin UIDs that have write access
export const ADMIN_UIDS = ['ZPyHfPGUI4elNvRN2Q30ZqfzT6X2'];

// Platform/category colors for charts
export const PLATFORM_COLORS = {
    hardware: '#78716c',
    switch_physical: '#c2410c',
    switch_digital: '#d97757',
    steam: '#5b7a9a',
    epic: '#bfb0a0',
    ubi: '#8b7aaa',
    gog: '#b8707f',
    ps: '#4d7c9e',
    xbox: '#5e8f5e',
    appstore: '#6b6560',
    googleplay: '#5e9a7a',
    emulator: '#c4a040',
    other: '#a39a92',
    drama: '#c4556a'
};

// Type display name maps
export const TYPE_MAP = {
    digital: 'Switch数字', physical: 'Switch实体', hardware: '硬件',
    steam: 'Steam', epic: 'Epic', ubi: 'Uplay', gog: 'GOG',
    ps: 'PlayStation', xbox: 'Xbox/MS Store', ms: 'Xbox/MS Store',
    appstore: 'App Store', googleplay: 'Google Play', emulator: '模拟器',
    other: 'Other', drama: '剧'
};

export const FROM_MAP = {
    purchase: '购买', free: '免费', friend: '赠送', subscription: '订阅'
};

export const STATUS_MAP = {
    playing: '进行中', backlog: '待看', passed: '已完成',
    abandoned: '已放弃', empty: '空'
};

// Cost distribution chart: label → internal type(s)
export const COST_TYPE_MAP = {
    '硬件设备': ['hardware'],
    'Switch 实体': ['physical'],
    'Switch 数字': ['digital'],
    'Steam 游戏': ['steam'],
    'Epic 游戏': ['epic'],
    'Uplay 游戏': ['ubi'],
    'GOG 游戏': ['gog'],
    'PlayStation 游戏': ['ps'],
    'Xbox/MS 游戏': ['xbox', 'ms'],
    'App Store 游戏': ['appstore'],
    'Google Play 游戏': ['googleplay'],
    '模拟器游戏': ['emulator'],
    'Other 游戏': ['other'],
    '剧': ['drama']
};

// Cost distribution: label → color key
export const COST_COLOR_MAP = {
    '硬件设备': 'hardware', 'Switch 实体': 'switch_physical',
    'Switch 数字': 'switch_digital', 'Steam 游戏': 'steam',
    'Epic 游戏': 'epic', 'Uplay 游戏': 'ubi', 'GOG 游戏': 'gog',
    'PlayStation 游戏': 'ps', 'Xbox/MS 游戏': 'xbox',
    'App Store 游戏': 'appstore', 'Google Play 游戏': 'googleplay',
    '模拟器游戏': 'emulator', 'Other 游戏': 'other', '剧': 'drama'
};

// Time distribution chart: label → internal type(s)
export const TIME_TYPE_MAP = {
    'Switch': ['physical', 'digital'],
    'Steam': ['steam'],
    'Epic': ['epic'],
    'Uplay': ['ubi'],
    'GOG': ['gog'],
    'PlayStation': ['ps'],
    'Xbox/MS': ['xbox', 'ms'],
    'App Store': ['appstore'],
    'Google Play': ['googleplay'],
    '模拟器': ['emulator'],
    'Other': ['other'],
    '剧': ['drama']
};

// Time distribution: label → color key
export const TIME_COLOR_MAP = {
    'Switch': 'switch_physical', 'Steam': 'steam', 'Epic': 'epic',
    'Uplay': 'ubi', 'GOG': 'gog', 'PlayStation': 'ps',
    'Xbox/MS': 'xbox', 'App Store': 'appstore',
    'Google Play': 'googleplay', '模拟器': 'emulator', 'Other': 'other',
    '剧': 'drama'
};
