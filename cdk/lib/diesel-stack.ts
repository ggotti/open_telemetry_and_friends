import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {aws_ec2, aws_ecr_assets, aws_ecs, aws_ecs_patterns, aws_iam, NestedStackProps, CfnOutput} from "aws-cdk-lib";
import {DockerImageAsset, NetworkMode} from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import {ContainerImage, Cluster, ICluster, FargateService} from "aws-cdk-lib/aws-ecs";
import {AlfredProperties} from './alref-stack-params';
import {IVpc, Port, SecurityGroup} from 'aws-cdk-lib/aws-ec2';
import {
    ApplicationLoadBalancer,
    ApplicationTargetGroup,
    ApplicationProtocol,
    ListenerCondition,
    ApplicationListener,
    TargetType,
    ListenerAction,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {Role} from "aws-cdk-lib/aws-iam";
import {DieselStackParams} from './diesel-stack-params';
import {OtelContainer} from './otel-container-task';

export class DieselStack extends cdk.NestedStack {
    readonly dieselLoadBalancerDnsName: CfnOutput;

    constructor(scope: Construct, id: string, props?: DieselStackParams) {
        super(scope, id, props);

        const defaultVPC = aws_ec2.Vpc.fromLookup(this, 'ImportVPC', {isDefault: true});

        const cluster = new aws_ecs.Cluster(this, "DiselStackServiceB", {
            vpc: defaultVPC
        });

        const dockerImageServiceB = new DockerImageAsset(this, 'DiselStackServiceBService', {
            directory: path.join(__dirname, '../', '../', 'diesel_service_b'),
            networkMode: NetworkMode.HOST,
            file: 'Dockerfile',
            platform: aws_ecr_assets.Platform.LINUX_AMD64,
            ignoreMode: undefined,
        })

        const greetingServiceLetters = ['W', 'O', 'R', 'L', 'D'];

        const loadBalancer = new ApplicationLoadBalancer(this, `DieselLoadBalancer`, {
            vpc: defaultVPC,
            internetFacing: true
        });

//        // Add a listener and open up the load balancer's security group
//        // to the world.
        const listener = loadBalancer.addListener('Listener', {
            port: 80,

            // 'open: true' is the default, you can leave it out if you want. Set it
            // to 'false' and use `listener.connections` if you want to be selective
            // about who can access the load balancer.
            open: true,
        });
        listener.addAction('DefaultAction', {
            action: ListenerAction.fixedResponse(404, {
                contentType: "text/plain",
                messageBody: 'Cannot route your request; no matching project found.',
            }),
        });


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

        let newDiseleServices = greetingServiceLetters.map(letter => this.createServiceForLetter(letter, dockerImageServiceB, props!.otelImage, cluster, defaultVPC, listener, taskRole, props!.honeycombAPIKey));
        newDiseleServices.forEach(fargateService => loadBalancer.connections.allowTo(fargateService, Port.tcp(8080)))

        this.dieselLoadBalancerDnsName = new CfnOutput(this, "LoadBalancerDnsName", {
            value: loadBalancer.loadBalancerDnsName
        });
    }

    createServiceForLetter(letter: string, dockerImageServiceB: DockerImageAsset, otelImage: DockerImageAsset, cluster: ICluster, defaultVPC: IVpc, listener: ApplicationListener, taskRole: Role, honeycombAPIKey?: string): FargateService {
        const fargateTaskDefinition = new aws_ecs.FargateTaskDefinition(this, `DieselTaskDef${letter}`, {
            memoryLimitMiB: 1024,
            cpu: 512,
            taskRole: taskRole,
        });
        const nodeContainerName = "nodeContainer";
        let serviceContainer = fargateTaskDefinition.addContainer(`DieselServiceContainer${letter}`, {
            image: ContainerImage.fromDockerImageAsset(dockerImageServiceB),
            containerName: nodeContainerName,
            essential: true,
            logging: new aws_ecs.AwsLogDriver({
                streamPrefix: 'DiselStackServiceB' + letter,
                mode: aws_ecs.AwsLogDriverMode.NON_BLOCKING
            }),
            portMappings: [{
                containerPort: 8080,
            }],
            environment: {
                SERVER_SERVLET_CONTEXT_PATH: `/${letter}`,
                GREETING_LETTER: letter,
                SPRING_WEBFLUX_BASE_PATH: `/${letter}`,
                OTEL_SERVICE_NAME: `Diesel_${letter}`
            }
        });

        OtelContainer.addOtelContainerToTask(otelImage, `Diesel_${letter}`, fargateTaskDefinition, honeycombAPIKey);

        const fargateService = new aws_ecs.FargateService(this, `DieselService${letter}`, {
            cluster: cluster,
            taskDefinition: fargateTaskDefinition,
            desiredCount: 1,
            assignPublicIp: true, //just entirely to avoid running a NAT,
            circuitBreaker: {rollback: true}
        });

        const tg = new ApplicationTargetGroup(this, `DieselTargetGoup${letter}`, {
            protocol: ApplicationProtocol.HTTP,
            vpc: defaultVPC,
            port: 8080,
            targetType: TargetType.IP,
            healthCheck: {
                path: `/${letter}/actuator/health`,
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 10,
            },
        });
        fargateService.attachToApplicationTargetGroup(tg)

        listener.addTargetGroups(`DieselApiTargetGroup${letter}`, {
            targetGroups: [tg],
            priority: letter.charCodeAt(0),
            conditions: [ListenerCondition.pathPatterns([`/${letter}`, `/${letter}/*`])]
        })
        listener.connections.allowTo(fargateService, Port.tcp(8080));
        fargateService.connections.allowFrom(listener, Port.tcp(8080));

        return fargateService;
    }

}
