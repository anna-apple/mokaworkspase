export const ranks = ['E1', 'D1', 'D2', 'D3', 'C1', 'C2', 'C3', 'B1', 'B2', 'B3',
    'A1', 'A2', 'A3', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
export const emptySchedule = () => ({
    config: { startRank: 'C1', startMeter: 0 },
    stamps: {},
    streamTimes: {}
});
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const dateKey = key => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const date = new Date(`${key}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key;
};
export function validateSchedule(value) {
    if (!record(value) || !record(value.config) ||
        !ranks.includes(value.config.startRank) ||
        !Number.isInteger(value.config.startMeter) ||
        value.config.startMeter < -2 || value.config.startMeter > 2 ||
        !record(value.stamps) || !record(value.streamTimes)) {
        throw new Error('予定データの形式が正しくありません。');
    }
    const clean = emptySchedule();
    clean.config = {
        startRank: value.config.startRank,
        startMeter: value.config.startMeter
    };
    const allowed = ['➖', '⚖', '🔼', '🔥', '🎫', '💤'];
    for (const [date, stamp] of Object.entries(value.stamps)) {
        if (!dateKey(date) || !allowed.includes(stamp)) throw new Error('スタンプが不正です。');
        clean.stamps[date] = stamp;
    }
    for (const [date, slots] of Object.entries(value.streamTimes)) {
        if (!dateKey(date) || !Array.isArray(slots) || slots.length > 50) {
            throw new Error('配信時間の形式が不正です（1日50件まで）。');
        }
        clean.streamTimes[date] = slots.map(slot => {
            // Previously registered minute-level values are retained on import.
            const time = v => typeof v === 'string' &&
                (v === '' || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v));
            if (!record(slot) || !time(slot.start) || !time(slot.end) ||
                !['通常', 'ご新規', 'お忍び'].includes(slot.type)) {
                throw new Error('配信時間または種類が不正です。');
            }
            return { start: slot.start, end: slot.end, type: slot.type };
        });
    }
    return clean;
}
