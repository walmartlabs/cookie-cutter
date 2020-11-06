#----------------------------------------------------------
# Copyright (C) Microsoft Corporation. All rights reserved.
#----------------------------------------------------------

# Azure Cosmos DB Emulator management functions

# Plamen; AND CI STOPPED TRIGGERING

using namespace System.ServiceProcess

Set-Variable ProductName -Option Constant -Value "Azure Cosmos DB Emulator"
Set-Variable DefaultDefaultPartitionCount -Option Constant -Value 25
Set-Variable DefaultCassandraPortNumber -Option Constant 10350
Set-Variable DefaultGremlinPortNumber -Option Constant 8901
Set-Variable DefaultTablePortNumber -Option Constant 8902
Set-Variable DefaultMongoPortNumber -Option Constant 10250
Set-Variable DefaultPortNumber -Option Constant -Value 8081

Set-Variable InstallLocation -Option ReadOnly -Value (
    Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" |
        Where-Object { $_.DisplayName -eq $ProductName } |
        Select-Object -First 1 -Property InstallLocation
).InstallLocation

if ([string]::IsNullOrEmpty($InstallLocation)) {

    # Optimistically assume a copy-install in lieu of an MSI install with this module placed here: $PSScriptRoot\..\..\PSModules\Microsoft.Azure.CosmosDB.Emulator
    # => $InstallLocation = Resolve-Path "$PSScriptRoot\..\.."

    $realPath = if ($null -eq (Get-Item $PSScriptRoot ).LinkType) {
        $PSScriptRoot
    }
    else {
        (Get-Item $PSScriptRoot).Target
    }

    Set-Variable InstallLocation -Force -Option ReadOnly -Value (Resolve-Path "$realPath\..\..")
}

Set-Variable Emulator -Option ReadOnly -Value (Join-Path $InstallLocation "CosmosDB.Emulator.exe")

<#
 .Synopsis
  Gets the self-signed certificate used by the Cosmos DB Emulator.

 .Description
  The Get-CosmosDbEmulatorCertificate cmdlet returns the self-signed SSL certficate used by the Cosmos DB Emulator. This
  certificate is the first certificate from Cert:\LocalMachine\My matching these criteria:

  FriendlyName: DocumentDbEmulatorCertificate
  Subject: CN=localhost
  Issuer: CN=localhost

  .Example
  # $certificate | Export-Certificate -Type CERT -FilePath azure-cosmosdb-emulator.cer
  Gets the Emulator's self-signed certificate and exports it as .cer file.

#>
function Get-CosmosDbEmulatorCertificate {
    [CmdletBinding()]
    param()

    if (-not (Test-Installation)) {
        return
    }
    $certificate = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.FriendlyName -eq "DocumentDbEmulatorCertificate" -and $_.Subject -eq "CN=localhost" -and $_.Issuer -eq "CN=localhost" }
    if ($null -eq $certificate) {
        Write-Error "Cannot find DocumentDbEmulatorCertificate in Cert:\LocalMachine\My"
    }
    $certificate
}

<#
 .Synopsis
  Gets the status of the Cosmos DB Emulator.

 .Description
  The Get-CosmosDbEmulatorStatus cmdlet returns one of these ServiceControllerStatus values: ServiceControllerStatus.StartPending, 
  ServiceControllerStatus.Running, or ServiceControllerStatus.Stopped; otherwise--if an error is encountered--no value is returned.
#>
function Get-CosmosDbEmulatorStatus {
    [CmdletBinding()]
    param()

    if (-not (Test-Installation)) {
        return
    }

    $process = Start-Process $Emulator -ArgumentList "/getstatus" -PassThru -Wait

    switch ($process.ExitCode) {
        1 {
            [ServiceControllerStatus]::StartPending
        }
        2 {
            [ServiceControllerStatus]::Running
        }
        3 {
            [ServiceControllerStatus]::Stopped
        }
        default {
            Write-ErrorUnrecognizedExitCode $process.ExitCode
        }
    }
}

<#
 .Synopsis
  Generates and installs a new self-signed SSL Certificate for the Cosmos DB Emulator

 .Description
 The New-CosmosDbEmulatorCertificate cmdlet generates a new self-signed SSL certificate for the Emulator. The certificate is 
 installed to Cert:\LocalMachine\My and replaces the current SSL certificate used by the Emulator. The certificate is also 
 added to Cert:\LocalMachine\Trust.
 
 The generated certificate has these properties.

    Friendly name: DocumentDbEmulatorCertificate
    Subject: localhost
    Issuer: localhost
  
    Subject Alternative Name:

    * Hostname as returned by [System.Net.Dns]::GetHostEntry((hostname)).HostName.
    * The names provided by the DnsName argument to this function.
    * The IPv4 addresses as returned by:
        [System.Net.Dns]::GetHostEntry((hostname)).AddressList | 
        Where-Object { $_.AddressFamily -eq "InterNetwork" } | 
        ForEach-Object { $_.IpAddressToString }
    * "localhost"
    * "127.0.0.1"

 For compatibility with Windows Server 2012, all IPv4 Addresses are added to the Subject Alternative Name list as both
 DNS names and IP addresses.

 .Example
 # New-CosmosDbEmulatorCertificate cosmosdb-emulator, cosmosdb-emulator.constoso.com
 Generates and installs a self-signed SSL certificate that replaces the one currently used by the Emulator. The new
 certificate includes two additional domain names in the certificates subject alternative name list:

 * cosmosdb-emulator and
 * cosmosdb-emulator.contoso.com

