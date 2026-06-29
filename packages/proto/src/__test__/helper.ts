/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { join } from "node:path";
import * as protobuf from "protobufjs";

export async function loadTestProto(): Promise<any> {
    // Use protobufjs v7 dynamic loader API for proper compatibility
    // This loads the proto file at runtime and returns Type instances for each message
    const protoPath = join(__dirname, "test.proto");
    const root = await protobuf.load(protoPath);

    // Get the SampleMessage type and its nested type
    const SampleMessage = root.lookupType("cookiecutter.test.SampleMessage");
    const Nested = root.lookupType("cookiecutter.test.SampleMessage.Nested");
    const Timestamp = root.lookupType("google.protobuf.Timestamp");

    // Reconstruct the nested structure that pbjsStaticModuleRegistry expects
    // The structure needs to have message types with encode/decode methods
    const SampleMessageWithNested = Object.assign(SampleMessage, {
        Nested: Nested,
    });

    return {
        cookiecutter: {
            test: {
                SampleMessage: SampleMessageWithNested,
            },
        },
        google: {
            protobuf: {
                Timestamp: Timestamp,
            },
        },
    };
}
