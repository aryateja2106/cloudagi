import type { AuthToken, ProviderId, ProviderType, UsageSnapshot } from '../types.js';

/** Interface every provider plugin must implement */
export interface ProbePlugin {
  /** Unique provider identifier */
  id: ProviderId;

  /** Human-readable provider name */
  name: string;

  /** Provider type */
  type: ProviderType;

  /** Check if this provider is installed on the machine */
  detect(): Promise<boolean>;

  /** Read existing credentials from local storage */
  authenticate(): Promise<AuthToken>;

  /** Fetch current usage data from the provider */
  fetchUsage(token: AuthToken): Promise<UsageSnapshot>;
}

/** Registry of all available plugins */
const plugins: ProbePlugin[] = [];

/** Register a plugin */
export function registerPlugin(plugin: ProbePlugin): void {
  plugins.push(plugin);
}

/** Get all registered plugins */
export function getPlugins(): readonly ProbePlugin[] {
  return plugins;
}
