export type FocusState = { duration: number; remaining: number; endsAt: number | null };
export function secondsRemaining(state: FocusState, now = Date.now()) {
  return state.endsAt === null ? state.remaining : Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}
export function startFocus(state: FocusState, now = Date.now()): FocusState {
  const remaining = secondsRemaining(state, now) || state.duration;
  return { ...state, remaining, endsAt: now + remaining * 1000 };
}
export function pauseFocus(state: FocusState, now = Date.now()): FocusState {
  return { ...state, remaining: secondsRemaining(state, now), endsAt: null };
}
export function readFocus(raw: string | null): FocusState {
  const fallback = { duration: 1500, remaining: 1500, endsAt: null };
  try {
    const state = JSON.parse(raw || 'null');
    if (!state || ![300, 900, 1500].includes(state.duration) || !Number.isFinite(state.remaining) || state.remaining < 0 || state.remaining > state.duration || (state.endsAt !== null && (!Number.isFinite(state.endsAt) || state.endsAt < 0))) return fallback;
    return state;
  } catch { return fallback; }
}
