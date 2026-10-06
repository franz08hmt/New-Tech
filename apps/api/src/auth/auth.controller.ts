import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import type { PilotLoginRequest } from "@examate/contracts";
import {
  AuthService,
  type AuthRequest,
  type AuthResponse,
} from "./auth.service.js";
export class LoginDto implements PilotLoginRequest {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(1024) password: string;
}
export class EmptyAuthDto {}
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Get("session") session(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: AuthResponse,
  ) {
    return this.auth.session(req, res);
  }
  @Post("login") @HttpCode(200) login(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: AuthResponse,
    @Body() body: LoginDto,
  ) {
    return this.auth.login(req, res, body.email, body.password);
  }
  @Post("logout") @HttpCode(200) logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: AuthResponse,
    @Body() _body: EmptyAuthDto,
  ) {
    return this.auth.logout(req, res);
  }
  @Post("refresh") @HttpCode(200) refresh(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: AuthResponse,
    @Body() _body: EmptyAuthDto,
  ) {
    return this.auth.refresh(req, res);
  }
}
