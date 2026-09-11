import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [file, id] = process.argv.slice(2);
if (!file || !id) throw new Error('Usage: node scripts/verify-receipt.mjs <export.json> <task-id>');
const { tasks } = JSON.parse(await readFile(file, 'utf8'));
const task = tasks?.find(task => task.id === id);
if (!task?.receipt) throw new Error('Task or receipt missing from export.');
if (!task.checked?.length || !task.checked.every(Boolean) || task.checked.length !== task.steps?.length) throw new Error('Task is not complete.');
const payload = JSON.stringify({ version: 1, id: task.id, title: task.title, circuit: task.circuit, steps: task.steps, checked: task.checked, createdAt: task.createdAt, due: task.due });
const digest = createHash('sha256').update(payload).digest('hex');
if (digest !== task.receipt.digest) throw new Error('The exported task no longer matches the receipt digest.');
const networks = { 46630: 'https://rpc.testnet.chain.robinhood.com', 4663: 'https://rpc.mainnet.chain.robinhood.com' };
if (!networks[task.receipt.chainId]) throw new Error('Unknown receipt chain.');
const rpc = process.env.FLYBRAIN_VERIFY_RPC_URL || networks[task.receipt.chainId];
if (new URL(rpc).protocol !== 'https:') throw new Error('RPC must use HTTPS.');
async function request(method, params) {
  const response = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}
const network = await request('eth_chainId', []);
if (parseInt(network, 16) !== task.receipt.chainId) throw new Error('RPC is connected to the wrong chain.');
const [tx, receipt] = await Promise.all([request('eth_getTransactionByHash', [task.receipt.hash]), request('eth_getTransactionReceipt', [task.receipt.hash])]);
if (!tx || !receipt) throw new Error('Transaction is not confirmed yet.');
if (receipt.status !== '0x1') throw new Error('Transaction did not succeed.');
const expected = '0x' + Buffer.from(`flybrain:v1:sha256:${digest}`).toString('hex');
if (tx.input?.toLowerCase() !== expected) throw new Error('On-chain data does not match the completion digest.');
if (tx.from?.toLowerCase() !== task.receipt.account.toLowerCase() || tx.to?.toLowerCase() !== tx.from?.toLowerCase() || BigInt(tx.value) !== 0n) throw new Error('Unexpected transaction sender, recipient, or value.');
console.log(JSON.stringify({ verified: true, taskId: id, digest, transaction: task.receipt.hash, chainId: task.receipt.chainId, blockNumber: parseInt(receipt.blockNumber, 16) }, null, 2));
