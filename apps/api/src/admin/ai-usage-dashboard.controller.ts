import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import type { PilotPrincipal } from "@examate/contracts";
import type { AuthRequest } from "../auth/auth.service.js";
import { AiUsageDashboardService } from "./ai-usage-dashboard.service.js";
import {
  parseAiUsageCallsQuery,
  parseAiUsageCostBreakdownQuery,
  parseAiUsageDashboardQuery,
} from "./ai-usage-dashboard-query.js";

@Controller("admin/ai-usage")
export class AiUsageDashboardController {
  constructor(private readonly service: AiUsageDashboardService) {}

  @Get()
  overview(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.overview(
      req.principal as PilotPrincipal | undefined,
      parseAiUsageDashboardQuery(query),
    );
  }

  @Get("cost-breakdown")
  costBreakdown(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.costBreakdown(
      req.principal as PilotPrincipal | undefined,
      parseAiUsageCostBreakdownQuery(query),
    );
  }

  @Get("operations/:operationId/calls")
  calls(
    @Req() req: AuthRequest,
    @Param("operationId") operationId: string,
    @Query() query: unknown,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        operationId,
      )
    )
      throw new BadRequestException({
        code: "AI_USAGE_QUERY_INVALID",
        message: "Yêu cầu xem provider calls không hợp lệ.",
      });
    return this.service.providerCalls(
      req.principal as PilotPrincipal | undefined,
      operationId,
      parseAiUsageCallsQuery(query),
    );
  }
}
