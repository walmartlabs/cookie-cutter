/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import {
    DefaultComponentContext,
    EventSourcedMetadata,
    failSpan,
    IComponentContext,
    ILogger,
    IMetrics,
    IMetricTags,
    IRequireInitialization,
    OpenTracingTagKeys,
} from "@walmartlabs/cookie-cutter-core";
import {
    QueueGetPropertiesResponse,
    QueueServiceClient,
    StoragePipelineOptions,
    StorageRetryOptions,
    StorageRetryPolicyType,
    StorageSharedKeyCredential,
} from "@azure/storage-queue";
import { FORMAT_HTTP_HEADERS, Span, SpanContext, Tags, Tracer } from "opentracing";
import { IQueueConfiguration, IQueueMessagePreprocessor, QueueMetadata } from "../streaming";

interface IQueueRequestOptions {
    /**
     * Specifies the queue name to use other than the configured default
     */
    queueName?: string;
}

enum QueueMetrics {
    Write = "cookie_cutter.azure_queue_client.write",
    Read = "cookie_cutter.azure_queue_client.read",
    MarkAsProcessed = "cookie_cutter.azure_queue_client.mark_as_processed",
    QueueMetadata = "cookie_cutter.azure_queue_client.queue_metadata",
}
enum QueueMetricResults {
    Success = "success",
    Error = "error",
    ErrorTooBig = "error.too_big",
}

export enum QueueOpenTracingTagKeys {
    QueueName = "queue.name",
}

export interface IDeadLetterQueueOptions extends IQueueCreateMessageOptions {
    readonly maxDequeueCount: number;
    readonly retryCount?: number;
    readonly retryInterval?: number;
}

export interface IQueueCreateMessageOptions extends IQueueRequestOptions {
    /**
     * (FROM AZURE DOCS)
     * The time-to-live interval for the message, in seconds. The maximum time-to-live allowed is 7 days. If this parameter
     * is omitted, the default time-to-live is 7 days (604800 seconds)
     */
    messageTimeToLive?: number;
    /**
     * (FROM AZURE DOCS)
     * Specifies the new visibility timeout value, in seconds, relative to server time. The new value must be larger than or
     * equal to 0, and cannot be larger than 7 days (604800 seconds). The visibility timeout of a message cannot be set to a value later than
     * the expiry time (calculated based on time-to-live when updating message). visibilitytimeout should be set to a value smaller than the time-to-live value.
     */
    visibilityTimeout?: number;
}

export interface IQueueReadOptions extends IQueueRequestOptions {
    /**
     * (FROM AZURE DOCS)
     * A nonzero integer value that specifies the number of messages to retrieve from the queue,
     * up to a maximum of 32. By default, a single message is retrieved from the queue with this operation.
     */
    numOfMessages?: number;

    /**
     * (FROM AZURE DOCS)
     * Required if not peek only. Specifies the new visibility timeout value, in seconds,
     * relative to server time. The new value must be larger than or equal to 0, and cannot be larger than 7 days (604800 seconds).
     * The visibility timeout of a message can be set to a value later than the expiry time.
     */
    visibilityTimeout?: number;
    readonly deadLetterQueue?: IDeadLetterQueueOptions;
}

export interface IQueueMessage {
    headers: Record<string, string>;
    payload: unknown;
}

const QUEUE_NOT_FOUND_ERROR_CODE = 404;

export class EnvelopeQueueMessagePreprocessor implements IQueueMessagePreprocessor {
    public process(payload: string): IQueueMessage {
        // https://github.com/walmartlabs/cookie-cutter/issues/324
        // https://azure.github.io/azure-storage-node/services_queue_queuemessageencoder.js.html#sunlight-1-line-171
        const textToDecode = payload
            .replace(/&amp;/gm, "&")
            .replace(/&lt;/gm, "<")
            .replace(/&gt;/gm, ">")
            .replace(/&quot;/gm, '"')
            .replace(/&apos;/gm, "'");
        return JSON.parse(textToDecode) as {
            headers: Record<string, string>;
            payload: unknown;
        };
    }
}

export class QueueClient implements IRequireInitialization {
    private readonly queueService: QueueServiceClient;
    public readonly defaultQueue: string;
    private tracer: Tracer;
    private metrics: IMetrics;
    private logger: ILogger;
    private spanOperationName = "Azure Queue Client Call";

