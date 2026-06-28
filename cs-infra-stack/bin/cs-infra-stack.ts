#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { CsInfraStackStack } from '../lib/cs-infra-stack-stack';

const app = new cdk.App();
new CsInfraStackStack(app, 'CsInfraStackStack');
