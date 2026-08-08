const { mkdirSync } = require('fs');
const { resolve } = require('path');
const { spawn } = require('child_process');

const projectRoot = resolve(__dirname, '..');
const tempDir = resolve(projectRoot, '.tmp');
mkdirSync(tempDir, { recursive: true });

const expoCli = require.resolve('expo/bin/cli');
const child = spawn(
  process.execPath,
  [expoCli, 'start', ...process.argv.slice(2)],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      TEMP: tempDir,
      TMP: tempDir,
      EXPO_NO_TELEMETRY: '1',
    },
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
