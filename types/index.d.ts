declare module '@runium/core' {
  import { ChildProcessWithoutNullStreams } from 'node:child_process';
  import { EventEmitter } from 'node:events';
  import { WriteStream } from 'node:fs';
  import Ajv2020 from 'ajv/dist/2020';
  import AjvKeywords from 'ajv-keywords';

  export function applyMacros(text: string, macros: MacrosCollection): string;

  export class EventTrigger extends RuniumTrigger<EventTriggerParams> {
    constructor(
      params: EventTriggerParams,
      project: RuniumTriggerProjectAccessible
    );
    enable(): void;
    disable(): void;
  }

  export type EventTriggerParams = RuniumTriggerParams<{
    event: string;
  }>;

  export function extendProjectSchema(
    schema: object,
    extensions: ProjectSchemaExtension
  ): object;

  export enum FileErrorCode {
    READ_JSON = 'file-read-json',
    WRITE_JSON = 'file-write-json',
  }

  export function getProcessTreePids(pid: number): Promise<number[]>;

  export function getProjectSchema(): object;

  export const ID_REGEX: RegExp;

  export class IntervalTrigger extends RuniumTrigger<IntervalTriggerParams> {
    constructor(
      params: IntervalTriggerParams,
      project: RuniumTriggerProjectAccessible
    );
    enable(): void;
    disable(): void;
  }

  export type IntervalTriggerParams = RuniumTriggerParams<{
    interval: number;
  }>;

  export function isCustomAction(
    action: ProjectAction
  ): action is ProjectCustomAction;

  export function isCustomTrigger(
    trigger: ProjectTrigger
  ): trigger is ProjectCustomTrigger;

  export function isProcessTaskAction(
    action: ProjectAction
  ): action is ProjectActionProcessTask;

  export function isRuniumError(error: unknown): boolean;

  export function isToggleTriggerAction(
    action: ProjectAction
  ): action is ProjectActionToggleTrigger;

  export interface JSONObject {
    [x: string]: JSONValue;
  }

  export type JSONValue = string | number | boolean | JSONObject | JSONValue[];

  export function killProcessTree(
    pid: number,
    signal?: NodeJS.Signals,
    forceSignal?: NodeJS.Signals,
    timeout?: number
  ): Promise<void>;

  export type Macro = (...params: string[]) => string;

  export type MacrosCollection = Record<string, Macro>;

  export enum MacrosErrorCode {
    MACRO_APPLY_ERROR = 'macro-apply-error',
  }

  export class Project extends EventEmitter {
    constructor(config: ProjectConfig);
    validate(): void;
    getConfig(): ProjectConfig;
    setConfig(config: ProjectConfig): void;
    getState(): ProjectState;
    start(): Promise<void>;
    stop(reason?: string): Promise<void>;
    extendValidationSchema(extensions: ProjectSchemaExtension): void;
    registerAction(type: string, processor: RuniumActionProcessor): void;
    registerTask(
      type: string,
      processor: RuniumTaskConstructor<unknown, any>
    ): void;
    registerTrigger(
      type: string,
      processor: RuniumTriggerConstructor<any>
    ): void;
    startTask(taskId: string): Promise<void>;
    stopTask(taskId: string): Promise<void>;
    restartTask(taskId: string): Promise<void>;
    getTaskState<T extends RuniumTaskState = RuniumTaskState>(
      taskId: string
    ): T | null;
    processAction(action: ProjectAction): void;
    enableTrigger(triggerId: string): void;
    disableTrigger(triggerId: string): void;
  }

  export type ProjectAction =
    | ProjectCustomAction
    | ProjectActionEmitEvent
    | ProjectActionProcessTask
    | ProjectActionStopProject
    | ProjectActionToggleTrigger;

  export interface ProjectActionBase<Options = unknown> {
    type: ProjectActionType;
    options: Options;
  }

  export interface ProjectActionEmitEvent extends ProjectActionBase<{
    event: string;
  }> {
    type: ProjectActionType.EMIT_EVENT;
  }

  export interface ProjectActionProcessTask extends ProjectActionBase<{
    taskId: string;
  }> {
    type:
      | ProjectActionType.START_TASK
      | ProjectActionType.RESTART_TASK
      | ProjectActionType.STOP_TASK;
  }

  export interface ProjectActionStopProject extends ProjectActionBase<never> {
    type: ProjectActionType.STOP_PROJECT;
  }

  export interface ProjectActionToggleTrigger extends ProjectActionBase<{
    triggerId: string;
  }> {
    type: ProjectActionType.ENABLE_TRIGGER | ProjectActionType.DISABLE_TRIGGER;
  }

  export enum ProjectActionType {
    EMIT_EVENT = 'emit-event',
    START_TASK = 'start-task',
    RESTART_TASK = 'restart-task',
    STOP_TASK = 'stop-task',
    STOP_PROJECT = 'stop-project',
    ENABLE_TRIGGER = 'enable-trigger',
    DISABLE_TRIGGER = 'disable-trigger',
  }

  export interface ProjectConfig {
    id: string;
    name?: string;
    tasks: ProjectTaskConfig[];
    triggers?: ProjectTrigger[];
  }

  export enum ProjectConfigErrorCode {
    INCORRECT_DATA = 'project-config-incorrect-data',
    TASKS_CIRCULAR_DEPENDENCY = 'project-config-tasks-circular-dependency',
    TASK_NOT_EXISTS = 'project-config-task-not-exists',
    TRIGGER_NOT_EXISTS = 'project-config-trigger-not-exists',
  }

  export type ProjectCustomAction = ProjectActionBase;

  export type ProjectCustomTrigger = ProjectTriggerBase<{
    options: unknown;
  }>;

  export interface ProjectDefaultTaskConfig extends ProjectTaskConfig<TaskOptions> {
    type?: ProjectTaskType.DEFAULT;
  }

  export enum ProjectErrorCode {
    ACTION_PROCESSOR_ALREADY_REGISTERED = 'project-action-processor-already-registered',
    ACTION_PROCESSOR_INCORRECT = 'project-action-processor-incorrect',
    TASK_PROCESSOR_NOT_FOUND = 'project-task-processor-not-found',
    TASK_PROCESSOR_ALREADY_REGISTERED = 'project-task-processor-already-registered',
    TASK_PROCESSOR_INCORRECT = 'project-task-processor-incorrect',
    TRIGGER_PROCESSOR_ALREADY_REGISTERED = 'project-trigger-processor-already-registered',
    TRIGGER_PROCESSOR_INCORRECT = 'project-trigger-processor-incorrect',
  }

  export enum ProjectEvent {
    STATE_CHANGE = 'state-change',
    START_TASK = 'start-task',
    RESTART_TASK = 'restart-task',
    STOP_TASK = 'stop-task',
    PROCESS_ACTION = 'process-action',
    ENABLE_TRIGGER = 'enable-trigger',
    DISABLE_TRIGGER = 'disable-trigger',
    TASK_STATE_CHANGE = 'task-state-change',
    TASK_STDOUT = 'task-stdout',
    TASK_STDERR = 'task-stderr',
  }

  export enum ProjectSchemaErrorCode {
    ACTION_TYPE_ALREADY_USED = 'project-schema-action-type-already-used',
    TASK_TYPE_ALREADY_USED = 'project-schema-task-type-already-used',
    TRIGGER_TYPE_ALREADY_USED = 'project-schema-trigger-type-already-used',
  }

  export interface ProjectSchemaExtension {
    project?: ProjectSchemaExtensionProject;
    tasks?: Record<string, ProjectSchemaExtensionTask>;
    definitions?: Record<string, unknown>;
    actions?: Record<string, ProjectSchemaExtensionAction>;
    triggers?: Record<string, ProjectSchemaExtensionTrigger>;
  }

  export interface ProjectSchemaExtensionAction {
    type: string;
    options?: unknown;
  }

  export interface ProjectSchemaExtensionProject {
    properties: unknown;
    required?: string[];
  }

  export interface ProjectSchemaExtensionTask {
    type: string;
    options: unknown;
  }

  export interface ProjectSchemaExtensionTrigger {
    type: string;
    options?: unknown;
  }

  export interface ProjectState {
    status: ProjectStatus;
    timestamp: number;
    reason?: string;
  }

  export enum ProjectStatus {
    IDLE = 'idle',
    STARTING = 'starting',
    STARTED = 'started',
    STOPPING = 'stopping',
    STOPPED = 'stopped',
  }

  export interface ProjectTaskConfig<Options = unknown> {
    id: string;
    options: Options;
    type?: ProjectTaskType | string;
    name?: string;
    mode?: ProjectTaskStartMode;
    dependencies?: ProjectTaskDependency[];
    handlers?: ProjectTaskHandler[];
    restart?: ProjectTaskRestartPolicy;
  }

  export interface ProjectTaskDependency {
    taskId: string;
    condition: ProjectTaskStateCondition;
  }

  export interface ProjectTaskHandler {
    condition: ProjectTaskStateCondition;
    action: ProjectAction;
  }

  export type ProjectTaskRestartPolicy =
    | ProjectTaskRestartPolicyAlways
    | ProjectTaskRestartPolicyOnFailure;

  export interface ProjectTaskRestartPolicyAlways {
    policy: ProjectTaskRestartPolicyType.ALWAYS;
    delay?: number;
  }

  export interface ProjectTaskRestartPolicyOnFailure {
    policy: ProjectTaskRestartPolicyType.ON_FAILURE;
    delay?: number;
    maxRetries?: number;
  }

  export enum ProjectTaskRestartPolicyType {
    ALWAYS = 'always',
    ON_FAILURE = 'on-failure',
  }

  export enum ProjectTaskStartMode {
    IMMEDIATE = 'immediate',
    DEFERRED = 'deferred',
    IGNORE = 'ignore',
  }

  export type ProjectTaskStateCondition =
    | string
    | boolean
    | Partial<RuniumTaskState>
    | ((state: RuniumTaskState) => boolean);

  export enum ProjectTaskType {
    DEFAULT = 'default',
  }

  export type ProjectTrigger =
    | ProjectTriggerEvent
    | ProjectTriggerInterval
    | ProjectTriggerTimeout
    | ProjectCustomTrigger;

  interface ProjectTriggerBase<T = unknown> {
    id: string;
    type: ProjectTriggerType | string;
    action: ProjectAction;
    disabled?: boolean;
    options: T;
  }

  export interface ProjectTriggerEvent extends ProjectTriggerBase<{
    event: string;
  }> {
    type: ProjectTriggerType.EVENT;
  }

  export interface ProjectTriggerInterval extends ProjectTriggerBase<{
    interval: number;
  }> {
    type: ProjectTriggerType.INTERVAL;
  }

  export interface ProjectTriggerTimeout extends ProjectTriggerBase<{
    timeout: number;
  }> {
    type: ProjectTriggerType.TIMEOUT;
  }

  export enum ProjectTriggerType {
    EVENT = 'event',
    TIMEOUT = 'timeout',
    INTERVAL = 'interval',
  }

  export function readJsonFile<T = JSONValue>(path: string): Promise<T>;

  type RuniumActionProcessor = (options: unknown) => void;

  export class RuniumError extends Error {
    code: string;
    payload: unknown;
    constructor(message: string, code: string, payload?: unknown);
  }

  export abstract class RuniumTask<
    Options = unknown,
    State = RuniumTaskState,
  > extends EventEmitter {
    protected options: Options;
    protected constructor(options: Options);
    abstract getOptions(): Options;
    abstract getState(): State;
    abstract start(): Promise<void>;
    abstract stop(reason?: string): Promise<void>;
    abstract restart(): Promise<void>;
  }

  export type RuniumTaskConstructor<
    Options = unknown,
    State extends RuniumTaskState = RuniumTaskState,
  > = new (options: any) => RuniumTask<Options, State>;

  export interface RuniumTaskState {
    status: TaskStatus;
    timestamp: number;
    iteration: number;
    exitCode?: number;
    error?: Error;
    reason?: string;
  }

  export abstract class RuniumTrigger<Params extends RuniumTriggerParams> {
    protected project: RuniumTriggerProjectAccessible;
    protected id: string;
    protected action: ProjectAction;
    protected disabled: boolean;
    constructor(params: Params, project: RuniumTriggerProjectAccessible);
    abstract enable(): void;
    abstract disable(): void;
    getId(): string;
    isDisabled(): boolean;
    processAction(): void;
  }

  export type RuniumTriggerConstructor<Params extends RuniumTriggerParams> =
    new (
      params: Params,
      project: RuniumTriggerProjectAccessible
    ) => RuniumTrigger<Params>;

  export interface RuniumTriggerParams<Options = unknown> {
    id: string;
    action: ProjectAction;
    options: Options;
    disabled?: boolean;
  }

  export interface RuniumTriggerProjectAccessible {
    processAction(action: ProjectAction): void;
    on: NodeJS.EventEmitter['on'];
    off: NodeJS.EventEmitter['off'];
  }

  export const SILENT_EXIT_CODE = -1;

  export class Task extends RuniumTask<TaskOptions, TaskState> {
    protected readonly options: TaskOptions;
    protected state: TaskState;
    protected process: ChildProcessWithoutNullStreams | null;
    protected stdoutStream: WriteStream | null;
    protected stderrStream: WriteStream | null;
    protected ttlTimer: NodeJS.Timeout | null;
    constructor(options: TaskOptions);
    getState(): TaskState;
    getOptions(): TaskOptions;
    protected canStart(): boolean;
    start(): Promise<void>;
    protected canStop(): boolean;
    stop(reason?: string): Promise<void>;
    restart(): Promise<void>;
    protected updateState(state: Partial<TaskState>): void;
    protected initLogStreams(): Promise<void>;
    protected setTTLTimer(): void;
    protected addProcessListeners(): void;
    protected onStdOutData(data: Buffer): void;
    protected onStdErrData(data: Buffer): void;
    protected onExit(code: number | null): void;
    protected onError(error: Error): void;
    protected cleanup(): void;
  }

  export enum TaskEvent {
    STATE_CHANGE = 'state-change',
    STDOUT = 'stdout',
    STDERR = 'stderr',
  }

  export interface TaskOptions {
    command: string;
    arguments?: string[];
    shell?: boolean;
    stopSignal?: string;
    cwd?: string;
    env?: {
      [key: string]: string | number | boolean;
    };
    ttl?: number;
    log?: {
      stdout?: string | null;
      stderr?: string | null;
    };
  }

  export interface TaskState extends RuniumTaskState {
    pid: number;
  }

  export enum TaskStatus {
    IDLE = 'idle',
    STARTING = 'starting',
    STARTED = 'started',
    COMPLETED = 'completed',
    FAILED = 'failed',
    STOPPING = 'stopping',
    STOPPED = 'stopped',
  }

  export class TimeoutTrigger extends RuniumTrigger<TimeoutTriggerParams> {
    constructor(
      params: TimeoutTriggerParams,
      project: RuniumTriggerProjectAccessible
    );
    enable(): void;
    disable(): void;
  }

  export type TimeoutTriggerParams = RuniumTriggerParams<{
    timeout: number;
  }>;

  export function validateProject(project: ProjectConfig, schema: object): void;

  export function writeJsonFile<T = JSONValue>(
    path: string,
    data: T
  ): Promise<void>;

  export const Ajv: typeof Ajv2020;

  export const ajvKeywords: typeof AjvKeywords;
}
