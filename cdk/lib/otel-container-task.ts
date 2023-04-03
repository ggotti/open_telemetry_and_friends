import {IFargateTaskDefinition, FargateTaskDefinition, ContainerImage} from "aws-cdk-lib/aws-ecs";
import {aws_ecs} from "aws-cdk-lib";
import {DockerImageAsset} from "aws-cdk-lib/aws-ecr-assets";

export class OtelContainer {

    static addOtelContainerToTask(otelImage: DockerImageAsset, serviceName: String, fargateTaskDefinition: FargateTaskDefinition, honeycombAPIKey?: String) {
        let environment = {}
        if (honeycombAPIKey) {
            environment = {
                HONEYCOMB_KEY: `${honeycombAPIKey}`,
                HONEYCOMB_DATASET: serviceName
            }
        }

        const otelConfigToUse = (honeycombAPIKey) ? "--config=/etc/ecs/ecs-config-with-xray-and-honeycomb.yml" : '--config=/etc/ecs/ecs-default-config.yaml';

        let otelContainer = fargateTaskDefinition.addContainer("Otel",
            {
                image: ContainerImage.fromDockerImageAsset(otelImage),
                containerName: "collector",
                logging: new aws_ecs.AwsLogDriver({
                    streamPrefix: `${serviceName}`,
                    mode: aws_ecs.AwsLogDriverMode.NON_BLOCKING
                }),
                command: [otelConfigToUse, '--set=service.telemetry.logs.level=DEBUG'],
                environment: environment
            });

        otelContainer.addPortMappings({
            containerPort: 4318,
        })
    };
}