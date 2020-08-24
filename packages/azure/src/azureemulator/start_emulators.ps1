function printAndLog
{
    param([string]$argstring = "unknown")
    Write-Output $argstring
    Add-Content C:\vagrant\service_loop.txt $argstring
}

printAndLog -argstring "--------------------------------"
printAndLog -argstring "Starting Azure Emulator Services"

Import-Module -Name "C:\Program Files\Azure Cosmos DB Emulator\PSModules\Microsoft.Azure.CosmosDB.Emulator" -Verbose

Do {
    printAndLog -argstring "--------------------------------"
    $date1 = Get-Date -Date "01/01/1970"
    $date2 = Get-Date
    $epoch = (New-TimeSpan -Start $date1 -End $date2).TotalSeconds
    printAndLog -argstring "Service Loop: $epoch"

    printAndLog -argstring "Start-CosmosDbEmulator"
    Start-Process "C:\Program Files\Azure Cosmos DB Emulator\CosmosDB.Emulator.exe" -ArgumentList "/noexplorer","/allownetworkaccess","/computeport=0","/key=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==","/nofirewall","/noui","/disableratelimiting" -ErrorAction Stop -PassThru
    
    printAndLog -argstring "SqlLocalDB.exe create MSSQLLocalDB"
    Start-Process -wait "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "create","MSSQLLocalDB"

    printAndLog -argstring "SqlLocalDB.exe start MSSQLLocalDB"
    Start-Process -wait "C:\Program Files\Microsoft SQL Server\110\Tools\Binn\SqlLocalDB.exe" -ArgumentList "start","MSSQLLocalDB"
    
    printAndLog -argstring "AzureStorageEmulator.exe start"
    Start-Process -wait "C:\Program Files (x86)\Microsoft SDKs\Azure\Storage Emulator\AzureStorageEmulator.exe"  -ArgumentList "start"
    
    Start-Sleep -s 60    
} while($true)