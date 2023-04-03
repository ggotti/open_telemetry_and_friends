import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {JohnsonStack} from './johnson-stack';
import {AlfredStack} from './alfred-stack';
import {DieselStack} from "./diesel-stack";
import {DockerImageAsset, NetworkMode} from 'aws-cdk-lib/aws-ecr-assets';
import * as path from "path";
import {aws_ecr_assets} from 'aws-cdk-lib';

export class OpenTelemetryAndFriendsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        let dockerImageAsset = this.createCollectorImage();

        const honeycombAPIKey = process.env.HONEYCOMB_API_KEY;

        const diesel = new DieselStack(this, 'DieselServiceB', {
            ...props,
            honeycombAPIKey,
            otelImage: dockerImageAsset
        });
        const johnson = new JohnsonStack(this, 'JohnsonFrontend', {
            ...props,
            honeycombAPIKey,
            otelImage: dockerImageAsset
        });
        const alfred = new AlfredStack(this, 'AlfredServiceA', {
            ...props,
            loadBalancerArn: johnson.frontendLoadBalancerArn.value,
            securityGroupId: johnson.frontendLoadBalancerSecurtyGroupId.value,
            listenerArn: johnson.frontendLoadBalancerListenerArn.value,
            dieselLoadBalancerDnsName: diesel.dieselLoadBalancerDnsName.value,
            otelImage: dockerImageAsset,
            honeycombAPIKey,
        });
        alfred.addDependency(johnson, "Requires load balancer from FrontendService")
        alfred.addDependency(diesel, "Requires load balancer of downstream service")
    }

    createCollectorImage(): DockerImageAsset {
        return new DockerImageAsset(this, 'OtelDockerImage', {
            directory: path.join(__dirname, '../', '../', 'collector'),
            networkMode: NetworkMode.HOST,
            file: 'Dockerfile',
            platform: aws_ecr_assets.Platform.LINUX_AMD64,
            ignoreMode: undefined,
        })
    }
}