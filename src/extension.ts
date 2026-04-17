import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

type TriggerKey =
  | 'gitPush'
  | 'gitCommit'
  | 'gitMerge'
  | 'buildSuccess'
  | 'buildFail'
  | 'install'
  | 'taskEnd'
  | 'terminalFallback';

type TagSpec = {
  file: string;
};

const EVENT_MAP: Record<TriggerKey, TagSpec> = {
  gitPush: { file: 'metro_boomin_want_some_more.mp3' },
  gitCommit: { file: 'metroooo.mp3' },
  gitMerge: { file: 'if_tha_metro_on_the beat_i_wont_shoot_you.mp3' },
  buildSuccess: { file: 'mustard_on_the_beat_ho.mp3' },
  buildFail: { file: 'life_is_good.mp3' },
  install: { file: 'jason_made_another_one.mp3' },
  taskEnd: { file: 'hournable_c_note.mp3' },
  terminalFallback: { file: 'they_check_chucking_tha_chat.mp3' },
};

const DEFAULT_TRIGGERS: TriggerKey[] = [
  'gitPush',
  'gitCommit',
  'gitMerge',
  'buildSuccess',
  'buildFail',
  'install',
  'taskEnd',
  'terminalFallback',
];

const BUILD_COMMAND = /\b(npm|yarn|pnpm)\s+(run\s+)?build\b|\btsc\b|\bwebpack\b|\bvite\b/i;
const INSTALL_COMMAND = /\b(npm|yarn|pnpm)\s+(install|i|add)\b/i;
const GIT_PUSH_COMMAND = /\bgit\s+push\b/i;
const GIT_COMMIT_COMMAND = /\bgit\s+commit\b/i;
const GIT_MERGE_COMMAND = /\bgit\s+merge\b/i;

let lastPlayed = 0;
let statusBar: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  updateStatusBar(context, context.globalState.get<boolean>('muted', false));
  context.subscriptions.push(statusBar!);

  context.subscriptions.push(
    vscode.commands.registerCommand('gitbanger.toggleMute', async () => {
      const current = context.globalState.get<boolean>('muted', false);
      await context.globalState.update('muted', !current);
      updateStatusBar(context, !current);
    }),
  );

  context.subscriptions.push(vscode.window.onDidEndTerminalShellExecution((event) => {
    const commandLine = event.execution.commandLine.value;
    const trigger = classifyTerminalCommand(commandLine, event.exitCode);
    if (trigger) {
      playTag(context, trigger);
    }
  }));

  context.subscriptions.push(vscode.tasks.onDidEndTaskProcess((event) => {
    const trigger = classifyTask(event.execution.task.name, event.exitCode);
    if (trigger) {
      playTag(context, trigger);
    }
  }));
}

export function deactivate() {
  statusBar?.dispose();
}

function updateStatusBar(context: vscode.ExtensionContext, muted: boolean) {
  if (!statusBar) {
    return;
  }

  statusBar.text = muted ? '$(mute) GitBanger' : '$(unmute) GitBanger';
  statusBar.tooltip = muted ? 'GitBanger muted - click to unmute' : 'GitBanger live - click to mute';
  statusBar.command = 'gitbanger.toggleMute';
  statusBar.show();
}

function playTag(context: vscode.ExtensionContext, trigger: TriggerKey) {
  const config = vscode.workspace.getConfiguration('producerTags');
  if (!config.get<boolean>('enabled', true)) {
    return;
  }

  if (context.globalState.get<boolean>('muted', false)) {
    return;
  }

  const triggers = config.get<string[]>('triggerOn', DEFAULT_TRIGGERS);
  if (!triggers.includes(trigger)) {
    return;
  }

  if (!canPlay(config.get<number>('cooldownSeconds', 10))) {
    return;
  }

  const tag = EVENT_MAP[trigger];
  const filePath = path.join(context.extensionPath, 'audio', tag.file);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const volume = clamp(config.get<number>('volume', 1), 0, 1);
  void playAudio(filePath, volume);
}

function canPlay(cooldownSeconds: number): boolean {
  const cooldownMs = Math.max(0, cooldownSeconds) * 1000;
  const now = Date.now();
  if (now - lastPlayed < cooldownMs) {
    return false;
  }

  lastPlayed = now;
  return true;
}

function classifyTerminalCommand(commandLine: string, exitCode: number | undefined): TriggerKey | undefined {
  if (GIT_PUSH_COMMAND.test(commandLine)) {
    return 'gitPush';
  }

  if (GIT_COMMIT_COMMAND.test(commandLine)) {
    return 'gitCommit';
  }

  if (GIT_MERGE_COMMAND.test(commandLine)) {
    return 'gitMerge';
  }

  if (INSTALL_COMMAND.test(commandLine)) {
    return 'install';
  }

  if (BUILD_COMMAND.test(commandLine)) {
    return exitCode === 0 ? 'buildSuccess' : 'buildFail';
  }

  return 'terminalFallback';
}

function classifyTask(taskName: string, exitCode: number | undefined): TriggerKey | undefined {
  if (/build|compile|bundle|release/i.test(taskName)) {
    return exitCode === 0 ? 'buildSuccess' : 'buildFail';
  }

  if (exitCode === 0) {
    return 'taskEnd';
  }

  return undefined;
}

async function playAudio(filePath: string, volume: number) {
  if (process.platform === 'darwin') {
    void spawnDetached('afplay', ['-v', String(volume), filePath]);
    return;
  }

  if (process.platform === 'win32') {
    const escapedPath = filePath.replace(/'/g, "''");
    const script = [
      '$ErrorActionPreference = "SilentlyContinue";',
      '$wmp = New-Object -ComObject WMPlayer.OCX.7;',
      `$wmp.settings.volume = ${Math.round(volume * 100)};`,
      `$wmp.URL = '${escapedPath}';`,
      '$wmp.controls.play();',
      'Start-Sleep -Milliseconds 300;',
    ].join(' ');
    void spawnDetached('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
    return;
  }

  const linuxCandidates: Array<[string, string[]]> = [
    ['paplay', [filePath]],
    ['aplay', [filePath]],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath]],
    ['mpg123', ['-q', filePath]],
  ];

  await trySpawnCandidates(linuxCandidates);
}

function spawnDetached(command: string, args: string[]) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });

  child.on('error', () => undefined);
  child.unref();
}

async function trySpawnCandidates(candidates: ReadonlyArray<readonly [string, string[]]>) {
  for (const [command, args] of candidates) {
    const started = await spawnAndWaitForStart(command, args);
    if (started) {
      return;
    }
  }
}

function spawnAndWaitForStart(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    let settled = false;

    child.once('spawn', () => {
      settled = true;
      child.unref();
      resolve(true);
    });

    child.once('error', () => {
      if (!settled) {
        resolve(false);
      }
    });
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
