import type { Expense, ExpenseCategory } from "@examate/contracts";

export type { ExpenseCategory };

/** The joined row and the public response share the contract shape. */
export type ExpenseRecord = Expense;

/**
 * The same categories as a runtime value, because class-validator's `@IsIn`
 * needs a real array. Pinned to the shared type in both directions, the way
 * taskStatuses is: `satisfies` rejects an unknown entry, and the alias below
 * fails to compile if one is left out.
 */
export const expenseCategories = [
  "books",
  "transport",
  "food",
  "supplies",
  "fees",
  "other",
] as const satisfies readonly ExpenseCategory[];

type AssertNever<T extends never> = T;
export type NoCategoryMissing = AssertNever<
  Exclude<ExpenseCategory, (typeof expenseCategories)[number]>
>;
