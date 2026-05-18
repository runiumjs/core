import { RuniumError } from './error';

export type Macro = (...params: string[]) => string;

export type MacrosCollection = Record<string, Macro>;

const UNWRAP_MACROS_PATTERN = String.raw`"\$unwrap\((.*)\)"`;

export enum MacrosErrorCode {
  MACRO_APPLY_ERROR = 'macro-apply-error',
}

/**
 * Apply unwrap macro recursively
 * @param value
 */
function unwrap(value: string): string {
  const unwrapRegex = new RegExp(UNWRAP_MACROS_PATTERN, 'g');

  let result = value;
  let hasUnwrap = true;

  while (hasUnwrap) {
    hasUnwrap = false;
    result = result.replace(unwrapRegex, (match: string, value: string) => {
      hasUnwrap = true;
      return value.trim();
    });
  }

  return result;
}

/**
 * Apply macros to a text
 * @param text
 * @param macros
 */
export function applyMacros(text: string, macros: MacrosCollection): string {
  const macrosNames = Object.keys(macros);

  const pattern = String.raw`\$(${macrosNames.join('|')})\(([^()]*(?:\([^()]*\)[^()]*)*)\)`;

  const apply = (data: string): string => {
    const macrosRegex = new RegExp(pattern, 'g');

    let result = data;

    let hasMacros = true;
    while (hasMacros) {
      hasMacros = false;
      result = unwrap(result);
      result = result.replace(
        macrosRegex,
        (match: string, type: string, args: string) => {
          hasMacros = true;

          const macroArgs: string[] = [];
          let depth = 0;
          let current = '';

          for (const char of args) {
            if (char === ',' && depth === 0) {
              macroArgs.push(current.trim());
              current = '';
            } else {
              if (char === '(') {
                depth++;
              }
              if (char === ')') {
                depth--;
              }
              current += char;
            }
          }
          macroArgs.push(current.trim());

          const values = macroArgs.map(arg => {
            return arg ? apply(arg) : '';
          });
          try {
            return macros[type](...values);
          } catch (ex) {
            throw new RuniumError(
              `Can not apply macro "${type}"`,
              MacrosErrorCode.MACRO_APPLY_ERROR,
              { type, args: macroArgs, original: ex }
            );
          }
        }
      );
    }

    return result;
  };

  return apply(text);
}
