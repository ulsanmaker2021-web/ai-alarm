const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function loadApp(elements = {}) {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  const appScript = scripts.at(-1)[1];
  const alerts = [];
  const document = {
    getElementById: id => elements[id] || null,
    querySelectorAll: () => [],
    querySelector: selector => {
      if (selector.includes('formRingtone')) return { value: 'crystal-bell' };
      if (selector.includes('formThemeId')) return { value: 'flower' };
      return null;
    },
    body: { className: '' }
  };
  const context = vm.createContext({
    console,
    document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    alert: message => alerts.push(message),
    confirm: () => true,
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: fn => fn(),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
    window: { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1280 },
    Date,
    Math
  });
  vm.runInContext(appScript, context);
  return { context, alerts };
}

function classList(initial = []) {
  const classes = new Set(initial);
  return {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    contains: name => classes.has(name)
  };
}

test('목표 도달 시 알람 모달을 한 번만 자동 실행한다', () => {
  const modalClasses = classList(['hidden']);
  const elements = {
    alarmRingModal: { classList: modalClasses },
    modalAlarmTitle: { textContent: '' },
    modalAlarmMemo: { textContent: '' },
    modalStageIcon: { textContent: '' },
    modalStageDesc: { textContent: '' }
  };
  const { context } = loadApp(elements);
  vm.runInContext(`
    state.activeAlarm = {
      id: 'alarm-test', title: '테스트', category: '목표/시험',
      startDate: new Date(Date.now() - 60000).toISOString(),
      targetDate: new Date(Date.now() - 1000).toISOString(),
      ringtone: 'crystal-bell', themeId: 'flower', memo: ''
    };
    triggerConfettiParticles = () => {};
    playRetroVictory = () => {};
    let soundLoopCount = 0;
    startAlarmSoundLoop = () => { soundLoopCount += 1; };
    handleClockTick();
    handleClockTick();
  `, context);
  assert.equal(modalClasses.contains('hidden'), false);
  assert.equal(vm.runInContext('soundLoopCount', context), 1);
});

test('목표 전에는 가상 진척도가 100%여도 자동 알람을 실행하지 않는다', () => {
  const { context } = loadApp();
  vm.runInContext(`
    state.activeAlarm = {
      id: 'alarm-future', title: '미래 알람', category: '목표/시험',
      startDate: new Date(Date.now() - 60000).toISOString(),
      targetDate: new Date(Date.now() + 3600000).toISOString(),
      ringtone: 'crystal-bell', themeId: 'flower', memo: ''
    };
    state.virtualProgressBoost = 100;
    triggerConfettiParticles = () => {};
    playRetroVictory = () => {};
    let automaticAlarmCount = 0;
    triggerAlarmModal = () => { automaticAlarmCount += 1; };
    handleClockTick();
  `, context);
  assert.equal(vm.runInContext('automaticAlarmCount', context), 0);
});

test('오래 지난 알람을 미루면 현재 시각부터 지정한 시간 뒤로 이동한다', () => {
  const { context } = loadApp();
  vm.runInContext(`
    state.activeAlarm = {
      id: 'alarm-old', title: '지난 알람',
      targetDate: new Date(Date.now() - 10 * 60000).toISOString()
    };
    deactivateCelebrationMode = () => {};
    saveActiveAlarm = () => {};
    renderActiveAlarmView = () => {};
    playToneFeedback = () => {};
    snoozeAlarm(5);
  `, context);
  const target = vm.runInContext('new Date(state.activeAlarm.targetDate).getTime()', context);
  assert.ok(target >= Date.now() + 4.9 * 60000);
});

test('시작일이 목표일보다 늦으면 알람 등록을 거부한다', () => {
  const elements = {
    formTitle: { value: '잘못된 일정' },
    formCategory: { value: '목표/시험' },
    formTargetDate: { value: '2026-09-01' },
    formTargetTime: { value: '09:00' },
    formStartDate: { value: '2026-09-02' },
    formMemo: { value: '' }
  };
  const { context, alerts } = loadApp(elements);
  vm.runInContext(`
    state.activeAlarm = { id: 'existing', title: '기존 알람' };
    saveActiveAlarm = () => {};
    renderActiveAlarmView = () => {};
    switchTab = () => {};
    triggerConfettiParticles = () => {};
    playCrystalBell = () => {};
    handleCreateAlarm({ preventDefault() {} });
  `, context);
  assert.equal(vm.runInContext('state.activeAlarm.title', context), '기존 알람');
  assert.match(alerts[0] || '', /시작일.*목표/);
});

