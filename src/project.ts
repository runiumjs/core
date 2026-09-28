import { EventEmitter } from 'node:events';
import expression from 'bcx-expression-evaluator';
import {
  isCustomAction,
  isCustomTrigger,
  isProcessTaskAction,
  isToggleTriggerAction,
  ProjectAction,
  ProjectActionEmitEvent,
  ProjectActionType,
  ProjectConfig,
  ProjectTaskConfig,
  ProjectTaskDependency,
  ProjectTaskHandler,
  ProjectTaskRestartPolicyOnFailure,
  ProjectTaskRestartPolicyType,
  ProjectTaskStartMode,
  ProjectTaskStateCondition,
  ProjectTaskType,
  ProjectTriggerType,
  validateProject,
} from './project-config';
import {
  SILENT_EXIT_CODE,
  RuniumTask,
  RuniumTaskState,
  RuniumTaskConstructor,
  Task,
  TaskEvent,
  TaskState,
  TaskStatus,
} from './task';
import {
  extendProjectSchema,
  getProjectSchema,
  ProjectSchemaExtension,
} from './project-schema';
import { RuniumError } from './error';
import {
  EventTrigger,
  IntervalTrigger,
  RuniumTrigger,
  RuniumTriggerConstructor,
  RuniumTriggerParams,
  RuniumTriggerProjectAccessible,
  TimeoutTrigger,
} from './trigger';

/**
 * Project events
 */
export enum ProjectEvent {
  STATE_CHANGE = 'state-change',
  START_TASK = 'start-task',
  RESTART_TASK = 'restart-task',
  STOP_TASK = 'stop-task',
  PROCESS_ACTION = 'process-action',
  ENABLE_TRIGGER = 'enable-trigger',
  DISABLE_TRIGGER = 'disable-trigger',
  NOTICE = 'notice',
  TASK_STATE_CHANGE = 'task-state-change',
  TASK_STDOUT = 'task-stdout',
  TASK_STDERR = 'task-stderr',
  TASK_NOTICE = 'task-notice',
}

/**
 * Project status
 */
export enum ProjectStatus {
  IDLE = 'idle',
  STARTING = 'starting',
  STARTED = 'started',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
}

/**
 * Project state
 */
export interface ProjectState {
  status: ProjectStatus;
  timestamp: number;
  reason?: string;
}

/**
 * Project error codes
 */
export enum ProjectErrorCode {
  ACTION_PROCESSOR_ALREADY_REGISTERED = 'project-action-processor-already-registered',
  ACTION_PROCESSOR_INCORRECT = 'project-action-processor-incorrect',
  TASK_PROCESSOR_NOT_FOUND = 'project-task-processor-not-found',
  TASK_PROCESSOR_ALREADY_REGISTERED = 'project-task-processor-already-registered',
  TASK_PROCESSOR_INCORRECT = 'project-task-processor-incorrect',
  TRIGGER_PROCESSOR_ALREADY_REGISTERED = 'project-trigger-processor-already-registered',
  TRIGGER_PROCESSOR_INCORRECT = 'project-trigger-processor-incorrect',
}

/**
 * Task data
 */
interface TaskData {
  instance: RuniumTask;
  config: ProjectTaskConfig;
  dependencies: ProjectTaskDependency[];
  dependents: string[] | null;
}

type RuniumActionProcessor = (options: unknown) => void;

/**
 * Project
 */
export class Project extends EventEmitter {
  /**
   * Project schema
   */
  private schema: object = getProjectSchema();

  /**
   * Task processors
   */
  private taskProcessors: Map<string, RuniumTaskConstructor> = new Map([
    [ProjectTaskType.DEFAULT, Task],
  ]);

  /**
   * Action processors
   */
  private actionProcessors: Map<string, RuniumActionProcessor> = new Map();

  /**
   * Trigger processors
   */
  private triggerProcessors: Map<
    string,
    RuniumTriggerConstructor<RuniumTriggerParams>
  > = new Map();

