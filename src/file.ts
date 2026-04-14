import { readFile, writeFile } from 'node:fs/promises';
import { RuniumError } from './error';

export type JSONValue = string | number | boolean | JSONObject | JSONValue[];

export interface JSONObject {
  [x: string]: JSONValue;
}

/**
 * File error codes
 */
export enum FileErrorCode {
  READ_JSON = 'file-read-json',
  WRITE_JSON = 'file-write-json',
}

/**
 * Reads a JSON file
 * @param path
 */
export async function readJsonFile<T = JSONValue>(path: string): Promise<T> {
  try {
    const data = await readFile(path, { encoding: 'utf-8' });
    return JSON.parse(data);
  } catch (ex) {
    throw new RuniumError(
      `Can not read JSON file ${path}`,
      FileErrorCode.READ_JSON,
      { path, original: ex }
    );
  }
}

/**
 * Writes a JSON file
 * @param path
 * @param data
 */
export async function writeJsonFile<T = JSONValue>(
  path: string,
  data: T
): Promise<void> {
  try {
    await writeFile(path, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
  } catch (ex) {
    throw new RuniumError(
      `Can not write JSON file ${path}`,
      FileErrorCode.WRITE_JSON,
      { path, data, original: ex }
    );
  }
}
