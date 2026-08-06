// src/lib/observability/langfuse/client.ts
// OTel initialization with custom REST JSON exporter (avoids OTLP protobuf issues).
import "server-only";

import { getLangfuseConfig, isLangfuseReady } from "./config";
import { VerseCraftSpanExporter } from "./restExporter";

let _provider: import("@opentelemetry/sdk-trace-node").NodeTracerProvider | null = null;

/**
 * Initialize Langfuse OTel tracing using a custom REST JSON exporter.
 * Must be called ONCE at process startup (from instrumentation.ts).
 * No-op if Langfuse is not configured or enabled.
 */
export async function initLangfuse(): Promise<boolean> {
  if (!isLangfuseReady()) {
    return false;
  }

  if (_provider) {
    return true; // already initialized
  }

  const cfg = getLangfuseConfig();

  try {
    const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
    const { SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
    const { setLangfuseTracerProvider } = await import("@langfuse/tracing");

    const exporter = new VerseCraftSpanExporter({
      publicKey: cfg.publicKey!,
      secretKey: cfg.secretKey!,
      baseUrl: cfg.baseUrl,
    });

    const processor = new SimpleSpanProcessor(exporter);

    const provider = new NodeTracerProvider({
      spanProcessors: [processor],
      forceFlushTimeoutMillis: 10000,
    });

    // 1. Register with OTel first (sets context manager, global tracer provider)
    provider.register();

    // 2. Then register with Langfuse SDK (so startObservation finds the tracer)
    setLangfuseTracerProvider(provider);

    _provider = provider;

    console.info("[langfuse] initialized (REST)", {
      environment: cfg.environment,
      baseUrl: cfg.baseUrl,
      sampleRate: cfg.sampleRate,
      promptSource: cfg.promptSource,
    });

    return true;
  } catch (err) {
    console.error("[langfuse] initialization failed — observability disabled", err);
    return false;
  }
}

/**
 * Gracefully shut down the tracer provider.
 * Flushes pending spans and closes the exporter.
 */
export async function shutdownLangfuse(): Promise<void> {
  try {
    if (_provider) {
      await _provider.forceFlush();
      await _provider.shutdown();
      _provider = null;
    }
    console.info("[langfuse] shut down");
  } catch {
    // Shutdown errors are non-fatal
  }
}

let _initialized = false;

export function isLangfuseInitialized(): boolean {
  return _initialized;
}

export function markLangfuseInitialized(): void {
  _initialized = true;
}
