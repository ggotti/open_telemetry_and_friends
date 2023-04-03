package au.gigliotti.otel.squeaky.controller;

import au.gigliotti.otel.squeaky.config.GreetingConfiguration;
import au.gigliotti.otel.squeaky.domain.Greeting;
import io.opentelemetry.api.metrics.LongCounter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import io.opentelemetry.instrumentation.annotations.WithSpan;

@RestController
public class GreetingController {

    private final LongCounter greetingRequests;

    private final GreetingConfiguration greetingConfiguration;

    public GreetingController(LongCounter greetingRequests, GreetingConfiguration greetingConfiguration) {
        this.greetingRequests = greetingRequests;
        this.greetingConfiguration = greetingConfiguration;
    }

    @GetMapping("/greeting")
    @WithSpan("greeting_call")
    private Mono<Greeting> getHello() {
        greetingRequests.add(1);
        var greeting = new Greeting(greetingConfiguration.getLetter());
        return Mono.justOrEmpty(greeting);
    }
}