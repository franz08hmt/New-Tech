import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { CreateExpenseDto } from "./create-expense.dto.js";
import { ExpensesService } from "./expenses.service.js";

@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list() {
    return this.expenses.list();
  }

  @Post()
  create(@Body() input: CreateExpenseDto) {
    return this.expenses.create(input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.expenses.remove(id);
  }
}
