#!/bin/sh

# Export Env Variables Locally

# Test COSMOS_SECRET_KEY from https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator?tabs=cli%2Cssl-netstd21
export COSMOS_SECRET_KEY="C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
# Test Storage Creds from https://docs.microsoft.com/en-us/azure/storage/common/storage-use-emulator
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;"
export AZURE_STORAGE_ACCESS_KEY="Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
export AZURE_STORAGE_ACCOUNT="devstoreaccount1"
export AZURE_STORAGE_URL="http://127.0.0.1:10000/devstoreaccount1"
export AZURE_QUEUE_URL="http://127.0.0.1:10001"
export AZURE_TABLE_URL="http://127.0.0.1:10002"

# Only HTTPS supported by CosmosClient so we need to disable this
export NODE_TLS_REJECT_UNAUTHORIZED="0"

echo "COSMOS_SECRET_KEY = $COSMOS_SECRET_KEY"
echo "AZURE_STORAGE_CONNECTION_STRING = $AZURE_STORAGE_CONNECTION_STRING"
echo "AZURE_STORAGE_ACCESS_KEY = $AZURE_STORAGE_ACCESS_KEY"
echo "AZURE_STORAGE_ACCOUNT = $AZURE_STORAGE_ACCOUNT"
echo "AZURE_STORAGE_URL = $AZURE_STORAGE_URL"
echo "NODE_TLS_REJECT_UNAUTHORIZED = $NODE_TLS_REJECT_UNAUTHORIZED"
