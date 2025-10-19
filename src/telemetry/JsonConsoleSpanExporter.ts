import { ExportResultCode, hrTimeToMilliseconds } from "@opentelemetry/core";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base/build/src/export/ReadableSpan";
import type { SpanKind } from "@opentelemetry/api";

interface SpanEventRecord {
  name: string;
  timeUnixMs: number;
  attributes: Record<string, unknown>;
}

interface SpanRecord {
  serviceName?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTimeUnixMs: number;
  endTimeUnixMs: number;
  durationMs: number;
  status: { code: number; message?: string };
  attributes: Record<string, unknown>;
  resource: Record<string, unknown>;
  instrumentationScope: { name: string; version?: string };
  events: SpanEventRecord[];
}

function kindToString(kind: SpanKind): string {
  switch (kind) {
    case 0:
      return "INTERNAL";
    case 1:
      return "SERVER";
    case 2:
      return "CLIENT";
    case 3:
      return "PRODUCER";
    case 4:
      return "CONSUMER";
    default:
      return "INTERNAL";
  }
}

function toRecord(span: ReadableSpan): SpanRecord {
  const startMs = hrTimeToMilliseconds(span.startTime);
  const endMs = hrTimeToMilliseconds(span.endTime);
  return {
    serviceName: (span.resource as any)?.attributes?.["service.name"],
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    parentSpanId: span.parentSpanContext?.spanId,
    name: span.name,
    kind: kindToString(span.kind),
    startTimeUnixMs: startMs,
    endTimeUnixMs: endMs,
    durationMs: hrTimeToMilliseconds(span.duration),
    status: { code: span.status.code, message: span.status.message },
    attributes: (span.attributes ?? {}) as Record<string, unknown>,
    resource:
      (span.resource as unknown as { attributes?: Record<string, unknown> })
        .attributes ?? {},
    instrumentationScope: {
      name: span.instrumentationScope.name,
      version: span.instrumentationScope.version,
    },
    events: span.events.map((e) => ({
      name: e.name,
      timeUnixMs: hrTimeToMilliseconds(e.time),
      attributes: (e.attributes ?? {}) as Record<string, unknown>,
    })),
  };
}

export class JsonConsoleSpanExporter implements SpanExporter {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: { code: ExportResultCode }) => void
  ): void {
    for (const span of spans) {
      const record = toRecord(span);
      // structured JSON log for Cloudflare Workers Logs
      console.log(record);
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }
  async shutdown(): Promise<void> {
    // nothing to close
  }
  async forceFlush(): Promise<void> {
    // no buffering
  }
}
