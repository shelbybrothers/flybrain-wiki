import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNeuralState, stepNeuralState, NEURON_COUNT } from '../src/simulation.ts';
import { readFocus, startFocus, pauseFocus, secondsRemaining } from '../src/focus.ts';
import { planTask, parseTasks, isValidTaskDate } from '../src/model.ts';

test('synthetic circuit stays at rest with no stimulus', () => {
  const state = createNeuralState();
  for (let i = 0; i < 400; i++) assert.equal(stepNeuralState(state, 'all', 100, false).length, 0);
  assert.ok(state.voltage.every(value => value === 0));
});

test('a localized stimulus propagates and the network settles after it ends', () => {
  const state = createNeuralState(), counts = [0, 0, 0, 0];
  for (let i = 0; i < 240; i++) for (const neuron of stepNeuralState(state, 'research', 75, true)) counts[Math.floor(neuron / 48)]++;
  assert.ok(counts[0] > 0, 'The selected region must respond');
  assert.ok(counts.slice(1).some(value => value > 0), 'Connected regions must receive the signal');
  for (let i = 0; i < 1600; i++) stepNeuralState(state, 'research', 75, false);
  assert.ok(Math.max(...state.voltage) < .001, 'Membrane voltage returns toward rest');
  assert.equal(state.voltage.length, NEURON_COUNT);
});

test('stimulus strength changes the response reproducibly', () => {
  const count = (strength: number) => {
    const state = createNeuralState(); let spikes = 0;
    for (let i = 0; i < 240; i++) spikes += stepNeuralState(state, 'all', strength, true).length;
    return spikes;
  };
  assert.equal(count(0), 0);
  assert.ok(count(80) > count(40));
  assert.equal(count(65), count(65));
});

test('focus countdown uses its deadline, including time spent in a hidden tab', () => {
  const initial = { duration: 300, remaining: 300, endsAt: null };
  const running = startFocus(initial, 1000);
  assert.equal(secondsRemaining(running, 1000), 300);
  assert.equal(secondsRemaining(running, 121000), 180);
  assert.equal(secondsRemaining(running, 500000), 0);
  assert.equal(readFocus(JSON.stringify(running)).endsAt, running.endsAt);
});

test('pausing preserves remaining time and restarting a finished session resets its duration', () => {
  const initial = { duration: 900, remaining: 900, endsAt: null };
  const paused = pauseFocus(startFocus(initial, 0), 150000);
  assert.equal(paused.remaining, 750);
  assert.equal(secondsRemaining(paused, 1000000), 750);
  assert.equal(secondsRemaining(startFocus(paused, 1000000), 1010000), 740);
  const restarted = startFocus({ duration: 300, remaining: 0, endsAt: null }, 1000);
  assert.equal(secondsRemaining(restarted, 1000), 300);
});

test('invalid saved timer state falls back to a usable 25-minute session', () => {
  for (const raw of ['{bad', 'null', '{"duration":1}', '{"duration":300,"remaining":-1,"endsAt":null}', '{"duration":300,"remaining":600,"endsAt":null}']) {
    assert.deepEqual(readFocus(raw), { duration: 1500, remaining: 1500, endsAt: null });
  }
});

test('task dates reject invalid calendar days before they reach the interface', () => {
  assert.ok(isValidTaskDate('2028-02-29'));
  assert.ok(!isValidTaskDate('2026-02-29'));
  assert.ok(!isValidTaskDate('2026-13-01'));
  assert.ok(!isValidTaskDate('not-a-date'));
  assert.throws(() => planTask('Plan my day', '2026-02-31'));
  const task = planTask('Plan my day');
  assert.deepEqual(parseTasks(JSON.stringify([{ ...task, due: 'bad' }])), []);
});
