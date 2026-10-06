import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check() {
    try {
      await this.database.ping();
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException({
        status: "degraded",
        code: "DATABASE_UNAVAILABLE",
        message: "Database is unavailable. Please retry.",
      });
    }
  }
}
