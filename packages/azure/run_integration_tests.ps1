$StartTime = Get-Date

$value = $env:RUNNING_IN_CI
if ($value -ne 1)
{
    Write-Host "NOT RUNNING IN CI"
    # Test COSMOS_SECRET_KEY from https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator?tabs=cli%2Cssl-netstd21
    $env:COSMOS_SECRET_KEY = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
    # Test Storage Creds from https://docs.microsoft.com/en-us/azure/storage/common/storage-use-emulator
    $env:AZURE_STORAGE_CONNECTION_STRING = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;"
    $env:AZURE_STORAGE_ACCESS_KEY = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
    $env:AZURE_STORAGE_ACCOUNT = "devstoreaccount1"
    $env:NODE_TLS_REJECT_UNAUTHORIZED = "0" # Only HTTPS supported by CosmosClient so we need to disable this

    # Required for curl to work, throws "curl : The request was aborted: Could not create SSL/TLS secure channel."
    Write-Host "Set Security Protocol to Tls12"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $protocol = [Net.ServicePointManager]::SecurityProtocol
    Write-Host "Protocol: $protocol"
}

$protocol = [Net.ServicePointManager]::SecurityProtocol
Write-Host "Protocol: $protocol"
$d1 = Get-Date
Write-Host "Downloading Cosmos Emulator"
curl https://aka.ms/cosmosdb-emulator -o .\cosmos.msi
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

$d1 = Get-Date
Write-Host "Installing Cosmos Emulator"
Start-Process -Wait .\cosmos.msi -ArgumentList "/quiet"
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

Write-Host "Loading CosmosDB Module"
Import-Module "$env:ProgramFiles\Azure Cosmos DB Emulator\PSModules\Microsoft.Azure.CosmosDB.Emulator"

New-Variable Key -Scope Global -Option Constant -Value "$env:COSMOS_SECRET_KEY"
New-Variable PartitionCount -Scope Global -Option Constant -Value 10
# New-Variable Timeout -Scope Global -Option Constant -Value 3600

$d1 = Get-Date
Write-Host "Starting Cosmos Emulator"
Start-CosmosDbEmulator -AllowNetworkAccess -NoFirewall -NoUI -Key $Key -PartitionCount $PartitionCount
# Start-CosmosDbEmulator -AllowNetworkAccess -NoFirewall -NoUI -Key $Key -Timeout $Timeout -PartitionCount $PartitionCount
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

$status = Get-CosmosDbEmulatorStatus
Write-Host "Current Cosmos Emulator Status: $status"

# Write-Host "Launching Cosmos Client"
# node ./packages/azure/index.js

# Required to allow responses to request from outside the VM
Write-Host "Disable Net Firewall Profiles"
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

$d1 = Get-Date
Write-Host "Downloading SqlLocalDB"
curl 'https://download.microsoft.com/download/8/D/D/8DD7BDBA-CEF7-4D8E-8C16-D9F69527F909/ENU/x64/SqlLocalDB.MSI' -o .\SqlLocalDB.MSI
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

$d1 = Get-Date
Write-Host "Installing SqlLocalDB"
Start-Process -Wait .\SqlLocalDB.MSI -ArgumentList "/qn","IACCEPTSQLLOCALDBLICENSETERMS=YES"
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

$d1 = Get-Date
Write-Host "Downloading Storage Emulator"
curl 'https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409' -o .\az_storage_emulator.msi
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

$d1 = Get-Date
Write-Host "Installing Storage Emulator"
Start-Process -Wait .\az_storage_emulator.msi -ArgumentList "/quiet"
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

if ($value -ne 1) 
{
    $vm_ip = (Get-NetIPAddress -InterfaceAlias "Ethernet" -AddressFamily "IPv4").IPAddress
    Write-Host "Configure IP from 127.0.0.1 to $vm_ip"
    $storage_emulator_config_path = "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe.config"
    ((Get-Content -path $storage_emulator_config_path -Raw) -replace '127.0.0.1', $vm_ip ) | Set-Content -Path $storage_emulator_config_path
}

$vm_ip = (Get-NetIPAddress -InterfaceAlias "Ethernet" -AddressFamily "IPv4").IPAddress
Write-Host "Do Not Configure IP from 127.0.0.1 to $vm_ip"

$d1 = Get-Date
Write-Host "Create MSSQLLocalDB"
Start-Process -Wait "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "create","MSSQLLocalDB"
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

Write-Host "Start MSSQLLocalDB"
Start-Process "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "start","MSSQLLocalDB"
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

# Start-Sleep -s 30

$d1 = Get-Date
Write-Host  "Initializing Storage Emulator"
Start-Process -Wait "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "init","/server","(localdb)\.\MSSQLLocalDb","-inprocess"
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

$d1 = Get-Date
Write-Host "Starting Storage Emulator"
Start-Process "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "start"
$d2 = Get-Date
$epoch = (New-TimeSpan -Start $d1 -End $d2).TotalSeconds
Write-Host "Seconds: $epoch"

# Start-Sleep -s 30

Write-Host  "AzureStorageEmulator.exe status"
Start-Process -Wait "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "status"

$EndTime = Get-Date
$epoch = (New-TimeSpan -Start $StartTime -End $EndTime).TotalSeconds
Write-Host "Emulators Setup Took: $epoch seconds"

# Write-Host "Launching Storage Client"
# node ./packages/azure/storage_index.js

# Write-Host "Launching Queue Client"
# node ./packages/azure/queue_index.js

if ($value -eq 1)
{
    Write-Host "NOT RUNNING IN CI"
    Write-Host "\n Yarn integrate part"

    Write-Host "\n Get-ChildItem ."
    Get-ChildItem .

    Write-Host "\n cd packages/core"
    cd packages/core

    Write-Host "\n yarn"
    yarn

    Start-Sleep -s 60

    Write-Host "\n yarn build"
    yarn build

    Start-Sleep -s 60

    Write-Host "\n cd ../azure"
    cd ../azure

    Write-Host "\n Get-ChildItem ."
    Get-ChildItem .

    Write-Host "\n yarn"
    yarn

    Start-Sleep -s 60

    Write-Host "\n yarn build"
    yarn build

    Start-Sleep -s 60

    Write-Host "\n cd .. && pwd"
    cd ..
    $pwd_res = pwd
    Write-Host "$pwd_res"

    Write-Host "\n Get-ChildItem ."
    Get-ChildItem .

    Write-Host "\n cd .. && pwd"
    cd ..
    $pwd_res = pwd
    Write-Host "$pwd_res"

    Write-Host "\n Get-ChildItem ."
    Get-ChildItem .

    Write-Host "\n cd packages/azure"
    cd packages/azure

    Write-Host "\n Get-ChildItem ."
    Get-ChildItem -Path "C:\Users\travis\build\walmartlabs\cookie-cutter\node_modules\@walmartlabs"

    Write-Host "\n yarn integrate"
    yarn integrate

    Start-Sleep -s 60
}