#>
function New-CosmosDbEmulatorCertificate {
    param(
        [Parameter(Position = 1, Mandatory = $false)]
        [string[]]
        $DnsName
    )

    Start-Process $Emulator -ArgumentList "/noui /gencert=`"$(if ($DnsName.Count -gt 0) { $DnsName -join ',' })`"" -Wait

    if ($LASTEXITCODE -eq 0) {
        Get-CosmosDbEmulatorCertificate
    }
    else {
        Write-Error "Certificate generation failed with exit code $LASTEXITCODE"
    }
}

<#
 .Synopsis
  Removes all the files used by the Cosmos DB Emulator for a given data path

 .Description
 The Remove-CosmosDbEmulatorData cmdlet recursively removes all the content used by the Cosmos DB Emulator from the given
 data path or the $env:LocalAppData\CosmosDbEmulator if the data path is not specified.
 
 .Example
 # Remove-CosmosDbEmulatorData
 It recursively removes all the files in $env:LocalAppData\CosmosDbEmulator directory.
 # Remove-CosmosDbEmulatorData C:\MyDataPath
 It recursively removes all the files in C:\MyDataPath\CosmosDBEmulator directory.

#>
function Remove-CosmosDbEmulatorData {
    param(
        [Parameter(Position = 1, Mandatory = $false)]
        [string]
        $Path
    )

    Start-Process $Emulator -ArgumentList "/noui /resetdatapath$(if ($Path) { '=' + $Path })" -Wait

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Emulator data path removal failed with exit code $LASTEXITCODE"
    }
}

<#
 .Synopsis
  Starts the Cosmos DB Emulator on the local computer.

 .Description
  The Start-CosmosDbEmulator cmdlet starts the Cosmos DB Emulator on the local computer. You can use the parameters of
  Start-CosmosDbEmulator to specify options, such as the port, direct port, and mongo port numbers.

 .Parameter AllowNetworkAccess
  Allow access from all IP Addresses assigned to the Emulator's host. You must also specify a value for Key or KeyFile 
  to allow network access.

 .Parameter CassandraPort
  Port number to use for the Cassandra Compatibility API. The default port number is 10350.

 .Parameter ComputePort
  Port to use for the Compute Interop Gateway service. The Gateway's HTTP endpoint probe port is calculated as 
  ComputePort + 79. Hence, ComputePort and ComputePort + 79 must be open and available. The defaults is 8900, 8979.

 .Parameter Consistency
  Sets the default consistency level for the Emulator to Session, Strong, Eventual, or BoundedStaleness. The default
  is Session.

 .Parameter Credential
  Specifies a user account that has permission to perform this action. Type a user name, such as User01 or
  Domain01\User01, or enter a PSCredential object, such as one from the Get-Credential cmdlet. By default,
  the cmdlet uses the credentials of the current user.

 .Parameter DataPath
  Path to store data files. The default location for data files is $env:LocalAppData\CosmosDbEmulator.

 .Parameter DefaultPartitionCount
  The number of partitions to reserve per partitioned collection. The default is 25, which is the same as default value of
  the total partition count.

 .Parameter DirectPort
  A list of 4 ports to use for direct connectivity to the Emulator's backend. The default list is 10251, 10252, 10253, 10254.

 .Parameter EnableMongoDb
  Specifies that MongoDB API endpoint is enabled (default is false).

 .Parameter EnableCassandra
  Specifies that Cassandra API endpoint is enabled (default is false).

 .Parameter EnableGremlin
  Specifies that Gremlin (Graph) API endpoint is enabled (default is false).

 .Parameter EnableTable
  Specifies that Table API endpoint is enabled (default is false).

 .Parameter EnablePreview
 It enables Cosmos public emulator features that are in preview and not fully matured to be on by default.

 .Parameter EnableAadAuthentication
 It enables Cosmos public emulator to accept custom AAD token base authorization for testing purposes.

 .Parameter FailOnSslCertificateNameMismatch
  By default the Emulator regenerates its self-signed SSL certificate, if the certificate's SAN does not include the Emulator
  host's domain name, local IPv4 address, 'localhost', and '127.0.0.1'. With this option, the Emulator will fail at startup
  instead. You should then use the New-CosmosDbEmulatorCertificate option to create and install a new self-signed SSL 
  certificate.

 .Parameter GremlinPort
  Port number to use for the Gremlin Compatibility API. The default port number is 8901.

 .Parameter TablePort
  Port number to use for the Table Compatibility API. The default port number is 8902.

 .Parameter Key
  Authorization key for the Emulator. This value must be the base 64 encoding of a 64 byte vector.

 .Parameter MongoPort
  Port number to use for the Mongo Compatibility API. The default port number is 10250.

 .Parameter NoFirewall
  Specifies that no inbound port rules should be added to the Emulator host's firewall.

 .Parameter NoTelemetry
  Specifies that the cmdlet should not collect telemetry data for the current Emulator session.

 .Parameter NoUI
  Specifies that the cmdlet should not present the Windows taskbar icon user interface.

 .Parameter NoWait
  Specifies that the cmdlet should return as soon as the emulator begins to start. By default the cmdlet waits until startup
  is complete and the Emulator is ready to receive requests.

 .Parameter PartitionCount
  The total number of partitions allocated by the Emulator.

 .Parameter Port
  Port number for the Emulator Gateway Service and Web UI. The default port number is 8081.

 .Parameter Trace
  Indicates whether the Emulator should be configured for traces prior to startup

 .Example
  # Start-CosmosDbEmulator
  Start the Emulator and wait until it is fully started and ready to accept requests.

 .Example
  # Start-CosmosDbEmulator -DefaultPartitionCount 5
  Start the Emulator with 5 partitions reserved for each partitioned collection. The total number of partitions is set
  to the default: 25. Hence, the total number of partitioned collections that can be created is 5 = 25 partitions / 5
  partitions/collection. Each partitioned collection will be capped at 50 GB = 5 partitions * 10 GB / partiton.

 .Example
  # Start-CosmosDbEmulator -Port 443 -MongoPort 27017 -DirectPort 20001,20002,20003,20004
  Starts the Emulator with altermative port numbers.
#>
function Start-CosmosDbEmulator {
    [CmdletBinding(PositionalBinding = $false)]
    param(
        [Parameter(Mandatory = $false)]
        [switch]
        $AllowNetworkAccess,

        [Parameter(Mandatory = $false)]
        [UInt16]
        $CassandraPort = $DefaultCassandraPortNumber,

        [Parameter(Mandatory = $false)]
        [UInt16]
        $ComputePort = $null,

        [Parameter(Mandatory = $false)]
        [ValidateSet('BoundedStaleness', 'Eventual', 'Session', 'Strong')]
        [string]
        $Consistency,

        [Parameter(Mandatory = $false)]
        [ValidateNotNull()]
        [PSCredential]
        $Credential = $null,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]
        $DataPath = $null,

        [Parameter(Mandatory = $false)]
        [ValidateRange(1, 250)]
        [UInt16]
        $DefaultPartitionCount = $DefaultDefaultPartitionCount,

        [Parameter(Mandatory = $false)]
        [ValidateCount(4, 4)]
        [UInt16[]]
        $DirectPort = $null,

        [Parameter(Mandatory = $false)]
        [switch]
        $EnableMongoDb,

        [Parameter(Mandatory = $false)]
        [switch]
        $EnableCassandra,

        [Parameter(Mandatory = $false)]
        [switch]
        $EnableGremlin,

        [Parameter(Mandatory = $false)]
        [switch]
        $EnableTable,

        [Parameter(Mandatory = $false)]
        [switch]
        $EnablePreview,

        [Parameter(Mandatory = $false)]
        [switch]
        $EnableAadAuthentication,

        [Parameter(Mandatory = $false)]
        [switch]
        $FailOnSslCertificateNameMismatch,

        [Parameter(Mandatory = $false)]
        [UInt16]
        $GremlinPort = $DefaultGremlinPortNumber,

        [Parameter(Mandatory = $false)]
        [UInt16]
        $TablePort = $DefaultTablePortNumber,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]
        $Key = $null,

        [Parameter(Mandatory = $false)]
        [UInt16]
        $MongoPort = $DefaultMongoPortNumber,

        [Parameter(Mandatory = $false)]
        [switch]
        $NoFirewall,

        [Parameter(Mandatory = $false)]
        [switch]
        $NoTelemetry,

        [Parameter(Mandatory = $false)]
        [switch]
        $NoUI,

        [Parameter(Mandatory = $false)]
        [switch]
        $NoWait,

        [Parameter(Mandatory = $false)]
        [ValidateRange(1, 250)]
        [UInt16]
        $PartitionCount = $DefaultPartitionCount,

        [Parameter(Mandatory = $false)]
        [UInt16]
        $Port = $DefaultPortNumber,

        [Parameter(Mandatory = $false)]
        [switch]
        $SimulateRateLimiting,

        [Parameter(Mandatory = $false)]
        [Uint32]
        $Timeout = 2400,

        [Parameter(Mandatory = $false)]
        [switch]
        $Trace
    )

    if (!(Test-Path $Emulator)) {
        Write-Error "The emulator is not installed where expected at '$Emulator'"
        return
    }

    if ($Trace) {
        $process = Start-Process $Emulator -ArgumentList "/starttraces" -PassThru -Wait
        if ($process.ExitCode -ne 0) {
            Write-Error "Attempt to start traces failed with HRESULT 0x$($process.ExitCode.ToString('X8'))"
            return
        }
    }

    $process = Start-Process $Emulator -ArgumentList "/getstatus" -PassThru -Wait

    switch ($process.ExitCode) {
        1 {
            Write-Debug "The emulator is already starting"
            return
        }
        2 {
            Write-Debug "The emulator is already running"
            return
        }
        3 {
            Write-Debug "The emulator is stopped"
        }
        default {
            Write-ErrorUnrecognizedExitCode $process.ExitCode
            return
        }
    }

    $argumentList = , "/noexplorer"

    if ($AllowNetworkAccess) {
        $argumentList += "/allownetworkaccess"
    }

    if (-not [string]::IsNullOrEmpty($ComputePort)) {
        $argumentList += "/computeport=$ComputePort"
    }

    if (-not [string]::IsNullOrEmpty($Consistency)) {
        $argumentList += "/consistency=$Consistency"
    }

    if (-not [string]::IsNullOrWhitespace($DataPath)) {
        $argumentList += "/datapath=`"$DataPath`""
    }

    if ($DefaultPartitionCount -ne $DefaultDefaultPartitionCount) {
        $argumentList += "/defaultpartitioncount=$DefaultPartitionCount"
    }

    if ($null -ne $DirectPort) {
        $argumentList += "/directports=$($DirectPort -Join ',')"
    }

    if ($EnableMongoDb) {
        $argumentList += , "/enablemongodbendpoint"
    }

    if ($EnableCassandra) {
        $argumentList += , "/enablecassandraendpoint"
    }

    if ($EnableGremlin) {
        $argumentList += , "/enablegremlinendpoint"
    }

    if ($EnableTable) {
        $argumentList += , "/enabletableendpoint"
    }

    if ($EnablePreview) {
        $argumentList += , "/enablepreview"
    }

    if ($EnableAadAuthentication) {
        $argumentList += , "/enableaadauthentication"
    }

    if ($FailOnSslCertificateNameMismatch) {
        $argumentList += "/failoncertificatenamemismatch"
    }
    
    if ($CassandraPort -ne $DefaultCassandraPortNumber) {
        $argumentList += "/cassandraport=$CassandraPort"
    }

    if ($GremlinPort -ne $DefaultGremlinPortNumber) {
        $argumentList += "/gremlinport=$GremlinPort"
    }

    if ($TablePort -ne $DefaultTablePortNumber) {
        $argumentList += "/tableport=$TablePort"
    }

    if (-not [string]::IsNullOrWhiteSpace($Key)) {
        $argumentList += "/key=$Key"
    }

    if ($MongoPort -ne $DefaultMongoPortNumber) {
        $argumentList += "/mongoport=$MongoPort"
    }

    if ($NoFirewall) {
        $argumentList += , "/nofirewall"
    }

    if ($NoTelemetry) {
        $argumentList += , "/notelemetry"
    }

    if ($NoUI) {
        $argumentList += , "/noui"
    }

    if ($PartitionCount -ne $DefaultDefaultPartitionCount) {
        $argumentList += "/partitioncount=$PartitionCount"
    }

    if ($Port -ne $DefaultPortNumber) {
        $argumentList += "/port=$Port"
    }

    $argumentList += if ($SimulateRateLimiting) {
        "/enableratelimiting"
    }
    else {
        "/disableratelimiting"
    }

    Write-Debug "Starting emulator process: $Emulator $argumentList"
    Write-Debug "Credential = $(if ($credential -ne $null) { $credential.UserName } else { "`$null" })"

    $process = if ($Credential -eq $null -or $Credential -eq [PSCredential]::Empty) {
        Start-Process $Emulator -ArgumentList $argumentList -ErrorAction Stop -PassThru
    }
    else {
        Start-Process $Emulator -ArgumentList $argumentList -Credential $Credential -ErrorAction Stop -PassThru
    }

    Write-Debug "Emulator process started: $($process.Name), $($process.FileVersion)"

    if ($NoWait) {
        return;
    }

    [void](Wait-CosmosDbEmulator -Status Running -Timeout $Timeout)
    # [void](Wait-CosmosDbEmulator -Status Running)
}

<#
.Synopsis
Stops the Cosmos DB Emulator on the local computer.

.Description
The Stop-CosmosDbEmulator cmdlet stops the Cosmos DB Emulator on the local computer. By default the cmdlet waits for the
Emulator to fully stop. Use the NoWait switch to proceed as soon as shutdown begins.

.Parameter NoWait
Specifies that the StopCosmosDbEmulator cmdlet proceed as soon as shutdown begins.

#>
function Stop-CosmosDbEmulator {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [switch]
        $NoWait,

        [Parameter(Mandatory = $false)]
        [UInt32]
        $Timeout = 1200
    )

    if (!(Test-Path $Emulator)) {
        Write-Error "The emulator is not installed"
        return
    }

    $process = Start-Process $Emulator -ArgumentList "/getstatus" -PassThru -Wait

    switch ($process.ExitCode) {
        1 {
            Write-Debug "The emulator is starting"
        }
        2 {
            Write-Debug "The emulator is running"
        }
        3 {
            Write-Debug "The emulator is already stopped"
            return
        }
        default {
            Write-ErrorUnrecognizedExitCode $process.ExitCode
            return
        }
    }

    & $Emulator /shutdown

    if ($NoWait) {
        return
    }

    [void](Wait-CosmosDbEmulator -Status Stopped -Timeout $Timeout)
    # [void](Wait-CosmosDbEmulator -Status Stopped)
}

<#
.Synopsis
Uninstalls the Cosmos DB Emulator on the local computer.

.Description
The Uninstall-CosmosDbEmulator cmdlet removes the Cosmos DB Emulator on the local computer. By default the cmdlet keeps
all configuration and databases intact. Use the RemoveData switch to delete all data after removing the the Emulator.

.Parameter RemoveData
Specifies that the Uninstall-CosmosDbEmulator cmdlet should delete all data after it removes the Emulator.

#>
function Uninstall-CosmosDbEmulator {
    [CmdletBinding()]
    param(
        [switch]
        $RemoveData
    )

    $installationIds = Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" |
        Where-Object { $_.DisplayName -eq $ProductName } |
        ForEach-Object { $_.PSChildName }

    if ($null -eq $installationIds) {
        Write-Warning "The Cosmos DB Emulator is not installed on $env:COMPUTERNAME"
    }
    else {

        foreach ($installationId in $installationIds) {

            & $Emulator "/shutdown"

            Write-Information "Awaiting shutdown"

            for ($timeout = 30; $timeout -gt 0; $timeout--) {
                Write-Debug $timeout
                $process = Start-Process $Emulator -ArgumentList "/getstatus" -PassThru -Wait
                if ($process.ExitCode -eq 3) {
                    break;
                }
                Start-Sleep -Seconds 1
            }

            Write-Information "Uninstalling the emulator"
            Start-Process MsiExec -ArgumentList "/quiet", "/x${installationId}" -Wait
        }
    }

    if ($RemoveData) {
        $dataPath = Join-Path $env:LOCALAPPDATA CosmosDbEmulator
        Write-Information "Removing data from $dataPath"
        Get-Item -ErrorAction SilentlyContinue $dataPath | Remove-Item -Force -Recurse -ErrorAction Stop
    }
}

<#
 .Synopsis
  Waits for the status of the Cosmos DB Emulator to reach a specified status.

 .Description
  The Wait-CosmosDbEmulatorStatus cmdlet waits for the Emulator to reach one of these statuses: [ServiceControllerStatus]::StartPending,
  [ServiceControllerStatus]::Running, or [ServiceControllerStatus]::Stopped. A timeout value in seconds may be set.

 .Parameter Status
  The status to wait for: ServiceControllerStatus]::StartPending, [ServiceControllerStatus]::Running, [ServiceControllerStatus]::Stopped.

 .Parameter Timeout
  A timeout interval in seconds. The default value of zero specifies an unlimited timeout interval.

#>
function Wait-CosmosDbEmulator {
    [CmdletBinding(PositionalBinding = $false)]
    param(
        [ValidateSet([ServiceControllerStatus]::StartPending, [ServiceControllerStatus]::Running, [ServiceControllerStatus]::Stopped)]
        [Parameter(Position = 2, Mandatory = $true)]
        [ServiceControllerStatus]
        $Status,

        [Parameter()]
        [UInt32]
        $Timeout = 0
    )

    Write-Debug "Timeout"
    Write-Debug $Timeout

    # $NewTimeout = 1200

    $complete = if ($Timeout -gt 0) {
        $start = [DateTimeOffset]::Now
        # $stop = $start.AddSeconds($Timeout)
        $stop = $start.AddSeconds($NewTimeout)
        {
            $result -eq $Status -or [DateTimeOffset]::Now -ge $stop
        }
    }
    else {
        {
            $result -eq $Status
        }
    }

    do {
        $process = Start-Process $Emulator -ArgumentList "/getstatus" -PassThru -Wait

        switch ($process.ExitCode) {
            1 {
                Write-Debug "The emulator is starting"
                if ($status -eq [ServiceControllerStatus]::StartPending) {
                    return $true
                }
            }
            2 {
                Write-Debug "The emulator is running"
                if ($status -eq [ServiceControllerStatus]::Running) {
                    return $true
                }
            }
            3 {
                Write-Debug "The emulator is stopped"
                if ($status -eq [ServiceControllerStatus]::Stopped) {
                    return $true
                }
            }
            default {
                Write-ErrorUnrecognizedExitCode $process.ExitCode
                return $false
            }
        }
        Start-Sleep -Seconds 1
    }
    until ($complete.Invoke())

    # Write-Error "The emulator failed to reach ${Status} status within ${Timeout} seconds"
    Write-Error "The emulator failed to reach ${Status} status within ${Timeout} seconds (NEW LINE)"
    $false
}

function Test-Installation {
    [CmdletBinding()]
    param()
    if (Test-Path $Emulator) {
        $true
    }
    else {
        Write-Error "The emulator is not installed where expected at '$Emulator'"
        $false
    }
}

function Write-ErrorUnrecognizedExitCode {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [int]
        $ExitCode
    )
    Write-Error "The GetStatus operation returned an unrecognized status code: 0x${$ExitCode.ToString("X")}"
}

Export-ModuleMember Get-CosmosDbEmulatorCertificate, Get-CosmosDbEmulatorStatus, New-CosmosDbEmulatorCertificate, Remove-CosmosDbEmulatorData, Start-CosmosDbEmulator, Stop-CosmosDbEmulator, Uninstall-CosmosDbEmulator, Wait-CosmosDbEmulator

# SIG # Begin signature block
# MIIjkgYJKoZIhvcNAQcCoIIjgzCCI38CAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCB9wXcpdNpODXSC
# PZO9JLW+diBpReAkFLCIK3gvFwN6dqCCDYEwggX/MIID56ADAgECAhMzAAABh3IX
# chVZQMcJAAAAAAGHMA0GCSqGSIb3DQEBCwUAMH4xCzAJBgNVBAYTAlVTMRMwEQYD
# VQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNy
# b3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMTH01pY3Jvc29mdCBDb2RlIFNpZ25p
# bmcgUENBIDIwMTEwHhcNMjAwMzA0MTgzOTQ3WhcNMjEwMzAzMTgzOTQ3WjB0MQsw
# CQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9u
# ZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMR4wHAYDVQQDExVNaWNy
# b3NvZnQgQ29ycG9yYXRpb24wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIB
# AQDOt8kLc7P3T7MKIhouYHewMFmnq8Ayu7FOhZCQabVwBp2VS4WyB2Qe4TQBT8aB
# znANDEPjHKNdPT8Xz5cNali6XHefS8i/WXtF0vSsP8NEv6mBHuA2p1fw2wB/F0dH
# sJ3GfZ5c0sPJjklsiYqPw59xJ54kM91IOgiO2OUzjNAljPibjCWfH7UzQ1TPHc4d
# weils8GEIrbBRb7IWwiObL12jWT4Yh71NQgvJ9Fn6+UhD9x2uk3dLj84vwt1NuFQ
# itKJxIV0fVsRNR3abQVOLqpDugbr0SzNL6o8xzOHL5OXiGGwg6ekiXA1/2XXY7yV
# Fc39tledDtZjSjNbex1zzwSXAgMBAAGjggF+MIIBejAfBgNVHSUEGDAWBgorBgEE
# AYI3TAgBBggrBgEFBQcDAzAdBgNVHQ4EFgQUhov4ZyO96axkJdMjpzu2zVXOJcsw
# UAYDVR0RBEkwR6RFMEMxKTAnBgNVBAsTIE1pY3Jvc29mdCBPcGVyYXRpb25zIFB1
# ZXJ0byBSaWNvMRYwFAYDVQQFEw0yMzAwMTIrNDU4Mzg1MB8GA1UdIwQYMBaAFEhu
# ZOVQBdOCqhc3NyK1bajKdQKVMFQGA1UdHwRNMEswSaBHoEWGQ2h0dHA6Ly93d3cu
# bWljcm9zb2Z0LmNvbS9wa2lvcHMvY3JsL01pY0NvZFNpZ1BDQTIwMTFfMjAxMS0w
# Ny0wOC5jcmwwYQYIKwYBBQUHAQEEVTBTMFEGCCsGAQUFBzAChkVodHRwOi8vd3d3
# Lm1pY3Jvc29mdC5jb20vcGtpb3BzL2NlcnRzL01pY0NvZFNpZ1BDQTIwMTFfMjAx
# MS0wNy0wOC5jcnQwDAYDVR0TAQH/BAIwADANBgkqhkiG9w0BAQsFAAOCAgEAixmy
# S6E6vprWD9KFNIB9G5zyMuIjZAOuUJ1EK/Vlg6Fb3ZHXjjUwATKIcXbFuFC6Wr4K
# NrU4DY/sBVqmab5AC/je3bpUpjtxpEyqUqtPc30wEg/rO9vmKmqKoLPT37svc2NV
# BmGNl+85qO4fV/w7Cx7J0Bbqk19KcRNdjt6eKoTnTPHBHlVHQIHZpMxacbFOAkJr
# qAVkYZdz7ikNXTxV+GRb36tC4ByMNxE2DF7vFdvaiZP0CVZ5ByJ2gAhXMdK9+usx
# zVk913qKde1OAuWdv+rndqkAIm8fUlRnr4saSCg7cIbUwCCf116wUJ7EuJDg0vHe
# yhnCeHnBbyH3RZkHEi2ofmfgnFISJZDdMAeVZGVOh20Jp50XBzqokpPzeZ6zc1/g
# yILNyiVgE+RPkjnUQshd1f1PMgn3tns2Cz7bJiVUaqEO3n9qRFgy5JuLae6UweGf
# AeOo3dgLZxikKzYs3hDMaEtJq8IP71cX7QXe6lnMmXU/Hdfz2p897Zd+kU+vZvKI
# 3cwLfuVQgK2RZ2z+Kc3K3dRPz2rXycK5XCuRZmvGab/WbrZiC7wJQapgBodltMI5
# GMdFrBg9IeF7/rP4EqVQXeKtevTlZXjpuNhhjuR+2DMt/dWufjXpiW91bo3aH6Ea
# jOALXmoxgltCp1K7hrS6gmsvj94cLRf50QQ4U8Qwggd6MIIFYqADAgECAgphDpDS
# AAAAAAADMA0GCSqGSIb3DQEBCwUAMIGIMQswCQYDVQQGEwJVUzETMBEGA1UECBMK
# V2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0
# IENvcnBvcmF0aW9uMTIwMAYDVQQDEylNaWNyb3NvZnQgUm9vdCBDZXJ0aWZpY2F0
# ZSBBdXRob3JpdHkgMjAxMTAeFw0xMTA3MDgyMDU5MDlaFw0yNjA3MDgyMTA5MDla
# MH4xCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdS
# ZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMT
# H01pY3Jvc29mdCBDb2RlIFNpZ25pbmcgUENBIDIwMTEwggIiMA0GCSqGSIb3DQEB
# AQUAA4ICDwAwggIKAoICAQCr8PpyEBwurdhuqoIQTTS68rZYIZ9CGypr6VpQqrgG
# OBoESbp/wwwe3TdrxhLYC/A4wpkGsMg51QEUMULTiQ15ZId+lGAkbK+eSZzpaF7S
# 35tTsgosw6/ZqSuuegmv15ZZymAaBelmdugyUiYSL+erCFDPs0S3XdjELgN1q2jz
# y23zOlyhFvRGuuA4ZKxuZDV4pqBjDy3TQJP4494HDdVceaVJKecNvqATd76UPe/7
# 4ytaEB9NViiienLgEjq3SV7Y7e1DkYPZe7J7hhvZPrGMXeiJT4Qa8qEvWeSQOy2u
# M1jFtz7+MtOzAz2xsq+SOH7SnYAs9U5WkSE1JcM5bmR/U7qcD60ZI4TL9LoDho33
# X/DQUr+MlIe8wCF0JV8YKLbMJyg4JZg5SjbPfLGSrhwjp6lm7GEfauEoSZ1fiOIl
# XdMhSz5SxLVXPyQD8NF6Wy/VI+NwXQ9RRnez+ADhvKwCgl/bwBWzvRvUVUvnOaEP
# 6SNJvBi4RHxF5MHDcnrgcuck379GmcXvwhxX24ON7E1JMKerjt/sW5+v/N2wZuLB
# l4F77dbtS+dJKacTKKanfWeA5opieF+yL4TXV5xcv3coKPHtbcMojyyPQDdPweGF
# RInECUzF1KVDL3SV9274eCBYLBNdYJWaPk8zhNqwiBfenk70lrC8RqBsmNLg1oiM
# CwIDAQABo4IB7TCCAekwEAYJKwYBBAGCNxUBBAMCAQAwHQYDVR0OBBYEFEhuZOVQ
# BdOCqhc3NyK1bajKdQKVMBkGCSsGAQQBgjcUAgQMHgoAUwB1AGIAQwBBMAsGA1Ud
# DwQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB8GA1UdIwQYMBaAFHItOgIxkEO5FAVO
# 4eqnxzHRI4k0MFoGA1UdHwRTMFEwT6BNoEuGSWh0dHA6Ly9jcmwubWljcm9zb2Z0
# LmNvbS9wa2kvY3JsL3Byb2R1Y3RzL01pY1Jvb0NlckF1dDIwMTFfMjAxMV8wM18y
# Mi5jcmwwXgYIKwYBBQUHAQEEUjBQME4GCCsGAQUFBzAChkJodHRwOi8vd3d3Lm1p
# Y3Jvc29mdC5jb20vcGtpL2NlcnRzL01pY1Jvb0NlckF1dDIwMTFfMjAxMV8wM18y
# Mi5jcnQwgZ8GA1UdIASBlzCBlDCBkQYJKwYBBAGCNy4DMIGDMD8GCCsGAQUFBwIB
# FjNodHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3BzL2RvY3MvcHJpbWFyeWNw
# cy5odG0wQAYIKwYBBQUHAgIwNB4yIB0ATABlAGcAYQBsAF8AcABvAGwAaQBjAHkA
# XwBzAHQAYQB0AGUAbQBlAG4AdAAuIB0wDQYJKoZIhvcNAQELBQADggIBAGfyhqWY
# 4FR5Gi7T2HRnIpsLlhHhY5KZQpZ90nkMkMFlXy4sPvjDctFtg/6+P+gKyju/R6mj
# 82nbY78iNaWXXWWEkH2LRlBV2AySfNIaSxzzPEKLUtCw/WvjPgcuKZvmPRul1LUd
# d5Q54ulkyUQ9eHoj8xN9ppB0g430yyYCRirCihC7pKkFDJvtaPpoLpWgKj8qa1hJ
# Yx8JaW5amJbkg/TAj/NGK978O9C9Ne9uJa7lryft0N3zDq+ZKJeYTQ49C/IIidYf
# wzIY4vDFLc5bnrRJOQrGCsLGra7lstnbFYhRRVg4MnEnGn+x9Cf43iw6IGmYslmJ
# aG5vp7d0w0AFBqYBKig+gj8TTWYLwLNN9eGPfxxvFX1Fp3blQCplo8NdUmKGwx1j
# NpeG39rz+PIWoZon4c2ll9DuXWNB41sHnIc+BncG0QaxdR8UvmFhtfDcxhsEvt9B
# xw4o7t5lL+yX9qFcltgA1qFGvVnzl6UJS0gQmYAf0AApxbGbpT9Fdx41xtKiop96
# eiL6SJUfq/tHI4D1nvi/a7dLl+LrdXga7Oo3mXkYS//WsyNodeav+vyL6wuA6mk7
# r/ww7QRMjt/fdW1jkT3RnVZOT7+AVyKheBEyIXrvQQqxP/uozKRdwaGIm1dxVk5I
# RcBCyZt2WwqASGv9eZ/BvW1taslScxMNelDNMYIVZzCCFWMCAQEwgZUwfjELMAkG
# A1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQx
# HjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEoMCYGA1UEAxMfTWljcm9z
# b2Z0IENvZGUgU2lnbmluZyBQQ0EgMjAxMQITMwAAAYdyF3IVWUDHCQAAAAABhzAN
# BglghkgBZQMEAgEFAKCBrjAZBgkqhkiG9w0BCQMxDAYKKwYBBAGCNwIBBDAcBgor
# BgEEAYI3AgELMQ4wDAYKKwYBBAGCNwIBFTAvBgkqhkiG9w0BCQQxIgQgmthLUwMa
# Wglm0CyHvNax8PY0zcrE/EZbBFduQ83pvxwwQgYKKwYBBAGCNwIBDDE0MDKgFIAS
# AE0AaQBjAHIAbwBzAG8AZgB0oRqAGGh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbTAN
# BgkqhkiG9w0BAQEFAASCAQAmCGb+MlrRGQpsdcXURm5tvlOhdrWCztqj7WLQoJbW
# 8VfJSjRvowNGVabAqA4socqxr1pxgkNP4gw1JjnsLjVWa4GzvSCpX1o1NZDjvf7e
# 2pMRwm3aOP+dgkn6M7T1tbhYd6V65REISJ6aEJFem/qbgEpJQl56RYM3rvmV7gQK
# pvORPIAX3B2iWWZ/gtZJHJEEPsrFv61w4IOy0HFlLjPCWYUl4fQgVeo3GkKkAyd/
# naaIMWsEO/nycNsJ4ijoLWFjTxUh3dZqPiEx+OFDKrEDiEGMPFjY2P8rJ2CIICkW
# tf8VLDLkVu52bCg21125r+UR7jJg9UI1Vx21+8Dlg+r7oYIS8TCCEu0GCisGAQQB
# gjcDAwExghLdMIIS2QYJKoZIhvcNAQcCoIISyjCCEsYCAQMxDzANBglghkgBZQME
# AgEFADCCAVUGCyqGSIb3DQEJEAEEoIIBRASCAUAwggE8AgEBBgorBgEEAYRZCgMB
# MDEwDQYJYIZIAWUDBAIBBQAEIO4ofZ7u6MvYnUxQStY1wpadvHgt29F1P9kXOa6g
# m1kzAgZfdILlTZYYEzIwMjAxMDA2MTY1NjM0LjA4NlowBIACAfSggdSkgdEwgc4x
# CzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRt
# b25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xKTAnBgNVBAsTIE1p
# Y3Jvc29mdCBPcGVyYXRpb25zIFB1ZXJ0byBSaWNvMSYwJAYDVQQLEx1UaGFsZXMg
# VFNTIEVTTjowQTU2LUUzMjktNEQ0RDElMCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUt
# U3RhbXAgU2VydmljZaCCDkQwggT1MIID3aADAgECAhMzAAABJy9uo++RqBmoAAAA
# AAEnMA0GCSqGSIb3DQEBCwUAMHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNo
# aW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29y
# cG9yYXRpb24xJjAkBgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAyMDEw
# MB4XDTE5MTIxOTAxMTQ1OVoXDTIxMDMxNzAxMTQ1OVowgc4xCzAJBgNVBAYTAlVT
# MRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQK
# ExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xKTAnBgNVBAsTIE1pY3Jvc29mdCBPcGVy
# YXRpb25zIFB1ZXJ0byBSaWNvMSYwJAYDVQQLEx1UaGFsZXMgVFNTIEVTTjowQTU2
# LUUzMjktNEQ0RDElMCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3RhbXAgU2Vydmlj
# ZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAPgB3nERnk6fS40vvWeD
# 3HCgM9Ep4xTIQiPnJXE9E+HkZVtTsPemoOyhfNAyF95E/rUvXOVTUcJFL7Xb16jT
# KPXONsCWY8DCixSDIiid6xa30TiEWVcIZRwiDlcx29D467OTav5rA1G6TwAEY5rQ
# jhUHLrOoJgfJfakZq6IHjd+slI0/qlys7QIGakFk2OB6mh/ln/nS8G4kNRK6Do4g
# xDtnBSFLNfhsSZlRSMDJwFvrZ2FCkaoexd7rKlUNOAAScY411IEqQeI1PwfRm3aW
# bS8IvAfJPC2Ah2LrtP8sKn5faaU8epexje7vZfcZif/cbxgUKStJzqbdvTBNc93n
# /Z8CAwEAAaOCARswggEXMB0GA1UdDgQWBBTl9JZVgF85MSRbYlOJXbhY022V8jAf
# BgNVHSMEGDAWgBTVYzpcijGQ80N7fEYbxTNoWoVtVTBWBgNVHR8ETzBNMEugSaBH
# hkVodHRwOi8vY3JsLm1pY3Jvc29mdC5jb20vcGtpL2NybC9wcm9kdWN0cy9NaWNU
# aW1TdGFQQ0FfMjAxMC0wNy0wMS5jcmwwWgYIKwYBBQUHAQEETjBMMEoGCCsGAQUF
# BzAChj5odHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpL2NlcnRzL01pY1RpbVN0
# YVBDQV8yMDEwLTA3LTAxLmNydDAMBgNVHRMBAf8EAjAAMBMGA1UdJQQMMAoGCCsG
# AQUFBwMIMA0GCSqGSIb3DQEBCwUAA4IBAQAKyo180VXHBqVnjZwQy7NlzXbo2+W5
# qfHxR7ANV5RBkRkdGamkwUcDNL+DpHObFPJHa0oTeYKE0Zbl1MvvfS8RtGGdhGYG
# CJf+BPd/gBCs4+dkZdjvOzNyuVuDPGlqQ5f7HS7iuQ/cCyGHcHYJ0nXVewF2Lk+J
# lrWykHpTlLwPXmCpNR+gieItPi/UMF2RYTGwojW+yIVwNyMYnjFGUxEX5/DtJjRZ
# mg7PBHMrENN2DgO6wBelp4ptyH2KK2EsWT+8jFCuoKv+eJby0QD55LN5f8SrUPRn
# K86fh7aVOfCglQofo5ABZIGiDIrg4JsV4k6p0oBSIFOAcqRAhiH+1spCMIIGcTCC
# BFmgAwIBAgIKYQmBKgAAAAAAAjANBgkqhkiG9w0BAQsFADCBiDELMAkGA1UEBhMC
# VVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNV
# BAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEyMDAGA1UEAxMpTWljcm9zb2Z0IFJv
# b3QgQ2VydGlmaWNhdGUgQXV0aG9yaXR5IDIwMTAwHhcNMTAwNzAxMjEzNjU1WhcN
# MjUwNzAxMjE0NjU1WjB8MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3Rv
# bjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0
# aW9uMSYwJAYDVQQDEx1NaWNyb3NvZnQgVGltZS1TdGFtcCBQQ0EgMjAxMDCCASIw
# DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKkdDbx3EYo6IOz8E5f1+n9plGt0
# VBDVpQoAgoX77XxoSyxfxcPlYcJ2tz5mK1vwFVMnBDEfQRsalR3OCROOfGEwWbEw
# RA/xYIiEVEMM1024OAizQt2TrNZzMFcmgqNFDdDq9UeBzb8kYDJYYEbyWEeGMoQe
# dGFnkV+BVLHPk0ySwcSmXdFhE24oxhr5hoC732H8RsEnHSRnEnIaIYqvS2SJUGKx
# Xf13Hz3wV3WsvYpCTUBR0Q+cBj5nf/VmwAOWRH7v0Ev9buWayrGo8noqCjHw2k4G
# kbaICDXoeByw6ZnNPOcvRLqn9NxkvaQBwSAJk3jN/LzAyURdXhacAQVPIk0CAwEA
# AaOCAeYwggHiMBAGCSsGAQQBgjcVAQQDAgEAMB0GA1UdDgQWBBTVYzpcijGQ80N7
# fEYbxTNoWoVtVTAZBgkrBgEEAYI3FAIEDB4KAFMAdQBiAEMAQTALBgNVHQ8EBAMC
# AYYwDwYDVR0TAQH/BAUwAwEB/zAfBgNVHSMEGDAWgBTV9lbLj+iiXGJo0T2UkFvX
# zpoYxDBWBgNVHR8ETzBNMEugSaBHhkVodHRwOi8vY3JsLm1pY3Jvc29mdC5jb20v
# cGtpL2NybC9wcm9kdWN0cy9NaWNSb29DZXJBdXRfMjAxMC0wNi0yMy5jcmwwWgYI
# KwYBBQUHAQEETjBMMEoGCCsGAQUFBzAChj5odHRwOi8vd3d3Lm1pY3Jvc29mdC5j
# b20vcGtpL2NlcnRzL01pY1Jvb0NlckF1dF8yMDEwLTA2LTIzLmNydDCBoAYDVR0g
# AQH/BIGVMIGSMIGPBgkrBgEEAYI3LgMwgYEwPQYIKwYBBQUHAgEWMWh0dHA6Ly93
# d3cubWljcm9zb2Z0LmNvbS9QS0kvZG9jcy9DUFMvZGVmYXVsdC5odG0wQAYIKwYB
# BQUHAgIwNB4yIB0ATABlAGcAYQBsAF8AUABvAGwAaQBjAHkAXwBTAHQAYQB0AGUA
# bQBlAG4AdAAuIB0wDQYJKoZIhvcNAQELBQADggIBAAfmiFEN4sbgmD+BcQM9naOh
# IW+z66bM9TG+zwXiqf76V20ZMLPCxWbJat/15/B4vceoniXj+bzta1RXCCtRgkQS
# +7lTjMz0YBKKdsxAQEGb3FwX/1z5Xhc1mCRWS3TvQhDIr79/xn/yN31aPxzymXlK
# kVIArzgPF/UveYFl2am1a+THzvbKegBvSzBEJCI8z+0DpZaPWSm8tv0E4XCfMkon
# /VWvL/625Y4zu2JfmttXQOnxzplmkIz/amJ/3cVKC5Em4jnsGUpxY517IW3DnKOi
# PPp/fZZqkHimbdLhnPkd/DjYlPTGpQqWhqS9nhquBEKDuLWAmyI4ILUl5WTs9/S/
# fmNZJQ96LjlXdqJxqgaKD4kWumGnEcua2A5HmoDF0M2n0O99g/DhO3EJ3110mCII
# YdqwUB5vvfHhAN/nMQekkzr3ZUd46PioSKv33nJ+YWtvd6mBy6cJrDm77MbL2IK0
# cs0d9LiFAR6A+xuJKlQ5slvayA1VmXqHczsI5pgt6o3gMy4SKfXAL1QnIffIrE7a
# KLixqduWsqdCosnPGUFN4Ib5KpqjEWYw07t0MkvfY3v1mYovG8chr1m1rtxEPJdQ
# cdeh0sVV42neV8HR3jDA/czmTfsNv11P6Z0eGTgvvM9YBS7vDaBQNdrvCScc1bN+
# NR4Iuto229Nfj950iEkSoYIC0jCCAjsCAQEwgfyhgdSkgdEwgc4xCzAJBgNVBAYT
# AlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYD
# VQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xKTAnBgNVBAsTIE1pY3Jvc29mdCBP
# cGVyYXRpb25zIFB1ZXJ0byBSaWNvMSYwJAYDVQQLEx1UaGFsZXMgVFNTIEVTTjow
# QTU2LUUzMjktNEQ0RDElMCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3RhbXAgU2Vy
# dmljZaIjCgEBMAcGBSsOAwIaAxUAs5W4TmyDHMRM7iz6mgGojqvXHzOggYMwgYCk
# fjB8MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMH
# UmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSYwJAYDVQQD
# Ex1NaWNyb3NvZnQgVGltZS1TdGFtcCBQQ0EgMjAxMDANBgkqhkiG9w0BAQUFAAIF
# AOMm6f0wIhgPMjAyMDEwMDYxNzA1MDFaGA8yMDIwMTAwNzE3MDUwMVowdzA9Bgor
# BgEEAYRZCgQBMS8wLTAKAgUA4ybp/QIBADAKAgEAAgIdrQIB/zAHAgEAAgIR9DAK
# AgUA4yg7fQIBADA2BgorBgEEAYRZCgQCMSgwJjAMBgorBgEEAYRZCgMCoAowCAIB
# AAIDB6EgoQowCAIBAAIDAYagMA0GCSqGSIb3DQEBBQUAA4GBAAg3+XQgR9NOyr8a
# WgdViQzUZmEcRn416v4CznuULaJ4zshLcJdVf0bSnrefOgAI8qd1yyudjvPci3uj
# srwG6EZbAR9er4eWgWz/jgK7a77rRLzKoF8FNeU2vxp5CIwGduu+MJojKT8q5yX3
# ZkVTCOMlUeNTJW6IX3UQ7hekXhf/MYIDDTCCAwkCAQEwgZMwfDELMAkGA1UEBhMC
# VVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNV
# BAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRp
# bWUtU3RhbXAgUENBIDIwMTACEzMAAAEnL26j75GoGagAAAAAAScwDQYJYIZIAWUD
# BAIBBQCgggFKMBoGCSqGSIb3DQEJAzENBgsqhkiG9w0BCRABBDAvBgkqhkiG9w0B
# CQQxIgQgk3iMiLSXNEnBqr1LkR5oqQqWrjogBkgKUvDNDX2ahgUwgfoGCyqGSIb3
# DQEJEAIvMYHqMIHnMIHkMIG9BCAbkuhLEoYdahb/BUyVszO2VDi6kB3MSaof/+8u
# 7SM+IjCBmDCBgKR+MHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9u
# MRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRp
# b24xJjAkBgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAyMDEwAhMzAAAB
# Jy9uo++RqBmoAAAAAAEnMCIEIE3JQ+kLRdxmzAP2rB40Etnz/fkegQmO8GeiNS0Q
# pOaGMA0GCSqGSIb3DQEBCwUABIIBAH1FkcVv5xFMfnj3YNAKCi4AlsuxQfmjzOPh
# sjmTWsDQV+N4E0W2xYAiFbSI8O1tTJnbU/JwslGN5LqPBhTusuTQpRKCkeFrO54Y
# VJ2yFccEuyoh7HAt4pkLkK3K5Yo6dhU5kZakYPoHtzj9JZD46D/j1OloqcILJGC4
# yliCYKjytJORFwqwgjmYqGznJ6FWrRxTGhZ3YcFVO8DViHSQXJYWUe37h9R3QA1t
# OmfKkWbCfTLzfU3UIdMGZn43N0/pf9IRJIk2sLPV9+MiD/g6p4CcgD4MXBP2R7xi
# G+giBjS2iidVnX1gQCoUuQXE/2tNoEqGhHYth6V77DKJbskIAbk=
# SIG # End signature block


