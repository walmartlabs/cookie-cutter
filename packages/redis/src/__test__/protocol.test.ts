/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { DEFAULT_PAYLOAD_KEY, DEFAULT_TYPENAME_KEY } from "..";
import { parseRawReadGroupResult, RawReadGroupResult } from "../RedisClient";

describe("XReadGroup response parsing", () => {
    it("parses multi stream result", () => {
        const data: RawReadGroupResult = [
            {
                name: "stream-1",
                messages: [
                    {
                        id: "1597844517517-0",
                        message: { [DEFAULT_PAYLOAD_KEY]: '{"foo": "bar"}' },
                    },
                    {
                        id: "1597844517952-0",
                        message: {
                            [DEFAULT_PAYLOAD_KEY]: '{"fizz": "buzz"}',
                        },
                    },
                    {
                        id: "1597844518432-0",
                        message: { [DEFAULT_PAYLOAD_KEY]: '{"bar": "foo"}' },
                    },
                ],
            },
            {
                name: "stream-2",
                messages: [
                    {
                        id: "1597844517517-0",
                        message: { [DEFAULT_PAYLOAD_KEY]: '{"foo": "bar"}' },
                    },
                    {
                        id: "1597844517952-0",
                        message: { [DEFAULT_PAYLOAD_KEY]: '{"fizz": "buzz"}' },
                    },
                    {
                        id: "1597844518432-0",
                        message: { [DEFAULT_PAYLOAD_KEY]: '{"bar": "foo"}' },
                    },
                ],
            },
        ];

        const messages = parseRawReadGroupResult(data, DEFAULT_PAYLOAD_KEY, DEFAULT_TYPENAME_KEY);
        expect(messages).toHaveLength(6);
    });

    it("parses result with bad messages", () => {
        const data: RawReadGroupResult = [
            {
                name: "stream-1",
                messages: [
                    {
                        id: "1597844517517-0",
                        message: { [DEFAULT_PAYLOAD_KEY]: '{"foo": "bar"}' },
                    },
                    { id: "1597844517519-0", message: {} },
                    {
                        id: "1597844517952-0",
                        message: { [DEFAULT_PAYLOAD_KEY]: '{"fizz": "buzz"}' },
                    },
                    {
                        id: "1597844518432-0",
                        message: { [DEFAULT_PAYLOAD_KEY]: '{"bar": "foo"}' },
                    },
                ],
            },
        ] as any;

        const messages = parseRawReadGroupResult(data, DEFAULT_PAYLOAD_KEY, DEFAULT_TYPENAME_KEY);
        expect(messages).toMatchObject([
            { streamName: "stream-1", messageId: "1597844517517-0", data: '{"foo": "bar"}' },
            { streamName: "stream-1", messageId: "1597844517519-0" },
            { streamName: "stream-1", messageId: "1597844517952-0", data: '{"fizz": "buzz"}' },
            { streamName: "stream-1", messageId: "1597844518432-0", data: '{"bar": "foo"}' },
        ]);
    });
});
