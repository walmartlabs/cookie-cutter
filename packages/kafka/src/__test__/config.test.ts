/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { config } from "@walmartlabs/cookie-cutter-core";
import { KafkaOffsetResetStrategy } from "..";
import { KafkaSubscriptionConfiguration } from "../config";

describe("KafkaSubscriptionConfiguration", () => {
    it("parses topics as comma separated list", async () => {
        const actual = config.parse(KafkaSubscriptionConfiguration, {
            topics: "topic1, topic2,topic3",
        });

        expect(actual.topics).toMatchObject([
            { name: "topic1", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
            { name: "topic2", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
            { name: "topic3", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
        ]);
    });

    it("parses topics with reset strategy", async () => {
        const actual = config.parse(KafkaSubscriptionConfiguration, {
            topics: "topic1, topic2|always-latest,topic3|latest",
        });

        expect(actual.topics).toMatchObject([
            { name: "topic1", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
            { name: "topic2", offsetResetStrategy: KafkaOffsetResetStrategy.AlwaysLatest },
            { name: "topic3", offsetResetStrategy: KafkaOffsetResetStrategy.Latest },
        ]);
    });

    it("recognizes legacy 'compacted' configuration", async () => {
        const actual = config.parse(KafkaSubscriptionConfiguration, {
            topics: "topic1|compacted",
        });

        expect(actual.topics).toMatchObject([
            { name: "topic1", offsetResetStrategy: KafkaOffsetResetStrategy.AlwaysEarliest },
        ]);
    });

    it("accepts topics as array of strings", async () => {
        const actual = config.parse(KafkaSubscriptionConfiguration, {
            topics: ["topic1", "topic2", "topic3"],
        });

        expect(actual.topics).toMatchObject([
            { name: "topic1", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
            { name: "topic2", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
            { name: "topic3", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
        ]);
    });

    it("accepts topics as array of IKafkaTopic", async () => {
        const actual = config.parse(KafkaSubscriptionConfiguration, {
            topics: [
                { name: "topic1", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
                { name: "topic2", offsetResetStrategy: KafkaOffsetResetStrategy.Latest },
                { name: "topic3" },
            ],
        });

        expect(actual.topics).toMatchObject([
            { name: "topic1", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
            { name: "topic2", offsetResetStrategy: KafkaOffsetResetStrategy.Latest },
            { name: "topic3", offsetResetStrategy: KafkaOffsetResetStrategy.Earliest },
        ]);
    });

    it("has correct additional headers in the config", async () => {
        const actual = config.parse(KafkaSubscriptionConfiguration, {
            additionalHeaderNames: {
                internal_header_one: "raw_message_header_one",
                internal_header_two: "raw_message_header_two",
            },
        });

        expect(actual.additionalHeaderNames).toMatchObject({
            internal_header_one: "raw_message_header_one",
            internal_header_two: "raw_message_header_two",
        });
    });
});
