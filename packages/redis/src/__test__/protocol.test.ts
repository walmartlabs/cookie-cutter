import { parseRawReadGroupResult } from "../RedisClient";
import { RawReadGroupResult } from "../RedisProxy";

describe("XReadGroup response parsing", () => {
    it("parses single stream result", () => {
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
});