    constructor(private config: IQueueConfiguration) {
        this.defaultQueue = config.queueName;
        this.tracer = DefaultComponentContext.tracer;
        this.metrics = DefaultComponentContext.metrics;
        this.logger = DefaultComponentContext.logger;

        const { retryCount, retryInterval } = config;

        let storagePipelineOptions: StoragePipelineOptions;

        if (retryCount > 0) {
            const retryOperations: StorageRetryOptions = {
                retryDelayInMs: retryInterval,
                retryPolicyType: StorageRetryPolicyType.FIXED, // LINEAR
                maxTries: retryCount,
            };
            storagePipelineOptions = {
                retryOptions: retryOperations,
            };
        }

        if (config.connectionString) {
            this.queueService = QueueServiceClient.fromConnectionString(
                config.connectionString,
                storagePipelineOptions
            );
        } else if (config.url) {
            if (config.url.indexOf("http") === 0) {
                this.queueService = new QueueServiceClient(
                    config.url,
                    new StorageSharedKeyCredential(config.storageAccount, config.storageAccessKey),
                    storagePipelineOptions
                );
            } else {
                this.queueService = QueueServiceClient.fromConnectionString(
                    config.url,
                    storagePipelineOptions
                );
            }
        } else {
            this.queueService = new QueueServiceClient(
                `https://${config.storageAccount}.queue.core.windows.net`,
                new StorageSharedKeyCredential(config.storageAccount, config.storageAccessKey),
                storagePipelineOptions
            );
        }
    }

    public async initialize(context: IComponentContext) {
        this.tracer = context.tracer;
        this.metrics = context.metrics;
        this.logger = context.logger;
    }

    private generateMetricTags(
        queueName: string,
        statusCode: number | undefined,
        result: QueueMetricResults
    ): IMetricTags {
        const tags: { [key: string]: any } = {
            queue_name: queueName,
            storage_account: this.config.storageAccount,
            result,
        };
        if (statusCode) {
            tags.status_code = statusCode;
        }
        return tags;
    }

    private spanLogAndSetTags(
        span: Span,
        kind: string,
        funcName: string,
        queueName: string,
        logObj: any
    ): void {
        span.log(logObj);
        span.setTag(Tags.SPAN_KIND, kind);
        span.setTag(Tags.MESSAGE_BUS_DESTINATION, queueName);
        span.setTag(Tags.COMPONENT, "cookie-cutter-azure");
        span.setTag(Tags.DB_INSTANCE, this.config.storageAccount);
        span.setTag(Tags.DB_TYPE, "AzureQueue");
        span.setTag(Tags.PEER_SERVICE, "AzureQueue");
        span.setTag(OpenTracingTagKeys.FunctionName, funcName);
        span.setTag(QueueOpenTracingTagKeys.QueueName, queueName);
    }

    private async createQueueIfNotExists(
        spanContext: SpanContext,
        queueName: string
    ): Promise<void> {
        const spanName = "Create Azure Queue (If Not Exists)";
        const createQueueSpan = this.tracer.startSpan(spanName, { childOf: spanContext });
        createQueueSpan.log({ queueName });

        const queueClient = this.queueService.getQueueClient(queueName);

        try {
            const result = await queueClient.create();
            createQueueSpan.log({ result });
            createQueueSpan.finish();
            return;
        } catch (error) {
            failSpan(createQueueSpan, error);
            throw error;
        }
    }

