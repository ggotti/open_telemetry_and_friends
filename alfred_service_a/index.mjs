import tracing from "./tracing.mjs";
import Koa from "koa";
import otel from "@opentelemetry/api";
import Router from "koa-router";
import axios from 'axios';
import * as opentelemetry from "@opentelemetry/api";

const app = new Koa();
const myMeter = otel.metrics.getMeter('my-service-meter');

const router = new Router();

const metricAttributesCounter = myMeter.createCounter("request-counter",{
    description: 'Creates a counter metric',
    unit: 'friends'
});


const tracer = opentelemetry.trace.getTracer('alfred-service-tracer');

router.prefix('/api');

router.get('/healthcheck', async (ctx) => {
    ctx.body = {}
})

async function retrieveLetter(letter) {
    const letterResponse = await axios.get(`${process.env.DOWNSTREAM_BASE_URL}/${letter}/greeting`);
    const letterData = letterResponse.data;
    return letterData.greeting;
}

router.get('/hello', async (ctx) => {
    console.log("otel.context.active(): " + JSON.stringify(otel.context.active()))
    await metricAttributesCounter.add(1);
    const worldGreetings = ['W','O','R', 'L', 'D'];
    const downstreamCallSpan = tracer.startSpan();
    const greetings = await Promise.all(worldGreetings.map(letter => retrieveLetter(letter)));
    downstreamCallSpan.end();
    

    //DOWNSTREAM_BASE_URL
    // http://opent-diese-1mhbijp41fsfl-1789624296.us-east-1.elb.amazonaws.com/W/greeting
    ctx.body = 'Hello ' + greetings.join('');
});
console.log("Starting Application")
app.use(router.routes())

app.listen(3000);