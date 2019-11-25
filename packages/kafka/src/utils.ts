import { getRootProjectPackageInfo } from "@walmartlabs/cookie-cutter-core";
import * as uuid from "uuid";

export function generateClientId() {
    return `${getRootProjectPackageInfo().name}-${uuid.v4()}`;
}
