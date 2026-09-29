import { Fragment } from "react";

// Highlights the tokens inside one raw log line that most help a human
// scanning fast: HTTP-style status codes (200 green, 3xx sky, 4xx amber,
// 5xx red) and common level keywords (ERROR/FATAL red, WARN amber,
// SUCCESS/OK/INFO green-ish) -- independent of the line's own overall
// LogSeverity classification (that's a per-line badge; this is per-token
// within the line itself, e.g. a HEALTHY line that still mentions a 500
// somewhere in a stack trace).
const TOKEN_SOURCE =
  "\\b(1\\d\\d|2\\d\\d|3\\d\\d|4\\d\\d|5\\d\\d)\\b|\\b(ERROR|FATAL|PANIC|CRITICAL)\\b|\\b(WARN|WARNING)\\b|\\b(SUCCESS|SUCCEEDED|OK|HEALTHY)\\b|\\b(INFO|DEBUG)\\b";

function classFor(match: string): string {
  const upper = match.toUpperCase();
  if (/^[1-5]\d\d$/.test(match)) {
    const first = match[0];
    if (first === "2") return "text-emerald-400 font-semibold";
    if (first === "3") return "text-sky-400 font-semibold";
    if (first === "4") return "text-amber-400 font-semibold";
    return "text-red-400 font-semibold"; // 1xx/5xx
  }
  if (["ERROR", "FATAL", "PANIC", "CRITICAL"].includes(upper)) return "text-red-400 font-semibold";
  if (["WARN", "WARNING"].includes(upper)) return "text-amber-400 font-semibold";
  if (["SUCCESS", "SUCCEEDED", "OK", "HEALTHY"].includes(upper)) return "text-emerald-400 font-semibold";
  return "text-slate-400";
}

export function ColorizedLogLine({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  // A fresh RegExp per call (rather than a shared module-level one) --
  // the `g` flag makes exec() stateful via .lastIndex, which must never
  // be a value shared across renders/instances.
  const pattern = new RegExp(TOKEN_SOURCE, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={i++}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    nodes.push(
      <span key={i++} className={classFor(match[0])}>
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={i++}>{text.slice(lastIndex)}</Fragment>);
  }
  return <>{nodes}</>;
}
