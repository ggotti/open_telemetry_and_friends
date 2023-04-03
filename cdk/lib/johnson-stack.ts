import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {aws_ec2, aws_ecr_assets, aws_ecs, aws_ecs_patterns, aws_iam, CfnOutput} from "aws-cdk-lib";
import {DockerImageAsset, NetworkMode} from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import {ContainerImage} from "aws-cdk-lib/aws-ecs";
import {JohnsonParams} from './johnson-stack-params';
import {OtelContainer} from './otel-container-task';

export class JohnsonStack extends cdk.NestedStack {

    readonly frontendLoadBalancerArn: CfnOutput;

    readonly frontendLoadBalancerSecurtyGroupId: CfnOutput

    readonly frontendLoadBalancerListenerArn: CfnOutput


    constructor(scope: Construct, id: string, props?: JohnsonParams) {
        super(scope, id, props);

        const defaultVPC = aws_ec2.Vpc.fromLookup(this, 'ImportVPC', {isDefault: true});

        const cluster = new aws_ecs.Cluster(this, "JohnsonFrontend", {
            vpc: defaultVPC
        });
        const otelImage = props!.otelImage;

        const dockerImageServiceB = new DockerImageAsset(this, 'JohnsonFrontendService', {
            directory: path.join(__dirname, '../', '../', 'johnson_frontend'),
            networkMode: NetworkMode.HOST,
            file: 'Dockerfile',
            platform: aws_ecr_assets.Platform.LINUX_AMD64,
            ignoreMode: undefined,
        })

        const otelPolicy = new aws_iam.PolicyDocument({
            statements: [new aws_iam.PolicyStatement({
                actions: [
                    'logs:PutLogEvents',
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                    'logs:DescribeLogStreams',
                    'logs:DescribeLogGroups',
                    'xray:PutTraceSegments',
                    'xray:PutTelemetryRecords',
                    'xray:GetSamplingRules',
                    'xray:GetSamplingTargets',
                    'xray:GetSamplingStatisticSummaries'
                ],
                resources: ['*'],
            })],
        });

        const taskRole = new aws_iam.Role(this, 'Role', {
            assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            inlinePolicies: {
                otelPolicy
            }
        });

        const fargateTaskDefinition = new aws_ecs.FargateTaskDefinition(this, 'TaskDef', {
            memoryLimitMiB: 512,
            cpu: 256,
            taskRole: taskRole
        });
        let webContainer = fargateTaskDefinition.addContainer("WebContainer", {
            image: ContainerImage.fromDockerImageAsset(dockerImageServiceB),
            logging: new aws_ecs.AwsLogDriver({
                streamPrefix: 'JohnsonFrontend',
                mode: aws_ecs.AwsLogDriverMode.NON_BLOCKING
            })
        });
        webContainer.addPortMappings({
            containerPort: 80,
        });

        OtelContainer.addOtelContainerToTask(otelImage, 'JohnsonFrontend', fargateTaskDefinition, props?.honeycombAPIKey);

        // // Create a load-balanced Fargate service and make it public
        let frontendALB = new aws_ecs_patterns.ApplicationLoadBalancedFargateService(this, "FrontendService", {
            cluster: cluster,
            cpu: 512,
            desiredCount: 1,
            taskDefinition: fargateTaskDefinition,
            assignPublicIp: true, // this is purely to not require a NAT option.
            memoryLimitMiB: 1024,
            minHealthyPercent: 50,
            publicLoadBalancer: true,
            healthCheckGracePeriod: cdk.Duration.seconds(10),
            circuitBreaker: {rollback: true}

        });
        dockerImageServiceB.repository.grantPull(frontendALB.taskDefinition.obtainExecutionRole());

        this.frontendLoadBalancerArn = new CfnOutput(this, "LoadBalancerArnOutput", {
            value: frontendALB.loadBalancer.loadBalancerArn
        });
        this.frontendLoadBalancerSecurtyGroupId = new CfnOutput(this, "LoadBalancerSecurityGroupOutput", {
            value: frontendALB.loadBalancer.connections.securityGroups[0].securityGroupId
        });
        this.frontendLoadBalancerListenerArn = new CfnOutput(this, "LoadBalancerListner", {
            value: frontendALB.loadBalancer.listeners[0].listenerArn
        });

        new cdk.CfnOutput(this, 'dnsLoadBalancerName', {
            value: frontendALB.loadBalancer.loadBalancerDnsName,
            description: 'External Load Balancer URL',
            exportName: 'johnsonLoadBalancer',
        });
    }
}
