# Cosmos DB & Azure Storage Emulator

## Introduction

The scripts contained here set up emulators for Cosmos DB and Azure Storage in a Windows VM. This can be used for local testing or running integration tests on a non-windows environment. The Azure Cosmos Emulator provides a local environment that emulates the Azure Cosmos DB service for development purposes. The Microsoft Azure Storage Emulator is a tool that emulates the Azure Blob, Queue, and Table services for local development purposes.

## Pre-requisites

-   Install 'Virtual Box', the provider to be used by Vagrant.

    `https://www.virtualbox.org/wiki/Downloads`

*   Vagrant

    `brew install vagrant`

## Running integration tests

-   Make sure that the `core` package is built. As it is required by other packages.

    Run `yarn && yarn build` at this path `cookie-cutter/packages/core`
    Do the same if you want to build other packages.

-   `yarn integrate`

    start VM, run setup steps, run tests and destroy VM.

-   `yarn integrate --keep`

    leaves the VM running post test runs. Speeds up test re-runs.

    When starting the VM for the first time, the emulators get downloaded, installed and spun up, which may take 10-15 minutes.

## Setup Details

-   `setup_env_vars_locally.sh` - exports all the variables needed for running integration testing locally.
    `Note`: Please also update the file `start_emulators.ps1` and `.travis.yaml' if you would need these environment vaiables during server CI.

-   `start_emulators.ps1` - provision script which downloads, installs an spins up emulators.

-   `vagrant up --provision` - sets up the Windows VM and forces running the provision script even if VM is already up.

-   `vagrant destroy` - stops the VM and all resources that were created during the machine creation process.

-   `vagrant rdp` - start an RDP client for a remote desktop session with the guest.

-   `run_integration_tests.ps1` - PowerShell script that sets up and runs integration tests in CI

More details on [Vagrant](https://www.vagrantup.com/docs/cli)

## Environment Variables

The following environment variables are set by the `yarn integrate` command:

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

-   you can access the Windows VM through the `Virtual Box` app.

### Localhost cert not valid

Follow instructions here:
https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator?tabs=cli%2Cssl-netstd21#macos-environment

### Authorization errors

If you get an authorization error, make sure that the Windows VM time is set correctly. This can drift over time, so RDP onto the box and verify it.

### Rejected cert errors

If you get errors from node about a reject self-signed cert, ensure you have the following set:
`export NODE_TLS_REJECT_UNAUTHORIZED="0"`
NOTE: never set this in a production environment, it is strictly for testing purposes.
