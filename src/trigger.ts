import { ProjectAction } from './project-config';

/**
 * Base runium trigger params
 */
export interface RuniumTriggerParams<Options = unknown> {
  id: string;
  action: ProjectAction;
  options: Options;
  disabled?: boolean;
}

/**
 * Base runium trigger project accessible interface
 */
export interface RuniumTriggerProjectAccessible {
  processAction(action: ProjectAction): void;
  on: NodeJS.EventEmitter['on'];
  off: NodeJS.EventEmitter['off'];
}

/**
 * Runium trigger constructor
 */
export type RuniumTriggerConstructor<Params extends RuniumTriggerParams> = new (
  params: Params,
  project: RuniumTriggerProjectAccessible
) => RuniumTrigger<Params>;

/**
 * Base runium trigger class
 */
export abstract class RuniumTrigger<Params extends RuniumTriggerParams> {
  protected project: RuniumTriggerProjectAccessible;
  protected id: string;
  protected action: ProjectAction;
  protected disabled: boolean;

  constructor(params: Params, project: RuniumTriggerProjectAccessible) {
    this.id = params.id;
    this.action = params.action;
    this.disabled = params.disabled ?? false;
    this.project = project;
  }

  abstract enable(): void;
  abstract disable(): void;

  /**
   * Get trigger id
   */
  getId(): string {
    return this.id;
  }

  /**
   * Check if trigger is disabled
   */
  isDisabled(): boolean {
    return this.disabled;
  }

  /**
   * Process action
   */
  processAction(): void {
    this.project.processAction(this.action);
  }
}

/**
 * Event trigger params
 */
export type EventTriggerParams = RuniumTriggerParams<{ event: string }>;

/**
 * Event trigger class
 */
export class EventTrigger extends RuniumTrigger<EventTriggerParams> {
  private readonly event: string;

  constructor(
    params: EventTriggerParams,
    project: RuniumTriggerProjectAccessible
  ) {
    super(params, project);
    this.event = params.options.event;
  }

  enable(): void {
    this.project.on(this.event, this.handler);
    this.disabled = false;
  }

  disable(): void {
    this.project.off(this.event, this.handler);
    this.disabled = true;
  }

  private handler = () => {
    this.processAction();
  };
}

/**
 * Interval trigger params
 */
export type IntervalTriggerParams = RuniumTriggerParams<{ interval: number }>;

/**
 * Interval trigger class
 */
export class IntervalTrigger extends RuniumTrigger<IntervalTriggerParams> {
  private readonly interval: number;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    params: IntervalTriggerParams,
    project: RuniumTriggerProjectAccessible
  ) {
    super(params, project);
    this.interval = params.options.interval;
  }

  enable(): void {
    this.intervalId = setInterval(() => {
      this.processAction();
    }, this.interval);
    this.disabled = false;
  }

  disable(): void {
    this.intervalId && clearInterval(this.intervalId);
    this.disabled = true;
    this.intervalId = null;
  }
}

/**
 * Timeout trigger params
 */
export type TimeoutTriggerParams = RuniumTriggerParams<{ timeout: number }>;

/**
 * Timeout trigger class
 */
export class TimeoutTrigger extends RuniumTrigger<TimeoutTriggerParams> {
  private readonly timeout: number;
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(
    params: TimeoutTriggerParams,
    project: RuniumTriggerProjectAccessible
  ) {
    super(params, project);
    this.timeout = params.options.timeout;
  }

  enable(): void {
    this.timeoutId = setTimeout(() => {
      this.processAction();
    }, this.timeout);
    this.disabled = false;
  }

  disable(): void {
    this.timeoutId && clearTimeout(this.timeoutId);
    this.disabled = true;
    this.timeoutId = null;
  }
}
