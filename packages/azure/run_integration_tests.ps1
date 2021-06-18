# $ErrorActionPreference = "Stop"

# Write-Host "Throw Error here"
# If ($lastExitCode -ne "0") {
#     Write-Host "Success !!"
# }
# Write-Host "Last Exit Code: $lastExitCode"
# throw "This is an error."

Write-Host "Build core"
cd packages/core
yarn build

Write-Host "Integrate azure"
cd ../azure
yarn build
yarn integrate
$exit_code = $?
Write-Host "EXIT CODE: $exit_code"
# If ("$?" -ne "0") {
If ("$exit_code" -ne "0") {
    throw "Yarn Integrate Failed"
}

Start-Sleep -s 60
# exit $exit_code