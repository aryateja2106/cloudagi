#!/usr/bin/env node

import { program } from 'commander';
import { runProbe } from './probe.js';
import { renderTable, renderJson } from './output.js';
import { getPlugins } from './plugins/plugin.js';

// Import plugins to trigger registration
import './plugins/claude.js';
import './plugins/copilot.js';
import './plugins/cursor.js';
import './plugins/codex.js';
import './plugins/amp.js';

program
  .name('cloudagi')
  .description('See how much of your coding agent credits you\'re wasting.')
  .version('0.1.1')
  .option('--json', 'Output as JSON')
  .option('--providers', 'List detected providers without fetching usage')
  .option('--verbose', 'Show debug info')
  .action(async (opts) => {
    if (opts.providers) {
      const plugins = getPlugins();
      for (const plugin of plugins) {
        const detected = await plugin.detect();
        const status = detected ? '✓' : '✗';
        console.log(`  ${status} ${plugin.name} (${plugin.id})`);
      }
      return;
    }

    const output = await runProbe();

    if (opts.json) {
      console.log(renderJson(output));
    } else {
      console.log(renderTable(output));
    }
  });

program.parse();
