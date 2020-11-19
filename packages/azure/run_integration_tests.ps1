Write-Host "Downloading Cosmos Emulator"
curl https://aka.ms/cosmosdb-emulator -o .\cosmos.msi

Write-Host "Installing Emulator"
Start-Process -Wait .\cosmos.msi -ArgumentList "/quiet"

Write-Host "Loading CosmosDB Module"
Import-Module "$env:ProgramFiles\Azure Cosmos DB Emulator\PSModules\Microsoft.Azure.CosmosDB.Emulator"

Write-Host "Current Emulator Status"
Get-CosmosDbEmulatorStatus

New-Variable Key -Scope Global -Option Constant -Value "$env:MASTER_KEY"
New-Variable Timeout -Scope Global -Option Constant -Value 3600
New-Variable PartitionCount -Scope Global -Option Constant -Value 10

Write-Host "Starting Emulator"
Start-CosmosDbEmulator -AllowNetworkAccess -NoFirewall -NoUI -Key $Key -Timeout $Timeout -PartitionCount $PartitionCount

Write-Host "Current Emulator Status"
Get-CosmosDbEmulatorStatus

Write-Host "Launching Cosmos Client"
node ./packages/azure/index.js

Write-Host "Set-NetFirewallProfile"
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

Write-Host "Downloading SqlLocalDB.MSI"
curl 'https://download.microsoft.com/download/8/D/D/8DD7BDBA-CEF7-4D8E-8C16-D9F69527F909/ENU/x64/SqlLocalDB.MSI' -o .\SqlLocalDB.MSI

Write-Host "Installing SqlLocalDB.MSI"
Start-Process -Wait .\SqlLocalDB.MSI -ArgumentList "/qn","IACCEPTSQLLOCALDBLICENSETERMS=YES"

Write-Host "Downloading Storage Emulator"
curl 'https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409' -o .\az_storage_emulator.msi

Write-Host "Installing Storage Emulator"
Start-Process -Wait .\az_storage_emulator.msi -ArgumentList "/quiet"

Write-Host "SqlLocalDB.exe create MSSQLLocalDB"
Start-Process -Wait "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "create","MSSQLLocalDB"

Write-Host "SqlLocalDB.exe start MSSQLLocalDB"
Start-Process "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "start","MSSQLLocalDB"

Start-Sleep -s 30

Write-Host  "AzureStorageEmulator.exe init"
Start-Process -Wait "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "init","/server","(localdb)\.\MSSQLLocalDb","-inprocess"

Write-Host "AzureStorageEmulator.exe start"
Start-Process "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "start"

Start-Sleep -s 30

Write-Host  "AzureStorageEmulator.exe status"
Start-Process -Wait "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "status", "-inprocess"

Write-Host "Launching Storage Client"
node ./packages/azure/storage_index.js

Write-Host "Launching Queue Client"
node ./packages/azure/queue_index.js

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

Write-Host "\n cd packages/azure"
cd packages/azure

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
Get-ChildItem -Path "C:\Users\travis\build\walmartlabs\cookie-cutter\packages/azure/node_modules/@walmartlabs"

Write-Host "\n yarn integrate"
yarn integrate
