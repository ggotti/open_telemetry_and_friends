import {
    ConsoleSpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {WebTracerProvider} from '@opentelemetry/sdk-trace-web';
import {DocumentLoadInstrumentation} from '@opentelemetry/instrumentation-document-load';
import {ZoneContextManager} from '@opentelemetry/context-zone';
import {registerInstrumentations} from '@opentelemetry/instrumentation';
import {getWebAutoInstrumentations} from '@opentelemetry/auto-instrumentations-web';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import {
    OTLPTraceExporter,
} from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
// OTel JS - Contrib - AWS X-Ray
import {AWSXRayIdGenerator} from "@opentelemetry/id-generator-aws-xray";
import {AWSXRayPropagator} from "@opentelemetry/propagator-aws-xray";


const provider = new WebTracerProvider({
    idGenerator: new AWSXRayIdGenerator(),
    resource: new Resource( {
        [ SemanticResourceAttributes.SERVICE_NAME ]: "johnson_frontend",
    }),
});
provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter({
    url: '/otel/v1/traces'
})));
provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new CompositePropagator({
        propagators: [new W3CBaggagePropagator(), new W3CTraceContextPropagator(), new AWSXRayPropagator()],
    }),
});

// Registering instrumentations
// new DocumentLoadInstrumentation() for web-traces
registerInstrumentations({
    instrumentations: [getWebAutoInstrumentations({
            '@opentelemetry/instrumentation-fetch': {
                clearTimingResources: true,
            },
        }),],
});

const getHello = async () => {
    const response = await fetch("/api/hello", {
        method: 'GET',
    })
    const responseText = await response.text();
    let responseBox = document.getElementById("responseBox");
    let p = document.createElement("p");
    p.append(responseText)
    responseBox.append(p);
}

window.addEventListener("load", (event) => {
    const el = document.getElementById("helloButton");
    el.addEventListener("click", getHello, false);

});