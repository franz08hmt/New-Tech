import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService, MAX_FILE_SIZE } from "./documents.service.js";
import type { PdfFile } from "./documents.service.js";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Get() list() {
    return this.documents.list();
  }
  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
        fields: 0,
        parts: 2,
        fieldNameSize: 100,
      },
    }),
  )
  upload(@UploadedFile() file?: PdfFile) {
    return this.documents.upload(file);
  }
  @Get(":id/download")
  download(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.documents.download(id);
  }
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.documents.remove(id);
  }
}