  /**
   * Tasks
   */
  private tasks: Map<string, TaskData> = new Map();

  /**
   * Triggers
   */
  private triggers: Map<string, RuniumTrigger<RuniumTriggerParams>> = new Map();

  /**
   * Project state
   */
  private state: ProjectState = {
    timestamp: Date.now(),
    status: ProjectStatus.IDLE,
  };

  constructor(private config: ProjectConfig) {
    super();
  }

  /**
   * Validate project configuration
   */
  validate(): void {
    validateProject(this.config, this.schema);
  }

  /**
   * Get project configuration
   */
  getConfig(): ProjectConfig {
    return { ...this.config };
  }

  /**
   * Set project configuration
   * @param config
   */
  setConfig(config: ProjectConfig): void {
    this.config = { ...config };
  }

  /**
   * Get project state
   */
  getState(): ProjectState {
    return { ...this.state };
  }

  /**
   * Start project
   */
  async start(): Promise<void> {
    // can not start not idel or stopped
    if (
      this.state.status !== ProjectStatus.IDLE &&
      this.state.status !== ProjectStatus.STOPPED
    ) {
      return;
    }

    this.validate();

    this.initTasks();
    this.initTriggers();

    this.updateState({
      status: ProjectStatus.STARTING,
    });

    const taskIds = this.getTasksStartOrder();
    for (const taskId of taskIds) {
      if (this.tasks.has(taskId)) {
        const { instance, config } = this.tasks.get(taskId)!;
        const { mode = ProjectTaskStartMode.IMMEDIATE, dependencies = [] } =
          config;
        if (
          mode === ProjectTaskStartMode.IMMEDIATE &&
          dependencies.length === 0
        ) {
          instance.start();
        }
      }
    }

    this.updateState({
      status: ProjectStatus.STARTED,
    });
  }

  /**
   * Stop project
   * @param reason
   */
  async stop(reason: string = ''): Promise<void> {
    // can not stop not started or starting
    if (
      this.state.status !== ProjectStatus.STARTED &&
      this.state.status !== ProjectStatus.STARTING
    ) {
      return;
    }

    this.updateState({
      status: ProjectStatus.STOPPING,
      reason,
    });

    this.cleanupTriggers();

    const taskIds = this.getTasksStartOrder().reverse();
    const promises = [];
    for (const taskId of taskIds) {
      if (this.tasks.has(taskId)) {
        const { instance } = this.tasks.get(taskId)!;
        const { status } = instance.getState();
        if (status === TaskStatus.STARTED) {
          promises.push(instance.stop('project-stop'));
        }
      }
    }
    await Promise.allSettled(promises);

    this.updateState({
      status: ProjectStatus.STOPPED,
    });
  }

  /**
   * Extend project validation schema
   * @param extensions
   */
  extendValidationSchema(extensions: ProjectSchemaExtension): void {
    this.schema = extendProjectSchema(this.schema, extensions);
  }

  /**
   * Register action
   * @param type
   * @param processor
   */
  registerAction(type: string, processor: RuniumActionProcessor): void {
    if (this.actionProcessors.has(type)) {
      throw new RuniumError(
        `Action processor for type "${type}" already registered`,
        ProjectErrorCode.ACTION_PROCESSOR_ALREADY_REGISTERED,
        {
          type,
        }
      );
    }

    if (typeof processor !== 'function') {
      throw new RuniumError(
        `Action processor for type "${type}" must be a function`,
        ProjectErrorCode.ACTION_PROCESSOR_INCORRECT,
        {
          type,
        }
      );
    }

    this.actionProcessors.set(type, processor);
  }

