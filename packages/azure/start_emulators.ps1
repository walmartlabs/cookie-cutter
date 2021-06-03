function Log-Time
{
    param([DateTime]$Start)
    $end = Get-Date
    $epoch = (New-TimeSpan -Start $Start -End $end).TotalSeconds
    Write-Host "    done in $epoch seconds"
}

$StartTime = Get-Date

if ($env:RUNNING_IN_CI -eq 1)
{
    Write-Host "Running in CI"
    # Env Vars required and set in CI (not required in the Windows VM but required when running intergration tests locally)
    Write-Host "NODE_TLS_REJECT_UNAUTHORIZED: $env:NODE_TLS_REJECT_UNAUTHORIZED"
    Write-Host "AZURE_STORAGE_CONNECTION_STRING: $env:AZURE_STORAGE_CONNECTION_STRING"
    Write-Host "AZURE_STORAGE_ACCESS_KEY: $env:AZURE_STORAGE_ACCESS_KEY"
    Write-Host "AZURE_STORAGE_ACCOUNT: $env:AZURE_STORAGE_ACCOUNT"
    Write-Host "AZURE_STORAGE_URL: $env:AZURE_STORAGE_URL"
}
else
{
    Write-Host "Running locally"
    Write-Host "Set Env Variables in Windows VM"
    # Test COSMOS_SECRET_KEY from https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator?tabs=cli%2Cssl-netstd21
    $env:COSMOS_SECRET_KEY = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="

    # Required for curl to work, throws "curl : The request was aborted: Could not create SSL/TLS secure channel."
    Write-Host "Set Security Protocol to Tls12"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # Required to allow responses to request from outside the VM
    Write-Host "Disable Net Firewall Profiles"
    Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False
}

Write-Host "COSMOS_SECRET_KEY: $env:COSMOS_SECRET_KEY"
$protocol = [Net.ServicePointManager]::SecurityProtocol
Write-Host "Protocol: $protocol"

if (Test-Path -Path .\cosmos.msi -PathType leaf)
{
    Write-Host "Cosmos Emulator already downloaded and installed"
}
else
{
    $d1 = Get-Date
    Write-Host "Downloading Cosmos Emulator"
    curl https://aka.ms/cosmosdb-emulator -o .\cosmos.msi
    Log-Time -Start $d1

    $d1 = Get-Date
    Write-Host "Installing Cosmos Emulator"
    Start-Process -Wait .\cosmos.msi -ArgumentList "/quiet"
    Log-Time -Start $d1
}

Write-Host "Loading CosmosDB Module"
Import-Module "$env:ProgramFiles\Azure Cosmos DB Emulator\PSModules\Microsoft.Azure.CosmosDB.Emulator"

$d1 = Get-Date
Write-Host "Starting Cosmos Emulator"
Start-CosmosDbEmulator -AllowNetworkAccess -NoFirewall -NoUI -Key $env:COSMOS_SECRET_KEY -PartitionCount 10
Log-Time -Start $d1

$status = Get-CosmosDbEmulatorStatus
Write-Host "Current Cosmos Emulator Status: $status"

if (Test-Path -Path .\SqlLocalDB.MSI -PathType leaf)
{
    Write-Host "SqlLocalDB already downloaded and installed"
}
else
{
    $d1 = Get-Date
    Write-Host "Downloading SqlLocalDB"
    curl 'https://download.microsoft.com/download/8/D/D/8DD7BDBA-CEF7-4D8E-8C16-D9F69527F909/ENU/x64/SqlLocalDB.MSI' -o .\SqlLocalDB.MSI
    Log-Time -Start $d1

    $d1 = Get-Date
    Write-Host "Installing SqlLocalDB"
    Start-Process -Wait .\SqlLocalDB.MSI -ArgumentList "/qn","IACCEPTSQLLOCALDBLICENSETERMS=YES"
    Log-Time -Start $d1

    $d1 = Get-Date
    Write-Host "Create MSSQLLocalDB"
    Start-Process -Wait "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "create","MSSQLLocalDB"
    Log-Time -Start $d1
}

$d1 = Get-Date
Write-Host "Start MSSQLLocalDB"
Start-Process "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "start","MSSQLLocalDB"
Log-Time -Start $d1

if (Test-Path -Path .\az_storage_emulator.msi -PathType leaf)
{
    Write-Host "Storage Emulator already downloaded and installed"
}
else
{
    $d1 = Get-Date
    Write-Host "Downloading Storage Emulator"
    curl 'https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409' -o .\az_storage_emulator.msi
    Log-Time -Start $d1

    $d1 = Get-Date
    Write-Host "Installing Storage Emulator"
    Start-Process -Wait .\az_storage_emulator.msi -ArgumentList "/quiet"
    Log-Time -Start $d1

    if ($env:RUNNING_IN_CI -ne 1) 
    {
        $vm_ip = (Get-NetIPAddress -InterfaceAlias "Ethernet" -AddressFamily "IPv4").IPAddress
        Write-Host "Configure IP from 127.0.0.1 to $vm_ip for Windows VM"
        $storage_emulator_config_path = "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe.config"
        ((Get-Content -path $storage_emulator_config_path -Raw) -replace '127.0.0.1', $vm_ip ) | Set-Content -Path $storage_emulator_config_path
    }

    $d1 = Get-Date
    Write-Host  "Initializing Storage Emulator"
    Start-Process -Wait "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "init","/server","(localdb)\.\MSSQLLocalDb","-inprocess"
    Log-Time -Start $d1
}

$d1 = Get-Date
Write-Host "Starting Storage Emulator"
Start-Process "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "start"
Log-Time -Start $d1

$EndTime = Get-Date
$epoch = (New-TimeSpan -Start $StartTime -End $EndTime).TotalSeconds
Write-Host "Emulators Setup Took: $epoch seconds"
