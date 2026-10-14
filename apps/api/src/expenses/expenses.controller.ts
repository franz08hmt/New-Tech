import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { CreateExpenseDto } from "./create-expense.dto.js";
import { ExpensesService } from "./expenses.service.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.expenses.list(req.principal);
  }

  @Post()
  create(@Body() input: CreateExpenseDto, @Req() req: AuthRequest) {
    return this.expenses.create(input, req.principal);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.expenses.remove(id, req.principal);
  }
}
