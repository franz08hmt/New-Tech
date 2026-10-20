import { Controller, Get, Query, Req } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.service.js";
import { WorkspaceSearchQueryDto } from "./workspace-search-query.dto.js";
import { WorkspaceSearchService } from "./workspace-search.service.js";

@Controller("search")
export class WorkspaceSearchController {
  constructor(private readonly searchService: WorkspaceSearchService) {}

  @Get()
  search(@Query() query: WorkspaceSearchQueryDto, @Req() request: AuthRequest) {
    return this.searchService.search(request.principal, query);
  }
}
