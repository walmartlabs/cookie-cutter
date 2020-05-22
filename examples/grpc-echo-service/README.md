# gRPC Echo Service

This examples demonstrates how to implement a simple non-streaming gRPC server.

## How to Run

```
yarn start
```

## Output

```
2019-09-12T17:04:40.911Z |  INFO | starting Cookie Cutter service | version=1.2.0-beta.0 | serviceName=@examples/grpc-echo-service | serviceVersion=0.0.0
2019-09-12T17:04:40.938Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 1
Response { value: 'hello world 1' }
2019-09-12T17:04:41.100Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 2
Response { value: 'hello world 2' }
2019-09-12T17:04:41.259Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 3
Response { value: 'hello world 3' }
2019-09-12T17:04:41.416Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 4
Response { value: 'hello world 4' }
2019-09-12T17:04:41.575Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 5
Response { value: 'hello world 5' }
2019-09-12T17:04:41.734Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 6
Response { value: 'hello world 6' }
2019-09-12T17:04:41.890Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 7
Response { value: 'hello world 7' }
2019-09-12T17:04:42.043Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 8
Response { value: 'hello world 8' }
2019-09-12T17:04:42.197Z |  INFO | received request | grpc.OperationPath=/samples/Echo | grpc.Peer=ipv6:[::1]:50701 | value=hello world 9
Response { value: 'hello world 9' }
2019-09-12T17:04:42.358Z |  INFO | shutting down
```