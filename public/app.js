const ranks = ["E1", "D1", "D2", "D3", "C1", "C2", "C3", "B1", "B2", "B3", "A1", "A2", "A3", "S1", "S2", "S3", "S4", "S5", "S6"];
const today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth() + 1;
let selectedDay = null;
let isLocked = true;
let currentMode = 'search';
let stamps = {};
let streamTimes = {};
let config = { startRank: 'C1', startMeter: 0 };
let version = 0;
let dirty = false;
let saving = false;
let editingRevision = 0;
let ready = false;
const adminView = new URLSearchParams(location.search).get('admin') === '1';

// Populate rank options
const rankSelect = document.getElementById('startRank');
ranks.forEach(r => {
    let opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    if(r === config.startRank) opt.selected = true;
    rankSelect.appendChild(opt);
});
document.getElementById('startMeter').value = config.startMeter;
function setStatus(message, error = false) {
    const element = document.getElementById('syncStatus');
    element.textContent = message;
    element.classList.toggle('error', error);
}

async function api(path, options = {}) {
    const response = await fetch(`/api/${path}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error('APIに接続できません。公開設定を確認してください。');
    }
    if (!response.ok) throw new Error(result.error || '通信に失敗しました。');
    return result;
}

function setEditing(editing) {
    isLocked = !editing;
    document.getElementById('lockBtn').textContent = editing ? '🔓 編集終了' : '🔒 ロック解除';
    document.getElementById('lockBtn').classList.toggle('locked', editing);
    document.getElementById('configPanel').style.display = editing ? 'block' : 'none';
    document.getElementById('bottomDock').style.display = editing ? 'grid' : 'none';
    document.getElementById('dayClearBtn').style.display = editing ? 'block' : 'none';
    setMode('search');
    renderStreamTimes();
}

async function toggleLock() {
    if (!ready || saving) return;
    try {
        if (isLocked) {
            const password = prompt('管理パスワードを入力してください:');
            if (password === null) return;
            await api('session', { method: 'POST', body: JSON.stringify({ password }) });
            await loadSchedule();
            setEditing(true);
            setStatus('編集中です。変更後は「予定を保存・公開」を押してください。');
        } else {
            if (dirty && !confirm('未保存の変更を破棄して編集を終了しますか？')) return;
            await api('session', { method: 'DELETE' });
            setEditing(false);
            dirty = false;
            await loadSchedule();
        }
    } catch (error) {
        setStatus(error.message, true);
        alert(error.message);
    }
}

async function savePw() {
    if (isLocked || saving) return;
    if (dirty) {
        alert('先に予定を保存・公開してください。');
        return;
    }
    const input = document.getElementById('pwInput');
    if (input.value.length < 12 || input.value.length > 256) {
        alert('新しいパスワードは12〜256文字にしてください。');
        return;
    }
    const currentPassword = prompt('確認のため現在の管理パスワードを入力してください:');
    if (currentPassword === null) return;
    try {
        await api('password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword: input.value })
        });
        input.value = '';
        setEditing(false);
        setStatus('パスワードを変更しました。新しいパスワードで解除してください。');
    } catch (error) {
        alert(error.message);
    }
}

function snapshot() {
    return structuredClone({ config, stamps, streamTimes });
}

function markDirty() {
    if (isLocked) return;
    dirty = true;
    editingRevision++;
    setStatus('未保存の変更があります。「予定を保存・公開」を押してください。');
}

function changeConfig() {
    if (isLocked) return;
    updateAll();
    markDirty();
}

function applyData(data) {
    config = data.config;
    stamps = data.stamps;
    streamTimes = data.streamTimes;
    document.getElementById('startRank').value = config.startRank;
    document.getElementById('startMeter').value = config.startMeter;
    updateAll();
}

async function loadSchedule() {
    const result = await api('schedule');
    version = result.version;
    applyData(result.data);
    setStatus('公開予定を表示しています。');
}

async function saveSchedule() {
    if (isLocked || saving) return;
    saving = true;
    const revision = editingRevision;
    document.getElementById('saveBtn').disabled = true;
    setStatus('保存中…');
    try {
        const result = await api('schedule', {
            method: 'PUT',
            body: JSON.stringify({ data: snapshot(), version })
        });
        version = result.version;
        dirty = revision !== editingRevision;
        setStatus(dirty ? '追加の変更があります。もう一度保存してください。' : '保存・公開しました。');
    } catch (error) {
        // Never fall back to a local-only save that would look like a successful publication.
        setStatus(`${error.message} 変更内容は画面に残っています。`, true);
        alert(error.message);
    } finally {
        saving = false;
        document.getElementById('saveBtn').disabled = false;
    }
}

function exportSchedule() {
    if (isLocked) return;
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stream-schedule-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeImport(data) {
    if (!data || typeof data !== 'object') throw new Error('JSONの形式が不正です。');
    const value = data.data || data;
    const isRecord = item => item && typeof item === 'object' && !Array.isArray(item);
    if (!isRecord(value.config) || !ranks.includes(value.config.startRank) ||
        !Number.isInteger(value.config.startMeter) ||
        value.config.startMeter < -2 || value.config.startMeter > 2 ||
        !isRecord(value.stamps) || !isRecord(value.streamTimes)) {
        throw new Error('取込ファイルの形式が正しくありません。');
    }
    const validDate = date => {
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return false;
        const parsed = new Date(`${date}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    };
    const clean = {
        config: { startRank: value.config.startRank, startMeter: value.config.startMeter },
        stamps: {}, streamTimes: {}
    };
    for (const [date, stamp] of Object.entries(value.stamps)) {
        if (!validDate(date) || !['➖', '⚖', '🔼', '🔥', '🎫', '💤'].includes(stamp)) {
            throw new Error('スタンプデータが不正です。');
        }
        clean.stamps[date] = stamp;
    }
    for (const [date, slots] of Object.entries(value.streamTimes)) {
        if (!validDate(date) || !Array.isArray(slots) || slots.length > 50) {
            throw new Error('配信時間の形式が不正です。');
        }
        clean.streamTimes[date] = slots.map(slot => {
            if (!isRecord(slot)) throw new Error('配信時間が不正です。');
            const start = slot.start ?? '';
            const end = slot.end ?? '';
            const type = slot.type || '通常';
            const validTime = time => typeof time === 'string' &&
                (time === '' || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time));
            if (!validTime(start) || !validTime(end) ||
                !['通常', 'ご新規', 'お忍び'].includes(type)) {
                throw new Error('配信時間または種類が不正です。');
            }
            return { start, end, type };
        });
    }
    return clean;
}

