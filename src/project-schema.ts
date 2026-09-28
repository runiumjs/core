import {
  ProjectActionType,
  ProjectTaskRestartPolicyType,
  ProjectTaskStartMode,
  ProjectTaskType,
  ProjectTriggerType,
} from './project-config';
import { TaskStatus } from './task';
import { RuniumError } from './error';

interface ProjectSchema {
  properties: {
    tasks: {
      items: {
        oneOf: { $ref: string }[];
      };
    };
  };
  required?: string[];
  $defs: Record<string, ProjectSchemaTask | ProjectSchemaAction | unknown> & {
    Runium_Action: {
      oneOf: { $ref: string }[];
    };
    Runium_Trigger: {
      oneOf: { $ref: string }[];
    };
  };
}

interface ProjectSchemaTask {
  type?: string;
  properties?: {
    type?: {
      const?: string;
    };
    [key: string]: unknown;
  };
  required?: string[];
  additionalProperties?: boolean;
}

interface ProjectSchemaAction {
  properties: {
    type: {
      const?: string;
      enum?: string[];
    };
  };
}

export interface ProjectSchemaExtensionCommon {
  properties: unknown;
  required?: string[];
}

export interface ProjectSchemaExtensionTask {
  type: string;
  options: unknown;
}

export interface ProjectSchemaExtensionTasks {
  '*'?: ProjectSchemaExtensionCommon;
  [key: string]:
    | ProjectSchemaExtensionTask
    | ProjectSchemaExtensionCommon
    | undefined;
}

export interface ProjectSchemaExtensionAction {
  type: string;
  options?: unknown;
}

export interface ProjectSchemaExtensionActions {
  '*'?: ProjectSchemaExtensionCommon;
  [key: string]:
    | ProjectSchemaExtensionAction
    | ProjectSchemaExtensionCommon
    | undefined;
}

export interface ProjectSchemaExtensionTrigger {
  type: string;
  options?: unknown;
}

export interface ProjectSchemaExtensionTriggers {
  '*'?: ProjectSchemaExtensionCommon;
  [key: string]:
    | ProjectSchemaExtensionTrigger
    | ProjectSchemaExtensionCommon
    | undefined;
}

export interface ProjectSchemaExtension {
  project?: ProjectSchemaExtensionCommon;
  tasks?: ProjectSchemaExtensionTasks;
  definitions?: Record<string, unknown>;
  actions?: ProjectSchemaExtensionActions;
  triggers?: ProjectSchemaExtensionTriggers;
}

export enum ProjectSchemaErrorCode {
  ACTION_TYPE_ALREADY_USED = 'project-schema-action-type-already-used',
  TASK_TYPE_ALREADY_USED = 'project-schema-task-type-already-used',
  TRIGGER_TYPE_ALREADY_USED = 'project-schema-trigger-type-already-used',
}

export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Task common properties
 */
const TASK_COMMON_PROPERTIES = {
  id: {
    type: 'string',
    pattern: ID_REGEX.source,
  },
  name: {
    type: 'string',
  },
  description: {
    type: 'string',
  },
  type: {
    type: 'string',
  },
  mode: {
    $ref: '#/$defs/Runium_TaskStartMode',
  },
  dependencies: {
    type: 'array',
    items: {
      $ref: '#/$defs/Runium_TaskDependency',
    },
  },
  handlers: {
    type: 'array',
    items: {
      $ref: '#/$defs/Runium_TaskHandler',
    },
  },
  restart: {
    $ref: '#/$defs/Runium_TaskRestartPolicy',
  },
};

/**
 * Trigger common properties
 */
const TRIGGER_COMMON_PROPERTIES = {
  id: {
    type: 'string',
    pattern: ID_REGEX.source,
  },
  action: {
    $ref: '#/$defs/Runium_Action',
  },
  disabled: {
    type: 'boolean',
  },
};

/**
 * Common properties key
 */
const COMMON_PROPERTIES_KEY = '*';

/**
 * Create task schema
 * @param type
 * @param options
 * @param common
 */
