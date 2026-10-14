import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ExamsService } from "../dist/exams/exams.service.js";
import { StudyPlansService } from "../dist/study-plans/study-plans.service.js";
import { ExpensesService } from "../dist/expenses/expenses.service.js";
import { DocumentsService } from "../dist/documents/documents.service.js";
import { FeedbackService } from "../dist/feedback/feedback.service.js";

const workspaceA = "22222222-2222-4222-8222-222222222222";
const workspaceB = "33333333-3333-4333-8333-333333333333";
const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: workspaceA,
  role: "member",
};
const ownCourseId = "44444444-4444-4444-8444-444444444444";
const outsideCourseId = "55555555-5555-4555-8555-555555555555";
const timestamp = "2026-10-13T00:00:00.000Z";

function insertedValues(sql, values) {
  const insert = sql.match(
    /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
  );
  assert.ok(insert, "fixture expects INSERT with named columns");
  const columns = insert[2].split(",").map((column) => column.trim());
  const expressions = insert[3].split(",");
  const row = {};
  columns.forEach((column, index) => {
    const expression = expressions[index].trim();
    const parameter = expression.match(/^\$(\d+)(?:::.*)?$/);
    if (parameter) row[column] = values[Number(parameter[1]) - 1];
    else {
      const literal = expression.match(/^'([^']*)'$/);
      assert.ok(
        literal,
        `fixture does not recognize INSERT expression ${expression}`,
      );
      row[column] = literal[1];
    }
  });
  return { table: insert[1], row };
}

function insertFixture(options = {}) {
  const queries = [],
    events = [],
    inserted = [],
    objects = new Map();
  let existingDocument;
  const database = {
    async query(sql, values = []) {
      queries.push({ sql, values: [...values] });
      if (/\bINSERT\s+INTO\b/i.test(sql)) {
        events.push("insert");
        const parsed = insertedValues(sql, values);
        const row = {
          id: randomUUID(),
          workspace_id: workspaceB,
          created_at: timestamp,
          updated_at: timestamp,
          processing_status: "pending",
          total_page_count: null,
          course_slug: null,
          course_name: null,
          course_code: null,
          ...parsed.row,
        };
        inserted.push({ table: parsed.table, row, columns: parsed.row });
        if (
          options.enforceCourseWorkspace &&
          row.course_id === outsideCourseId &&
          row.workspace_id !== workspaceB
        )
          throw Object.assign(
            new Error("private composite foreign-key detail"),
            { code: "23503" },
          );
        if (parsed.table === "assistant_feedback")
          row.created_at = new Date(timestamp);
        if (options.documentInsertError) {
          if (options.committedDocument) existingDocument = row;
          throw options.documentInsertError;
        }
        return { rows: [row] };
      }
      if (/\bFROM\s+documents\b/i.test(sql)) {
        events.push("find");
        if (options.documentLookupError) throw options.documentLookupError;
        return { rows: existingDocument ? [existingDocument] : [] };
      }
      throw new Error("Unhandled SQL in insert compatibility fixture");
    },
  };
  const storage = {
    async upload(key, bytes) {
      events.push("upload");
      objects.set(key, bytes);
    },
    async remove(key) {
      events.push("remove");
      objects.delete(key);
    },
  };
  return { database, storage, queries, events, inserted, objects };
}

function pdfFile() {
  const buffer = Buffer.from("%PDF-1.4\nfixture document\n%%EOF");
  return {
    originalname: "fixture.pdf",
    mimetype: "application/pdf",
    size: buffer.length,
    buffer,
  };
}

function feedbackInput() {
  return {
    answerId: randomUUID(),
    submissionId: randomUUID(),
    rating: "helpful",
    reasons: [],
    snapshot: {
      schemaVersion: 1,
      request: {
        mode: "general",
        operation: "question",
        question: "Fixture question",
      },
      response: {
        mode: "general",
        answer: "Fixture answer",
        answerable: true,
        reasonCode: "ANSWER_GENERATED",
        citations: [],
        ragEnabled: false,
        provider: "google",
        model: "fixture-model",
        promptVersion: "fixture-v1",
      },
    },
  };
}

