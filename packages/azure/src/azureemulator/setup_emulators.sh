#!/bin/sh

# Download files needed

# storage emulator
curl 'https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409' --output az_storage_emulator.msi
# cosmos emulator
curl 'https://aka.ms/cosmosdb-emulator' --output cosmos.msi
# service manager
curl 'https://nssm.cc/release/nssm-2.24.zip' --output nssm.zip
# sql db
curl 'https://go.microsoft.com/fwlink/?LinkID=866658' --output SQLLocalDB.MSI

# Start vagrant
vagrant up

# Export connection strings
export NODE_TLS_REJECT_UNAUTHORIZED="0"
export COSMOS_SECRET_KEY="C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;"
export AZURE_STORAGE_ACCESS_KEY="Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="