import { receiptPayload, type Task, type Receipt } from './model.ts';

interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (value: unknown) => void): void;
  removeListener?(event: string, listener: (value: unknown) => void): void;
}
declare global { interface Window { ethereum?: Provider; } }
export const chains = {
  testnet: { id: 46630, name: 'Robinhood Chain Testnet', rpc: 'https://rpc.testnet.chain.robinhood.com', explorer: 'https://explorer.testnet.chain.robinhood.com' },
  mainnet: { id: 4663, name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com' },
};
// Vercel build-time overrides allow a dedicated RPC provider without changing wallet code.
const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
for (const key of ['testnet', 'mainnet'] as const) {
  const override = env?.[`VITE_RH_${key.toUpperCase()}_RPC_URL`];
  if (override) {
    try { if (new URL(override).protocol === 'https:') chains[key].rpc = override; } catch { /* Keep the official HTTPS endpoint. */ }
  }
}
export type ChainKey = keyof typeof chains;
export function friendlyError(error: unknown): Error {
  const e = error as { code?: number; message?: string };
  if (e.code === 4001) return new Error('Request declined in your wallet. Your tasks are still saved.');
  if (e.code === -32002) return new Error('A wallet request is already open. Check your wallet extension.');
  return new Error(e.message || 'The wallet could not complete this request. Please try again.');
}
export async function connectWallet(key: ChainKey): Promise<string> {
  const provider = window.ethereum;
  if (!provider) throw new Error('No browser wallet found. Install MetaMask or open this page in an Ethereum-compatible wallet browser.');
  const chain = chains[key], chainId = `0x${chain.id.toString(16)}`;
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !/^0x[0-9a-f]{40}$/i.test(accounts[0])) throw new Error('Your wallet did not provide an account.');
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
    catch (error) {
      const e = error as { code?: number; data?: { originalError?: { code?: number } } };
      if (e.code !== 4902 && e.data?.originalError?.code !== 4902) throw error;
      await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId, chainName: chain.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [chain.rpc], blockExplorerUrls: [chain.explorer] }] });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    }
    const actual = await provider.request({ method: 'eth_chainId' });
    if (typeof actual !== 'string' || parseInt(actual, 16) !== chain.id) throw new Error(`Switch your wallet to ${chain.name} and try again.`);
    const latest = await provider.request({ method: 'eth_accounts' });
    if (!Array.isArray(latest) || typeof latest[0] !== 'string' || !/^0x[0-9a-f]{40}$/i.test(latest[0])) throw new Error('Your wallet account changed. Please connect again.');
    return latest[0];
  } catch (error) { throw friendlyError(error); }
}
export function bytesToHex(data: Uint8Array) { return [...data].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
export async function recordReceipt(task: Task, key: ChainKey): Promise<Receipt> {
  if (task.steps.some(step => !step.trim())) throw new Error('Add text to every step before recording this plan.');
  const payload = receiptPayload(task);
  const account = await connectWallet(key);
  const bytes = Uint8Array.from(new TextEncoder().encode(payload));
  const digest = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)));
  const data = '0x' + bytesToHex(new TextEncoder().encode(`flybrain:v1:sha256:${digest}`));
  // A zero-value self-transaction anchors the digest without a contract or token approval.
  const hash = await window.ethereum!.request({ method: 'eth_sendTransaction', params: [{ from: account, to: account, value: '0x0', data, chainId: `0x${chains[key].id.toString(16)}` }] }).catch(error => { throw friendlyError(error); });
  if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('The wallet returned an invalid transaction hash.');
  return { hash, chainId: chains[key].id, account, digest, status: 'pending' };
}
export async function checkReceipt(receipt: Receipt): Promise<Receipt['status']> {
  const chain = Object.values(chains).find(c => c.id === receipt.chainId);
  if (!chain) throw new Error('Unknown receipt network.');
  const response = await fetch(chain.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [receipt.hash] }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('The network is unavailable. Receipt confirmation will be retried.');
  const data = await response.json();
  if (data.error) throw new Error('The network could not confirm the receipt yet.');
  if (!data.result) return 'pending';
  if (data.result.transactionHash?.toLowerCase() !== receipt.hash.toLowerCase()) throw new Error('Unexpected receipt returned by the network.');
  if (data.result.status === '0x1') return 'confirmed';
  if (data.result.status === '0x0') return 'failed';
  throw new Error('The network returned an unrecognized transaction status.');
}
