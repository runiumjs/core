import {
  ChildProcessWithoutNullStreams,
  SpawnOptionsWithoutStdio,
  spawn,
} from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:os';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { killProcessTree } from './process-tree';

/**
 * Task status
 */
export enum TaskStatus {
  IDLE = 'idle',
  STARTING = 'starting',
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
}

/**
 * Task event
 */
export enum TaskEvent {
  STATE_CHANGE = 'state-change',
  STDOUT = 'stdout',
  STDERR = 'stderr',
  NOTICE = 'notice',
}

/**
 * Base runium task state
 */
export interface RuniumTaskState {
  status: TaskStatus;
  timestamp: number;
  iteration: number;
  exitCode?: number;
  error?: Error;
  reason?: string;
}

/**
 * Task options
 */
export interface TaskOptions {
  command: string;
  arguments?: string[];
  shell?: boolean;
  stopSignal?: string;
  cwd?: string;
  envFile?: string[];
  env?: { [key: string]: string | number | boolean };
  ttl?: number;
  log?: {
    stdout?: string | null;
    stderr?: string | null;
  };
}

/**
 * Task state
 */
export interface TaskState extends RuniumTaskState {
  pid: number;
}

/**
 * Runium task constructor
 */
export type RuniumTaskConstructor<
  Options = unknown,
  State extends RuniumTaskState = RuniumTaskState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
> = new (options: any) => RuniumTask<Options, State>;

/**
 * Silent exit code
 * use when stopping task without error
 */
export const SILENT_EXIT_CODE = -1;

const MAX_LISTENERS_COUNT = 50;

const EXIT_CODE_OFFSET = 128;

const STOP_TASK_TIMEOUT = 30 * 1000;

/**
 * Base runium task class
 */
export abstract class RuniumTask<
  Options = unknown,
  State = RuniumTaskState,
> extends EventEmitter {
  protected constructor(protected options: Options) {
    super();
  }
  abstract getOptions(): Options;
  abstract getState(): State;
  abstract start(): Promise<void>;
  abstract stop(reason?: string): Promise<void>;
  abstract restart(): Promise<void>;
}

/**
 * Task class
 */
export class Task extends RuniumTask<TaskOptions, TaskState> {
  protected state: TaskState = {
    status: TaskStatus.IDLE,
    pid: -1,
    timestamp: Date.now(),
    iteration: 0,
  };
  protected process: ChildProcessWithoutNullStreams | null = null;
  protected stdoutStream: WriteStream | null = null;
  protected stderrStream: WriteStream | null = null;
  protected ttlTimer: NodeJS.Timeout | null = null;

  constructor(protected readonly options: TaskOptions) {
    super(options);
    this.setMaxListeners(MAX_LISTENERS_COUNT);

    this.options.env = {
      ...process.env,
      ...(options.env || {}),
    } as TaskOptions['env'];
    this.options.cwd = resolve(process.cwd(), options.cwd || '');
    this.options.envFile = options.envFile?.map(path =>
      resolve(this.options.cwd!, path)
    );
  }

  /**
   * Get task state
   */
  getState(): TaskState {
    return { ...this.state };
  }

  /**
   * Get task options
   */
  getOptions(): TaskOptions {
    return { ...this.options };
  }

  /**
   * Check if task can start
   */
  protected canStart(): boolean {
    const { status } = this.state;
    return (
      status !== TaskStatus.STARTED &&
      status !== TaskStatus.STARTING &&
      status !== TaskStatus.STOPPING
    );
  }

