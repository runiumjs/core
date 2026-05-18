import { RuniumTaskState, TaskOptions } from './task';
import { RuniumError } from './error';
import { Ajv, ajvKeywords } from './validation';

/**
 * Project task start mode
 */
export enum ProjectTaskStartMode {
  IMMEDIATE = 'immediate',
  DEFERRED = 'deferred',
  IGNORE = 'ignore',
}

/**
 * Project action type
 */
export enum ProjectActionType {
  EMIT_EVENT = 'emit-event',
  START_TASK = 'start-task',
  RESTART_TASK = 'restart-task',
  STOP_TASK = 'stop-task',
  STOP_PROJECT = 'stop-project',
  ENABLE_TRIGGER = 'enable-trigger',
  DISABLE_TRIGGER = 'disable-trigger',
}

/**
 * Project task state condition
 */
export type ProjectTaskStateCondition =
  | string
  | boolean
  | Partial<RuniumTaskState>
  | ((state: RuniumTaskState) => boolean);

/**
 * Project task handler
 */
export interface ProjectTaskHandler {
  condition: ProjectTaskStateCondition;
  action: ProjectAction;
}

/**
 * Project task dependency
 */
export interface ProjectTaskDependency {
  taskId: string;
  condition: ProjectTaskStateCondition;
}

/**
 * Project task type
 */
export enum ProjectTaskType {
  DEFAULT = 'default',
}

/**
 * Project task config
 */
export interface ProjectTaskConfig<Options = unknown> {
  id: string;
  options: Options;
  type?: ProjectTaskType | string;
  name?: string;
  description?: string;
  mode?: ProjectTaskStartMode;
  dependencies?: ProjectTaskDependency[];
  handlers?: ProjectTaskHandler[];
  restart?: ProjectTaskRestartPolicy;
}

/**
 * Project default task config
 */
export interface ProjectDefaultTaskConfig
  extends ProjectTaskConfig<TaskOptions> {
  type?: ProjectTaskType.DEFAULT;
}

/**
 * Project action base
 */
export interface ProjectActionBase<Options = unknown> {
  type: ProjectActionType;
  options: Options;
}

/**
 * Project action emit event
 */
export interface ProjectActionEmitEvent
  extends ProjectActionBase<{
    event: string;
  }> {
  type: ProjectActionType.EMIT_EVENT;
}

/**
 * Project action process task
 */
export interface ProjectActionProcessTask
  extends ProjectActionBase<{
    taskId: string;
  }> {
  type:
    | ProjectActionType.START_TASK
    | ProjectActionType.RESTART_TASK
    | ProjectActionType.STOP_TASK;
}

/**
 * Project action stop project
 */
export interface ProjectActionStopProject extends ProjectActionBase<never> {
  type: ProjectActionType.STOP_PROJECT;
}

/**
 * Project action toggle trigger
 */
export interface ProjectActionToggleTrigger
  extends ProjectActionBase<{
    triggerId: string;
  }> {
  type: ProjectActionType.ENABLE_TRIGGER | ProjectActionType.DISABLE_TRIGGER;
}

/**
 * Project custom action
 */
export type ProjectCustomAction = ProjectActionBase;

/**
 * Project action
 */
export type ProjectAction =
  | ProjectCustomAction
  | ProjectActionEmitEvent
  | ProjectActionProcessTask
  | ProjectActionStopProject
  | ProjectActionToggleTrigger;

/**
 * Project trigger type
 */
export enum ProjectTriggerType {
  EVENT = 'event',
  TIMEOUT = 'timeout',
  INTERVAL = 'interval',
}

/**
 * Project trigger base
 */
interface ProjectTriggerBase<T = unknown> {
  id: string;
  type: ProjectTriggerType | string;
  action: ProjectAction;
  disabled?: boolean;
  options: T;
}

/**
 * Project trigger event
 */
export interface ProjectTriggerEvent
  extends ProjectTriggerBase<{
    event: string;
  }> {
  type: ProjectTriggerType.EVENT;
}

/**
 * Project trigger interval
 */
export interface ProjectTriggerInterval
  extends ProjectTriggerBase<{
    interval: number;
  }> {
  type: ProjectTriggerType.INTERVAL;
}