async function importSchedule(input) {
    if (isLocked || !input.files[0]) return;
    try {
        if (input.files[0].size > 512 * 1024) throw new Error('ファイルは512KB以内にしてください。');
        const data = normalizeImport(JSON.parse(await input.files[0].text()));
        if (!confirm('画面の予定を取込データで置き換えますか？保存・公開するまでは反映されません。')) return;
        applyData(data);
        markDirty();
    } catch (error) {
        alert(error.message);
    } finally {
        input.value = '';
    }
}

function importLegacy() {
    if (isLocked) return;
    try {
        if (!localStorage.getItem('rank_stamps') && !localStorage.getItem('rank_stream_times') &&
            !localStorage.getItem('rank_config')) {
            throw new Error('このURLには旧データがありません。以前と同じ端末・ブラウザ・公開URLでお試しください。');
        }
        const data = normalizeImport({
            config: JSON.parse(localStorage.getItem('rank_config')) ||
                { startRank: 'C1', startMeter: 0 },
            stamps: JSON.parse(localStorage.getItem('rank_stamps')) || {},
            streamTimes: JSON.parse(localStorage.getItem('rank_stream_times')) || {}
        });
        if (!confirm('このブラウザに保存されている旧データを取り込みますか？')) return;
        applyData(data);
        markDirty();
    } catch (error) {
        alert(error.message);
    }
}

function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.dock-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-' + mode).classList.add('active');
}

