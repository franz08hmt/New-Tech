import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { CreateExpenseDto } from "./create-expense.dto.js";
import { ExpenseSearchQueryDto } from "./expense-search-query.dto.js";
import { ExpensesService } from "./expenses.service.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get("search")
  search(@Query() query: ExpenseSearchQueryDto, @Req() req: AuthRequest) {
    return this.expenses.search(req.principal, query);
  }

  @Get()
  list(@Req() req: AuthRequest) {
    return this.expenses.list(req.principal);
  }

  @Get(":id")
  getById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.expenses.getById(id, req.principal);
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
