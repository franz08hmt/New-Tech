import { ConfigurationError } from "../config/config.js";

export interface StudyCoachConfig {
  quizRetentionDays: number;
}

export function studyCoachConfig(): StudyCoachConfig {
  const raw = process.env.STUDY_COACH_QUIZ_RETENTION_DAYS ?? "90";
  if (!/^\d+$/.test(raw))
    throw new ConfigurationError(
      "Invalid configuration: STUDY_COACH_QUIZ_RETENTION_DAYS",
    );
  const quizRetentionDays = Number(raw);
  if (
    !Number.isSafeInteger(quizRetentionDays) ||
    quizRetentionDays < 30 ||
    quizRetentionDays > 90
  )
    throw new ConfigurationError(
      "Invalid configuration: STUDY_COACH_QUIZ_RETENTION_DAYS",
    );
  return { quizRetentionDays };
}
