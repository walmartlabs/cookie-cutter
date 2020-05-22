/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { getRootProjectPackageInfo } from "@walmartlabs/cookie-cutter-core";
import * as uuid from "uuid";

export function generateClientId() {
    return `${getRootProjectPackageInfo().name}-${uuid.v4()}`;
}
