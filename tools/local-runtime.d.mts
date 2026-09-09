import type { ChildProcess, ExecFileSyncOptions, SpawnOptions } from "node:child_process";

export const rootDir: string;
export const clientDir: string;
export const workerDir: string;
export const workerConfig: string;
export const localStateDir: string;
export const viteCli: string;
export const wranglerCli: string;

export function ensureDevVars(): void;
export function runWrangler(args: string[], options?: ExecFileSyncOptions): Buffer;
export function runLocalWrangler(args: string[], options?: ExecFileSyncOptions): Buffer;
export function startVite(command: string, args: string[], options?: SpawnOptions): ChildProcess;
