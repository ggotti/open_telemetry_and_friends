package au.gigliotti.otel.squeaky.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GreetingConfiguration {

    @Value("${GREETING_LETTER}")
    private String letter;

    public String getLetter() {
        return this.letter;
    }
}