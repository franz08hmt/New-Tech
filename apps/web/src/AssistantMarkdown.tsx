import { Fragment, type ReactNode } from "react";

/*
 * The Markdown an assistant reply is written in, and nothing more.
 *
 * A model's output is not trusted markup, so this never reaches for
 * dangerouslySetInnerHTML: every element below is built by React from plain
 * strings, and anything this does not recognise — raw HTML, links, images,
 * tables — stays visible as the text it is. Links are left out on purpose: a
 * reply's [text](url) could point anywhere, including javascript:, and the
 * sources worth opening already come as citations.
 *
 * Supported: paragraphs with their line breaks, headings, bullet and numbered
 * lists (a numbered list keeps where it starts), **bold**, *italic* and
 * `code`.
 */

type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: string[] };

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim() || RULE.test(line)) {
      current = undefined;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
      current = undefined;
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      const item = numbered ? numbered[2] : bullet![1];
      if (current?.kind === "list" && current.ordered === ordered) {
        current.items.push(item);
      } else {
        current = {
          kind: "list",
          ordered,
          start: numbered ? Number(numbered[1]) : 1,
          items: [item],
        };
        blocks.push(current);
      }
      continue;
    }
    // An indented line under a list item continues that item.
    if (current?.kind === "list" && /^\s/.test(line)) {
      current.items[current.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (current?.kind === "paragraph") {
      current.lines.push(line.trim());
    } else {
      current = { kind: "paragraph", lines: [line.trim()] };
      blocks.push(current);
    }
  }
  return blocks;
}

// Emphasis must hug its text, so "2 ** 3" and "4 * 5" stay arithmetic.
const INLINE =
  /\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])(.+?)(?<=[^\s*])\*|`([^`]+)`/g;

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, strong, em, code] = match;
    const key = match.index;
    if (strong !== undefined)
      parts.push(<strong key={key}>{renderInline(strong)}</strong>);
    else if (em !== undefined) parts.push(<em key={key}>{em}</em>);
    else parts.push(<code key={key}>{code}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="assistant-md">
      {parseBlocks(text).map((block, index) => {
        if (block.kind === "heading")
          // Bold, not <h4>: a reply is one item in the conversation, and its
          // own headings would pile up in heading navigation with each answer.
          return (
            <p key={index} className="assistant-md-heading">
              <strong>{renderInline(block.text)}</strong>
            </p>
          );
        if (block.kind === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ));
          return block.ordered ? (
            <ol key={index} start={block.start}>
              {items}
            </ol>
          ) : (
            <ul key={index}>{items}</ul>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
