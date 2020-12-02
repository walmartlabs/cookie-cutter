#!/bin/sh

if [[ $RUNNING_IN_CI != 1 ]]
then
    source setup_env_vars_locally.sh
    cd vm
    st=$(vagrant status)
    echo $st
    if [[ ! $st =~ "running" ]]
    then
        vagrant up --provision
        echo "Allow 30 sec for setup to complete."
        sleep 30s
    fi
    cd ..
fi

jest --config=../../jest.integration.config.js --rootDir=.

if [[ $RUNNING_IN_CI != 1 ]]
then
    if [[ ! $1 =~ "keep" ]]
    then
        cd vm
        vagrant destroy -f
        cd ..
    fi
fi