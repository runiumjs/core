import { exec } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

interface ProcessTreeNode {
  pid: number;
  children: ProcessTreeNode[];
  depth: number;
}

interface ProcessKillError extends Error {
  code?: string;
}

const PROCESS_CHECK_INTERVAL = 50;

const execAsync = promisify(exec);

/**
 * Get process tree for a given PID
 * @param pid
 */
async function getProcessTree(pid: number): Promise<ProcessTreeNode> {
  if (process.platform === 'win32') {
    return getProcessTreeWindows(pid);
  } else {
    return getProcessTreeUnix(pid);
  }
}

/**
 * Get process tree on Windows using WMIC
 * @param pid
 */
async function getProcessTreeWindows(pid: number): Promise<ProcessTreeNode> {
  try {
    const { stdout } = await execAsync(
      `wmic process where (ParentProcessId=${pid}) get ProcessId`,
      { windowsHide: true }
    );

    const lines = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    // remove header line
    const childPids = lines
      .slice(1)
      .map(line => parseInt(line, 10))
      .filter(p => !isNaN(p));

    const children: ProcessTreeNode[] = [];
    for (const childPid of childPids) {
      const childTree = await getProcessTreeWindows(childPid);
      children.push(childTree);
    }

    return {
      pid,
      children,
      depth: 0,
    };
  } catch (error) {
    // process might not exist or have no children
    return {
      pid,
      children: [],
      depth: 0,
    };
  }
}

/**
 * Build process tree recursively
 * @param currentPid
 * @param processMap
 */
function buildTree(
  currentPid: number,
  processMap: Map<number, number[]>
): ProcessTreeNode {
  const childPids = processMap.get(currentPid) || [];
  const children = childPids.map(childPid => buildTree(childPid, processMap));

  return {
    pid: currentPid,
    children,
    depth: 0,
  };
}

/**
 * Get process tree on Unix-like systems (Linux, macOS) using ps
 * @param pid
 */
async function getProcessTreeUnix(pid: number): Promise<ProcessTreeNode> {
  try {
    // use ps to get all processes with their parent PIDs
    const { stdout } = await execAsync('ps -eo pid,ppid');

    // skip header
    const lines = stdout.split('\n').slice(1);
    // ppid -> [child pids]
    const processMap = new Map<number, number[]>();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const childPid = parseInt(parts[0], 10);
        const parentPid = parseInt(parts[1], 10);

        if (!isNaN(childPid) && !isNaN(parentPid)) {
          if (!processMap.has(parentPid)) {
            processMap.set(parentPid, []);
          }
          processMap.get(parentPid)!.push(childPid);
        }
      }
    }

    return buildTree(pid, processMap);
  } catch (error) {
    // process might not exist or have no children
    return {
      pid,
      children: [],
      depth: 0,
    };
  }
}

/**
 * Calculate depth for each node in the tree
 * @param node
 * @param depth
 */
function calculateDepths(node: ProcessTreeNode, depth: number = 0): void {
  node.depth = depth;
  for (const child of node.children) {
    calculateDepths(child, depth + 1);
  }
}

/**
 * Flatten the tree and sort by depth (deepest first)
 * @param node
 */
function flattenTreeByDepth(node: ProcessTreeNode): ProcessTreeNode[] {
  const nodes: ProcessTreeNode[] = [];

  const traverse = (n: ProcessTreeNode): void => {
    nodes.push(n);
    for (const child of n.children) {
      traverse(child);
    }
  };

  traverse(node);

  // sort by depth descending (deepest first)
  return nodes.sort((a, b) => b.depth - a.depth);
}

/**
 * Check if a process is still running
 * @param pid
 */
function isProcessRunning(pid: number): boolean {
  try {
    // sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch (ex) {
    const error = ex as ProcessKillError;
    // ESRCH means process doesn't exist
    if (error.code === 'ESRCH') {
      return false;
    }
    // EPERM means process exists but we don't have permission
    return error.code === 'EPERM';
  }
}

/**
 * Kill a single process and wait for it to terminate
 * @param pid
 * @param signal
 * @param timeout
 */
async function killProcess(
  pid: number,
  signal: NodeJS.Signals = 'SIGTERM',
  timeout: number = 1000
): Promise<boolean> {
  if (!isProcessRunning(pid)) {
    return true;
  }

  try {
    process.kill(pid, signal);
  } catch (ex) {
    const error = ex as ProcessKillError;
    if (error.code === 'ESRCH') {
      return true;
    }
    throw error;
  }

  // wait for process to terminate
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    // wait before checking again
    await setTimeout(PROCESS_CHECK_INTERVAL);
  }

  const isStillRunning = isProcessRunning(pid);
  return !isStillRunning;
}

/**
 * Kill a process tree from bottom to top (children first, then parent)
 * @param pid
 * @param signal
 * @param forceSignal
 * @param timeout
 */
export async function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = 'SIGTERM',
  forceSignal: NodeJS.Signals = 'SIGKILL',
  timeout: number = 1000
): Promise<void> {
  const tree = await getProcessTree(pid);

  calculateDepths(tree);

  const processes = flattenTreeByDepth(tree);

  for (const node of processes) {
    if (!isProcessRunning(node.pid)) {
      continue;
    }

    // try graceful termination first
    const killed = await killProcess(node.pid, signal, timeout);

    if (!killed && isProcessRunning(node.pid)) {
      // force kill if graceful termination failed
      await killProcess(node.pid, forceSignal, timeout);
    }
  }
}

/**
 * Get all PIDs in a process tree
 * @param pid
 */
export async function getProcessTreePids(pid: number): Promise<number[]> {
  const tree = await getProcessTree(pid);
  const pids: number[] = [];

  const collectPids = (node: ProcessTreeNode): void => {
    pids.push(node.pid);
    for (const child of node.children) {
      collectPids(child);
    }
  };

  collectPids(tree);
  return pids;
}
