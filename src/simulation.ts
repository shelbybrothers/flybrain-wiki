import type { Circuit } from './model.ts';

export const regionKeys: Circuit[] = ['research', 'planning', 'learning', 'writing'];
export const NEURON_COUNT = 192;
export type NeuralState = {
  time: number;
  voltage: Float64Array;
  current: Float64Array;
  refractory: Float64Array;
  lastSpike: Float64Array;
  connections: { target: number; weight: number }[][];
};
export function randomGenerator(seed: number) {
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}
export function createNeuralState(): NeuralState {
  const random = randomGenerator(138642);
  return {
    time: 0,
    voltage: new Float64Array(NEURON_COUNT),
    current: new Float64Array(NEURON_COUNT),
    refractory: new Float64Array(NEURON_COUNT),
    lastSpike: new Float64Array(NEURON_COUNT).fill(-1000),
    connections: Array.from({ length: NEURON_COUNT }, (_, source) => Array.from({ length: 7 }, () => ({
      target: Math.floor(random() * NEURON_COUNT),
      weight: source % 5 === 0 ? -.55 : .65 + random() * .45,
    }))),
  };
}
// A small synthetic LIF circuit for interaction. Not a FlyWire emulation.
export function stepNeuralState(state: NeuralState, region: Circuit | 'all', strength: number, stimulated: boolean) {
  const dt = .5, spikes: number[] = [];
  state.time += dt;
  for (let i = 0; i < NEURON_COUNT; i++) {
    const driven = stimulated && (region === 'all' || regionKeys[Math.floor(i / 48)] === region);
    state.current[i] *= Math.exp(-dt / 5);
    state.refractory[i] = Math.max(0, state.refractory[i] - dt);
    if (state.refractory[i] > 0) continue;
    const input = driven ? Math.max(0, Math.min(100, strength)) / 100 * (3 + i % 7 * .17) : 0;
    state.voltage[i] += dt / 20 * (input + state.current[i] - state.voltage[i]);
    if (state.voltage[i] >= 1) {
      spikes.push(i);
      state.lastSpike[i] = state.time;
      state.voltage[i] = 0;
      state.refractory[i] = 2.2;
    }
  }
  for (const source of spikes) for (const edge of state.connections[source]) state.current[edge.target] += edge.weight;
  return spikes;
}
