/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config } from "@walmartlabs/cookie-cutter-core";
import { IBlobStorageSnapshotOutputSinkConfiguration } from "..";
import { BlobStorageConfiguration } from "../../config";

@config.section
export class BlobStorageSnapshotOutputSinkConfiguration
    extends BlobStorageConfiguration
    implements IBlobStorageSnapshotOutputSinkConfiguration
{
    @config.field(config.converters.number)
    public set frequency(_: number) {
        config.noop();
    }
    public get frequency(): number {
        return config.noop();
    }
}
