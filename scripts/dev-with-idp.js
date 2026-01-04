#!/usr/bin/env node
/**
 * 一键开发启动：
 * - 自动清理 8080（BFF）和 9000（IdP）端口占用
 * - 并行启动 IdP 和 Modern dev
 *
 * 说明：
 * - 复用 scripts/clean-port.js（通过 PORT 环境变量指定端口）
 * - Windows 下用 shell 模式启动 npm，兼容性更好
 */

import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';

// Docker 环境沿用 clean-port.js 的策略：跳过端口清理
const isDocker = existsSync('/.dockerenv') || existsSync('/run/.containerenv');

function runCleanPort(port) {
  if (isDocker) return;
  spawnSync(process.execPath, ['scripts/clean-port.js'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  });
}

// 你项目默认：BFF 8080、IdP 9000
const BFF_PORT = Number.parseInt(process.env.PORT || '8080', 10) || 8080;
const IDP_PORT = Number.parseInt(process.env.IDP_PORT || '9000', 10) || 9000;

// 清理端口（先 IdP 再 BFF）
runCleanPort(IDP_PORT);
runCleanPort(BFF_PORT);

const baseEnv = { ...process.env, NODE_ENV: 'development' };

// 启动 IdP
const idp = spawn('npm', ['run', 'dev:idp'], {
  stdio: 'inherit',
  env: baseEnv,
  shell: true,
});

// 启动 Modern dev（原来的 dev 命令）
const app = spawn('npm', ['run', 'dev:app'], {
  stdio: 'inherit',
  env: baseEnv,
  shell: true,
});

let exiting = false;
const shutdown = () => {
  if (exiting) return;
  exiting = true;

  // 尽量优雅结束（Windows 下 kill 信号会被转义成 taskkill 行为）
  try { idp.kill('SIGINT'); } catch {}
  try { app.kill('SIGINT'); } catch {}

  // 给一点时间输出日志再退出
  setTimeout(() => process.exit(0), 300);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 任意子进程退出都结束整个 dev（避免僵尸进程）
idp.on('exit', (code) => {
  if (!exiting) {
    // eslint-disable-next-line no-console
    console.log(`\n[dev] IdP exited with code ${code}\n`);
    shutdown();
  }
});

app.on('exit', (code) => {
  if (!exiting) {
    // eslint-disable-next-line no-console
    console.log(`\n[dev] App exited with code ${code}\n`);
    shutdown();
  }
});


