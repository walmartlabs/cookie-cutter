choco install yarn -y

ECHO "Yarn Install && Yarn Build"

yarn install
yarn build

ECHO "Provisioning"

PowerShell -executionpolicy unrestricted -command packages\azure\src\azureemulator\provision.ps1

ECHO "Emu Startup"

PowerShell -executionpolicy unrestricted -command packages\azure\src\azureemulator\start_emulators.ps1

Start-Sleep -s 15
ECHO "Starting tests"

[System.Environment]::SetEnvironmentVariable('NODE_TLS_REJECT_UNAUTHORIZED','0',[System.EnvironmentVariableTarget]::Machine)
[System.Environment]::SetEnvironmentVariable('COSMOS_SECRET_KEY','2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',[System.EnvironmentVariableTarget]::Machine)
[System.Environment]::SetEnvironmentVariable('AZURE_STORAGE_CONNECTION_STRING','DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;',[System.EnvironmentVariableTarget]::Machine)
[System.Environment]::SetEnvironmentVariable('AZURE_STORAGE_ACCESS_KEY','Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',[System.EnvironmentVariableTarget]::Machine)

cd packages/azure
yarn integrate
