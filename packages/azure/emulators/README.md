# Cosmos DB & Azure Storage Emulator

## Introduction

These scripts will allow you to set up emulators for Cosmos DB and azure storage locally. This can be used for local testing or running integration tests on a non-windows environment. The Azure Cosmos Emulator provides a local environment that emulates the Azure Cosmos DB service for development purposes. The Microsoft Azure storage emulator is a tool that emulates the Azure Blob, Queue, and Table services for local development purposes.

## Pre-requisites

* Vagrant

    `brew install vagrant`

## Setup

* `setup_env_vars_locally.sh` - to export all the variables needed for running integration testing locally.

* `vagrant up` - sets up the Windows VM.

* `vagrant destroy` - stops the VM and remove all associated files.

* `vagrant reload --provision` - reload the VM and rerun the provision script: `start_emulators.ps1`.

* `vagrant rdp` - start an RDP client for a remote desktop session with the guest.

More details on [Vagrant](https://www.vagrantup.com/docs/cli)

When starting up or reloading the VM, the emulators get downloaded, installed and spun up, which may take around 10 minutes.

## Environment Variables

    export NODE_TLS_REJECT_UNAUTHORIZED="0"
    
    export COSMOS_SECRET_KEY="C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="

    export AZURE_STORAGE_ACCOUNT="devstoreaccount1"

    export AZURE_STORAGE_ACCESS_KEY="Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="

    export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;"

[Source](https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator?tabs=cli%2Cssl-netstd21) for `COSMOS_SECRET_KEY`. [Source](https://docs.microsoft.com/en-us/azure/storage/common/storage-use-emulator) for test Azure Storage Credentials. CosmosClient only supports `HTTPS` so we need to disable `NODE_TLS_REJECT_UNAUTHORIZED`.

## Azure Cosmos Emulator

Cosmos DB emulator can be accessed at the following URL: 

    https://localhost:8081/_explorer/index.html

Storage Emulator details: `https://docs.microsoft.com/en-us/azure/storage/common/storage-use-emulator?toc=/azure/storage/blobs/toc.json`

## Azure Storage Emulator

The service endpoints for the storage emulator are:

    Blob service: http://127.0.0.1:10000/<account-name>/<resource-path>
    Queue service: http://127.0.0.1:10001/<account-name>/<resource-path>
    Table service: http://127.0.0.1:10002/<account-name>/<resource-path>

Cosmos DB Emulator: `https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator?tabs=ssl-netstd21`

## Troubleshooting

### Localhost cert not valid

Follow instructions here:
https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator?tabs=cli%2Cssl-netstd21#macos-environment

### Authorization errors
If you get an authorization error, make sure that the Windows VM time is set correctly. This can drift over time, so RDP onto the box and verify it.

### Rejected cert errors
If you get errors from node about a reject self-signed cert, ensure you have the following set:
`export NODE_TLS_REJECT_UNAUTHORIZED="0"`
NOTE: never set this in a production environment, it is strictly for testing purposes.