function prevMonth() {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    selectedDay = null;
    updateAll();
}

function nextMonth() {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    selectedDay = null;
    updateAll();
}

function clearAllData() {
    if (isLocked) return;
    if(confirm("今月のスタンプをすべて消去しますか？")) {
        const prefix = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
        Object.keys(stamps).forEach(key => {
            if(key.startsWith(prefix)) delete stamps[key];
        });
        markDirty();
        updateAll();
    }
}

function clearCurrentDay() {
    if (isLocked || !selectedDay) return;
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
    delete stamps[dateStr];
    delete streamTimes[dateStr];
    markDirty();
    saveStreamTimes();
    updateAll();
    selectDay(selectedDay);
}

function handleDayClick(day) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if (!isLocked && currentMode !== 'search') {
        if (currentMode === 'minus') stamps[dateStr] = '➖';
        else if (currentMode === 'plat') stamps[dateStr] = '⚖';
        else if (currentMode === 'p1') stamps[dateStr] = '🔼';
        else if (currentMode === 'p2') stamps[dateStr] = '🔥';
        else if (currentMode === 'ticket') stamps[dateStr] = '🎫';
        else if (currentMode === 'off') stamps[dateStr] = '💤';
        markDirty();
        updateAll();
    }
    selectDay(day);
}

function selectDay(day) {
    selectedDay = day;
    document.querySelectorAll('.day-cell').forEach(cell => cell.classList.remove('selected'));
    if(day) {
        const cell = document.getElementById(`day-${day}`);
        if(cell) cell.classList.add('selected');

        document.getElementById('detailDate').textContent = `${currentMonth}月${day}日のステータス`;
        const cellRank = cell.getAttribute('data-rank') || config.startRank;
        const cellMeter = parseInt(cell.getAttribute('data-meter') || '0');

        document.getElementById('detailStatus').textContent = `${cellRank} (${cellMeter >= 0 ? '+' : ''}${cellMeter})`;
        renderDetailMeter(cellMeter);
    } else {
        document.getElementById('detailDate').textContent = "日付を選択してください";
        document.getElementById('detailStatus').textContent = "--";
        renderDetailMeter(0);
    }
    renderStreamTimes();
}


