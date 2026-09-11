# FlyBrain Wiki

A Wikipedia-inspired daily-task workspace with an interactive schematic fly brain, editable local task plans, and optional completion receipts on Robinhood Chain.

[Live site](https://flybrain-wiki.vercel.app) · [Application source](https://github.com/shelbybrothers/flybrain-wiki) · [Follow on X](https://x.com/flybrainwiki)

## Features

- The provided `flybrain.png` is used for the logo, article image, favicon, and touch icon.
- Responsive article layout, contents navigation, search, reading preferences, and reference links.
- An editorial encyclopedia layout with an agent dossier, readable typography, responsive navigation, and keyboard-driven search.
- A green-on-black agent lab inspired by [Supabase’s fly demo](https://x.com/supabase/status/2097999894632149229): task terminal, synchronized neural panel, and an original illustrated fly over a clickable keyboard.
- The lab creates real local plans, reveals the generated steps, and opens them in the existing workspace. Pause/replay controls affect presentation only; replay never creates a duplicate task or completes work.
- Interactive canvas brain: hover and click regions, drag or keyboard rotation, three camera presets, zoom, expanded view, and reduced-motion support.
- A 192-neuron synthetic LIF network: adjust stimulus strength, send a pulse, inspect simulated activity, switch between anatomy and connectivity, pause, and reset.
- Selected brain regions can be used directly as planning circuits.
- Daily task plans with editable titles, dates, and steps, completion tracking, filters, device persistence, JSON export, and deletion with undo.
- Focus sessions of 5, 15, or 25 minutes, with pause/reset and deadline-based timing that survives tab inactivity and reopening the task.
- Browser wallet connection, verified chain switching, hash-only zero-value self-transactions, receipt confirmation polling, and explorer links.
- Testnet is the default; mainnet can be selected in the wallet dialog.
- Community links point to https://x.com/flybrainwiki.
- Optional, feature-detected WebMCP tools expose task listing and plan creation. Wallet transactions are only available through the visible wallet approval flow.

## Development

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm ci
npm run dev
npm test
npm run build
```

Vercel detects Vite; `vercel.json` supplies the build and output directory. No server credentials are required.

## Honest scope

The browser app uses deterministic keyword classification and three-step planning templates. Users do the work and can edit every suggested step. It is not an LLM, an autonomous external-task executor, or a browser port of the full research simulation.

The canvas geometry is synthetic. Brain regions serve as interface metaphors, not demonstrated biological mappings to human productivity tasks. The ~138K neuron and ~5M synapse counts describe the referenced research connectome, not this display.

The interactive network contains 192 synthetic neurons in four groups. Its LIF dynamics run in 0.5 model-millisecond steps with generated connections. Stimulation and the activity trace reflect this small local simulation, not a measured fly brain. Rendering and simulation pause when the explorer is outside the viewport or the page is hidden; focus timers use wall-clock deadlines independently.

The lab’s keyboard and terminal playback send synthetic stimuli to the compact neural viewer. The fly is an original AI-generated raster illustration with a small typing animation, not a simulated body or an autonomous database operator. Reduced-motion preferences show the complete plan immediately. The scientific explorer remains a separate interactive view below the lab.

Tasks are stored only in this browser's local storage. There is no cross-device account or background scheduler. Export tasks regularly, especially after recording a receipt. Clearing browser data removes local plans. There are no fake task completions or synthetic transaction hashes.

## Completion receipts

1. Complete all steps in a task.
2. Select Robinhood Chain Testnet (46630) or Mainnet (4663).
3. The app serializes the task using the ordered fields in `receiptPayload` and hashes that UTF-8 string with SHA-256.
4. The connected wallet approves a transaction with `from === to`, `value = 0`, and UTF-8 calldata `flybrain:v1:sha256:<64-character digest>`.
5. The app records the transaction hash and polls `eth_getTransactionReceipt`. It reports confirmation only after a successful network response.

Task text is not sent on-chain. The sender, transaction calldata, fee, and time are public. A receipt timestamps a completion claim; it does not independently prove that work was done. There is no contract deployment, token approval, transfer of task rewards, or custody of private keys.

Network defaults are taken from [Robinhood's official documentation](https://docs.robinhood.com/chain/connecting/). They are rate-limited public endpoints. To configure a dedicated provider, set `VITE_RH_TESTNET_RPC_URL` and/or `VITE_RH_MAINNET_RPC_URL` before building; both must use HTTPS. These are browser-visible values, so use domain-restricted public client credentials where supported, never private server credentials.

During initial implementation the documented RPC hosts could not be reached from the development environment. Transaction construction and confirmation logic were tested with injected providers; no funded wallet transaction was signed or broadcast. Wallet users must have ETH for fees on the selected network. RPC failures leave receipts pending and are retried while the page is open.

Verify an exported receipt against the network:

```sh
node scripts/verify-receipt.mjs ./flybrain-tasks-YYYY-MM-DD.json TASK_ID
```

Set `FLYBRAIN_VERIFY_RPC_URL` to an alternative HTTPS RPC if necessary.

## Research provenance

The user-supplied [eonsystemspbc/fly-brain](https://github.com/eonsystemspbc/fly-brain) repository was cloned and inspected at commit `a3db62f9436074e485c0278290c2164ed6150808`. A separate sparse reference checkout is retained beside this application at `../flybrain-research`, including the original Python code and scripts. Its large connectome data is not bundled into the web deployment. To create a separate reference clone elsewhere, run `sh scripts/clone-research.sh <destination>`.

The web planner and schematic renderer are original interface code. The research environment, source code, licenses, and scientific claims remain with the upstream project. Running the complete simulation requires the upstream Python/CUDA environment and datasets; follow its README.

Other references:

- [Virtual Fly Brain, VFB_00101567](https://v2.virtualflybrain.org/org.geppetto.frontend/geppetto?id=VFB_00101567&i=VFB_00101567)
- [Aerts Lab Fly Brain Cell Atlas](https://flybrain.aertslab.org/?_inputs_&page=%22HomePage%22)

Independent project; not affiliated with Wikipedia, Robinhood, Virtual Fly Brain, Eon Systems, Aerts Lab, or Supabase. The Supabase post is a visual reference only; its video and branding are not bundled into this application.

## Validation

`npm test` runs 15 checks covering planning, calendar validation, storage recovery, deterministic stimulus response, neural propagation and return to rest, focus timer persistence/pause/resume, receipt determinism, chain-add/switch handling, wrong-chain rejection, transaction privacy and zero-value semantics, wallet cancellation, and receipt-status handling. `npm run build` checks TypeScript and creates the production bundle. Browser wallet signing and WebMCP integration require a supported client and were not exercised against a live wallet during deployment.

## License

Application code: GPL-2.0-or-later; see `LICENSE`. The supplied brand image is a user-provided asset and is not covered by the software license. Referenced projects retain their own licenses and notices.