function createTaskSchema(
  type: string,
  options: unknown,
  common?: ProjectSchemaExtensionCommon
): object {
  const commonProperties = common
    ? (structuredClone(common.properties as Record<string, unknown>) as Record<
        string,
        unknown
      >)
    : {};
  const commonRequired = common?.required || [];
  return {
    type: 'object',
    properties: {
      ...commonProperties,
      ...structuredClone(TASK_COMMON_PROPERTIES),
      type: {
        const: type,
      },
      options: {
        ...structuredClone(options as object),
      },
    },
    required: Array.from(new Set(['id', 'options', ...commonRequired])),
    additionalProperties: false,
  };
}

/**
 * Create action schema
 * @param type
 * @param options
 * @param common
 */
function createActionSchema(
  type: string | string[],
  options?: unknown,
  common?: ProjectSchemaExtensionCommon
): object {
  const commonProperties = common
    ? (structuredClone(common.properties as Record<string, unknown>) as Record<
        string,
        unknown
      >)
    : {};
  const commonRequired = common?.required || [];
  const optionsProp = options ? { options } : {};
  const optionsRequired = options ? ['options'] : [];
  const typeProp = Array.isArray(type)
    ? {
        type: 'string',
        enum: type,
      }
    : {
        type: 'string',
        const: type,
      };
  return {
    type: 'object',
    properties: {
      ...commonProperties,
      type: typeProp,
      ...optionsProp,
    },
    required: Array.from(
      new Set(['type', ...optionsRequired, ...commonRequired])
    ),
    additionalProperties: false,
  };
}

/**
 * Create trigger schema
 * @param type
 * @param options
 * @param common
 */
function createTriggerSchema(
  type: string,
  options?: unknown,
  common?: ProjectSchemaExtensionCommon
): object {
  const commonProperties = common
    ? (structuredClone(common.properties as Record<string, unknown>) as Record<
        string,
        unknown
      >)
    : {};
  const commonRequired = common?.required || [];
  const optionsProp = options ? { options } : {};
  const optionsRequired = options ? ['options'] : [];
  return {
    type: 'object',
    properties: {
      ...commonProperties,
      ...structuredClone(TRIGGER_COMMON_PROPERTIES),
      type: {
        type: 'string',
        const: type,
      },
      ...optionsProp,
    },
    required: Array.from(
      new Set(['id', 'type', 'action', ...optionsRequired, ...commonRequired])
    ),
    additionalProperties: false,
  };
}

/**
 * Get project schema
 */