const courseCreates = [
  {
    name: "exams",
    Service: ExamsService,
    input: {
      courseId: ownCourseId,
      topic: "Revision fixture",
      examDate: "2028-02-29",
      examTime: "09:00",
      room: "A101",
      revisionNote: "Review notes",
    },
    expected: {
      course_id: ownCourseId,
      topic: "Revision fixture",
      exam_date: "2028-02-29",
      exam_time: "09:00",
      room: "A101",
      revision_note: "Review notes",
    },
  },
  {
    name: "study_plans",
    Service: StudyPlansService,
    input: {
      courseId: ownCourseId,
      title: "Revision plan",
      detail: "Read fixture notes",
      dueDate: "2028-02-29",
      ownerName: "Fixture owner",
    },
    expected: {
      course_id: ownCourseId,
      title: "Revision plan",
      detail: "Read fixture notes",
      due_date: "2028-02-29",
      owner_name: "Fixture owner",
    },
  },
  {
    name: "expenses",
    Service: ExpensesService,
    input: {
      amount: 25000,
      description: "Fixture book",
      spentOn: "2028-02-29",
      category: "books",
      courseId: ownCourseId,
    },
    expected: {
      amount: 25000,
      description: "Fixture book",
      spent_on: "2028-02-29",
      category: "books",
      course_id: ownCourseId,
    },
  },
];

function assertWorkspaceInsert(fixture, table, expected = {}) {
  assert.equal(fixture.inserted.length, 1);
  const insert = fixture.inserted[0];
  assert.equal(insert.table, table);
  assert.ok(
    Object.hasOwn(insert.columns, "workspace_id"),
    "workspace_id must be explicitly bound in the INSERT",
  );
  assert.equal(insert.columns.workspace_id, workspaceA);
  for (const [column, value] of Object.entries(expected))
    assert.equal(insert.columns[column], value, column);
}

function hasSafeError(status, code) {
  return (error) => {
    assert.equal(error.getStatus?.(), status);
    const response = error.getResponse();
    assert.equal(response.code, code);
    assert.doesNotMatch(
      JSON.stringify(response),
      /private composite|workspace_id|23503|stack|SELECT/,
    );
    return true;
  };
}

for (const { name, Service, input, expected } of courseCreates) {
  test(`workspace INSERT compatibility: ${name} binds server workspace and preserves field values`, async () => {
    const fixture = insertFixture();
    const result = await new Service(fixture.database).create(
      { ...input, workspaceId: workspaceB },
      principal,
    );
    assertWorkspaceInsert(fixture, name, expected);
    assert.equal(result.id, fixture.inserted[0].row.id);
    assert.equal(fixture.queries.length, 1);
  });

  test(`workspace INSERT compatibility: ${name} rejects missing principal before SQL`, async () => {
    const fixture = insertFixture();
    await assert.rejects(
      new Service(fixture.database).create(input),
      hasSafeError(401, "AUTH_REQUIRED"),
    );
    assert.equal(fixture.queries.length, 0);
  });

  test(`workspace INSERT compatibility: ${name} cross-workspace course returns existing safe COURSE_NOT_FOUND`, async () => {
    const fixture = insertFixture({ enforceCourseWorkspace: true });
    await assert.rejects(
      new Service(fixture.database).create(
        { ...input, courseId: outsideCourseId },
        principal,
      ),
      hasSafeError(400, "COURSE_NOT_FOUND"),
    );
    assertWorkspaceInsert(fixture, name, { course_id: outsideCourseId });
    assert.equal(fixture.queries.length, 1);
  });
}

test("workspace INSERT compatibility: optional expense course stays null while workspace is bound", async () => {
  const fixture = insertFixture();
  const { courseId, ...input } = courseCreates[2].input;
  await new ExpensesService(fixture.database).create(input, principal);
  assertWorkspaceInsert(fixture, "expenses", { course_id: null });
});

test("workspace INSERT compatibility: viewer feedback remains allowed and binds trusted workspace", async () => {
  const fixture = insertFixture();
  const input = feedbackInput();
  const result = await new FeedbackService(fixture.database).create(input, {
    ...principal,
    role: "viewer",
  });
  assertWorkspaceInsert(fixture, "assistant_feedback", {
    answer_id: input.answerId,
    submission_id: input.submissionId,
    rating: "helpful",
  });
  assert.equal(result.id, fixture.inserted[0].row.id);
  assert.equal(result.createdAt, timestamp);
  assert.equal(fixture.queries.length, 1);
});