  /**
   * Register task
   * @param type
   * @param processor
   */
  registerTask(
    type: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processor: RuniumTaskConstructor<unknown, any>
  ): void {
    if (this.taskProcessors.has(type)) {
      throw new RuniumError(
        `Task processor for type "${type}" already registered`,
        ProjectErrorCode.TASK_PROCESSOR_ALREADY_REGISTERED,
        {
          type,
        }
      );
    }

    if (!(processor.prototype instanceof RuniumTask)) {
      throw new RuniumError(
        `Task processor for type "${type}" must be a subclass of "RuniumTask"`,
        ProjectErrorCode.TASK_PROCESSOR_INCORRECT,
        {
          type,
        }
      );
    }

    this.taskProcessors.set(type, processor);
  }

  /**
   * Register trigger
   * @param type
   * @param processor
   */
  registerTrigger(
    type: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processor: RuniumTriggerConstructor<any>
  ): void {
    if (this.triggerProcessors.has(type)) {
      throw new RuniumError(
        `Trigger processor for type "${type}" already registered`,
        ProjectErrorCode.TRIGGER_PROCESSOR_ALREADY_REGISTERED,
        {
          type,
        }
      );
    }

    if (!(processor.prototype instanceof RuniumTrigger)) {
      throw new RuniumError(
        `Trigger processor for type "${type}" must be a subclass of "RuniumTrigger"`,
        ProjectErrorCode.TRIGGER_PROCESSOR_INCORRECT,
        {
          type,
        }
      );
    }

    this.triggerProcessors.set(type, processor);
  }

  /**
   * Update project state
   * @param state
   */
  private updateState(state: Partial<ProjectState>): void {
    this.state = { ...this.state, ...state, timestamp: Date.now() };
    this.emit(ProjectEvent.STATE_CHANGE, this.getState());
    this.emit(this.state.status, this.getState());
  }

  /**
   * Initialize tasks
   */
  private initTasks(): void {
    this.tasks.clear();

    for (const taskConfig of this.config.tasks) {
      const type = taskConfig.type || ProjectTaskType.DEFAULT;
      const TaskConstructor = this.taskProcessors.get(type);

      if (!TaskConstructor) {
        throw new RuniumError(
          `Task processor for type "${type}" not found`,
          ProjectErrorCode.TASK_PROCESSOR_NOT_FOUND,
          {
            type,
          }
        );
      }

      const task = new TaskConstructor(taskConfig.options);

      task.on(TaskEvent.STATE_CHANGE, (state: TaskState) => {
        this.emit(ProjectEvent.TASK_STATE_CHANGE, taskConfig.id, state);
        this.onTaskStateChange(taskConfig.id, state);
      });

      task.on(TaskEvent.STDOUT, (data: string) => {
        this.emit(ProjectEvent.TASK_STDOUT, taskConfig.id, data);
      });

      task.on(TaskEvent.STDERR, (data: string) => {
        this.emit(ProjectEvent.TASK_STDERR, taskConfig.id, data);
      });

      task.on(TaskEvent.NOTICE, (data: string) => {
        this.emit(ProjectEvent.TASK_NOTICE, taskConfig.id, data);
      });

      this.tasks.set(taskConfig.id, {
        instance: task,
        config: taskConfig,
        dependencies: [...(taskConfig.dependencies || [])],
        dependents: null,
      });
    }
  }

  /**
   * Get tasks start order
   */
  private getTasksStartOrder(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return;

      visited.add(taskId);

      const { dependencies = [] } = this.tasks.get(taskId) || {};
      for (const dep of dependencies) {
        if (this.tasks.has(dep.taskId)) {
          visit(dep.taskId);
        }
      }

      result.push(taskId);
    };

    for (const taskId of this.tasks.keys()) {
      visit(taskId);
    }

