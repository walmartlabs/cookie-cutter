import { parseRawReadGroupResult } from "../RedisClient";
import { RawReadGroupResult } from "../RedisProxy";

describe("XReadGroup response parsing", () => {
    it("parses multi stream result", () => {
        const data: RawReadGroupResult = [
            [
                "stream-1",
                [
                    ["1597844517517-0", ["redis.stream.key", '{"foo": "bar"}']],
                    ["1597844517952-0", ["redis.stream.key", '{"fizz": "buzz"}']],
                    ["1597844518432-0", ["redis.stream.key", '{"bar": "foo"}']],
                ],
            ],
            [
                "stream-2",
                [
                    ["1597844517517-0", ["redis.stream.key", '{"foo": "bar"}']],
                    ["1597844517952-0", ["redis.stream.key", '{"fizz": "buzz"}']],
                    ["1597844518432-0", ["redis.stream.key", '{"bar": "foo"}']],
                ],
            ],
        ] as any;

        const messages = parseRawReadGroupResult(data);
        expect(messages).toHaveLength(6);
    });

    it("parses result with bad messages", () => {
        const data: RawReadGroupResult = [
            [
                "stream-1",
                [
                    ["1597844517517-0", ["redis.stream.key", '{"foo": "bar"}']],
                    ["1597844517519-0", []],
                    ["1597844517952-0", ["redis.stream.key", '{"fizz": "buzz"}']],
                    ["1597844518432-0", ["redis.stream.key", '{"bar": "foo"}']],
                ],
            ],
        ] as any;

        const messages = parseRawReadGroupResult(data);
        expect(messages).toMatchObject([
            { streamName: "stream-1", messageId: "1597844517517-0", data: '{"foo": "bar"}' },
            { streamName: "stream-1", messageId: "1597844517519-0" },
            { streamName: "stream-1", messageId: "1597844517952-0", data: '{"fizz": "buzz"}' },
            { streamName: "stream-1", messageId: "1597844518432-0", data: '{"bar": "foo"}' },
        ]);
    });
});
