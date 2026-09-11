import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask, planTask, isComplete, parseTasks, receiptPayload, localDate } from '../src/model.ts';
import { chains, connectWallet, recordReceipt, checkReceipt } from '../src/chain.ts';

const account = '0x1234567890123456789012345678901234567890';
const hash = '0x' + 'ab'.repeat(32);
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function provider(handler: (method: string, params?: unknown[]) => unknown) {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { ethereum: { request: async ({ method, params }: { method: string; params?: unknown[] }) => handler(method, params) } } });
}
function completed() { const task = planTask('Research the fly connectome'); task.checked = [true, true, true]; return task; }

test('planner trims input, classifies, and creates independent editable steps', () => {
  const task = planTask('  Draft a project update  ');
  assert.equal(task.title, 'Draft a project update');
  assert.equal(task.circuit, 'writing');
  assert.equal(task.steps.length, 3);
  assert.equal(task.due, localDate());
  assert.equal(isComplete(task), false);
  assert.equal(classifyTask('Learn a new skill'), 'learning');
  assert.equal(classifyTask('Compare primary sources'), 'research');
  assert.equal(classifyTask('Plan my day'), 'planning');
  assert.throws(() => planTask('  '));
  assert.throws(() => planTask('x'.repeat(241)));
});
test('device data recovery rejects malformed records and invalid receipts', () => {
  const task = completed();
  assert.deepEqual(parseTasks('{bad json'), []);
  assert.deepEqual(parseTasks('null'), []);
  assert.deepEqual(parseTasks(JSON.stringify([{ ...task, checked: [true] } ])), []);
  assert.deepEqual(parseTasks(JSON.stringify([{ ...task, circuit: '__proto__' } ])), []);
  assert.deepEqual(parseTasks(JSON.stringify([{ ...task, receipt: { hash: 'bad' } } ])), []);
  assert.equal(parseTasks(JSON.stringify([task])).length, 1);
});
test('receipt payload is deterministic, sensitive to edits, and rejects incomplete plans', () => {
  const task = completed();
  assert.equal(receiptPayload(task), receiptPayload({ ...task }));
  assert.notEqual(receiptPayload(task), receiptPayload({ ...task, title: 'Something else' }));
  assert.throws(() => receiptPayload(planTask('Plan the day')));
  assert.ok(!receiptPayload(task).includes('receipt'));
});
test('unknown wallet network is added and verified before connection', async () => {
  let switched = false; const methods: string[] = [];
  provider(method => {
    methods.push(method);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
    if (method === 'wallet_switchEthereumChain' && !switched) { switched = true; throw { code: 4902 }; }
    if (method === 'eth_chainId') return '0xb626';
  });
  assert.equal(await connectWallet('testnet'), account);
  assert.ok(methods.includes('wallet_addEthereumChain'));
  assert.equal(methods.filter(m => m === 'wallet_switchEthereumChain').length, 2);
});
test('wrong-chain wallet is rejected without broadcasting a transaction', async () => {
  const methods: string[] = [];
  provider(method => { methods.push(method); if (method === 'eth_requestAccounts') return [account]; if (method === 'eth_chainId') return '0x1'; });
  await assert.rejects(recordReceipt(completed(), 'testnet'), /Switch your wallet/);
  assert.ok(!methods.includes('eth_sendTransaction'));
});
test('completion sends zero value to self and publishes a digest, never the task text', async () => {
  let tx: any;
  provider((method, params) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return `0x${chains.testnet.id.toString(16)}`;
    if (method === 'eth_sendTransaction') { tx = params![0]; return hash; }
  });
  const task = completed(), receipt = await recordReceipt(task, 'testnet');
  assert.equal(tx.from, account); assert.equal(tx.to, account); assert.equal(tx.value, '0x0');
  assert.equal(tx.chainId, '0xb626');
  const text = Buffer.from(tx.data.slice(2), 'hex').toString();
  assert.equal(text, `flybrain:v1:sha256:${receipt.digest}`);
  assert.ok(!text.includes(task.title)); assert.equal(receipt.status, 'pending');
});
test('wallet rejection preserves a meaningful error', async () => {
  provider(() => { throw { code: 4001 }; });
  await assert.rejects(connectWallet('mainnet'), /Request declined/);
});
test('receipt confirmation distinguishes pending, success, failed, and invalid responses', async () => {
  const receipt = { hash, chainId: 46630, account, digest: 'ab'.repeat(32), status: 'pending' as const };
  globalThis.fetch = async () => Response.json({ result: null });
  assert.equal(await checkReceipt(receipt), 'pending');
  globalThis.fetch = async () => Response.json({ result: { transactionHash: hash, status: '0x1' } });
  assert.equal(await checkReceipt(receipt), 'confirmed');
  globalThis.fetch = async () => Response.json({ result: { transactionHash: hash, status: '0x0' } });
  assert.equal(await checkReceipt(receipt), 'failed');
  globalThis.fetch = async () => Response.json({ result: { transactionHash: hash, status: 'oops' } });
  await assert.rejects(checkReceipt(receipt), /unrecognized/);
  globalThis.fetch = async () => Response.json({ error: { message: 'rate limited' } });
  await assert.rejects(checkReceipt(receipt), /could not confirm/);
});
