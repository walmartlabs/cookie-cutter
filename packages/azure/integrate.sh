#!/bin/sh

if [[ $RUNNING_IN_CI != 1 ]]
then
    source setup_env_vars_locally.sh

    cd vm
    vagrant_status=$(vagrant status)
    echo $vagrant_status

    if [[ ! $vagrant_status =~ "running" ]]
    then
        vagrant up --provision
        echo "Allow 30 sec for VM provisioning to complete."
        sleep 30s
    fi

    cd ..
fi

jest --config=../../jest.integration.config.js --rootDir=.
exit_code=$?

if [[ $RUNNING_IN_CI != 1 ]]
then
    if [[ ! $1 =~ "keep" ]]
    then
        echo "Destroying the VM"

        cd vm
        vagrant destroy -f
        cd ..
    fi
fi

exit $exit_code