/**
 * Project trigger timeout
 */
export interface ProjectTriggerTimeout
  extends ProjectTriggerBase<{
    timeout: number;
  }> {
  type: ProjectTriggerType.TIMEOUT;
}

/**
 * Project custom trigger
 */
export type ProjectCustomTrigger = ProjectTriggerBase<{ options: unknown }>;

/**
 * Project trigger
 */
export type ProjectTrigger =
  | ProjectTriggerEvent
  | ProjectTriggerInterval
  | ProjectTriggerTimeout
  | ProjectCustomTrigger;

/**
 * Project task restart policy type
 */
export enum ProjectTaskRestartPolicyType {
  ALWAYS = 'always',
  ON_FAILURE = 'on-failure',
}

/**
 * Project task restart policy always
 */
export interface ProjectTaskRestartPolicyAlways {
  policy: ProjectTaskRestartPolicyType.ALWAYS;
  delay?: number;
}

/**
 * Project task restart policy on failure
 */
export interface ProjectTaskRestartPolicyOnFailure {
  policy: ProjectTaskRestartPolicyType.ON_FAILURE;
  delay?: number;
  maxRetries?: number;
}

/**
 * Project task restart policy
 */
export type ProjectTaskRestartPolicy =
  | ProjectTaskRestartPolicyAlways
  | ProjectTaskRestartPolicyOnFailure;

/**
 * Project config
 */
export interface ProjectConfig {
  id: string;
  name?: string;
  description?: string;
  tasks: ProjectTaskConfig[];
  triggers?: ProjectTrigger[];
}

/**
 * Project config error codes
 */
export enum ProjectConfigErrorCode {
  INCORRECT_DATA = 'project-config-incorrect-data',
  TASKS_CIRCULAR_DEPENDENCY = 'project-config-tasks-circular-dependency',
  TASK_NOT_EXISTS = 'project-config-task-not-exists',
  TRIGGER_NOT_EXISTS = 'project-config-trigger-not-exists',
}

/**
 * Process task action types
 */
const PROCESS_TASK_ACTION_TYPES = new Set<ProjectActionType>([
  ProjectActionType.START_TASK,
  ProjectActionType.RESTART_TASK,
  ProjectActionType.STOP_TASK,
]);

/**
 * Toggle trigger action types
 */
const TOGGLE_TRIGGER_ACTION_TYPES = new Set<ProjectActionType>([
  ProjectActionType.ENABLE_TRIGGER,
  ProjectActionType.DISABLE_TRIGGER,
]);

/**
 * Runium action types
 */
const RUNIUM_ACTION_TYPES = new Set(Object.values(ProjectActionType));

/**
 * Runium trigger types
 */
const RUNIUM_TRIGGER_TYPES = new Set(Object.values(ProjectTriggerType));

/**
 * Is process task action guard
 * @param action
 */
export function isProcessTaskAction(
  action: ProjectAction
): action is ProjectActionProcessTask {
  return PROCESS_TASK_ACTION_TYPES.has(action.type as ProjectActionType);
}

/**
 * Is toggle trigger action guard
 * @param action
 */
export function isToggleTriggerAction(
  action: ProjectAction
): action is ProjectActionToggleTrigger {
  return TOGGLE_TRIGGER_ACTION_TYPES.has(action.type as ProjectActionType);
}

/**
 * Is custom action guard
 * @param action
 */
export function isCustomAction(
  action: ProjectAction
): action is ProjectCustomAction {
  return !RUNIUM_ACTION_TYPES.has(action.type as ProjectActionType);
}

/**
 * Is custom trigger guard
 * @param trigger
 */
export function isCustomTrigger(
  trigger: ProjectTrigger
): trigger is ProjectCustomTrigger {
  return !RUNIUM_TRIGGER_TYPES.has(trigger.type as ProjectTriggerType);
}

const ajv = new Ajv({ allowUnionTypes: true, allErrors: true, verbose: true });
ajvKeywords(ajv, ['uniqueItemProperties']);

/**
 * Validate project schema
 * @param project
 * @param schema
 */
