# choco install yarn -y
$app = Get-WmiObject -Class Win32_Product | Where-Object { 
    $_.Name -match "Azure Cosmos DB Emulator" 
}

$app.Uninstall()

Remove-Item –path %ProgramFiles%\Azure Cosmos DB Emulator –recurse
Remote-Item -path %LOCALAPPDATA%\CosmosDBEmulator –recurse


choco install curl
# ECHO "Yarn Install && Yarn Build"

# yarn install
# yarn build

# ECHO "Provisioning"

# Cosmos DB emulator
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
(New-Object System.Net.WebClient).DownloadFile('https://aka.ms/cosmosdb-emulator', '.\cosmos.msi')
Start-Process -wait .\cosmos.msi -ArgumentList "/quiet"


Import-Module "$env:ProgramFiles\Azure Cosmos DB Emulator\PSModules\Microsoft.Azure.CosmosDB.Emulator"
Get-CosmosDbEmulatorStatus

cd "$env:ProgramFiles\Azure Cosmos DB Emulator"
.\Microsoft.Azure.Cosmos.Emulator.exe /startwprtraces
Start-CosmosDbEmulator
Get-CosmosDbEmulatorStatus

.\Microsoft.Azure.Cosmos.Emulator.exe /stopwprtraces

netstat -abn

#curl https://bashupload.com/docdbemulator_000001.etl --data-binary @docdbemulator_000001.etl
# Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

# SQL DB
# (New-Object System.Net.WebClient).DownloadFile('https://download.microsoft.com/download/8/D/D/8DD7BDBA-CEF7-4D8E-8C16-D9F69527F909/ENU/x64/SqlLocalDB.MSI', '.\SqlLocalDB.MSI')
# Start-Process -wait msiexec -ArgumentList "/i",".\SqlLocalDB.MSI","/qn","IACCEPTSQLLOCALDBLICENSETERMS=YES"

# Azure storage emulator
# (New-Object System.Net.WebClient).DownloadFile('https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409', '.\az_storage_emulator.msi')
# Start-Process -wait .\az_storage_emulator.msi -ArgumentList "/quiet"

# $vm_ip = (Get-NetIPAddress -InterfaceAlias "Ethernet" -AddressFamily "IPv4").IPAddress
# $storage_emulator_config_path = "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe.config"
# ((Get-Content -path $storage_emulator_config_path -Raw) -replace '127.0.0.1', $vm_ip ) | Set-Content -Path $storage_emulator_config_path

# Start-Sleep -s 60    

# ECHO "SqlLocalDB.exe create MSSQLLocalDB"
# Start-Process -wait "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "create","MSSQLLocalDB"

# ECHO "SqlLocalDB.exe start MSSQLLocalDB"
# Start-Process -wait "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "start","MSSQLLocalDB"

# ECHO "AzureStorageEmulator.exe start"
# Start-Process -wait "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "start"

# ECHO "Start-CosmosDbEmulator"
# Start-Process "C:\Program Files\Azure Cosmos DB Emulator\CosmosDB.Emulator.exe" -ArgumentList "/noexplorer","/allownetworkaccess","/computeport=0","/key=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==","/nofirewall","/noui","/disableratelimiting" -ErrorAction Stop -PassThru



# Start-Sleep -s 60
# ECHO "Starting tests"


# $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
# $env:COSMOS_SECRET_KEY="2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
# $env:AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;"
# $env:AZURE_STORAGE_ACCESS_KEY="Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="

# [System.Environment]::SetEnvironmentVariable('NODE_TLS_REJECT_UNAUTHORIZED','0',[System.EnvironmentVariableTarget]::Machine)
# [System.Environment]::SetEnvironmentVariable('COSMOS_SECRET_KEY','2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',[System.EnvironmentVariableTarget]::Machine)
# [System.Environment]::SetEnvironmentVariable('AZURE_STORAGE_CONNECTION_STRING','DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;',[System.EnvironmentVariableTarget]::Machine)
# [System.Environment]::SetEnvironmentVariable('AZURE_STORAGE_ACCESS_KEY','Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',[System.EnvironmentVariableTarget]::Machine)

# cd packages/azure
# yarn integrate


