# Cosmos DB & Azure Storage Emulator

## Introduction

These scripts will allow you to set up emulators for cosmosDB and azure storage locally. This can be used for local testing, or running integration tests on a non-windows environment. The Azure Cosmos Emulator provides a local environment that emulates the Azure Cosmos DB service for development purposes. The Microsoft Azure storage emulator is a tool that emulates the Azure Blob, Queue, and Table services for local development purposes.

## Pre-requistites
* Vagrant


## Setup

Run `setup_emulators.sh`. This will download the necessary files & start the vagrant box. You will only need to run the setup once, after which you can just start the vagrant box directly with `vagrant up`.

Note that this process will take some time on the first execution. There are several large files to be downloaded. Subsequent start-ups will be quicker.

### Azure Comsos Emulator

Cosmos DB emulator can be accessed at the following URL:
`https://localhost:8081/_explorer/index.html`

### Azure Storage Emulator

The service endpoints for the storage emulator are:

    Blob service: http://127.0.0.1:10000/<account-name>/<resource-path>
    Queue service: http://127.0.0.1:10001/<account-name>/<resource-path>
    Table service: http://127.0.0.1:10002/<account-name>/<resource-path>


# Troubleshooting

## Authorization errors
If you get an authorization error, make sure that the Windows VM time is set correctly. This can drift over time, so RDP onto the box and verify it.

## Rejected cert errors
If you get errors from node about a reject self-signed cert, ensure you have the following set:
`export NODE_TLS_REJECT_UNAUTHORIZED="0"`
NOTE: never set this in a production environment, it is strictly for testing purposes.


# Links

- Storage Emulator: `https://docs.microsoft.com/en-us/azure/storage/common/storage-use-emulator?toc=/azure/storage/blobs/toc.json`
- CosmosDB Emulator: `https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator?tabs=ssl-netstd21`