function validateSchema(project: ProjectConfig, schema: object): void {
  const validate = ajv.compile(schema || {});
  const result = validate(project);
  if (!result) {
    throw new RuniumError(
      'Incorrect project config data',
      ProjectConfigErrorCode.INCORRECT_DATA,
      {
        errors: validate.errors,
      }
    );
  }
}

/**
 * Detect cycles in dependencies
 * @param deps
 */
function detectCycles(deps: Map<string, string[]>) {
  const visited: Set<string> = new Set();
  const stack: Set<string> = new Set();

  const dfs = (node: string) => {
    if (stack.has(node)) {
      const cycle = [...stack, node].join(' -> ');
      throw new RuniumError(
        `Project config tasks circular dependency detected ${cycle}`,
        ProjectConfigErrorCode.TASKS_CIRCULAR_DEPENDENCY,
        {
          task: node,
          dependencies: [...stack],
        }
      );
    }
    if (visited.has(node)) return;

    stack.add(node);
    for (const neighbor of deps.get(node) || []) {
      dfs(neighbor);
    }
    stack.delete(node);
    visited.add(node);
  };

  for (const node of deps.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }
}

/**
 * Validate existing elements
 * @param project
 */
function validateExistingElements(project: ProjectConfig): void {
  // task dependencies graph
  const deps: Map<string, string[]> = new Map();

  // task ids
  const taskIds: Set<string> = new Set();
  for (const task of project.tasks) {
    taskIds.add(task.id);
    deps.set(task.id, []);
  }

  const triggerIds: Set<string> = new Set(
    project.triggers?.map(t => t.id) || []
  );

  // check every task dependencies, handler actions use existing task and existing triggers
  for (const task of project.tasks) {
    for (const dependency of task.dependencies || []) {
      if (!taskIds.has(dependency.taskId)) {
        throw new RuniumError(
          `Task "${task.id}" depends on not existing task "${dependency.taskId}"`,
          ProjectConfigErrorCode.TASK_NOT_EXISTS,
          {
            taskId: task.id,
            dependency: { ...dependency },
            scope: 'dependencies',
          }
        );
      }
      deps.get(dependency.taskId)!.push(task.id);
    }

    for (const handler of task.handlers || []) {
      if (
        isProcessTaskAction(handler.action) &&
        !taskIds.has(handler.action.options.taskId)
      ) {
        throw new RuniumError(
          `Task "${task.id}" handler action uses not existing task "${handler.action.options.taskId}"`,
          ProjectConfigErrorCode.TASK_NOT_EXISTS,
          {
            taskId: task.id,
            handler: { ...handler },
            scope: 'handlers',
          }
        );
      } else if (
        isToggleTriggerAction(handler.action) &&
        !triggerIds.has(handler.action.options.triggerId)
      ) {
        throw new RuniumError(
          `Task "${task.id}" handler action uses not existing trigger "${handler.action.options.triggerId}"`,
          ProjectConfigErrorCode.TRIGGER_NOT_EXISTS,
          {
            taskId: task.id,
            handler: { ...handler },
            scope: 'handlers',
          }
        );
      }
    }
  }

  // check project triggers use existing tasks and triggers
  for (const trigger of project.triggers || []) {
    if (
      isProcessTaskAction(trigger.action) &&
      !taskIds.has(trigger.action.options.taskId)
    ) {
      throw new RuniumError(
        `Trigger "${trigger.id}" action uses not existing task "${trigger.action.options.taskId}"`,
        ProjectConfigErrorCode.TASK_NOT_EXISTS,
        {
          trigger: { ...trigger },
          scope: 'triggers',
        }
      );
    } else if (
      isToggleTriggerAction(trigger.action) &&
      !triggerIds.has(trigger.action.options.triggerId)
    ) {
      throw new RuniumError(
        `Trigger "${trigger.id}" action uses not existing trigger "${trigger.action.options.triggerId}"`,
        ProjectConfigErrorCode.TRIGGER_NOT_EXISTS,
        {
          trigger: { ...trigger },
          scope: 'triggers',
        }
      );
    }
  }

  // detect circular and non unique dependencies
  detectCycles(deps);
}

/**
 * Validate project
 * @param project
 * @param schema
 */
export function validateProject(project: ProjectConfig, schema: object): void {
  // validate schema
  validateSchema(project, schema);

  // validate existing elements
  validateExistingElements(project);
}
