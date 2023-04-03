package au.gigliotti.otel.squeaky.domain;

public class Greeting {
    private String greeting;
    public Greeting(String s) {
        greeting = s;
    }

    public String getGreeting() {
        return greeting;
    }
}