    return result;
  }

  /**
   * On task state change
   * @param taskId
   * @param state
   */
  private onTaskStateChange(taskId: string, state: TaskState): void {
    const { config, instance } = this.tasks.get(taskId)!;

    // start dependent tasks
    const dependents = this.getDependentTasks(taskId);
    for (const dependentTaskId of dependents) {
      if (this.isDependentTaskReady(dependentTaskId)) {
        this.startTask(dependentTaskId);
      }
    }

    // check restart
    if (
      state.status === TaskStatus.COMPLETED ||
      state.status === TaskStatus.FAILED
    ) {
      const { restart } = config;
      if (restart && state.exitCode !== SILENT_EXIT_CODE) {
        const { policy } = restart;
        const needRestart =
          policy === ProjectTaskRestartPolicyType.ALWAYS ||
          (policy === ProjectTaskRestartPolicyType.ON_FAILURE &&
            state.exitCode !== 0);

        if (needRestart) {
          const { maxRetries = Infinity, delay = 0 } =
            restart as ProjectTaskRestartPolicyOnFailure;
          if (state.iteration <= maxRetries) {
            setTimeout(instance.restart.bind(instance), delay);
          }
        }
      }
    }

    // process handlers
    (config.handlers || []).forEach((handler: ProjectTaskHandler) => {
      if (this.checkTaskStateCondition(handler.condition, state)) {
        this.processAction(handler.action);
      }
    });
  }

  /**
   * Check task state condition
   * @param condition
   * @param state
   */
  private checkTaskStateCondition(
    condition: ProjectTaskStateCondition,
    state: RuniumTaskState
  ): boolean {
    if (typeof condition === 'string') {
      return expression.evaluate(condition, state) === true;
    }
    if (typeof condition === 'object') {
      return Object.entries(condition).every(([key, value]) => {
        return state[key as keyof RuniumTaskState] === value;
      });
    }
    if (typeof condition === 'boolean') {
      return condition;
    }
    return false;
  }

  /**
   * Start task
   * @param taskId
   */
  async startTask(taskId: string): Promise<void> {
    if (this.tasks.has(taskId)) {
      const { instance } = this.tasks.get(taskId)!;
      const { status } = instance.getState();
      if (
        status !== TaskStatus.STARTED &&
        status !== TaskStatus.STARTING &&
        status !== TaskStatus.STOPPING
      ) {
        this.emit(ProjectEvent.START_TASK, taskId);
        return instance.start();
      }
    }
  }

  /**
   * Stop task
   * @param taskId
   */
  async stopTask(taskId: string): Promise<void> {
    if (this.tasks.has(taskId)) {
      const { instance } = this.tasks.get(taskId)!;
      const { status } = instance.getState();
      if (status === TaskStatus.STARTED) {
        this.emit(ProjectEvent.STOP_TASK, taskId);
        return instance.stop('action-stop');
      }
    }
  }

  /**
   * Restart task
   * @param taskId
   */
  async restartTask(taskId: string): Promise<void> {
    if (this.tasks.has(taskId)) {
      const { instance } = this.tasks.get(taskId)!;
      this.emit(ProjectEvent.RESTART_TASK, taskId);
      return instance.restart();
    }
  }

  /**
   * Get task state
   * @param taskId
   */
  getTaskState<T extends RuniumTaskState = RuniumTaskState>(
    taskId: string
  ): T | null {
    if (this.tasks.has(taskId)) {
      const { instance } = this.tasks.get(taskId)!;
      return instance.getState() as T;
    }
    return null;
  }

  /**
   * Check if dependent task is ready
   * @param taskId
   */
  private isDependentTaskReady(taskId: string): boolean {
    if (this.tasks.has(taskId)) {
      const { dependencies = [], config } = this.tasks.get(taskId)!;

      if (config.mode === ProjectTaskStartMode.IGNORE) {
        return false;
      }

      for (const { taskId, condition } of dependencies) {
        const { instance } = this.tasks.get(taskId)!;
        if (!this.checkTaskStateCondition(condition, instance.getState())) {
          return false;
        }
      }

      return true;
    }
    return false;
  }

  /**
   * Get dependent tasks
   * @param taskId
   */
  private getDependentTasks(taskId: string): string[] {
    let result: string[] = [];

    if (this.tasks.has(taskId)) {
      const { dependents } = this.tasks.get(taskId)!;
      if (dependents) {
        result = dependents;
      } else {
        for (const [dependentTaskId, { dependencies }] of this.tasks) {
          for (const dep of dependencies) {
            if (dep.taskId === taskId) {
              result.push(dependentTaskId);
            }
          }
        }
        this.tasks.get(taskId)!.dependents = result;
      }
    }
    return result;
  }

  /**
   * Process action
   * @param action
   */
  processAction(action: ProjectAction): void {
    this.emit(ProjectEvent.PROCESS_ACTION, action);

    if (isProcessTaskAction(action)) {
      const taskId = action.options.taskId;
      switch (action.type) {
        case ProjectActionType.START_TASK:
          this.startTask(taskId);
          break;
        case ProjectActionType.RESTART_TASK:
          this.restartTask(taskId);
          break;
        case ProjectActionType.STOP_TASK:
          this.stopTask(taskId);
          break;
      }
      return;
    }
    if (isToggleTriggerAction(action)) {
      const triggerId = action.options.triggerId;
      switch (action.type) {
        case ProjectActionType.ENABLE_TRIGGER:
          this.enableTrigger(triggerId);
          break;
        case ProjectActionType.DISABLE_TRIGGER:
          this.disableTrigger(triggerId);
          break;
      }
      return;
    }

    if (isCustomAction(action)) {
      const processCustomAction = this.actionProcessors.get(action.type);
      if (processCustomAction) {
        processCustomAction(action.options || {});
      }
      return;
    }

    switch ((action as ProjectAction).type) {
      case ProjectActionType.EMIT_EVENT:
        this.emit((action as ProjectActionEmitEvent).options.event);
        break;
      case ProjectActionType.STOP_PROJECT:
        this.stop('action');
        break;
      default:
        break;
    }
  }

  /**
   * Init triggers
   */
  private initTriggers(): void {
    const projectAccessible = {
      processAction: this.processAction.bind(this),
      on: this.on.bind(this),
      off: this.off.bind(this),
    } as RuniumTriggerProjectAccessible;

    let trigger: RuniumTrigger<RuniumTriggerParams> | null = null;
    for (const triggerParams of this.config.triggers || []) {
      if (!isCustomTrigger(triggerParams)) {
        switch (triggerParams.type) {
          case ProjectTriggerType.EVENT:
            trigger = new EventTrigger(triggerParams, projectAccessible);
            break;
          case ProjectTriggerType.INTERVAL:
            trigger = new IntervalTrigger(triggerParams, projectAccessible);
            break;
          case ProjectTriggerType.TIMEOUT:
            trigger = new TimeoutTrigger(triggerParams, projectAccessible);
            break;
          default:
            break;
        }
      } else {
        const TriggerConstructor = this.triggerProcessors.get(
          triggerParams.type
        );
        if (TriggerConstructor) {
          trigger = new TriggerConstructor(triggerParams, projectAccessible);
        }
      }
      if (trigger) {
        this.triggers.set(triggerParams.id, trigger);
        if (triggerParams.disabled !== true) {
          trigger.enable();
        }
      }
    }
  }

  /**
   * Cleanup triggers
   */
  private cleanupTriggers(): void {
    for (const id in this.triggers) {
      const trigger = this.triggers.get(id);
      trigger && trigger.disable();
    }
    this.triggers.clear();
  }

  /**
   * Enable trigger
   * @param triggerId
   */
  enableTrigger(triggerId: string): void {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      this.emit(ProjectEvent.ENABLE_TRIGGER, triggerId);
      trigger.enable();
    }
  }

  /**
   * Disable trigger
   * @param triggerId
   */
  disableTrigger(triggerId: string): void {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      this.emit(ProjectEvent.DISABLE_TRIGGER, triggerId);
      trigger.disable();
    }
  }
}
