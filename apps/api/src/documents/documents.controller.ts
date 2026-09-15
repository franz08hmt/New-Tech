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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService, MAX_FILE_SIZE } from "./documents.service.js";
import type { PdfFile } from "./documents.service.js";
import {
  SetDocumentCourseDto,
  UploadDocumentDto,
} from "./set-document-course.dto.js";

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
        // Raised from 0 and 2 to carry exactly one text field, courseId,
        // alongside the file. Kept as tight as the feature allows: anything
        // beyond one extra part is still rejected by multer before Nest sees
        // it, so the upload endpoint cannot be used as a general form sink.
        fields: 1,
        parts: 3,
        fieldNameSize: 100,
      },
    }),
  )
  upload(@Body() input: UploadDocumentDto, @UploadedFile() file?: PdfFile) {
    return this.documents.upload(file, input.courseId);
  }
  @Get(":id/download")
  download(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.documents.download(id);
  }
  @Patch(":id/course")
  setCourse(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: SetDocumentCourseDto,
  ) {
    return this.documents.setCourse(id, input.courseId);
  }
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.documents.remove(id);
  }
}
