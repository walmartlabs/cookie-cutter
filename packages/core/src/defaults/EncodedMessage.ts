/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { IMessage, IMessageEncoder } from "../model";

export class EncodedMessage implements IMessage {
    private _payload: any;

    public constructor(
        private encoder: IMessageEncoder,
        public readonly type: string,
        private readonly data: Uint8Array
    ) {
        // messages that come off the wire aren't always guaranteed to
        // have type information (e.g. reading from third party kafka topics
        // that don't use EventSourceMetadata) so we attempt to eagerly decode the message
        // and set the event type by using the encoder in case it sets a default event type (e.g. CsvMessageEncoder)
        if (!type) {
            const msg = this.encoder.decode(this.data, undefined);
            this._payload = msg.payload;
            this.type = msg.type;
        }
    }

    public get payload(): any {
        if (this._payload) {
            return this._payload;
        }

        const msg = this.encoder.decode(this.data, this.type);
        this._payload = msg.payload;
        return this._payload;
    }
}