export function getProjectSchema(): object {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://example.com/schemas/project.json',
    title: 'Project',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        pattern: ID_REGEX.source,
      },
      name: {
        type: 'string',
      },
      description: {
        type: 'string',
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          discriminator: { propertyName: 'type' },
          properties: {
            type: {
              type: 'string',
            },
          },
          required: ['type'],
          oneOf: [
            {
              $ref: '#/$defs/Runium_TaskConfig',
            },
          ],
        },
        minItems: 1,
        uniqueItemProperties: ['id'],
      },
      triggers: {
        type: 'array',
        items: {
          $ref: '#/$defs/Runium_Trigger',
        },
        uniqueItemProperties: ['id'],
      },
    },
    required: ['id', 'tasks'],
    additionalProperties: false,
    $defs: {
      Runium_EnvValue: {
        type: ['string', 'number', 'boolean'],
      },
      Runium_Env: {
        type: 'object',
        additionalProperties: {
          $ref: '#/$defs/Runium_EnvValue',
        },
      },
      Runium_TaskStartMode: {
        type: 'string',
        enum: Object.values(ProjectTaskStartMode),
      },
      Runium_TaskHandler: {
        type: 'object',
        properties: {
          action: {
            $ref: '#/$defs/Runium_Action',
          },
          condition: {
            $ref: '#/$defs/Runium_TaskStateCondition',
          },
        },
        required: ['action', 'condition'],
        additionalProperties: false,
      },
      Runium_TaskStateCondition: {
        oneOf: [
          {
            type: 'string',
          },
          {
            type: 'boolean',
          },
          {
            $ref: '#/$defs/Runium_TaskState',
          },
        ],
      },
      Runium_TaskState: {
        type: 'object',
        properties: {
          status: {
            $ref: '#/$defs/Runium_TaskStatus',
          },
          iteration: {
            type: 'number',
            minimum: 0,
          },
          exitCode: {
            type: 'number',
            minimum: 0,
          },
          reason: {
            type: 'string',
          },
        },
        additionalProperties: false,
      },
      Runium_TaskStatus: {
        type: 'string',
        enum: Object.values(TaskStatus),
      },
      Runium_TaskDependency: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
          },
          condition: {
            $ref: '#/$defs/Runium_TaskStateCondition',
          },
        },
        required: ['taskId', 'condition'],
        additionalProperties: false,
      },
      Runium_Trigger: {
        type: 'object',
        discriminator: { propertyName: 'type' },
        oneOf: [
          {
            $ref: '#/$defs/Runium_TriggerEvent',
          },
          {
            $ref: '#/$defs/Runium_TriggerInterval',
          },
          {
            $ref: '#/$defs/Runium_TriggerTimeout',
          },
        ],
      },
      Runium_TriggerEvent: createTriggerSchema(ProjectTriggerType.EVENT, {
        type: 'object',
        properties: {
          event: {
            type: 'string',
          },
        },
        required: ['event'],
        additionalProperties: false,
      }),
      Runium_TriggerInterval: createTriggerSchema(ProjectTriggerType.INTERVAL, {
        type: 'object',
        properties: {
          interval: {
            type: 'number',
            minimum: 0,
          },
        },
        required: ['interval'],
        additionalProperties: false,
      }),
      Runium_TriggerTimeout: createTriggerSchema(ProjectTriggerType.TIMEOUT, {
        type: 'object',
        properties: {
          timeout: {
            type: 'number',
            minimum: 0,
          },
        },
        required: ['timeout'],
        additionalProperties: false,
      }),
      Runium_Action: {
        type: 'object',
        discriminator: { propertyName: 'type' },
        oneOf: [
          {
            $ref: '#/$defs/Runium_ActionEmitEvent',
          },
          {
            $ref: '#/$defs/Runium_ActionProcessTask',
          },
          {
            $ref: '#/$defs/Runium_ActionStopProject',
          },
          {
            $ref: '#/$defs/Runium_ActionToggleTrigger',
          },
        ],
      },
      Runium_ActionEmitEvent: createActionSchema(ProjectActionType.EMIT_EVENT, {
        type: 'object',
        properties: {
          event: {
            type: 'string',
          },
        },
        required: ['event'],
        additionalProperties: false,
      }),
      Runium_ActionProcessTask: createActionSchema(
        [
          ProjectActionType.START_TASK,
          ProjectActionType.RESTART_TASK,
          ProjectActionType.STOP_TASK,
        ],
        {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
            },
          },
          required: ['taskId'],
          additionalProperties: false,
        }
      ),
      Runium_ActionStopProject: createActionSchema(
        ProjectActionType.STOP_PROJECT
      ),
      Runium_ActionToggleTrigger: createActionSchema(
        [ProjectActionType.ENABLE_TRIGGER, ProjectActionType.DISABLE_TRIGGER],
        {
          type: 'object',
          properties: {
            triggerId: {
              type: 'string',
            },
          },
          required: ['triggerId'],
          additionalProperties: false,
        }
      ),
      Runium_TaskConfig: {
        ...createTaskSchema(ProjectTaskType.DEFAULT, {
          $ref: '#/$defs/Runium_TaskOptions',
        }),
      },
      Runium_TaskOptions: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
          },
          arguments: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          shell: {
            type: 'boolean',
          },
          cwd: {
            type: 'string',
          },
          envFile: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          env: {
            $ref: '#/$defs/Runium_Env',
          },
          ttl: {
            type: 'number',
          },
          log: {
            $ref: '#/$defs/Runium_TaskLog',
          },
          stopSignal: {
            type: 'string',
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
      Runium_TaskRestartPolicy: {
        oneOf: [
          {
            $ref: '#/$defs/Runium_TaskRestartPolicyAlways',
          },
          {
            $ref: '#/$defs/Runium_TaskRestartPolicyOnFailure',
          },
        ],
      },
      Runium_TaskRestartPolicyAlways: {
        type: 'object',
        required: ['policy'],
        properties: {
          policy: {
            const: ProjectTaskRestartPolicyType.ALWAYS,
          },
          delay: {
            type: 'number',
          },
        },
        additionalProperties: false,
      },
      Runium_TaskRestartPolicyOnFailure: {
        type: 'object',
        required: ['policy'],
        properties: {
          policy: {
            const: ProjectTaskRestartPolicyType.ON_FAILURE,
          },
          delay: {
            type: 'number',
          },
          maxRetries: {
            type: 'number',
          },
        },
        additionalProperties: false,
      },
      Runium_TaskLog: {
        type: 'object',
        properties: {
          stdout: {
            type: ['string', 'null'],
          },
          stderr: {
            type: ['string', 'null'],
          },
        },
        additionalProperties: false,
      },
    },
  };

  return Object.freeze(schema as object);
}

