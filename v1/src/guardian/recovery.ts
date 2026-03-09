/**
 * Recovery Playbook — per-provider instructions surfaced when the Guardian
 * detects that credentials changed while active sessions were running.
 *
 * Each RecoveryAction gives the user exactly enough information to restore
 * their agent session without guessing. Instructions are intentionally
 * short — the user is already in an interruption; don't make them read an
 * essay.
 */

import type { ProviderId } from '../types.js';
import type { RecoveryAction } from './types.js';

// ---------------------------------------------------------------------------
// Static playbook
// ---------------------------------------------------------------------------

const RECOVERY_PLAYBOOK: Record<ProviderId, RecoveryAction> = {
  claude: {
    provider: 'claude',
    summary: 'Claude Code session may have lost authentication',
    steps: [
      'Run `/login` inside your Claude Code session to re-authenticate.',
      'If the session is unresponsive, quit Claude Code and relaunch it.',
      'After relaunch, your session context (files, tasks) is preserved locally.',
    ],
  },

  cursor: {
    provider: 'cursor',
    summary: 'Cursor session may have lost authentication',
    steps: [
      'Restart Cursor (Cmd+Q on macOS, then reopen).',
      'If the restart does not fix it, open Settings > Account and sign out.',
      'Sign back in — Cursor will refresh its auth tokens automatically.',
    ],
  },

  amp: {
    provider: 'amp',
    summary: 'Amp session may have lost authentication',
    steps: [
      'Run `amp auth login` in your terminal to re-authenticate.',
      'Follow the browser prompt to complete the OAuth flow.',
      'Return to your Amp session — it should resume automatically.',
    ],
  },

  codex: {
    provider: 'codex',
    summary: 'Codex session may have lost authentication',
    steps: [
      'Run `codex login` in your terminal to re-authenticate.',
      'Follow the browser prompt to complete the login flow.',
      'Your Codex session will resume once authentication completes.',
    ],
  },

  copilot: {
    provider: 'copilot',
    summary: 'GitHub Copilot session may have lost authentication',
    steps: [
      'Run `gh auth login` to refresh your GitHub authentication.',
      'Select your preferred auth method (browser or token).',
      'Restart your editor after authentication completes.',
    ],
  },

  antigravity: {
    provider: 'antigravity',
    summary: 'Antigravity (Gemini) session may have lost authentication',
    steps: [
      'Open the Antigravity app and check the authentication status.',
      'If logged out, sign back in with your Google account.',
      'Active agent sessions will reconnect automatically after sign-in.',
    ],
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return recovery instructions for a given provider.
 *
 * @param provider - The provider whose credentials changed unexpectedly.
 * @param error    - Optional error string from the detection layer, included
 *                   for logging purposes but not shown to the user.
 * @returns A RecoveryAction with a summary and ordered steps. If the provider
 *          is unrecognised, returns a generic fallback action.
 */
export function getRecoveryInstructions(
  provider: ProviderId,
  error: string,
): RecoveryAction {
  void error; // Available for future structured logging

  const action = RECOVERY_PLAYBOOK[provider];
  if (action) return action;

  // Fallback for providers not yet in the playbook
  return {
    provider,
    summary: `${provider} session may have lost authentication`,
    steps: [
      `Check that ${provider} is still signed in on this machine.`,
      'Restart the agent tool and re-authenticate if prompted.',
      'If the problem persists, consult the provider documentation.',
    ],
  };
}
