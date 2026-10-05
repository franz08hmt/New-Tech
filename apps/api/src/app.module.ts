import { Module } from "@nestjs/common";
import { FeedbackController } from "./feedback/feedback.controller.js";
import { FeedbackService } from "./feedback/feedback.service.js";
import { AssistantController } from "./assistant/assistant.controller.js";
import { AssistantService } from "./assistant/assistant.service.js";
import { GeminiService } from "./assistant/gemini.service.js";
import { GeminiEmbeddingService } from "./assistant/gemini-embedding.service.js";
import { RagRetrievalService } from "./assistant/rag-retrieval.service.js";
import { WorkspaceAssistantService } from "./assistant/workspace-assistant.service.js";
import { WorkspaceRecordsService } from "./assistant/workspace-records.service.js";
import { DatabaseService } from "./database/database.service.js";
import { HealthController } from "./health/health.controller.js";
import { TasksController } from "./tasks/tasks.controller.js";
import { TasksService } from "./tasks/tasks.service.js";
import { DocumentsController } from "./documents/documents.controller.js";
import { DocumentsService } from "./documents/documents.service.js";
import { StorageService } from "./documents/storage.service.js";
import { PdfTextExtractorService } from "./documents/pdf-text-extractor.service.js";
import { DocumentIngestionService } from "./documents/document-ingestion.service.js";
import { DocumentOcrService } from "./documents/document-ocr.service.js";
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
    FeedbackController,
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
    FeedbackService,
    DatabaseService,
    TasksService,
    DocumentsService,
    StorageService,
    PdfTextExtractorService,
    DocumentOcrService,
    DocumentIngestionService,
    CoursesService,
    ExamsService,
    StudyPlansService,
    ExpensesService,
    AssistantService,
    GeminiService,
    GeminiEmbeddingService,
    RagRetrievalService,
    WorkspaceRecordsService,
    WorkspaceAssistantService,
  ],
})
export class AppModule {}