/**
 * Extend project schema
 * @param schema
 * @param extensions
 */
export function extendProjectSchema(
  schema: object,
  extensions: ProjectSchemaExtension
): object {
  let result = structuredClone(schema) as ProjectSchema;

  // extend project properties
  if (extensions.project) {
    result = extendProjectPropertiesSchema(result, extensions.project);
  }

  // extend definitions
  if (extensions.definitions) {
    result = extendDefinitionsSchema(result, extensions.definitions);
  }

  // extend tasks
  if (extensions.tasks) {
    result = extendTasksSchema(result, extensions.tasks);
  }

  // extend actions
  if (extensions.actions) {
    result = extendActionsSchema(result, extensions.actions);
  }

  // extend triggers
  if (extensions.triggers) {
    result = extendTriggersSchema(result, extensions.triggers);
  }

  return Object.freeze(result as object);
}

/**
 * Extend project properties schema
 * @param schema
 * @param extension
 */
function extendProjectPropertiesSchema(
  schema: ProjectSchema,
  extension: ProjectSchemaExtension['project']
): ProjectSchema {
  if (extension) {
    schema.properties = {
      ...((extension.properties || {}) as Record<string, unknown>),
      ...schema.properties,
    };
    schema.required = Array.from(
      new Set([...(schema.required ?? []), ...(extension.required ?? [])])
    );
  }
  return schema;
}

/**
 * Extend definitions schema
 * @param schema
 * @param extension
 */
function extendDefinitionsSchema(
  schema: ProjectSchema,
  extension: ProjectSchemaExtension['definitions']
): ProjectSchema {
  if (extension) {
    schema.$defs = {
      ...(extension as Record<string, unknown>),
      ...schema.$defs,
    };
  }
  return schema;
}

/**
 * Apply common properties to a list of schema definitions referenced by $ref
 * @param refs
 * @param definitions
 * @param common
 */
function applyCommonPropertiesToSchemas(
  refs: { $ref: string }[],
  definitions: ProjectSchema['$defs'],
  common?: ProjectSchemaExtensionCommon
): void {
  if (!common) {
    return;
  }

  const commonProperties = (common.properties as Record<string, unknown>) || {};
  const commonRequired = common.required || [];

  for (const ref of refs) {
    const defName = ref.$ref.split('/').pop() || '';
    const defSchema = definitions[defName] as ProjectSchemaTask | undefined;
    if (defSchema) {
      defSchema.properties = {
        ...structuredClone(commonProperties),
        ...(defSchema.properties || {}),
      };
      defSchema.required = Array.from(
        new Set([...(defSchema.required || []), ...commonRequired])
      );
    }
  }
}

/**
 * Extend tasks schema
 * @param schema
 * @param extension
 */
function extendTasksSchema(
  schema: ProjectSchema,
  extension: ProjectSchemaExtension['tasks']
): ProjectSchema {
  if (extension) {
    const common = extension[COMMON_PROPERTIES_KEY] as
      | ProjectSchemaExtensionCommon
      | undefined;

    // apply common task properties to all existing task types
    applyCommonPropertiesToSchemas(
      schema.properties.tasks.items.oneOf,
      schema.$defs,
      common
    );

    // check types uniqueness
    const taskTypes = new Set(
      schema.properties.tasks.items.oneOf.map(task => {
        const taskDef = task.$ref.split('/').pop() || '';
        return (
          (schema.$defs[taskDef] as ProjectSchemaTask)?.properties?.type
            ?.const || ProjectTaskType.DEFAULT
        );
      })
    );

    const tasks: Record<string, object> = {};
    for (const [key, value] of Object.entries(extension)) {
      if (key === COMMON_PROPERTIES_KEY) {
        continue;
      }

      const taskValue = value as ProjectSchemaExtensionTask;
      if (taskTypes.has(taskValue.type)) {
        throw new RuniumError(
          `Task type "${taskValue.type}" already used in project schema`,
          ProjectSchemaErrorCode.TASK_TYPE_ALREADY_USED,
          {
            type: taskValue.type,
          }
        );
      }
      tasks[key] = createTaskSchema(taskValue.type, taskValue.options, common);

      schema.properties.tasks.items.oneOf.push({
        $ref: `#/$defs/${key}`,
      });

      taskTypes.add(taskValue.type);
    }
    if (Object.keys(tasks).length) {
      schema.$defs = {
        ...tasks,
        ...schema.$defs,
      };
    }
  }
  return schema;
}

