import { Module } from "@nestjs/common";
import { AssistantController } from "./assistant/assistant.controller.js";
import { AssistantService } from "./assistant/assistant.service.js";
import { GeminiService } from "./assistant/gemini.service.js";
import { DatabaseService } from "./database/database.service.js";
import { HealthController } from "./health/health.controller.js";
import { TasksController } from "./tasks/tasks.controller.js";
import { TasksService } from "./tasks/tasks.service.js";
import { DocumentsController } from "./documents/documents.controller.js";
import { DocumentsService } from "./documents/documents.service.js";
import { StorageService } from "./documents/storage.service.js";
import { CoursesController } from "./courses/courses.controller.js";
import { CoursesService } from "./courses/courses.service.js";
import { ExamsController } from "./exams/exams.controller.js";
import { ExamsService } from "./exams/exams.service.js";
import { StudyPlansController } from "./study-plans/study-plans.controller.js";
import { StudyPlansService } from "./study-plans/study-plans.service.js";
import { ExpensesController } from "./expenses/expenses.controller.js";
import { ExpensesService } from "./expenses/expenses.service.js";

@Module({
  controllers: [
    HealthController,
    TasksController,
    AssistantController,
    DocumentsController,
    CoursesController,
    ExamsController,
    StudyPlansController,
    ExpensesController,
  ],
  providers: [
    DatabaseService,
    TasksService,
    DocumentsService,
    StorageService,
    CoursesService,
    ExamsService,
    StudyPlansService,
    ExpensesService,
    AssistantService,
    GeminiService,
  ],
})
export class AppModule {}
