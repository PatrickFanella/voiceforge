import { spawnSync } from 'node:child_process';

const commands = [
  ['bunx', 'tsc', '--noEmit'],
  ['bunx', 'expo', 'lint'],
  ['bunx', 'vitest', 'run'],
  ['bunx', 'expo', 'export', '--platform', 'web', '--clear'],
];

for (const [command, ...args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
