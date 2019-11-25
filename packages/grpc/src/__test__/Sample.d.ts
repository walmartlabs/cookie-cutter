import * as $protobuf from "protobufjs";
/** Namespace sample. */
export namespace sample {
    /** Properties of a SampleRequest. */
    interface ISampleRequest {
        /** SampleRequest id */
        id?: number | null;
    }

    /** Represents a SampleRequest. */
    class SampleRequest implements ISampleRequest {
        /**
         * Constructs a new SampleRequest.
         * @param [properties] Properties to set
         */
        constructor(properties?: sample.ISampleRequest);

        /** SampleRequest id. */
        public id: number;

        /**
         * Creates a new SampleRequest instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SampleRequest instance
         */
        public static create(properties?: sample.ISampleRequest): sample.SampleRequest;

        /**
         * Encodes the specified SampleRequest message. Does not implicitly {@link sample.SampleRequest.verify|verify} messages.
         * @param message SampleRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: sample.ISampleRequest,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Encodes the specified SampleRequest message, length delimited. Does not implicitly {@link sample.SampleRequest.verify|verify} messages.
         * @param message SampleRequest message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(
            message: sample.ISampleRequest,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a SampleRequest message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SampleRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): sample.SampleRequest;

        /**
         * Decodes a SampleRequest message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SampleRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): sample.SampleRequest;

        /**
         * Verifies a SampleRequest message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): string | null;

        /**
         * Creates a SampleRequest message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SampleRequest
         */
        public static fromObject(object: { [k: string]: any }): sample.SampleRequest;

        /**
         * Creates a plain object from a SampleRequest message. Also converts values to other types if specified.
         * @param message SampleRequest
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(
            message: sample.SampleRequest,
            options?: $protobuf.IConversionOptions
        ): { [k: string]: any };

        /**
         * Converts this SampleRequest to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }

    /** Properties of a SampleResponse. */
    interface ISampleResponse {
        /** SampleResponse name */
        name?: string | null;
    }

    /** Represents a SampleResponse. */
    class SampleResponse implements ISampleResponse {
        /**
         * Constructs a new SampleResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: sample.ISampleResponse);

        /** SampleResponse name. */
        public name: string;

        /**
         * Creates a new SampleResponse instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SampleResponse instance
         */
        public static create(properties?: sample.ISampleResponse): sample.SampleResponse;

        /**
         * Encodes the specified SampleResponse message. Does not implicitly {@link sample.SampleResponse.verify|verify} messages.
         * @param message SampleResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: sample.ISampleResponse,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Encodes the specified SampleResponse message, length delimited. Does not implicitly {@link sample.SampleResponse.verify|verify} messages.
         * @param message SampleResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(
            message: sample.ISampleResponse,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a SampleResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SampleResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): sample.SampleResponse;

        /**
         * Decodes a SampleResponse message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SampleResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: $protobuf.Reader | Uint8Array): sample.SampleResponse;

        /**
         * Verifies a SampleResponse message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): string | null;

        /**
         * Creates a SampleResponse message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SampleResponse
         */
        public static fromObject(object: { [k: string]: any }): sample.SampleResponse;

        /**
         * Creates a plain object from a SampleResponse message. Also converts values to other types if specified.
         * @param message SampleResponse
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(
            message: sample.SampleResponse,
            options?: $protobuf.IConversionOptions
        ): { [k: string]: any };

        /**
         * Converts this SampleResponse to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }

    /** Represents a SampleService */
    class SampleService extends $protobuf.rpc.Service {
        /**
         * Constructs a new SampleService service.
         * @param rpcImpl RPC implementation
         * @param [requestDelimited=false] Whether requests are length-delimited
         * @param [responseDelimited=false] Whether responses are length-delimited
         */
        constructor(
            rpcImpl: $protobuf.RPCImpl,
            requestDelimited?: boolean,
            responseDelimited?: boolean
        );

        /**
         * Creates new SampleService service using the specified rpc implementation.
         * @param rpcImpl RPC implementation
         * @param [requestDelimited=false] Whether requests are length-delimited
         * @param [responseDelimited=false] Whether responses are length-delimited
         * @returns RPC service. Useful where requests and/or responses are streamed.
         */
        public static create(
            rpcImpl: $protobuf.RPCImpl,
            requestDelimited?: boolean,
            responseDelimited?: boolean
        ): SampleService;

        /**
         * Calls NoStreaming.
         * @param request SampleRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and SampleResponse
         */
        public noStreaming(
            request: sample.ISampleRequest,
            callback: sample.SampleService.NoStreamingCallback
        ): void;

        /**
         * Calls NoStreaming.
         * @param request SampleRequest message or plain object
         * @returns Promise
         */
        public noStreaming(request: sample.ISampleRequest): Promise<sample.SampleResponse>;

        /**
         * Calls StreamingIn.
         * @param request SampleRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and SampleResponse
         */
        public streamingIn(
            request: sample.ISampleRequest,
            callback: sample.SampleService.StreamingInCallback
        ): void;

        /**
         * Calls StreamingIn.
         * @param request SampleRequest message or plain object
         * @returns Promise
         */
        public streamingIn(request: sample.ISampleRequest): Promise<sample.SampleResponse>;

        /**
         * Calls StreamingOut.
         * @param request SampleRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and SampleResponse
         */
        public streamingOut(
            request: sample.ISampleRequest,
            callback: sample.SampleService.StreamingOutCallback
        ): void;

        /**
         * Calls StreamingOut.
         * @param request SampleRequest message or plain object
         * @returns Promise
         */
        public streamingOut(request: sample.ISampleRequest): Promise<sample.SampleResponse>;

        /**
         * Calls Streaming.
         * @param request SampleRequest message or plain object
         * @param callback Node-style callback called with the error, if any, and SampleResponse
         */
        public streaming(
            request: sample.ISampleRequest,
            callback: sample.SampleService.StreamingCallback
        ): void;

        /**
         * Calls Streaming.
         * @param request SampleRequest message or plain object
         * @returns Promise
         */
        public streaming(request: sample.ISampleRequest): Promise<sample.SampleResponse>;
    }

    namespace SampleService {
        /**
         * Callback as used by {@link sample.SampleService#noStreaming}.
         * @param error Error, if any
         * @param [response] SampleResponse
         */
        type NoStreamingCallback = (error: Error | null, response?: sample.SampleResponse) => void;

        /**
         * Callback as used by {@link sample.SampleService#streamingIn}.
         * @param error Error, if any
         * @param [response] SampleResponse
         */
        type StreamingInCallback = (error: Error | null, response?: sample.SampleResponse) => void;

        /**
         * Callback as used by {@link sample.SampleService#streamingOut}.
         * @param error Error, if any
         * @param [response] SampleResponse
         */
        type StreamingOutCallback = (error: Error | null, response?: sample.SampleResponse) => void;

        /**
         * Callback as used by {@link sample.SampleService#streaming}.
         * @param error Error, if any
         * @param [response] SampleResponse
         */
        type StreamingCallback = (error: Error | null, response?: sample.SampleResponse) => void;
    }
}
