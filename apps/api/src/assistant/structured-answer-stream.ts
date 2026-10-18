/**
 * Reads the `answer` string from Gemini's schema-constrained JSON stream.
 * Nothing is exposed until the model has explicitly said `answerable: true`.
 * The complete JSON is still parsed and validated by AssistantService before
 * the turn can finish or be saved as a conversation receipt.
 */
export class StructuredAnswerStream {
  private raw = "";
  private answerStart = -1;
  private cursor = -1;
  private decoded = "";
  private emitted = 0;
  private answerable = false;
  private answerClosed = false;

  push(chunk: string): string {
    this.raw += chunk;
    if (this.raw.length > 64_000)
      throw new Error("Structured assistant response exceeded its limit.");
    if (this.answerClosed) return "";

    if (this.answerStart < 0) {
      const answerable = /"answerable"\s*:\s*(true|false)\s*,/.exec(this.raw);
      if (!answerable) return "";
      this.answerable = answerable[1] === "true";
      if (!this.answerable) return "";
      const answer = /"answer"\s*:\s*"/.exec(
        this.raw.slice(answerable.index + answerable[0].length),
      );
      if (!answer) return "";
      this.answerStart =
        answerable.index +
        answerable[0].length +
        answer.index +
        answer[0].length;
      this.cursor = this.answerStart;
    }

    while (this.cursor < this.raw.length) {
      const character = this.raw[this.cursor]!;
      if (character === '"') {
        this.cursor++;
        this.answerClosed = true;
        break;
      }
      if (character.charCodeAt(0) < 0x20)
        throw new Error("Invalid control character in structured answer.");
      if (character !== "\\") {
        this.decoded += character;
        this.cursor++;
        continue;
      }

      if (this.cursor + 1 >= this.raw.length) break;
      const escape = this.raw[this.cursor + 1]!;
      const simpleEscapes: Record<string, string> = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      if (Object.hasOwn(simpleEscapes, escape)) {
        this.decoded += simpleEscapes[escape]!;
        this.cursor += 2;
        continue;
      }
      if (escape !== "u")
        throw new Error("Invalid escape in structured answer.");
      if (this.cursor + 6 > this.raw.length) break;
      const code = this.raw.slice(this.cursor + 2, this.cursor + 6);
      if (!/^[0-9a-f]{4}$/i.test(code))
        throw new Error("Invalid unicode escape in structured answer.");
      this.decoded += String.fromCharCode(Number.parseInt(code, 16));
      this.cursor += 6;
    }

    const result = this.decoded.slice(this.emitted);
    this.emitted = this.decoded.length;
    return result;
  }

  get completeRaw(): string {
    return this.raw;
  }

  get isAnswerable(): boolean {
    return this.answerable;
  }
}

/** Keeps citation markers out of the unverified live text. The completed,
 * validated response reintroduces the real markers after `done`. */
export class CitationMarkerStreamFilter {
  private pending = "";

  push(text: string): string {
    const combined = this.pending + text;
    this.pending = "";
    const candidateStart = combined.endsWith("[")
      ? combined.length - 1
      : combined.lastIndexOf("[S");
    let safe = combined;
    if (candidateStart >= 0 && combined.indexOf("]", candidateStart) < 0) {
      this.pending = combined.slice(candidateStart);
      safe = combined.slice(0, candidateStart);
    }
    return safe.replace(/\[S[^\]]*\]/g, "");
  }
}