  /**
   * Start task
   */
  async start(): Promise<void> {
    if (!this.canStart()) {
      return;
    }

    this.updateState({
      status: TaskStatus.STARTING,
      iteration: this.state.iteration + 1,
      pid: -1,
      exitCode: undefined,
      error: undefined,
    });

    try {
      await this.initLogStreams();

      const fileEnv = await this.loadEnvFiles();

      const {
        cwd,
        command,
        arguments: args = [],
        env,
        shell = true,
      } = this.options;

      this.process = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          ...fileEnv,
          ...(env || {}),
        } as NodeJS.ProcessEnv,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
      } as SpawnOptionsWithoutStdio);

      this.addProcessListeners();
      this.setTTLTimer();

      this.updateState({
        status: TaskStatus.STARTED,
        pid: this.process!.pid,
      });
    } catch (error) {
      this.onError(error as Error);
    }
  }

  protected async loadEnvFiles(): Promise<NodeJS.Dict<string>> {
    if (!this.options.envFile?.length) {
      return {};
    }

    const fileEnvironments = await Promise.all(
      this.options.envFile.map(async path => {
        try {
          await stat(path);
          return parseEnv(await readFile(path, 'utf8'));
        } catch (error) {
          const reason =
            (error as NodeJS.ErrnoException).code === 'ENOENT'
              ? 'file does not exist'
              : error instanceof SyntaxError
                ? 'invalid format'
                : 'failed to read';
          this.emit(
            TaskEvent.NOTICE,
            `could not process env file "${path}": ${reason}`
          );
          return {};
        }
      })
    );

    const environment: NodeJS.Dict<string> = {};
    for (const fileEnvironment of fileEnvironments) {
      Object.assign(environment, fileEnvironment);
    }

    return environment;
  }

  /**
   * Check if task can stop
   */
  protected canStop(): boolean {
    const { status } = this.state;
    return !!this.process && status === TaskStatus.STARTED;
  }

  /**
   * Stop task
   * @param reason
   */
  async stop(reason: string = ''): Promise<void> {
    if (!this.canStop()) {
      return;
    }

    this.updateState({
      status: TaskStatus.STOPPING,
      reason,
    });

    const signal = this.options.stopSignal || 'SIGTERM';
    await killProcessTree(
      Number(this.process!.pid),
      signal as NodeJS.Signals,
      'SIGKILL',
      STOP_TASK_TIMEOUT
    );
  }

  /**
   * Restart task
   */
  async restart(): Promise<void> {
    await this.stop('restart');
    this.start();
  }

  /**
   * Update task state
   */
  protected updateState(state: Partial<TaskState>): void {
    const newState = { ...this.state, ...state, timestamp: Date.now() };
    this.state = Object.fromEntries(
      Object.entries(newState).filter(([_, value]) => {
        return value !== undefined;
      })
    ) as unknown as TaskState;
    this.emit(TaskEvent.STATE_CHANGE, this.getState());
    this.emit(this.state.status, this.getState());
  }

  /**
   * Initialize log streams
   */
  protected async initLogStreams(): Promise<void> {
    const { stdout = null, stderr = null } = this.options.log || {};
    if (stdout) {
      const stdOutPath = resolve(stdout);
      await mkdir(dirname(stdOutPath), { recursive: true });
      this.stdoutStream = createWriteStream(stdout, {
        flags: this.state.iteration === 1 ? 'w' : 'a',
      });
    }
    if (stderr) {
      const stdErrPath = resolve(stderr);
      await mkdir(dirname(stdErrPath), { recursive: true });
      this.stderrStream = createWriteStream(stderr, {
        flags: this.state.iteration === 1 ? 'w' : 'a',
      });
    }
  }

  /**
   * Set TTL timer
   */
  protected setTTLTimer(): void {
    const { ttl } = this.options;
    if (ttl && this.process) {
      this.ttlTimer = setTimeout(() => {
        this.stop('ttl');
      }, ttl);
    }
  }

  /**
   * Add process listeners
   */
  protected addProcessListeners(): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data: Buffer) => this.onStdOutData(data));

    this.process.stderr?.on('data', (data: Buffer) => this.onStdErrData(data));

    this.process.on('exit', (code: number | null) => this.onExit(code));

    this.process.on('error', (error: Error) => this.onError(error));
  }

  /**
   * On standard output data
   */
  protected onStdOutData(data: Buffer): void {
    const output = data.toString();
    this.emit(TaskEvent.STDOUT, output);
    if (this.stdoutStream) {
      this.stdoutStream!.write(output);
    }
  }

  /**
   * On standard error data
   */
  protected onStdErrData(data: Buffer): void {
    const output = data.toString();
    this.emit(TaskEvent.STDERR, output);
    if (this.stderrStream) {
      this.stderrStream!.write(output);
    }
  }

  /**
   * On exit
   */
  protected onExit(code: number | null): void {
    // when process exit after kill tree
    // exit code is equal to 128 + stop signal value - it's normal exit
    let exitCode = SILENT_EXIT_CODE;
    if (code !== null) {
      const stopSignalValue =
        constants.signals[
          (this.options.stopSignal as NodeJS.Signals) || 'SIGTERM'
        ];
      exitCode =
        code === EXIT_CODE_OFFSET + stopSignalValue ? SILENT_EXIT_CODE : code;
    }

    this.updateState({
      status:
        exitCode === 0
          ? TaskStatus.COMPLETED
          : exitCode === SILENT_EXIT_CODE
            ? TaskStatus.STOPPED
            : TaskStatus.FAILED,
      exitCode,
    });

    this.cleanup();
  }

  /**
   * On error
   */
  protected onError(error: Error): void {
    this.updateState({
      status: TaskStatus.FAILED,
      error,
    });

    this.cleanup();
  }

  /**
   * Cleanup
   */
  protected cleanup(): void {
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }

    if (this.process) {
      this.process.removeAllListeners();
      this.process.stdout?.removeAllListeners();
      this.process.stderr?.removeAllListeners();
      this.process = null;
    }

    if (this.stdoutStream) {
      this.stdoutStream.end();
      this.stdoutStream = null;
    }

    if (this.stderrStream) {
      this.stderrStream.end();
      this.stderrStream = null;
    }
  }
}
