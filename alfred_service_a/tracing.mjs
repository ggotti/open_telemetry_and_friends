import * as opentelemetry from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import {AWSXRayIdGenerator} from "@opentelemetry/id-generator-aws-xray";
import {AWSXRayPropagator} from "@opentelemetry/propagator-aws-xray";
import {BatchSpanProcessor} from "@opentelemetry/sdk-trace-base";

// Debugger
//diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'alfred',
});

const sdk = new opentelemetry.NodeSDK({
    resource: resource,
    traceExporter: new OTLPTraceExporter(),
    metricReader: new opentelemetry.metrics.PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
    }),
    textMapPropagator: new AWSXRayPropagator(),
    instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (incomingRequest) => {
                return incomingRequest.url === '/api/healthcheck';
                },
        },
    })],
});

sdk.configureTracerProvider({
    idGenerator: new AWSXRayIdGenerator(),
}, new BatchSpanProcessor(new OTLPTraceExporter()));

// DO NOT FORGET THIS. BAD THINGS WILL HAPPEN
await sdk.start();

process.on('SIGTERM', () => {
    sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});

export default sdk;