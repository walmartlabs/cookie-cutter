# Cosmos DB emulator
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
(New-Object System.Net.WebClient).DownloadFile('https://aka.ms/cosmosdb-emulator', 'C:\vagrant\cosmos.msi')
Start-Process -wait C:\vagrant\cosmos.msi -ArgumentList "/quiet"

# Service Manager
(New-Object System.Net.WebClient).DownloadFile('https://nssm.cc/release/nssm-2.24.zip', 'C:\vagrant\nssm.zip')
Expand-Archive C:\vagrant\nssm.zip -DestinationPath C:\vagrant\nssm -Force

# Cosmos as a service
C:\vagrant\nssm\nssm-2.24\win64\nssm.exe install cosmosdbemulator "C:\vagrant\service_startup.cmd"
C:\vagrant\nssm\nssm-2.24\win64\nssm.exe set cosmosdbemulator Start SERVICE_DELAYED_AUTO_START
C:\vagrant\nssm\nssm-2.24\win64\nssm.exe set cosmosdbemulator Type SERVICE_INTERACTIVE_PROCESS
C:\vagrant\nssm\nssm-2.24\win64\nssm.exe start cosmosdbemulator

Set-ItemProperty -Name 'FailureActions' -Path 'HKLM:\HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\cosmosdbemulator' -Value ([byte[]](0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x3,0x0,0x0,0x0,0x14,0x0,0x0,0x0,0x1,0x0,0x0,0x0,0x60,0xea,0x0,0x0,0x1,0x0,0x0,0x0,0x60,0xea,0x0,0x0,0x1,0x0,0x0,0x0,0x60,0xea,0x0,0x0))
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

# SQL DB
(New-Object System.Net.WebClient).DownloadFile('https://download.microsoft.com/download/8/D/D/8DD7BDBA-CEF7-4D8E-8C16-D9F69527F909/ENU/x64/SqlLocalDB.MSI', 'C:\vagrant\SqlLocalDB.MSI')
Start-Process -wait msiexec -ArgumentList "/i","C:\vagrant\SqlLocalDB.MSI","/qn","IACCEPTSQLLOCALDBLICENSETERMS=YES"

# Azure storage emulator
(New-Object System.Net.WebClient).DownloadFile('https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409', 'C:\vagrant\az_storage_emulator.msi')
Start-Process -wait C:\vagrant\az_storage_emulator.msi -ArgumentList "/quiet"

$vm_ip = (Get-NetIPAddress -InterfaceAlias "Ethernet" -AddressFamily "IPv4").IPAddress
$storage_emulator_config_path = "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe.config"
((Get-Content -path $storage_emulator_config_path -Raw) -replace '127.0.0.1', $vm_ip ) | Set-Content -Path $storage_emulator_config_path

# Copy file
Copy-Item "C:\vagrant\Microsoft.Azure.CosmosDB.Emulator.psm1" -Destination "C:\Program Files\Azure Cosmos DB Emulator\PSModules\Microsoft.Azure.CosmosDB.Emulator\Microsoft.Azure.CosmosDB.Emulator.psm1"