    public write(
        spanContext: SpanContext,
        payload: any,
        headers: Record<string, string>,
        options?: IQueueCreateMessageOptions
    ): Promise<IQueueMessage> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: spanContext });
        const queueName = options?.queueName || this.defaultQueue;
        const kind = spanContext ? Tags.SPAN_KIND_RPC_CLIENT : undefined;
        this.spanLogAndSetTags(span, kind, this.write.name, queueName, { queue: queueName });
        this.tracer.inject(span, FORMAT_HTTP_HEADERS, headers);
        const text = JSON.stringify({
            payload,
            headers,
        });

        const attemptWrite = () =>
            new Promise<IQueueMessage>(async (resolve, reject) => {
                const { sizeKb, isTooBig } = this.isMessageTooBig(text);
                span.log({ sizeKb });
                if (isTooBig) {
                    const error: Error & { statusCode?: number } = new Error(
                        `Queue Message too big, must be less than 64kb, is: ${sizeKb}`
                    );
                    error.statusCode = 413;
                    failSpan(span, error);
                    span.finish();
                    this.metrics.increment(
                        QueueMetrics.Write,
                        this.generateMetricTags(
                            queueName,
                            undefined,
                            QueueMetricResults.ErrorTooBig
                        )
                    );
                    return reject(error);
                }

                const queueClient = this.queueService.getQueueClient(queueName);
                try {
                    const result = await queueClient.sendMessage(text, options);

                    if (result.errorCode) {
                        const error: Error & { statusCode?: number } = new Error(
                            "Queue creation failed."
                        );
                        error.statusCode = parseInt(result.errorCode, 10);
                        failSpan(span, error);
                    }
                    span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
                    span.finish();

                    this.metrics.increment(
                        QueueMetrics.Write,
                        this.generateMetricTags(
                            queueName,
                            result._response.status,
                            QueueMetricResults.Success
                        )
                    );

                    return resolve({ headers, payload });
                } catch (error) {
                    failSpan(span, error);
                    span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);
                    span.finish();
                    this.metrics.increment(
                        QueueMetrics.Write,
                        this.generateMetricTags(
                            queueName,
                            (error as any).statusCode,
                            QueueMetricResults.Error
                        )
                    );
                    return reject(error);
                }
            });

        return attemptWrite().catch((err) => {
            const isQueueNotFoundError =
                err && err.statusCode && err.statusCode === QUEUE_NOT_FOUND_ERROR_CODE;
            if (isQueueNotFoundError && this.config.createQueueIfNotExists) {
                return this.createQueueIfNotExists(spanContext, queueName).then(attemptWrite);
            } else {
                return Promise.reject(err);
            }
        });
    }

    public async read(
        spanContext: SpanContext,
        options?: IQueueReadOptions
    ): Promise<IQueueMessage[]> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: spanContext });

        let queueName: string = this.defaultQueue;
        let visibilityTimeout: number;
        let numOfMessages: number;
        if (options) {
            if (options.queueName) {
                queueName = options.queueName;
            }
            visibilityTimeout = options.visibilityTimeout;
            numOfMessages = options.numOfMessages;
        }

        const kind = spanContext ? Tags.SPAN_KIND_RPC_CLIENT : undefined;
        this.spanLogAndSetTags(span, kind, this.read.name, queueName, {
            queueName,
            visibilityTimeout,
            numOfMessages,
        });

        const queueClient = this.queueService.getQueueClient(queueName);

        return new Promise<IQueueMessage[]>(async (resolve, reject) => {
            try {
                const result = await queueClient.receiveMessages({
                    visibilityTimeout,
                    numberOfMessages: numOfMessages,
                });

                if (result.errorCode) {
                    span.log({ error: result.errorCode });
                    span.setTag(Tags.ERROR, true);

                    span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
                    span.finish();

                    this.metrics.increment(
                        QueueMetrics.Read,
                        this.generateMetricTags(
                            queueName,
                            result._response.status,
                            QueueMetricResults.Error
                        )
                    );
                    const error: Error & { code?: number } = new Error("Queue read failed");
                    reject(error);
                }

                span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
                span.finish();

                this.metrics.increment(
                    QueueMetrics.Read,
                    this.generateMetricTags(
                        queueName,
                        result._response.status,
                        QueueMetricResults.Success
                    )
                );

                resolve(
                    result.receivedMessageItems.reduce((messages, result) => {
                        const messageObj = this.config.preprocessor
                            ? this.config.preprocessor.process(result.messageText)
                            : (JSON.parse(result.messageText) as {
                                  headers: Record<string, string>;
                                  payload: unknown;
                              });

                        if (
                            !messageObj.headers ||
                            !messageObj.headers[EventSourcedMetadata.EventType]
                        ) {
                            span.log({ messageId: result.messageId });
                            failSpan(
                                span,
                                new Error("Message does not have EventType header value.")
                            );
                            this.logger.error("Message does not have EventType header value.", {
                                messageId: result.messageId,
                            });
                            return messages;
                        }

                        messageObj.headers[QueueMetadata.DequeueCount] = (
                            result.dequeueCount || 1
                        ).toString();
                        messageObj.headers[QueueMetadata.QueueName] = queueClient.name;
                        messageObj.headers[QueueMetadata.TimeToLive] = (
                            result.expiresOn.getTime() - Date.now()
                        ).toString();
                        messageObj.headers[QueueMetadata.VisibilityTimeout] = result.nextVisibleOn
                            .getTime()
                            .toString();
                        messageObj.headers[QueueMetadata.MessageId] = result.messageId;
                        messageObj.headers[QueueMetadata.PopReceipt] = result.popReceipt;

                        messages.push(messageObj);

                        return messages;
                    }, [])
                );
            } catch (error) {
                span.log({ error });
                span.setTag(Tags.ERROR, true);
                span.setTag(Tags.HTTP_STATUS_CODE, (error as any).statusCode);
                span.finish();

                this.metrics.increment(
                    QueueMetrics.Read,
                    this.generateMetricTags(
                        queueName,
                        (error as any).statusCode,
                        QueueMetricResults.Error
                    )
                );

                reject(error);
            }
        });
    }

    public markAsProcessed(
        spanContext: SpanContext,
        messageId: string,
        popReceipt: string,
        queueName: string = this.defaultQueue
    ): Promise<void> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: spanContext });
        const kind = spanContext ? Tags.SPAN_KIND_RPC_CLIENT : undefined;
        this.spanLogAndSetTags(span, kind, this.markAsProcessed.name, queueName, {
            queueName,
            messageId,
            popReceipt,
        });

        return new Promise<void>(async (resolve, reject) => {
            try {
                const result = await this.queueService
                    .getQueueClient(queueName)
                    .deleteMessage(messageId, popReceipt);
                if (result.errorCode) {
                    const error: Error & { code?: number } = new Error(
                        `Unable to delete message: ${messageId}`
                    );
                    span.log(error);
                    span.setTag(Tags.ERROR, true);
                }
                span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
                span.finish();

                this.metrics.increment(
                    QueueMetrics.MarkAsProcessed,
                    this.generateMetricTags(
                        queueName,
                        result._response.status,
                        QueueMetricResults.Success
                    )
                );
                resolve();
            } catch (error) {
                span.log({ error });
                span.setTag(Tags.ERROR, true);
                span.finish();

                this.metrics.increment(
                    QueueMetrics.MarkAsProcessed,
                    this.generateMetricTags(
                        queueName,
                        (error as any).statusCode,
                        QueueMetricResults.Error
                    )
                );
                reject(error);
            }
        });
    }

    public queueMetadata(
        spanContext: SpanContext,
        queueName: string
    ): Promise<QueueGetPropertiesResponse> {
        const span = this.tracer.startSpan(this.spanOperationName, { childOf: spanContext });
        const kind = spanContext ? Tags.SPAN_KIND_RPC_CLIENT : undefined;
        this.spanLogAndSetTags(span, kind, this.queueMetadata.name, queueName, { queueName });

        return new Promise(async (resolve, reject) => {
            try {
                const result = await this.queueService.getQueueClient(queueName).getProperties();

                if (result.errorCode) {
                    const error: Error & { code?: number } = new Error(
                        "Could not fetch queue metadata"
                    );
                    span.log(error);
                    span.setTag(Tags.ERROR, true);
                }

                span.setTag(Tags.HTTP_STATUS_CODE, result._response.status);
                span.finish();

                this.metrics.increment(
                    QueueMetrics.QueueMetadata,
                    this.generateMetricTags(
                        queueName,
                        result._response.status,
                        QueueMetricResults.Success
                    )
                );
                resolve(result);
            } catch (error) {
                span.log(error);
                span.setTag(Tags.ERROR, true);

                this.metrics.increment(
                    QueueMetrics.QueueMetadata,
                    this.generateMetricTags(
                        queueName,
                        (error as any).statusCode,
                        QueueMetricResults.Error
                    )
                );
                reject(error);
            }
        });
    }

    private getKB(input: string | Buffer) {
        const kb = (n: number) => n / 1024;
        if (typeof input === "string") {
            // QueueClient calculates final kb by creating a buffer from the input and encoding in base64.
            // Since we don't want to base64 twice to calculate things we can take byte length and multiply
            // by 8 / 6 to get final number of bytes that would have been output by base64. Every 6 bits of data
            // is encoded into one base64 character.
            // https://github.com/Azure/azure-storage-node/blob/0557d02cd2116046db1a2d7fc61a74aa28c8b557/lib/services/queue/queuemessageencoder.js#L76
            // https://stackoverflow.com/questions/13378815/base64-length-calculation
            return kb(Math.ceil((Buffer.byteLength(input, "utf8") * 8) / 6));
        }
        return kb(input.byteLength);
    }

    private isMessageTooBig(input: string | Buffer) {
        const sizeKb = this.getKB(input);
        return {
            sizeKb,
            isTooBig: sizeKb >= 64,
        };
    }
}
