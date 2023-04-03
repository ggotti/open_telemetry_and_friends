import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {aws_ec2, aws_ecr_assets, aws_ecs, aws_ecs_patterns, aws_iam} from "aws-cdk-lib";
import {DockerImageAsset, NetworkMode} from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import {ContainerImage} from "aws-cdk-lib/aws-ecs";
import {AlfredProperties} from './alref-stack-params';
import {Port, SecurityGroup, Peer, ISecurityGroup} from 'aws-cdk-lib/aws-ec2';
import {
    ApplicationLoadBalancer,
    ApplicationTargetGroup,
    ApplicationProtocol,
    ListenerCondition,
    ApplicationListener,
    TargetType
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {OtelContainer} from './otel-container-task';

export class AlfredStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props: AlfredProperties) {
        super(scope, id, props);

        const defaultVPC = aws_ec2.Vpc.fromLookup(this, 'ImportVPC', {isDefault: true});

        const cluster = new aws_ecs.Cluster(this, "AlfredServiceA", {
            vpc: defaultVPC
        });

        const otelImage = props!.otelImage;


        const loadBalancerSecurityGroup = SecurityGroup.fromSecurityGroupId(this, "ExistingFrontendALB", props.securityGroupId, {
            allowAllOutbound: false
        })

        const existingListener = ApplicationListener.fromApplicationListenerAttributes(this, 'ExistingFrontendListener', {
            listenerArn: props.listenerArn,
            securityGroup: loadBalancerSecurityGroup
        });

        const dockerImageServiceB = new DockerImageAsset(this, 'AlfredServiceAService', {
            directory: path.join(__dirname, '../', '../', 'alfred_service_a'),
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
            taskRole: taskRole,
        });
        const nodeContainerName = "nodeContainer";
        let webContainer = fargateTaskDefinition.addContainer("ServiceContainer", {
            image: ContainerImage.fromDockerImageAsset(dockerImageServiceB),
            containerName: nodeContainerName,
            essential: true,
            logging: new aws_ecs.AwsLogDriver({
                streamPrefix: 'AlfredServiceA',
                mode: aws_ecs.AwsLogDriverMode.NON_BLOCKING
            }),
            portMappings: [{
                containerPort: 3000,
            }],
            environment: {
                "DOWNSTREAM_BASE_URL": `http://${props.dieselLoadBalancerDnsName}`
            }
        });

        OtelContainer.addOtelContainerToTask(otelImage, `Alfred`, fargateTaskDefinition, props.honeycombAPIKey);

        const fargateService = new aws_ecs.FargateService(this, "alfredFargateService", {
            cluster: cluster,
            taskDefinition: fargateTaskDefinition,
            desiredCount: 1,
            assignPublicIp: true, //just entirely to avoid running a NAT,
            circuitBreaker: {rollback: true}
        });

        const tg = new ApplicationTargetGroup(this, "alfredTargetGoup", {
            protocol: ApplicationProtocol.HTTP,
            vpc: defaultVPC,
            port: 3000,
            targetType: TargetType.IP,
            healthCheck: {
                path: '/api/healthcheck',
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 10,
            }
        });
        fargateService.attachToApplicationTargetGroup(tg)

        existingListener.addTargetGroups("apiTargetGroup", {
            targetGroups: [tg],
            priority: 100,
            conditions: [ListenerCondition.pathPatterns(['/api', '/api/*'])]
        })

        existingListener.connections.allowTo(fargateService, Port.tcp(3000));
        fargateService.connections.allowFrom(existingListener, Port.tcp(3000));

//        loadBalancerSecurityGroup.connections.allowTo(fargateService, Port.tcp(3000))
//        loadBalancerSecurityGroup.connections.allowTo(existingListener, Port.tcp(3000))
        fargateService.connections.securityGroups.forEach((serviceSecurityGroup: ISecurityGroup) => {
            console.log("FargateConnection to: " + serviceSecurityGroup.securityGroupId);
            loadBalancerSecurityGroup.addEgressRule(Peer.securityGroupId(serviceSecurityGroup.securityGroupId), Port.tcp(3000), "API listener access", false);
        })
    }
}
