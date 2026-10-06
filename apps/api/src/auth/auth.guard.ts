import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService, type AuthRequest } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { HealthController } from "../health/health.controller.js";
@Injectable()
export class PilotAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    // Explicit controllers only: no path regex or client-controlled bypass switch.
    if (
      context.getClass() === AuthController ||
      context.getClass() === HealthController
    )
      return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.principal = await this.auth.authenticate(req);
    return true;
  }
}
