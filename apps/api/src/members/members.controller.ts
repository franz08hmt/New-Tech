import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  GrantMemberDto,
  InviteMemberDto,
  UpdateMemberDto,
} from "./members.dto.js";
import { MembersService } from "./members.service.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("workspace")
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get("members")
  list(@Req() req: AuthRequest) {
    return this.members.list(req.principal);
  }

  @Patch("members/:id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateMemberDto,
    @Req() req: AuthRequest,
  ) {
    return this.members.update(req.principal, id, input);
  }

  @Post("members/:id/grant")
  @HttpCode(200)
  grant(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: GrantMemberDto,
    @Req() req: AuthRequest,
  ) {
    return this.members.grant(req.principal, id, input.role);
  }

  @Post("invitations")
  @HttpCode(200)
  invite(@Body() input: InviteMemberDto, @Req() req: AuthRequest) {
    return this.members.invite(req.principal, input.email, input.role);
  }

  @Delete("invitations/:id")
  revoke(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.members.revoke(req.principal, id);
  }
}
