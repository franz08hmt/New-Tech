import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check() {
    try {
      const databaseLatencyMs = await this.database.ping();
      return {
        status: "ok",
        service: "examate-api",
        database: "connected",
        databaseLatencyMs,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "degraded",
        service: "examate-api",
        database: "unavailable",
        code: "DATABASE_UNAVAILABLE",
      });
    }
  }
}
