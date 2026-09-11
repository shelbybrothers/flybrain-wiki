export type Circuit = 'research' | 'planning' | 'writing' | 'learning';
export type Receipt = { hash: string; chainId: number; account: string; digest: string; status: 'pending' | 'confirmed' | 'failed' };
export type Task = { id: string; title: string; circuit: Circuit; steps: string[]; checked: boolean[]; createdAt: string; due: string; receipt?: Receipt };
export const circuits: Record<Circuit, { label: string; region: string; color: string; description: string }> = {
  research: { label: 'Research', region: 'Optic lobes', color: '#a4b7fa', description: 'Gather information, compare sources, and find the signal.' },
  planning: { label: 'Planning', region: 'Central complex', color: '#eca36c', description: 'Turn a goal into a clear sequence of small actions.' },
  writing: { label: 'Writing', region: 'Antennal lobes', color: '#d697d7', description: 'Organize your ideas and shape a useful first draft.' },
  learning: { label: 'Learning', region: 'Mushroom bodies', color: '#93c4a1', description: 'Build understanding through practice and reflection.' },
};
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function classifyTask(title: string): Circuit {
  if (/learn|study|practice|understand|read|course|review notes/i.test(title)) return 'learning';
  if (/write|draft|email|article|post|copy|newsletter/i.test(title)) return 'writing';
  if (/research|explore|find|compare|investigate|source|analy[sz]/i.test(title)) return 'research';
  return 'planning';
}
export function planTask(title: string, due = localDate(), circuit?: Circuit): Task {
  const clean = title.trim();
  if (!clean || clean.length > 240) throw new Error('Use a task between 1 and 240 characters.');
  const category = circuit ?? classifyTask(clean);
  const plans: Record<Circuit, string[]> = {
    research: [`Define the question and scope for “${clean}”.`, 'Find two primary sources; capture evidence, dates, and links.', 'Compare the findings and write a brief conclusion with open questions.'],
    planning: [`Define what “${clean}” looks like when it is finished.`, 'List the next three actions, dependencies, and time needed.', 'Complete the first action, then review the remaining work.'],
    writing: [`Outline the audience, main point, and structure for “${clean}”.`, 'Write a first draft with concrete examples and supporting sources.', 'Edit for clarity, verify factual claims, and prepare the final version.'],
    learning: [`Choose one learning outcome for “${clean}”.`, 'Study a reliable resource, then explain the idea in your own words.', 'Practice without notes and record what you need to revisit.'],
  };
  return { id: crypto.randomUUID(), title: clean, circuit: category, steps: plans[category], checked: [false, false, false], createdAt: new Date().toISOString(), due };
}
export function isComplete(task: Task) { return task.checked.length > 0 && task.checked.every(Boolean); }
export function receiptPayload(task: Task) {
  if (!isComplete(task)) throw new Error('Complete all steps before recording a receipt.');
  return JSON.stringify({ version: 1, id: task.id, title: task.title, circuit: task.circuit, steps: task.steps, checked: task.checked, createdAt: task.createdAt, due: task.due });
}
export function parseTasks(raw: string | null): Task[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is Task => {
      if (!item || typeof item !== 'object') return false;
      const t = item as Task;
      return typeof t.id === 'string' && typeof t.title === 'string' && t.title.length <= 240 && Object.hasOwn(circuits, t.circuit) && typeof t.createdAt === 'string' && typeof t.due === 'string' && Array.isArray(t.steps) && t.steps.length > 0 && t.steps.every(s => typeof s === 'string') && Array.isArray(t.checked) && t.checked.length === t.steps.length && t.checked.every(s => typeof s === 'boolean') && (!t.receipt || (/^0x[0-9a-f]{64}$/i.test(t.receipt.hash) && /^0x[0-9a-f]{40}$/i.test(t.receipt.account) && typeof t.receipt.digest === 'string' && [4663, 46630].includes(t.receipt.chainId) && ['pending', 'confirmed', 'failed'].includes(t.receipt.status)));
    });
  } catch { return []; }
}
