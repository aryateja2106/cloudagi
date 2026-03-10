import chalk from 'chalk';
import Table from 'cli-table3';
import type { ProbeOutput, ProbeResult, SellWindow } from './types.js';

/** Color a sell window rating */
function colorSellWindow(sw: SellWindow): string {
  switch (sw) {
    case 'MASSIVE': return chalk.bgGreen.black.bold(` ${sw} `);
    case 'HIGH': return chalk.green.bold(sw);
    case 'MEDIUM': return chalk.yellow(sw);
    case 'LOW': return chalk.dim(sw);
    case 'NONE': return chalk.red(sw);
  }
}

/** Format milliseconds as human-readable time until reset */
function formatResetTime(resetsAt: Date | null, now: Date = new Date()): string {
  if (!resetsAt) return 'unknown';

  const ms = resetsAt.getTime() - now.getTime();
  if (ms <= 0) return 'now';

  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  return `${hours}h ${minutes}m`;
}

/** Format a dollar amount */
function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Render a single probe result as a table row */
function resultToRow(result: ProbeResult): (string | undefined)[] | null {
  if (result.status === 'not-installed') return null;

  if (result.status === 'error') {
    // Show the actual error reason instead of generic ERROR
    const reason = result.error?.includes('429')
      ? chalk.yellow('RATE LIMITED')
      : result.error?.includes('401')
        ? chalk.yellow('AUTH FAILED')
        : chalk.red('ERROR');
    return [
      chalk.red(result.provider),
      chalk.dim('—'),
      chalk.dim('—'),
      chalk.dim('—'),
      chalk.dim('—'),
      chalk.dim('—'),
      reason,
    ];
  }

  const { snapshot, waste } = result;
  if (!snapshot || !waste) return null;

  const metric = waste.metric;

  return [
    chalk.bold(snapshot.provider.charAt(0).toUpperCase() + snapshot.provider.slice(1)),
    snapshot.plan,
    `${metric.used}%`,
    `${metric.remaining}%`,
    formatResetTime(metric.resetsAt),
    chalk.yellow(formatDollars(waste.dollarWaste)),
    colorSellWindow(waste.sellWindow),
  ];
}

/** Render the full probe output as a terminal table */
export function renderTable(output: ProbeOutput): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold(`CloudAGI Credit Probe v${output.version}`));
  lines.push('');

  const table = new Table({
    head: ['Provider', 'Plan', 'Used', 'Left', 'Resets', 'Waste', 'Sell Window'].map(
      (h) => chalk.dim(h),
    ),
    style: {
      head: [],
      border: [],
    },
    chars: {
      top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      left: '│', 'left-mid': '├',
      mid: '─', 'mid-mid': '┼',
      right: '│', 'right-mid': '┤',
      middle: '│',
    },
  });

  const activeResults = output.results.filter((r) => r.status !== 'not-installed');

  for (const result of activeResults) {
    const row = resultToRow(result);
    if (row) table.push(row);
  }

  lines.push(table.toString());

  // Summary
  lines.push('');
  if (output.totalWaste > 0) {
    lines.push(
      `  Total Estimated Waste: ${chalk.yellow.bold(formatDollars(output.totalWaste))}`,
    );
  }

  // Detected but not shown
  const notInstalled = output.results.filter((r) => r.status === 'not-installed');
  if (notInstalled.length > 0) {
    lines.push(
      chalk.dim(`  Not detected: ${notInstalled.map((r) => r.provider).join(', ')}`),
    );
  }

  lines.push('');
  lines.push(chalk.dim(`  Probed in ${output.probeDurationMs}ms`));
  lines.push('');
  lines.push(chalk.cyan('  Want to sell your unused credits? Run: cloudagi sell --start'));
  lines.push('');

  return lines.join('\n');
}

/** Render probe output as JSON */
export function renderJson(output: ProbeOutput): string {
  return JSON.stringify(output, null, 2);
}
