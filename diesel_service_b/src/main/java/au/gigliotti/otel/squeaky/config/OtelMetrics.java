package au.gigliotti.otel.squeaky.config;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.metrics.ObservableLongCounter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OtelMetrics {
    private static final Meter sampleMeter = GlobalOpenTelemetry.getMeter("au.gigliotti.otel.squeaky.metrics");
    private static final LongCounter getGreetingRequests = sampleMeter
          .counterBuilder("greeting_requests")
          .setDescription("Counts number of hello requests")
          .setUnit("friends")
          .build();

    @Bean(name = "greetingRequests")
    public LongCounter greetingRequests() {
        return getGreetingRequests;
    }
}