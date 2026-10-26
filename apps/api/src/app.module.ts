import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { AuthStore } from "./auth/auth-store.js";
import { AUTH_ADAPTER, AUTH_CONFIG, authConfig } from "./auth/auth-config.js";
import { SupabaseAuthAdapter } from "./auth/supabase-auth.adapter.js";
import { PilotAuthGuard } from "./auth/auth.guard.js";
import { FeedbackController } from "./feedback/feedback.controller.js";
import { FeedbackService } from "./feedback/feedback.service.js";
import { AssistantController } from "./assistant/assistant.controller.js";
import { AnswerReceiptService } from "./assistant/answer-receipt.service.js";
import { AssistantConversationController } from "./assistant/assistant-conversation.controller.js";
import { AssistantConversationService } from "./assistant/assistant-conversation.service.js";
import { AssistantService } from "./assistant/assistant.service.js";
import { GeminiService } from "./assistant/gemini.service.js";
import { GeminiEmbeddingService } from "./assistant/gemini-embedding.service.js";
import { RagRetrievalService } from "./assistant/rag-retrieval.service.js";
import { WorkspaceAssistantService } from "./assistant/workspace-assistant.service.js";
import { WorkspaceRecordsService } from "./assistant/workspace-records.service.js";
import { AiUsageService } from "./assistant/ai-usage.service.js";
import { AiAdmissionService } from "./assistant/ai-admission.service.js";
import { DatabaseService } from "./database/database.service.js";
import { AuthDatabaseService } from "./database/auth-database.service.js";
import { HealthController } from "./health/health.controller.js";
import { TasksController } from "./tasks/tasks.controller.js";
import { TasksService } from "./tasks/tasks.service.js";
import { DocumentsController } from "./documents/documents.controller.js";
import { DocumentsService } from "./documents/documents.service.js";
import { DocumentAccessService } from "./documents/document-access.service.js";
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
import { WorkspaceSearchController } from "./workspace-search/workspace-search.controller.js";
import { WorkspaceSearchService } from "./workspace-search/workspace-search.service.js";
import { StudyCoachController } from "./study-coach/study-coach.controller.js";
import { StudyCoachService } from "./study-coach/study-coach.service.js";
import { StudyFlashcardsController } from "./study-coach/study-flashcards.controller.js";
import { StudyFlashcardsService } from "./study-coach/study-flashcards.service.js";
import {
  SpeechController,
  SpeechAdmissionInterceptor,
} from "./speech/speech.controller.js";
import { SpeechService } from "./speech/speech.service.js";
import { AudioInspector } from "./speech/audio-inspector.js";
import { SpeechLimiter } from "./speech/speech-limiter.js";
import { LocalSpeechProvider } from "./speech/local-speech.provider.js";
import { AiUsageDashboardController } from "./admin/ai-usage-dashboard.controller.js";
import { AiUsageDashboardService } from "./admin/ai-usage-dashboard.service.js";
import { MembersController } from "./members/members.controller.js";
import { MembersService } from "./members/members.service.js";
import {
  localSpeechRuntimeProvider,
  localSpeechWorkerFactoryProvider,
} from "./speech/local-speech-runtime.js";
import { SPEECH_CONFIG, speechConfig } from "./speech/speech-config.js";
import { SPEECH_PROVIDER } from "./speech/speech.types.js";

@Module({
  controllers: [
    AuthController,
    FeedbackController,
    HealthController,
    TasksController,
    AssistantController,
    AssistantConversationController,
    DocumentsController,
    CoursesController,
    ExamsController,
    StudyPlansController,
    ExpensesController,
    WorkspaceSearchController,
    AiUsageDashboardController,
    MembersController,
    SpeechController,
    StudyCoachController,
    StudyFlashcardsController,
  ],
  providers: [
    AuthService,
    AuthStore,
    { provide: AUTH_CONFIG, useValue: authConfig },
    { provide: AUTH_ADAPTER, useClass: SupabaseAuthAdapter },
    { provide: APP_GUARD, useClass: PilotAuthGuard },
    FeedbackService,
    DatabaseService,
    AuthDatabaseService,
    TasksService,
    DocumentsService,
    DocumentAccessService,
    StorageService,
    PdfTextExtractorService,
    DocumentOcrService,
    DocumentIngestionService,
    CoursesService,
    ExamsService,
    StudyPlansService,
    ExpensesService,
    WorkspaceSearchService,
    AssistantService,
    AnswerReceiptService,
    AssistantConversationService,
    GeminiService,
    GeminiEmbeddingService,
    RagRetrievalService,
    WorkspaceRecordsService,
    WorkspaceAssistantService,
    AiUsageService,
    AiUsageDashboardService,
    MembersService,
    AiAdmissionService,
    StudyCoachService,
    StudyFlashcardsService,
    SpeechService,
    SpeechAdmissionInterceptor,
    AudioInspector,
    SpeechLimiter,
    { provide: SPEECH_CONFIG, useValue: speechConfig },
    localSpeechRuntimeProvider,
    localSpeechWorkerFactoryProvider,
    { provide: SPEECH_PROVIDER, useClass: LocalSpeechProvider },
  ],
})
export class AppModule {}