test('달력에 없는 목표 날짜는 알람 등록을 거부한다', () => {
  const elements = {
    formTitle: { value: '잘못된 날짜' },
    formCategory: { value: '목표/시험' },
    formTargetDate: { value: '2026-02-31' },
    formTargetTime: { value: '09:00' },
    formStartDate: { value: '2026-02-01' },
    formMemo: { value: '' }
  };
  const { context, alerts } = loadApp(elements);
  vm.runInContext(`
    state.activeAlarm = { id: 'existing', title: '기존 알람' };
    saveActiveAlarm = () => {};
    renderActiveAlarmView = () => {};
    switchTab = () => {};
    triggerConfettiParticles = () => {};
    playCrystalBell = () => {};
    handleCreateAlarm({ preventDefault() {} });
  `, context);
  assert.equal(vm.runInContext('state.activeAlarm.title', context), '기존 알람');
  assert.match(alerts[0] || '', /올바른/);
});

test('편집에서도 시작일이 목표일보다 늦으면 기존 알람을 유지한다', () => {
  const elements = {
    editAlarmTitleInput: { value: '변경 제목' },
    editAlarmCategorySelect: { value: '목표/시험' },
    editAlarmTargetDateInput: { value: '2026-09-01' },
    editAlarmTargetTimeInput: { value: '09:00' },
    editAlarmStartDateInput: { value: '2026-09-02' },
    editAlarmMemoInput: { value: '' }
  };
  const { context, alerts } = loadApp(elements);
  vm.runInContext(`
    state.activeAlarm = {
      id: 'existing', title: '기존 알람', category: '목표/시험',
      startDate: new Date('2026-08-01T00:00:00').toISOString(),
      targetDate: new Date('2026-09-01T09:00:00').toISOString(), memo: ''
    };
    saveActiveAlarm = () => {};
    renderActiveAlarmView = () => {};
    closeEditActiveAlarmModal = () => {};
    triggerConfettiParticles = () => {};
    playCrystalBell = () => {};
    handleSaveActiveAlarmEdits({ preventDefault() {} });
  `, context);
  assert.equal(vm.runInContext('state.activeAlarm.title', context), '기존 알람');
  assert.match(alerts[0] || '', /시작일.*목표/);
});

test('코끼리 성장 문장은 아기부터 성체까지 5단계 이야기로 생성한다', () => {
  const { context } = loadApp();
  const theme = vm.runInContext(
    `generateSmartFallbackTheme('어린코끼리를 어른 코끼리로 키우기')`,
    context
  );

  assert.equal(theme.archetype, 'elephant');
  assert.equal(theme.stages.length, 5);
  assert.deepEqual(
    Array.from(theme.stages, stage => stage.percent),
    [0, 25, 50, 75, 100]
  );
  assert.match(theme.stages[0].text, /아기 코끼리/);
  assert.match(theme.stages[4].text, /어른 코끼리/);
});

test('코끼리 테마는 범용 장면 대신 코끼리 성장 장면을 그린다', () => {
  const { context } = loadApp();
  vm.runInContext(`
    let elephantDrawCount = 0;
    let universalDrawCount = 0;
    drawElephantGrowthScene = () => { elephantDrawCount += 1; };
    drawUniversalAdaptiveScene = () => { universalDrawCount += 1; };
    drawAiDynamicScene(
      {}, { title: '어린코끼리를 어른 코끼리로 키우기', desc: '', archetype: 'elephant' },
      3, 640, 300, 0
    );
  `, context);

  assert.equal(vm.runInContext('elephantDrawCount', context), 1);
  assert.equal(vm.runInContext('universalDrawCount', context), 0);
});


