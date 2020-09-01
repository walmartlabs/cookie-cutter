ECHO "Installing Curl"

choco install curl -y
choco install yarn -y

yarn install
yarn build

ECHO "Starting Downloads"

curl -o az_storage_emulator.msi 'https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409' 
curl -o cosmos.msi 'https://aka.ms/cosmosdb-emulator'
curl -o nssm.zip 'https://nssm.cc/release/nssm-2.24.zip'
curl -o SQLLocalDB.MSI 'https://go.microsoft.com/fwlink/?LinkID=866658'

ECHO "Downloads Completed"

# Cosmos DB emulator
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Start-Process -wait .\cosmos.msi -ArgumentList "/quiet"


# Service Manager
Expand-Archive .\nssm.zip -DestinationPath C:\nssm -Force

# Cosmos as a service
C:\nssm\nssm-2.24\win64\nssm.exe install cosmosdbemulator "C:\service_startup.cmd"
C:\nssm\nssm-2.24\win64\nssm.exe set cosmosdbemulator Start SERVICE_DELAYED_AUTO_START
C:\nssm\nssm-2.24\win64\nssm.exe set cosmosdbemulator Type SERVICE_INTERACTIVE_PROCESS
C:\nssm\nssm-2.24\win64\nssm.exe start cosmosdbemulator

Set-ItemProperty -Name 'FailureActions' -Path 'HKLM:\HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\cosmosdbemulator' -Value ([byte[]](0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x3,0x0,0x0,0x0,0x14,0x0,0x0,0x0,0x1,0x0,0x0,0x0,0x60,0xea,0x0,0x0,0x1,0x0,0x0,0x0,0x60,0xea,0x0,0x0,0x1,0x0,0x0,0x0,0x60,0xea,0x0,0x0))
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

ECHO  "Started Cosmos Process"

# SQL DB
Start-Process -wait msiexec -ArgumentList "/i",".\SqlLocalDB.MSI","/qn","IACCEPTSQLLOCALDBLICENSETERMS=YES"

ECHO  "Started SQL DB"

# Azure storage emulator
Start-Process -wait .\az_storage_emulator.msi -ArgumentList "/quiet"

$vm_ip = (Get-NetIPAddress -InterfaceAlias "Ethernet" -AddressFamily "IPv4").IPAddress
$storage_emulator_config_path = "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe.config"
((Get-Content -path $storage_emulator_config_path -Raw) -replace '127.0.0.1', $vm_ip ) | Set-Content -Path $storage_emulator_config_path

ECHO "Started Azure Storage Emulator"

Start-Sleep -s 60

ECHO "Exporting env variables"

[System.Environment]::SetEnvironmentVariable('NODE_TLS_REJECT_UNAUTHORIZED','0',[System.EnvironmentVariableTarget]::Machine)
[System.Environment]::SetEnvironmentVariable('COSMOS_SECRET_KEY','2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',[System.EnvironmentVariableTarget]::Machine)
[System.Environment]::SetEnvironmentVariable('AZURE_STORAGE_CONNECTION_STRING','DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;',[System.EnvironmentVariableTarget]::Machine)
[System.Environment]::SetEnvironmentVariable('AZURE_STORAGE_ACCESS_KEY','Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',[System.EnvironmentVariableTarget]::Machine)

ECHO "Starting tests"

cd packages/azure
yarn integrate
