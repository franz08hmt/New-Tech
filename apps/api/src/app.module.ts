import { Module } from "@nestjs/common";
import { AssistantController } from "./assistant/assistant.controller.js";
import { DatabaseService } from "./database/database.service.js";
import { HealthController } from "./health/health.controller.js";
import { TasksController } from "./tasks/tasks.controller.js";
import { TasksService } from "./tasks/tasks.service.js";
import { DocumentsController } from "./documents/documents.controller.js";
import { DocumentsService } from "./documents/documents.service.js";
import { StorageService } from "./documents/storage.service.js";

@Module({
  controllers: [
    HealthController,
    TasksController,
    AssistantController,
    DocumentsController,
  ],
  providers: [DatabaseService, TasksService, DocumentsService, StorageService],
})
export class AppModule {}
