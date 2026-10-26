import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  MaxLength,
} from "class-validator";
import type {
  GrantWorkspaceMemberRequest,
  InviteWorkspaceMemberRequest,
  PilotRole,
  UpdateWorkspaceMemberRequest,
} from "@examate/contracts";

const roles: PilotRole[] = ["manager", "member", "viewer"];

export class UpdateMemberDto implements UpdateWorkspaceMemberRequest {
  @IsOptional()
  @IsIn(roles)
  role?: PilotRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class GrantMemberDto implements GrantWorkspaceMemberRequest {
  @IsIn(roles)
  role!: PilotRole;
}

export class InviteMemberDto implements InviteWorkspaceMemberRequest {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(roles)
  role!: PilotRole;
}
