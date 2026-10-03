// Server-sent events over fetch streaming (not EventSource: we need the
// Authorization header, the 401/403 status and our own reconnect policy).

export type SseMessage =
  | { kind: "event"; event: string; data: string; id?: string }
  | { kind: "comment"; text: string };

/**
 * Incremental SSE parser (WHATWG event-stream format). Feed it text chunks
 * split anywhere, including between "\r" and "\n" or inside a field.
 */
export class SseParser {
  private buffer = "";
  /** A chunk ended with "\r": swallow a "\n" at the start of the next one. */
  private skipLf = false;
  private event = "";
  private data: string[] = [];
  private id: string | undefined;

  push(chunk: string): SseMessage[] {
    const out: SseMessage[] = [];
    let text = chunk;
    if (this.skipLf && text.startsWith("\n")) text = text.slice(1);
    this.skipLf = false;
    this.buffer += text;

    for (;;) {
      const idx = this.buffer.search(/[\r\n]/);
      if (idx < 0) break;
      const line = this.buffer.slice(0, idx);
      let next = idx + 1;
      if (this.buffer[idx] === "\r") {
        if (next < this.buffer.length) {
          if (this.buffer[next] === "\n") next++;
        } else {
          this.skipLf = true;
        }
      }
      this.buffer = this.buffer.slice(next);
      this.line(line, out);
    }
    return out;
  }

  private line(line: string, out: SseMessage[]): void {
    if (line === "") {
      // Dispatch.
      if (this.data.length > 0) {
        out.push({
          kind: "event",
          event: this.event || "message",
          data: this.data.join("\n"),
          ...(this.id !== undefined ? { id: this.id } : {}),
        });
      }
      this.event = "";
      this.data = [];
      return;
    }
    if (line.startsWith(":")) {
      out.push({ kind: "comment", text: line.slice(1).trimStart() });
      return;
    }
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        this.event = value;
        break;
      case "data":
        this.data.push(value);
        break;
      case "id":
        if (!value.includes("\0")) this.id = value;
        break;
      // "retry" and unknown fields are ignored: we use our own backoff.
    }
  }
}
