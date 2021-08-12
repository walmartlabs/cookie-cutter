Write-Host "Build core"
cd packages/core
yarn build

Write-Host "Integrate azure"
cd ../azure
yarn build
yarn integrate

If ("$?" -ne "True") {
    throw "Yarn Integrate Failed"
}

Start-Sleep -s 60