test("workspace INSERT compatibility: missing feedback principal is AUTH_REQUIRED before SQL", async () => {
  const fixture = insertFixture();
  await assert.rejects(
    new FeedbackService(fixture.database).create(feedbackInput()),
    hasSafeError(401, "AUTH_REQUIRED"),
  );
  assert.equal(fixture.queries.length, 0);
});

test("workspace INSERT compatibility: document upload binds workspace and preserves public receipt", async () => {
  const fixture = insertFixture();
  const result = await new DocumentsService(
    fixture.database,
    fixture.storage,
  ).upload(pdfFile(), ownCourseId, principal);
  assertWorkspaceInsert(fixture, "documents", {
    name: "fixture.pdf",
    course_id: ownCourseId,
    media_type: "application/pdf",
    storage_status: "stored",
  });
  assert.equal(result.id, fixture.inserted[0].row.id);
  assert.equal(result.name, "fixture.pdf");
  assert.equal(result.storage_key, undefined);
  assert.equal(result.index_quality, null);
  assert.deepEqual(fixture.events, ["upload", "insert"]);
  assert.equal(fixture.objects.size, 1);
});

test("workspace INSERT compatibility: document without course binds workspace with null course", async () => {
  const fixture = insertFixture();
  await new DocumentsService(fixture.database, fixture.storage).upload(
    pdfFile(),
    undefined,
    principal,
  );
  assertWorkspaceInsert(fixture, "documents", { course_id: null });
});

test("workspace INSERT compatibility: missing document principal fails before Storage and SQL", async () => {
  const fixture = insertFixture();
  await assert.rejects(
    new DocumentsService(fixture.database, fixture.storage).upload(
      pdfFile(),
      ownCourseId,
    ),
    hasSafeError(401, "AUTH_REQUIRED"),
  );
  assert.equal(fixture.queries.length, 0);
  assert.deepEqual(fixture.events, []);
  assert.equal(fixture.objects.size, 0);
});

test("workspace INSERT compatibility: cross-workspace document course confirms absence then cleans object before safe 400", async () => {
  const fixture = insertFixture({ enforceCourseWorkspace: true });
  await assert.rejects(
    new DocumentsService(fixture.database, fixture.storage).upload(
      pdfFile(),
      outsideCourseId,
      principal,
    ),
    hasSafeError(400, "COURSE_NOT_FOUND"),
  );
  assertWorkspaceInsert(fixture, "documents", { course_id: outsideCourseId });
  assert.deepEqual(fixture.events, ["upload", "insert", "find", "remove"]);
  assert.equal(fixture.objects.size, 0);
});

test("workspace INSERT compatibility: response-lost document INSERT preserves the reconciled committed object", async () => {
  const fixture = insertFixture({
    committedDocument: true,
    documentInsertError: Object.assign(
      new Error("synthetic lost database response"),
      { code: "ETIMEDOUT" },
    ),
  });
  const result = await new DocumentsService(
    fixture.database,
    fixture.storage,
  ).upload(pdfFile(), ownCourseId, principal);
  assert.equal(result.id, fixture.inserted[0].row.id);
  assert.deepEqual(fixture.events, ["upload", "insert", "find"]);
  assert.equal(fixture.objects.size, 1);
});

test("workspace INSERT compatibility: uncertain document reconciliation retains object and original error", async () => {
  const original = Object.assign(
    new Error("synthetic lost database response"),
    { code: "ETIMEDOUT" },
  );
  const fixture = insertFixture({
    documentInsertError: original,
    documentLookupError: new Error("synthetic lookup outage"),
  });
  await assert.rejects(
    new DocumentsService(fixture.database, fixture.storage).upload(
      pdfFile(),
      ownCourseId,
      principal,
    ),
    (error) => error === original,
  );
  assert.deepEqual(fixture.events, ["upload", "insert", "find"]);
  assert.equal(fixture.objects.size, 1);
});