function getSelectedDateKey() {
    if (!selectedDay) return null;
    return `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
}

function saveStreamTimes() {
    markDirty();
}

function addStreamTime() {
    const dateKey = getSelectedDateKey();
    if (isLocked || !dateKey) return;
    if (!Array.isArray(streamTimes[dateKey])) {
        streamTimes[dateKey] = [];
    }
    if (streamTimes[dateKey].length >= 50) {
        alert('配信時間は1日50件まで登録できます。');
        return;
    }
    streamTimes[dateKey].push({ start: '', end: '', type: '通常' });
    saveStreamTimes();
    renderStreamTimes();
    const inputs = document.querySelectorAll('.stream-time-input');
    if (inputs.length >= 2) {
        inputs[inputs.length - 2].focus();
    }
}

function updateStreamTime(index, field, value) {
    const dateKey = getSelectedDateKey();
    if (isLocked || !dateKey || !Array.isArray(streamTimes[dateKey])) return;
    const slot = streamTimes[dateKey][index];
    if (!slot || !['start', 'end'].includes(field)) return;
    if (value !== '' && !/^([01][0-9]|2[0-3]):[0-5]0$/.test(value)) return;
    slot[field] = value;
    saveStreamTimes();
}

function updateStreamType(index, value) {
    const dateKey = getSelectedDateKey();
    if (isLocked || !dateKey || !Array.isArray(streamTimes[dateKey])) return;
    const slot = streamTimes[dateKey][index];
    if (!slot || !['通常', 'ご新規', 'お忍び'].includes(value)) return;
    slot.type = value;
    saveStreamTimes();
}

function removeStreamTime(index) {
    const dateKey = getSelectedDateKey();
    if (isLocked || !dateKey || !Array.isArray(streamTimes[dateKey])) return;
    streamTimes[dateKey].splice(index, 1);
    if (streamTimes[dateKey].length === 0) {
        delete streamTimes[dateKey];
    }
    saveStreamTimes();
    renderStreamTimes();
}

function renderStreamTimes() {
    const dateKey = getSelectedDateKey();
    const panel = document.getElementById('streamSchedule');
    const list = document.getElementById('streamTimeList');
    const addButton = document.getElementById('streamAddBtn');
    panel.style.display = dateKey ? 'block' : 'none';
    addButton.style.display = dateKey && !isLocked ? 'block' : 'none';
    list.innerHTML = '';
    if (!dateKey) return;

    const slots = Array.isArray(streamTimes[dateKey]) ? streamTimes[dateKey] : [];
    if (slots.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'stream-empty';
        empty.textContent = '未登録';
        list.appendChild(empty);
        return;
    }

    slots.forEach((slot, index) => {
        const row = document.createElement('div');
        row.className = 'stream-time-row';

        const streamType = ['通常', 'ご新規', 'お忍び'].includes(slot.type) ? slot.type : '通常';
        if (isLocked) {
            const label = document.createElement('span');
            const startTimeLabel = slot.start ? slot.start.replace(/^0(?=\d:)/, '') : '未設定';
            const endTimeLabel = slot.end ? slot.end.replace(/^0(?=\d:)/, '') : '';
            // 終了時間の有無にかかわらず、区切りの「～」を必ず表示する。
            label.appendChild(document.createTextNode(startTimeLabel));
            label.appendChild(document.createTextNode('～'));
            label.appendChild(document.createTextNode(endTimeLabel));
            label.appendChild(document.createTextNode(`（${streamType}）`));
            row.appendChild(label);
        } else {
            const typeSelect = document.createElement('select');
            typeSelect.className = 'stream-type-select';
            typeSelect.setAttribute('aria-label', `配信${index + 1}の種類`);
            ['通常', 'ご新規', 'お忍び'].forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                typeSelect.appendChild(option);
            });
            typeSelect.value = streamType;
            typeSelect.onchange = () => updateStreamType(index, typeSelect.value);
            row.appendChild(typeSelect);
            ['start', 'end'].forEach((field, fieldIndex) => {
                if (fieldIndex === 1) {
                    const separator = document.createElement('span');
                    separator.textContent = '～';
                    row.appendChild(separator);
                }
                const input = document.createElement('select');
                input.className = 'stream-time-input';
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '未設定';
                input.appendChild(emptyOption);
                for (let minutes = 0; minutes < 24 * 60; minutes += 10) {
                    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
                    const option = document.createElement('option');
                    option.value = time;
                    option.textContent = time;
                    input.appendChild(option);
                }
                // 以前登録した10分刻みでない時刻は、変更するまで保持する。
                const savedTime = slot[field] || '';
                if (/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(savedTime) &&
                    !/^([01][0-9]|2[0-3]):[0-5]0$/.test(savedTime)) {
                    const savedOption = document.createElement('option');
                    savedOption.value = savedTime;
                    savedOption.textContent = `${savedTime}（登録済み）`;
                    input.appendChild(savedOption);
                }
                input.value = savedTime;
                input.setAttribute('aria-label', `配信${index + 1}の${field === 'start' ? '開始' : '終了'}時間`);
                input.onchange = () => updateStreamTime(index, field, input.value);
                row.appendChild(input);
            });
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'clear-btn stream-delete-btn';
            removeButton.textContent = '削除';
            removeButton.setAttribute('aria-label', `配信${index + 1}の時間を削除`);
            removeButton.onclick = () => removeStreamTime(index);
            row.appendChild(removeButton);
        }
        list.appendChild(row);
    });
}

function renderDetailMeter(meterVal) {
    const dotsContainer = document.getElementById('detailMeter');
    dotsContainer.innerHTML = '';
    for(let i = -2; i <= 2; i++) {
        let dot = document.createElement('div');
        dot.className = 'dot';
        if (i === 0 && meterVal === 0) {
            dot.classList.add('zero');
        } else if (i < 0 && meterVal <= i) {
            dot.classList.add('minus-active');
        } else if (i > 0 && meterVal >= i) {
            dot.classList.add('plus-active');
        }
        dotsContainer.appendChild(dot);
    }
}

function updateAll() {
    // Save current config
    config.startRank = document.getElementById('startRank').value;
    config.startMeter = parseInt(document.getElementById('startMeter').value);


    document.getElementById('navTitle').textContent = `${currentYear}年 ${currentMonth}月`;

    // Calculate grid
    const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();

    const daysContainer = document.getElementById('calendarDays');
    daysContainer.innerHTML = '';

    // Blank cells before first day
    for (let i = 0; i < firstDayIndex; i++) {
        let emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell';
        daysContainer.appendChild(emptyCell);
    }

    // Continuous calculations
    let activeRankIndex = ranks.indexOf(config.startRank);
    let activeMeter = config.startMeter;

    for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const stamp = stamps[dateStr] || '';

        if (stamp === '➖') {
            activeMeter -= 1;
            if (activeMeter <= -3) {
                activeRankIndex = Math.max(0, activeRankIndex - 1);
                activeMeter = 0;
            }
        } else if (stamp === '🔼') {
            activeMeter += 1;
            if (activeMeter >= 3) {
                activeRankIndex = Math.min(ranks.length - 1, activeRankIndex + 1);
                activeMeter = 0;
            }
        } else if (stamp === '🔥') {
            activeMeter += 2;
            if (activeMeter >= 3) {
                activeRankIndex = Math.min(ranks.length - 1, activeRankIndex + 1);
                activeMeter = activeMeter - 3; // Keep remainder or clear based on rules, standard is reset to 0 or remainder. Let's do standard reset to 0 or remainder.
                if(activeMeter >= 3) { // just in case
                    activeRankIndex = Math.min(ranks.length - 1, activeRankIndex + 1);
                    activeMeter = 0;
                }
            }
        } else if (stamp === '⚖') {
            // standard plat does not shift rank immediately unless specified, just clear towards 0 or stays? Usually stays or becomes 0. Let's keep it same.
        }

        let cell = document.createElement('div');
        cell.className = 'day-cell active-cell';
        cell.id = `day-${d}`;
        cell.setAttribute('data-rank', ranks[activeRankIndex]);
        cell.setAttribute('data-meter', activeMeter);
        cell.onclick = () => handleDayClick(d);

        let numDiv = document.createElement('div');
        numDiv.className = 'day-num';
        numDiv.textContent = d;

        let stampDiv = document.createElement('div');
        stampDiv.className = 'day-stamp';
        stampDiv.textContent = stamp;

        let rankDiv = document.createElement('div');
        rankDiv.className = 'day-rank';
        rankDiv.textContent = `${ranks[activeRankIndex]} (${activeMeter >= 0 ? '+' : ''}${activeMeter})`;

        cell.appendChild(numDiv);
        cell.appendChild(stampDiv);
        cell.appendChild(rankDiv);
        daysContainer.appendChild(cell);
    }

    selectDay(selectedDay);
}

window.addEventListener('beforeunload', event => {
    if (dirty || saving) {
        event.preventDefault();
        event.returnValue = '';
    }
});

async function init() {
    document.getElementById('lockBtn').style.display = adminView ? 'block' : 'none';
    try {
        await loadSchedule();
        ready = true;
        document.getElementById('lockBtn').disabled = false;
        if (adminView) {
            const session = await api('session');
            if (session.authenticated) {
                setEditing(true);
                setStatus('編集中です。変更後は「予定を保存・公開」を押してください。');
            }
        }
    } catch (error) {
        setStatus(error.message, true);
    }
}

// Public pages refresh every 60 seconds. Editor state is never overwritten in the background.
setInterval(async () => {
    if (isLocked && !dirty && ready && document.visibilityState === 'visible') {
        try {
            await loadSchedule();
        } catch (error) {
            setStatus(`更新できませんでした：${error.message}`, true);
        }
    }
}, 60000);

init();
