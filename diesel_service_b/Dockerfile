# syntax=docker/dockerfile:1

FROM amazoncorretto:17 AS builder
WORKDIR /app

COPY . .
RUN ./mvnw clean package
#
FROM amazoncorretto:17-alpine
WORKDIR /app

COPY --from=builder /app/target/diesel*.jar ./app.jar
ADD https://github.com/aws-observability/aws-otel-java-instrumentation/releases/download/v1.23.0/aws-opentelemetry-agent.jar /app/opentelemetry-javaagent.jar
ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -javaagent:/app/opentelemetry-javaagent.jar -jar /app/app.jar"]