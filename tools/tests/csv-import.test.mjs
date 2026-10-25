// CSV import hardening: formula-injection guards, limits and value validation.
// Imports the REAL production module (js/services/csv-parse.js), which is kept
// dependency-free so it loads under node:test without Firebase.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CSV_MAX_ROWS,
    parseCSVText,
    sanitizeCSVField,
    serializeCSVField,
    stripCSVGuard,
} from '../../js/services/csv-parse.js';

const HEADER = 'id,name,type,sort,status,purchaseDate,startDate,purchasePrice,from,playTime,passDate,sellDate,sellPrice,rating,episodeCount,episodeDuration,steam_app_id,steam_override,fullyCompleted,remarks';
const row = (overrides = {}) => {
    const values = {
        id: 'x-0001',
        name: 'Test Game',
        type: 'xbox',
        sort: 'TPS',
        status: 'passed',
        purchaseDate: '2026-01-01',
        startDate: '2026-01-02',
        purchasePrice: '10',
        from: 'purchase',
        playTime: '12.5',
        passDate: '2026-01-10',
        sellDate: '',
        sellPrice: '',
        rating: '8',
        episodeCount: '',
        episodeDuration: '',
        steam_app_id: '220',
        steam_override: 'true',
        fullyCompleted: 'false',
        remarks: '',
        ...overrides,
    };
    return HEADER.split(',').map((h) => `"${String(values[h] ?? '').replace(/"/g, '""')}"`).join(',');
};
const csv = (...rows) => [HEADER, ...rows].join('\r\n');

describe('formula injection guard', () => {
    it('prefixes dangerous leading characters with an apostrophe', () => {
        for (const value of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '  =cmd']) {
            assert.equal(sanitizeCSVField(value), `'${value}`);
        }
    });

    it('leaves ordinary text and numbers-as-text alone', () => {
        assert.equal(sanitizeCSVField('Half-Life 2'), 'Half-Life 2');
        assert.equal(sanitizeCSVField('2026-01-01'), '2026-01-01');
        assert.equal(sanitizeCSVField(''), '');
    });

    it('round-trips a guarded value back to the original', () => {
        for (const value of ['=cmd', '+1', '-x', '@home', '  =cmd']) {
            assert.equal(stripCSVGuard(sanitizeCSVField(value)), value);
        }
    });

    it('does not strip an apostrophe that was not our guard', () => {
        assert.equal(stripCSVGuard("'quoted name"), "'quoted name");
    });

    it('unguards a name on import so Firestore stores the real text', () => {
        const { items } = parseCSVText(csv(row({ name: "'=危险公式" })));
        assert.equal(items[0].name, '=危险公式');
    });
});

describe('CSV structural limits', () => {
    it('rejects duplicate headers instead of silently using the last one', () => {
        assert.throws(
            () => parseCSVText('id,name,type,name\n1,a,xbox,b'),
            /表头重复/
        );
    });

    it('rejects a file beyond the row cap', () => {
        const rows = Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) =>
            row({ id: `x-${i}`, name: `Game ${i}` })
        );
        assert.throws(() => parseCSVText(csv(...rows)), /行数超过/);
    });

    it('requires id, name and type headers', () => {
        assert.throws(() => parseCSVText('name,type\nA,xbox'), /必须包含 id, name, 和 type/);
    });

    it('skips rows missing identity fields and reports them', () => {
        const { items, skipped, skippedDetails } = parseCSVText(csv(
            row(),
            row({ id: '', name: 'No id' }),
        ));
        assert.equal(items.length, 1);
        assert.equal(skipped, 1);
        assert.equal(skippedDetails[0].row, 3);
    });

    it('rejects duplicate item ids', () => {
        assert.throws(() => parseCSVText(csv(row(), row())), /ID "x-0001" 重复/);
    });
});

describe('CSV value validation', () => {
    it('rejects a non-ISO date instead of silently nulling it', () => {
        assert.throws(() => parseCSVText(csv(row({ purchaseDate: '2026-13-99' }))), /purchaseDate 日期无效/);
    });

    it('rejects prices below the negative bound and negative playtime', () => {
        assert.throws(() => parseCSVText(csv(row({ purchasePrice: '-10000001' }))), /purchasePrice 超出允许范围/);
        assert.throws(() => parseCSVText(csv(row({ playTime: '-5' }))), /playTime 超出允许范围/);
    });

    it('accepts bounded negative prices and round-trips them through export', () => {
        const { items } = parseCSVText(csv(row({ purchasePrice: '-123.45', sellPrice: '-50' })));
        assert.equal(items[0].purchasePrice, -123.45);
        assert.equal(items[0].sellPrice, -50);

        const values = {
            id: 'x-0002',
            name: '=危险公式',
            type: 'xbox',
            purchasePrice: -123.45,
            sellPrice: -50,
            playTime: 12.5,
        };
        const exported = HEADER.split(',').map((h) => serializeCSVField(values[h])).join(',');
        assert.match(exported, /"-123\.45"/);
        assert.match(exported, /"-50"/);
        assert.match(exported, /"'=危险公式"/);
        // A numeric negative price is not formula-guarded; the string name is.
        const parsed = parseCSVText(csv(exported)).items[0];
        assert.equal(parsed.purchasePrice, -123.45);
        assert.equal(parsed.sellPrice, -50);
        assert.equal(parsed.name, '=危险公式');
    });

    it('serializes numbers untouched and guards only text formulas', () => {
        assert.equal(serializeCSVField(-50), '"-50"');
        assert.equal(serializeCSVField(0), '"0"');
        assert.equal(serializeCSVField('=cmd'), `"'=cmd"`);
        assert.equal(serializeCSVField('-2+3'), `"'-2+3"`);
        assert.equal(serializeCSVField('Half-Life 2'), '"Half-Life 2"');
    });

    it('rejects a rating outside 0..10', () => {
        assert.throws(() => parseCSVText(csv(row({ rating: '11' }))), /rating 超出允许范围/);
    });

    it('rejects sloppy numeric strings such as 12abc', () => {
        assert.throws(() => parseCSVText(csv(row({ playTime: '12abc' }))), /playTime 不是有效数字/);
    });

    it('rejects an overlong name', () => {
        assert.throws(() => parseCSVText(csv(row({ name: 'x'.repeat(301) }))), /name 超过 300 字符/);
    });

    it('rejects invalid booleans instead of treating them as false', () => {
        assert.throws(() => parseCSVText(csv(row({ fullyCompleted: 'yes' }))), /fullyCompleted 只能是 true 或 false/);
    });

    it('rejects a non-integer steam_app_id', () => {
        assert.throws(() => parseCSVText(csv(row({ steam_app_id: 'abc' }))), /steam_app_id 必须是整数/);
    });

    it('rejects control characters in identity fields', () => {
        assert.throws(() => parseCSVText(csv(row({ name: 'bad\nname' }))), /name 含换行或制表符/);
    });

    it('accepts a fully valid row and keeps numbers/dates normalised', () => {
        const { items } = parseCSVText(csv(row()));
        assert.equal(items.length, 1);
        assert.equal(items[0].id, 'x-0001');
        assert.equal(items[0].purchasePrice, 10);
        assert.equal(items[0].playTime, 12.5);
        assert.equal(items[0].purchaseDate, '2026-01-01');
        assert.equal(items[0].steam_app_id, 220);
        assert.equal(items[0].steam_override, true);
        assert.equal(items[0].fullyCompleted, false);
    });
});
