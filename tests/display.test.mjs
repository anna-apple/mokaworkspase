import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function element() {
    return {
        style: {}, children: [], value: '',
        appendChild(child) { this.children.push(child); },
        setAttribute() {},
        set innerHTML(value) { this.children = []; },
        set textContent(value) { this.children = [{ textContent: value }]; },
        get textContent() { return this.children.map(child => child.textContent).join(''); }
    };
}
async function context(locked, slot) {
    const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
    const fn = source.slice(source.indexOf('function renderStreamTimes()'),
        source.indexOf('function renderDetailMeter'));
    const elements = {};
    const document = {
        getElementById(id) { return elements[id] ||= element(); },
        createElement() { return element(); },
        createTextNode(value) { return { textContent: value }; }
    };
    const scope = { document, isLocked: locked, streamTimes: { test: [slot] },
        getSelectedDateKey: () => 'test' };
    vm.runInNewContext(fn + '; renderStreamTimes();', scope);
    return elements;
}
test('viewer always renders wave separator even without end time', async () => {
    let elements = await context(true, { start: '09:00', end: '', type: '通常' });
    assert.equal(elements.streamTimeList.textContent, '9:00～（通常）');
    elements = await context(true, { start: '09:00', end: '10:00', type: 'ご新規' });
    assert.equal(elements.streamTimeList.textContent, '9:00～10:00（ご新規）');
});
test('editor offers 144 ten-minute times plus empty option and all three types', async () => {
    const elements = await context(false, { start: '09:00', end: '', type: 'お忍び' });
    const row = elements.streamTimeList.children[0];
    const typeSelect = row.children[0];
    assert.deepEqual(typeSelect.children.map(child => child.value), ['通常', 'ご新規', 'お忍び']);
    const timeSelect = row.children[1];
    assert.equal(timeSelect.children.length, 145);
    assert.equal(timeSelect.children[1].value, '00:00');
    assert.equal(timeSelect.children.at(-1).value, '23:50');
    assert(!timeSelect.children.some(option => option.value === '09:01'));
});
