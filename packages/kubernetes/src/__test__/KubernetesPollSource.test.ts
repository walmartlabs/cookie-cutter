/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { MessageRef } from "@walmartlabs/cookie-cutter-core";
import { K8sResourceAdded, K8sResourceDeleted, K8sResourceModified } from "..";
import { KubernetesPollSource } from "../KubernetesPollSource";

jest.mock("@kubernetes/client-node", () => {
    return {
        KubeConfig: jest.fn().mockImplementation(() => {
            return {
                makeApiClient: jest.fn(),
                loadFromDefault: jest.fn(),
                loadFromFile: jest.fn(),
                setCurrentContext: jest.fn(),
                getCurrentCluster: jest.fn(),
                getCurrentContext: jest.fn(),
            };
        }),
    };
});

describe("KubernetesPollSource", () => {
    const BaseResp = {
        kind: "DeploymentList",
        apiVersion: "apps/v1",
        metadata: {},
        items: [],
    };
    const FooDeployment = {
        metadata: {
            name: "foo",
            namespace: "cookie-cutter",
            uid: "foo-uid",
        },
        spec: { replicas: 1 },
    };
    const BarDeployment = {
        metadata: {
            name: "bar",
            namespace: "cookie-cutter",
            uid: "bar-uid",
        },
        spec: { replicas: 1 },
    };

    it("returns K8sResourceAdded msgs", async () => {
        const pollResponse = {
            ...BaseResp,
            items: [FooDeployment, BarDeployment],
        };

        const poll = new KubernetesPollSource({});
        poll.poll = jest.fn().mockImplementationOnce(() => {
            return Promise.resolve(pollResponse);
        });

        const returnedMsgRefs: MessageRef[] = [];
        const p = poll.start();
        returnedMsgRefs.push((await p.next()).value);
        returnedMsgRefs.push((await p.next()).value);
        await poll.stop();
        expect(returnedMsgRefs[0].payload.type).toBe(K8sResourceAdded.name);
        expect(returnedMsgRefs[1].payload.type).toBe(K8sResourceAdded.name);
    });

    it("returns K8sResourceModified msgs", async () => {
        const firstPollResponse = {
            ...BaseResp,
            items: [FooDeployment, BarDeployment],
        };
        const secondPollResponse = {
            ...BaseResp,
            items: [
                FooDeployment,
                {
                    ...BarDeployment,
                    spec: { replicas: 2 },
                },
            ],
        };

        const poll = new KubernetesPollSource({});
        let pollCount = 0;
        poll.poll = jest.fn().mockImplementation(() => {
            if (pollCount === 0) {
                pollCount += 1;
                return Promise.resolve(firstPollResponse);
            }
            return Promise.resolve(secondPollResponse);
        });

        const returnedMsgRefs: MessageRef[] = [];
        const p = poll.start();
        returnedMsgRefs.push((await p.next()).value);
        returnedMsgRefs.push((await p.next()).value);
        returnedMsgRefs.push((await p.next()).value);
        returnedMsgRefs.push((await p.next()).value);
        await poll.stop();
        expect(returnedMsgRefs[0].payload.type).toBe(K8sResourceAdded.name);
        expect(returnedMsgRefs[1].payload.type).toBe(K8sResourceAdded.name);
        expect(returnedMsgRefs[2].payload.type).toBe(K8sResourceAdded.name);
        expect(returnedMsgRefs[3].payload.type).toBe(K8sResourceModified.name);
    });

    it("returns K8sResourceDeleted msgs", async () => {
        const firstPollResponse = {
            ...BaseResp,
            items: [FooDeployment, BarDeployment],
        };
        const secondPollResponse = {
            ...BaseResp,
            items: [FooDeployment],
        };

        const poll = new KubernetesPollSource({});
        let pollCount = 0;
        poll.poll = jest.fn().mockImplementation(() => {
            if (pollCount === 0) {
                pollCount += 1;
                return Promise.resolve(firstPollResponse);
            }
            return Promise.resolve(secondPollResponse);
        });

        const returnedMsgRefs: MessageRef[] = [];
        const p = poll.start();
        returnedMsgRefs.push((await p.next()).value);
        returnedMsgRefs.push((await p.next()).value);
        returnedMsgRefs.push((await p.next()).value);
        returnedMsgRefs.push((await p.next()).value);
        returnedMsgRefs.push((await p.next()).value);
        await poll.stop();
        expect(returnedMsgRefs[0].payload.type).toBe(K8sResourceAdded.name);
        expect(returnedMsgRefs[1].payload.type).toBe(K8sResourceAdded.name);
        expect(returnedMsgRefs[2].payload.type).toBe(K8sResourceAdded.name);
        expect(returnedMsgRefs[3].payload.type).toBe(K8sResourceDeleted.name);
        expect(returnedMsgRefs[4].payload.type).toBe(K8sResourceAdded.name);
    });
});
