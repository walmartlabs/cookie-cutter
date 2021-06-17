Write-Host "Build core"
cd packages/core
yarn build

Write-Host "Integrate azure"
cd ../azure
yarn build
yarn integrate
# exit_code=$?

Start-Sleep -s 60
# exit $exit_code