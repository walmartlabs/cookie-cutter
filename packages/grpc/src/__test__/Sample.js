/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.sample = (function() {

    /**
     * Namespace sample.
     * @exports sample
     * @namespace
     */
    var sample = {};

    sample.SampleRequest = (function() {

        /**
         * Properties of a SampleRequest.
         * @memberof sample
         * @interface ISampleRequest
         * @property {number|null} [id] SampleRequest id
         */

        /**
         * Constructs a new SampleRequest.
         * @memberof sample
         * @classdesc Represents a SampleRequest.
         * @implements ISampleRequest
         * @constructor
         * @param {sample.ISampleRequest=} [properties] Properties to set
         */
        function SampleRequest(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SampleRequest id.
         * @member {number} id
         * @memberof sample.SampleRequest
         * @instance
         */
        SampleRequest.prototype.id = 0;

        /**
         * Creates a new SampleRequest instance using the specified properties.
         * @function create
         * @memberof sample.SampleRequest
         * @static
         * @param {sample.ISampleRequest=} [properties] Properties to set
         * @returns {sample.SampleRequest} SampleRequest instance
         */
        SampleRequest.create = function create(properties) {
            return new SampleRequest(properties);
        };

        /**
         * Encodes the specified SampleRequest message. Does not implicitly {@link sample.SampleRequest.verify|verify} messages.
         * @function encode
         * @memberof sample.SampleRequest
         * @static
         * @param {sample.ISampleRequest} message SampleRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SampleRequest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.id != null && message.hasOwnProperty("id"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.id);
            return writer;
        };

        /**
         * Encodes the specified SampleRequest message, length delimited. Does not implicitly {@link sample.SampleRequest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof sample.SampleRequest
         * @static
         * @param {sample.ISampleRequest} message SampleRequest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SampleRequest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a SampleRequest message from the specified reader or buffer.
         * @function decode
         * @memberof sample.SampleRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {sample.SampleRequest} SampleRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SampleRequest.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.sample.SampleRequest();
            while (reader.pos < end) {
                var tag = reader.uint32();
                switch (tag >>> 3) {
                case 1:
                    message.id = reader.int32();
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a SampleRequest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof sample.SampleRequest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {sample.SampleRequest} SampleRequest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SampleRequest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a SampleRequest message.
         * @function verify
         * @memberof sample.SampleRequest
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        SampleRequest.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.id != null && message.hasOwnProperty("id"))
                if (!$util.isInteger(message.id))
                    return "id: integer expected";
            return null;
        };

        /**
         * Creates a SampleRequest message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof sample.SampleRequest
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {sample.SampleRequest} SampleRequest
         */
        SampleRequest.fromObject = function fromObject(object) {
            if (object instanceof $root.sample.SampleRequest)
                return object;
            var message = new $root.sample.SampleRequest();
            if (object.id != null)
                message.id = object.id | 0;
            return message;
        };

        /**
         * Creates a plain object from a SampleRequest message. Also converts values to other types if specified.
         * @function toObject
         * @memberof sample.SampleRequest
         * @static
         * @param {sample.SampleRequest} message SampleRequest
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        SampleRequest.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults)
                object.id = 0;
            if (message.id != null && message.hasOwnProperty("id"))
                object.id = message.id;
            return object;
        };

        /**
         * Converts this SampleRequest to JSON.
         * @function toJSON
         * @memberof sample.SampleRequest
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        SampleRequest.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return SampleRequest;
    })();

    sample.SampleResponse = (function() {

        /**
         * Properties of a SampleResponse.
         * @memberof sample
         * @interface ISampleResponse
         * @property {string|null} [name] SampleResponse name
         */

        /**
         * Constructs a new SampleResponse.
         * @memberof sample
         * @classdesc Represents a SampleResponse.
         * @implements ISampleResponse
         * @constructor
         * @param {sample.ISampleResponse=} [properties] Properties to set
         */
        function SampleResponse(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SampleResponse name.
         * @member {string} name
         * @memberof sample.SampleResponse
         * @instance
         */
        SampleResponse.prototype.name = "";

        /**
         * Creates a new SampleResponse instance using the specified properties.
         * @function create
         * @memberof sample.SampleResponse
         * @static
         * @param {sample.ISampleResponse=} [properties] Properties to set
         * @returns {sample.SampleResponse} SampleResponse instance
         */
        SampleResponse.create = function create(properties) {
            return new SampleResponse(properties);
        };

        /**
         * Encodes the specified SampleResponse message. Does not implicitly {@link sample.SampleResponse.verify|verify} messages.
         * @function encode
         * @memberof sample.SampleResponse
         * @static
         * @param {sample.ISampleResponse} message SampleResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SampleResponse.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.name != null && message.hasOwnProperty("name"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
            return writer;
        };

        /**
         * Encodes the specified SampleResponse message, length delimited. Does not implicitly {@link sample.SampleResponse.verify|verify} messages.
         * @function encodeDelimited
         * @memberof sample.SampleResponse
         * @static
         * @param {sample.ISampleResponse} message SampleResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SampleResponse.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a SampleResponse message from the specified reader or buffer.
         * @function decode
         * @memberof sample.SampleResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {sample.SampleResponse} SampleResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SampleResponse.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.sample.SampleResponse();
            while (reader.pos < end) {
                var tag = reader.uint32();
                switch (tag >>> 3) {
                case 1:
                    message.name = reader.string();
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a SampleResponse message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof sample.SampleResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {sample.SampleResponse} SampleResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SampleResponse.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a SampleResponse message.
         * @function verify
         * @memberof sample.SampleResponse
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        SampleResponse.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.name != null && message.hasOwnProperty("name"))
                if (!$util.isString(message.name))
                    return "name: string expected";
            return null;
        };

        /**
         * Creates a SampleResponse message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof sample.SampleResponse
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {sample.SampleResponse} SampleResponse
         */
        SampleResponse.fromObject = function fromObject(object) {
            if (object instanceof $root.sample.SampleResponse)
                return object;
            var message = new $root.sample.SampleResponse();
            if (object.name != null)
                message.name = String(object.name);
            return message;
        };

        /**
         * Creates a plain object from a SampleResponse message. Also converts values to other types if specified.
         * @function toObject
         * @memberof sample.SampleResponse
         * @static
         * @param {sample.SampleResponse} message SampleResponse
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        SampleResponse.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults)
                object.name = "";
            if (message.name != null && message.hasOwnProperty("name"))
                object.name = message.name;
            return object;
        };

        /**
         * Converts this SampleResponse to JSON.
         * @function toJSON
         * @memberof sample.SampleResponse
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        SampleResponse.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return SampleResponse;
    })();

    sample.SampleService = (function() {

        /**
         * Constructs a new SampleService service.
         * @memberof sample
         * @classdesc Represents a SampleService
         * @extends $protobuf.rpc.Service
         * @constructor
         * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
         * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
         * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
         */
        function SampleService(rpcImpl, requestDelimited, responseDelimited) {
            $protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);
        }

        (SampleService.prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = SampleService;

        /**
         * Creates new SampleService service using the specified rpc implementation.
         * @function create
         * @memberof sample.SampleService
         * @static
         * @param {$protobuf.RPCImpl} rpcImpl RPC implementation
         * @param {boolean} [requestDelimited=false] Whether requests are length-delimited
         * @param {boolean} [responseDelimited=false] Whether responses are length-delimited
         * @returns {SampleService} RPC service. Useful where requests and/or responses are streamed.
         */
        SampleService.create = function create(rpcImpl, requestDelimited, responseDelimited) {
            return new this(rpcImpl, requestDelimited, responseDelimited);
        };

        /**
         * Callback as used by {@link sample.SampleService#noStreaming}.
         * @memberof sample.SampleService
         * @typedef NoStreamingCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {sample.SampleResponse} [response] SampleResponse
         */

        /**
         * Calls NoStreaming.
         * @function noStreaming
         * @memberof sample.SampleService
         * @instance
         * @param {sample.ISampleRequest} request SampleRequest message or plain object
         * @param {sample.SampleService.NoStreamingCallback} callback Node-style callback called with the error, if any, and SampleResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(SampleService.prototype.noStreaming = function noStreaming(request, callback) {
            return this.rpcCall(noStreaming, $root.sample.SampleRequest, $root.sample.SampleResponse, request, callback);
        }, "name", { value: "NoStreaming" });

        /**
         * Calls NoStreaming.
         * @function noStreaming
         * @memberof sample.SampleService
         * @instance
         * @param {sample.ISampleRequest} request SampleRequest message or plain object
         * @returns {Promise<sample.SampleResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link sample.SampleService#streamingIn}.
         * @memberof sample.SampleService
         * @typedef StreamingInCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {sample.SampleResponse} [response] SampleResponse
         */

        /**
         * Calls StreamingIn.
         * @function streamingIn
         * @memberof sample.SampleService
         * @instance
         * @param {sample.ISampleRequest} request SampleRequest message or plain object
         * @param {sample.SampleService.StreamingInCallback} callback Node-style callback called with the error, if any, and SampleResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(SampleService.prototype.streamingIn = function streamingIn(request, callback) {
            return this.rpcCall(streamingIn, $root.sample.SampleRequest, $root.sample.SampleResponse, request, callback);
        }, "name", { value: "StreamingIn" });

        /**
         * Calls StreamingIn.
         * @function streamingIn
         * @memberof sample.SampleService
         * @instance
         * @param {sample.ISampleRequest} request SampleRequest message or plain object
         * @returns {Promise<sample.SampleResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link sample.SampleService#streamingOut}.
         * @memberof sample.SampleService
         * @typedef StreamingOutCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {sample.SampleResponse} [response] SampleResponse
         */

        /**
         * Calls StreamingOut.
         * @function streamingOut
         * @memberof sample.SampleService
         * @instance
         * @param {sample.ISampleRequest} request SampleRequest message or plain object
         * @param {sample.SampleService.StreamingOutCallback} callback Node-style callback called with the error, if any, and SampleResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(SampleService.prototype.streamingOut = function streamingOut(request, callback) {
            return this.rpcCall(streamingOut, $root.sample.SampleRequest, $root.sample.SampleResponse, request, callback);
        }, "name", { value: "StreamingOut" });

        /**
         * Calls StreamingOut.
         * @function streamingOut
         * @memberof sample.SampleService
         * @instance
         * @param {sample.ISampleRequest} request SampleRequest message or plain object
         * @returns {Promise<sample.SampleResponse>} Promise
         * @variation 2
         */

        /**
         * Callback as used by {@link sample.SampleService#streaming}.
         * @memberof sample.SampleService
         * @typedef StreamingCallback
         * @type {function}
         * @param {Error|null} error Error, if any
         * @param {sample.SampleResponse} [response] SampleResponse
         */

        /**
         * Calls Streaming.
         * @function streaming
         * @memberof sample.SampleService
         * @instance
         * @param {sample.ISampleRequest} request SampleRequest message or plain object
         * @param {sample.SampleService.StreamingCallback} callback Node-style callback called with the error, if any, and SampleResponse
         * @returns {undefined}
         * @variation 1
         */
        Object.defineProperty(SampleService.prototype.streaming = function streaming(request, callback) {
            return this.rpcCall(streaming, $root.sample.SampleRequest, $root.sample.SampleResponse, request, callback);
        }, "name", { value: "Streaming" });

        /**
         * Calls Streaming.
         * @function streaming
         * @memberof sample.SampleService
         * @instance
         * @param {sample.ISampleRequest} request SampleRequest message or plain object
         * @returns {Promise<sample.SampleResponse>} Promise
         * @variation 2
         */

        return SampleService;
    })();

    return sample;
})();

module.exports = $root;
