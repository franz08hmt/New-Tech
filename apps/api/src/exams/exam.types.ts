import type { Exam } from "@examate/contracts";

/**
 * The joined row and the public response share the contract shape: every
 * column selected here is meant to reach the browser.
 */
export type ExamRecord = Exam;