/**
 * Extend actions schema
 * @param schema
 * @param extension
 */
function extendActionsSchema(
  schema: ProjectSchema,
  extension: ProjectSchemaExtension['actions']
): ProjectSchema {
  if (extension) {
    const common = extension[COMMON_PROPERTIES_KEY] as
      | ProjectSchemaExtensionCommon
      | undefined;

    // apply common action properties to all existing action types
    applyCommonPropertiesToSchemas(
      schema.$defs.Runium_Action.oneOf,
      schema.$defs,
      common
    );

    // check types uniqueness
    const actionTypes = new Set(
      schema.$defs.Runium_Action.oneOf
        .map(action => {
          const actionDef = action.$ref.split('/').pop() || '';
          const actionType = (schema.$defs[actionDef] as ProjectSchemaAction)
            ?.properties?.type;
          return actionType?.enum || [actionType?.const];
        })
        .flat()
    );

    const actions: Record<string, object> = {};
    for (const [key, value] of Object.entries(extension)) {
      if (key === COMMON_PROPERTIES_KEY) {
        continue;
      }

      const actionValue = value as ProjectSchemaExtensionAction;
      if (actionTypes.has(actionValue.type)) {
        throw new RuniumError(
          `Action type "${actionValue.type}" already used in project schema`,
          ProjectSchemaErrorCode.ACTION_TYPE_ALREADY_USED,
          {
            type: actionValue.type,
          }
        );
      }

      actions[key] = createActionSchema(
        actionValue.type,
        actionValue.options,
        common
      );

      schema.$defs.Runium_Action.oneOf.push({
        $ref: `#/$defs/${key}`,
      });

      actionTypes.add(actionValue.type);
    }
    if (Object.keys(actions).length) {
      schema.$defs = {
        ...actions,
        ...schema.$defs,
      };
    }
  }
  return schema;
}

/**
 * Extend triggers schema
 * @param schema
 * @param extension
 */
function extendTriggersSchema(
  schema: ProjectSchema,
  extension: ProjectSchemaExtension['triggers']
): ProjectSchema {
  if (extension) {
    const common = extension[COMMON_PROPERTIES_KEY] as
      | ProjectSchemaExtensionCommon
      | undefined;

    // apply common trigger properties to all existing trigger types
    applyCommonPropertiesToSchemas(
      schema.$defs.Runium_Trigger.oneOf,
      schema.$defs,
      common
    );

    // check types uniqueness
    const triggerTypes = new Set(
      schema.$defs.Runium_Trigger.oneOf.map(trigger => {
        const triggerDef = trigger.$ref.split('/').pop() || '';
        const triggerType = (schema.$defs[triggerDef] as ProjectSchemaAction)
          ?.properties?.type;
        return triggerType?.const;
      })
    );

    const triggers: Record<string, object> = {};
    for (const [key, value] of Object.entries(extension)) {
      if (key === COMMON_PROPERTIES_KEY) {
        continue;
      }

      const triggerValue = value as ProjectSchemaExtensionTrigger;
      if (triggerTypes.has(triggerValue.type)) {
        throw new RuniumError(
          `Trigger type "${triggerValue.type}" already used in project schema`,
          ProjectSchemaErrorCode.TRIGGER_TYPE_ALREADY_USED,
          {
            type: triggerValue.type,
          }
        );
      }

      triggers[key] = createTriggerSchema(
        triggerValue.type,
        triggerValue.options,
        common
      );

      schema.$defs.Runium_Trigger.oneOf.push({
        $ref: `#/$defs/${key}`,
      });

      triggerTypes.add(triggerValue.type);
    }
    if (Object.keys(triggers).length) {
      schema.$defs = {
        ...triggers,
        ...schema.$defs,
      };
    }
  }
  return schema;
}
