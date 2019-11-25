/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    Application,
    ConsoleLogger,
    IDispatchContext,
    IMessage,
    NullMessageEncoder,
} from "@walmartlabs/cookie-cutter-core";
import { KafkaMetadata, kafkaSink, kafkaSource } from "@walmartlabs/cookie-cutter-kafka";

Application.create()
    .input()
    .add(
        kafkaSource({
            broker: "MY-BROKER:9092",
            group: "consumer-group-1",
            topics: "topic-1",
            encoder: new NullMessageEncoder(),
        })
    )
    .done()
    .logger(new ConsoleLogger())
    .dispatch({
        canDispatch: (_: IMessage): boolean => {
            return true;
        },
        dispatch: (msg: IMessage, ctx: IDispatchContext): void => {
            ctx.publish(Buffer, msg.payload, {
                [KafkaMetadata.Key]: ctx.metadata<string>(KafkaMetadata.Key),
            });
        },
    })
    .output()
    .published(
        kafkaSink({
            broker: "MY-BROKER:9092",
            defaultTopic: "topic-2",
            encoder: new NullMessageEncoder(),
        })
    )
    .done()
    .run();
