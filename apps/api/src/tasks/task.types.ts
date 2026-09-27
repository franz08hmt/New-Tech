import type { Task, TaskStatus } from "@examate/contracts";

export type { TaskStatus };

/**
 * A task row as it comes back from PostgreSQL.
 *
 * The stored row and the response body are the same shape today, so this is an
 * alias rather than a second declaration — the contract is the single source of
 * truth. If the table ever gains a column the API must not expose, this stops
 * being an alias and `tasks.service.ts` gains a mapper, the way documents
 * already do with `publicDocument`.
 */
export type TaskRecord = Task;

/**
 * The same statuses as a runtime value, because class-validator's `@IsIn`
 * needs an actual array — a type alone disappears at compile time.
 *
 * The two lines below make the compiler keep this list and `TaskStatus` in
 * step, in both directions:
 *  - `satisfies` rejects any entry that is not a TaskStatus.
 *  - `NoStatusMissing` fails to compile if a TaskStatus is left out, because
 *    `Exclude` would no longer be `never`.
 */
export const taskStatuses = [
  "todo",
  "in_progress",
  "done",
] as const satisfies readonly TaskStatus[];

type AssertNever<T extends never> = T;
export type NoStatusMissing = AssertNever<
  Exclude<TaskStatus, (typeof taskStatuses)[number]>
>;
