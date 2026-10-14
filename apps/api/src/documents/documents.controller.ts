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
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService, MAX_FILE_SIZE } from "./documents.service.js";
import { DocumentIngestionService } from "./document-ingestion.service.js";
import type { PdfFile } from "./documents.service.js";
import type { AuthRequest } from "../auth/auth.service.js";
import {
  DownloadDocumentQueryDto,
  SetDocumentCourseDto,
  UploadDocumentDto,
} from "./set-document-course.dto.js";

@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly ingestion: DocumentIngestionService,
  ) {}
  @Get() list(@Req() req: AuthRequest) {
    return this.documents.list(req.principal);
  }
  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: AuthRequest) {
    return this.documents.get(id, req.principal);
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
  upload(
    @Body() input: UploadDocumentDto,
    @UploadedFile() file: PdfFile | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.documents.upload(file, input.courseId, req.principal);
  }
  @Post(":id/process")
  @HttpCode(200)
  process(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.ingestion.process(id, req.principal);
  }
  @Get(":id/download")
  download(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: DownloadDocumentQueryDto,
    @Req() req: AuthRequest,
  ) {
    return this.documents.download(
      id,
      {
        inline: query.disposition === "inline",
      },
      req.principal,
    );
  }
  @Patch(":id/course")
  setCourse(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: SetDocumentCourseDto,
    @Req() req: AuthRequest,
  ) {
    return this.documents.setCourse(id, input.courseId, req.principal);
  }
  @Delete(":id")
  @HttpCode(204)
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.documents.remove(id, req.principal);
  }
}
