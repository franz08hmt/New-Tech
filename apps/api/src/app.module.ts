import { Module } from "@nestjs/common";
import { AssistantController } from "./assistant/assistant.controller.js";
import { DatabaseService } from "./database/database.service.js";
import { HealthController } from "./health/health.controller.js";
import { TasksController } from "./tasks/tasks.controller.js";
import { TasksService } from "./tasks/tasks.service.js";

@Module({
  controllers: [HealthController, TasksController, AssistantController],
  providers: [DatabaseService, TasksService],
})
export class AppModule {}
